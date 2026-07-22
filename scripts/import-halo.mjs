import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const origin = new URL(process.env.HALO_ORIGIN || "http://127.0.0.1:8090").origin;
const outputDir = path.resolve("src/content/posts");
const stagingDir = path.resolve("src/content/.posts-import-staging");
const backupDir = path.resolve("src/content/.posts-import-backup");
const thumbnailDir = path.resolve("public/post-thumbnails");
const thumbnailStagingDir = path.resolve("public/.post-thumbnails-import-staging");
const thumbnailBackupDir = path.resolve("public/.post-thumbnails-import-backup");
const PAGE_SIZE = 100;
const THUMBNAIL_WIDTH = 640;
const THUMBNAIL_HEIGHT = 400;
const MAX_COVER_BYTES = 20 * 1024 * 1024;
const MISSING_LEGACY_ASSETS = new Set([
	"https://img.wuw.li/tu/2024-09-25T23:54:51-sqazpumh.jpg",
	"https://img.wuw.li/tu/2025-02-02T18:10:59-mfbstfkq.png",
	"https://img.wuw.li/tu/2025-08-15T11-gyioo.png",
	"https://img.wuw.li/google/tu/2025-08-13-1eb6795b78f450e9.webp",
	"https://img.wuw.li/google/tu/2025-08-13-ece46943c3707a21.webp",
	"https://list.wuw.li/google/tu/68959bfd2ef69.webp",
]);

function normalizeHaloAssetUrls(value) {
	if (typeof value !== "string") return value ?? "";
	return value
		.replace(/https?:\/\/(?:www\.)?wuw\.li\/upload\//gi, "https://wuw.wuw.li/upload/")
		.replace(/https?:\/\/ailmy\.cn\/upload\//gi, "https://wuw.wuw.li/upload/")
		.replace(/(^|["'(=,\s])\/upload\//gi, "$1https://wuw.wuw.li/upload/")
		.replace(/https?:\/\/img\.wuw\.li\//gi, "https://wuw.li/r2-assets/");
}

function stripMissingLegacyImages(value) {
	if (typeof value !== "string") return value ?? "";
	return value.replace(/<img\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi, (tag, src) => {
		const clean = src.split("?")[0];
		return MISSING_LEGACY_ASSETS.has(clean) ? "" : tag;
	});
}

function normalizeCover(value) {
	if (!value) return "";
	const clean = String(value).split("?")[0];
	if (MISSING_LEGACY_ASSETS.has(clean)) return "";
	return normalizeHaloAssetUrls(value);
}

function yaml(value) {
	return JSON.stringify(normalizeHaloAssetUrls(value));
}

function validPost(post) {
	return post.spec?.publish === true
		&& post.spec?.deleted !== true
		&& post.spec?.visible === "PUBLIC"
		&& post.status?.phase === "PUBLISHED";
}

async function haloJson(pathname) {
	let lastError;
	for (let attempt = 1; attempt <= 3; attempt++) {
		try {
			const response = await fetch(`${origin}${pathname}`, {
				headers: { Accept: "application/json", "User-Agent": "Fuwari-Halo-Importer/1.0" },
				signal: AbortSignal.timeout(20_000),
			});
			if (!response.ok) throw new Error(`${response.status} ${pathname}`);
			return await response.json();
		} catch (error) {
			lastError = error;
			if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, attempt * 1_000));
		}
	}
	throw lastError;
}

async function fetchCover(url) {
	let lastError;
	for (let attempt = 1; attempt <= 3; attempt++) {
		try {
			const response = await fetch(url, {
				headers: { Accept: "image/avif,image/webp,image/*,*/*;q=0.8", "User-Agent": "Fuwari-Halo-Importer/1.0" },
				signal: AbortSignal.timeout(20_000),
			});
			if (!response.ok) throw new Error(`${response.status} ${url}`);
			const declaredLength = Number(response.headers.get("content-length"));
			if (Number.isFinite(declaredLength) && declaredLength > MAX_COVER_BYTES) {
				throw new Error(`Cover exceeds ${MAX_COVER_BYTES} bytes: ${url}`);
			}
			const buffer = Buffer.from(await response.arrayBuffer());
			if (buffer.length > MAX_COVER_BYTES) throw new Error(`Cover exceeds ${MAX_COVER_BYTES} bytes: ${url}`);
			return buffer;
		} catch (error) {
			lastError = error;
			if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, attempt * 1_000));
		}
	}
	throw lastError;
}

async function createCardThumbnail(cover, slug) {
	if (!cover) return "";
	try {
		const source = await fetchCover(cover);
		const filename = `${slug}.webp`;
		await sharp(source, { animated: false })
			.rotate()
			.resize(THUMBNAIL_WIDTH, THUMBNAIL_HEIGHT, { fit: "cover", position: "centre", withoutEnlargement: true })
			.webp({ quality: 72, effort: 4 })
			.toFile(path.join(thumbnailStagingDir, filename));
		return `/post-thumbnails/${filename}`;
	} catch (error) {
		console.warn(`\nThumbnail fallback for ${slug}: ${error.message}`);
		return cover;
	}
}

async function listAllPosts() {
	const items = [];
	for (let page = 1; ; page++) {
		const listing = await haloJson(`/apis/api.content.halo.run/v1alpha1/posts?page=${page}&size=${PAGE_SIZE}`);
		const pageItems = listing.items || [];
		items.push(...pageItems);
		const total = Number(listing.total ?? listing.totalElements);
		const hasNext = typeof listing.hasNext === "boolean"
			? listing.hasNext
			: Number.isFinite(total) ? items.length < total : pageItems.length === PAGE_SIZE;
		if (!hasNext) return items;
		if (page >= 100) throw new Error("Halo post listing exceeded 10,000 records");
	}
}

function safeSlug(value) {
	const slug = String(value || "").toLowerCase().replace(/[.\s]+$/g, "");
	if (!slug || slug === "." || slug === ".." || !/^[a-z0-9._~-]+$/i.test(slug)) {
		throw new Error(`Unsafe Halo slug: ${JSON.stringify(value)}`);
	}
	return slug;
}

const posts = (await listAllPosts()).filter(validPost);
const slugCounts = new Map();
for (const post of posts) {
	const slug = safeSlug(post.spec.slug);
	slugCounts.set(slug, (slugCounts.get(slug) || 0) + 1);
}

await fs.rm(stagingDir, { recursive: true, force: true });
await fs.rm(thumbnailStagingDir, { recursive: true, force: true });
await fs.mkdir(stagingDir, { recursive: true });
await fs.mkdir(thumbnailStagingDir, { recursive: true });

const manifest = [];
for (const [index, summary] of posts.entries()) {
	const post = await haloJson(`/apis/api.content.halo.run/v1alpha1/posts/${encodeURIComponent(summary.metadata.name)}`);
	const sourceSlug = safeSlug(post.spec.slug);
	const duplicateSlug = slugCounts.get(sourceSlug) > 1;
	const slug = duplicateSlug ? `${sourceSlug}-${post.metadata.name.slice(0, 8).toLowerCase()}` : sourceSlug;
	const categories = (post.categories || []).map((item) => item.spec.displayName).filter(Boolean);
	const tags = (post.tags || []).map((item) => item.spec.displayName).filter(Boolean);
	const body = normalizeHaloAssetUrls(stripMissingLegacyImages(post.content?.raw || post.content?.content || ""));
	const cover = normalizeCover(post.spec.cover);
	const cardImage = await createCardThumbnail(cover, slug);
	const frontmatter = [
		"---",
		`title: ${yaml(post.spec.title)}`,
		`published: ${post.spec.publishTime || post.metadata.creationTimestamp}`,
		`updated: ${post.status.lastModifyTime || post.spec.publishTime}`,
		"draft: false",
		`description: ${yaml(post.status.excerpt || post.spec.excerpt?.raw || "")}`,
		`image: ${JSON.stringify(cover)}`,
		`cardImage: ${JSON.stringify(cardImage)}`,
		`category: ${yaml(categories)}`,
		`tags: ${yaml(tags)}`,
		`pinned: ${post.spec.pinned === true}`,
		`haloName: ${yaml(post.metadata.name)}`,
		`allowComment: ${post.spec.allowComment !== false}`,
		"---",
		"",
	].join("\n");
	const target = path.resolve(stagingDir, `${slug}.md`);
	if (!target.startsWith(`${stagingDir}${path.sep}`)) throw new Error(`Unsafe output path for slug: ${slug}`);
	await fs.writeFile(target, `${frontmatter}${body}\n`);
	manifest.push({ slug, haloName: post.metadata.name, title: post.spec.title, allowComment: post.spec.allowComment !== false });
	process.stdout.write(`\rImported ${index + 1}/${posts.length}`);
}

await fs.mkdir("public", { recursive: true });
const commentSubjects = JSON.stringify({ posts: manifest.filter((post) => post.allowComment).map((post) => post.haloName) });
const contentManifest = JSON.stringify({ generatedAt: new Date().toISOString(), posts: manifest }, null, 2);

await fs.rm(backupDir, { recursive: true, force: true });
await fs.rm(thumbnailBackupDir, { recursive: true, force: true });
try {
	await fs.rename(outputDir, backupDir);
} catch (error) {
	if (error.code !== "ENOENT") throw error;
}
try {
	await fs.rename(thumbnailDir, thumbnailBackupDir);
} catch (error) {
	if (error.code !== "ENOENT") throw error;
}
try {
	await fs.rename(stagingDir, outputDir);
	await fs.rename(thumbnailStagingDir, thumbnailDir);
	await fs.writeFile("public/comment-subjects.json", commentSubjects);
	await fs.writeFile("public/halo-content-manifest.json", contentManifest);
	await fs.rm(backupDir, { recursive: true, force: true });
	await fs.rm(thumbnailBackupDir, { recursive: true, force: true });
} catch (error) {
	await fs.rm(outputDir, { recursive: true, force: true });
	await fs.rm(thumbnailDir, { recursive: true, force: true });
	try { await fs.rename(backupDir, outputDir); } catch {}
	try { await fs.rename(thumbnailBackupDir, thumbnailDir); } catch {}
	throw error;
}
console.log(`\nImported ${posts.length} published posts (${manifest.filter((post) => post.allowComment).length} comment-enabled).`);
