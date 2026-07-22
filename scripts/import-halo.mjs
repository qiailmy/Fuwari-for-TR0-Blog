import fs from "node:fs/promises";
import path from "node:path";

const origin = new URL(process.env.HALO_ORIGIN || "http://127.0.0.1:8090").origin;
const outputDir = path.resolve("src/content/posts");
const FALLBACK_COVER = "https://wuw.li/r2-assets/tu/2026-07-22T15-e21iq.webp";
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
	if (!value) return FALLBACK_COVER;
	const clean = String(value).split("?")[0];
	if (MISSING_LEGACY_ASSETS.has(clean)) return FALLBACK_COVER;
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
	const response = await fetch(`${origin}${pathname}`, {
		headers: { Accept: "application/json", "User-Agent": "Fuwari-Halo-Importer/1.0" },
	});
	if (!response.ok) throw new Error(`${response.status} ${pathname}`);
	return response.json();
}

const listing = await haloJson("/apis/api.content.halo.run/v1alpha1/posts?page=1&size=1000");
const posts = listing.items.filter(validPost);
const slugCounts = new Map();
for (const post of posts) {
	const slug = post.spec.slug;
	slugCounts.set(slug, (slugCounts.get(slug) || 0) + 1);
}

await fs.rm(outputDir, { recursive: true, force: true });
await fs.mkdir(outputDir, { recursive: true });

const manifest = [];
for (const [index, summary] of posts.entries()) {
	const post = await haloJson(`/apis/api.content.halo.run/v1alpha1/posts/${encodeURIComponent(summary.metadata.name)}`);
	const duplicateSlug = slugCounts.get(post.spec.slug) > 1;
	const sourceSlug = String(post.spec.slug).toLowerCase().replace(/[.\s]+$/g, "");
	const slug = duplicateSlug ? `${sourceSlug}-${post.metadata.name.slice(0, 8).toLowerCase()}` : sourceSlug;
	const categories = (post.categories || []).map((item) => item.spec.displayName).filter(Boolean);
	const tags = (post.tags || []).map((item) => item.spec.displayName).filter(Boolean);
	const body = normalizeHaloAssetUrls(stripMissingLegacyImages(post.content?.raw || post.content?.content || ""));
	const frontmatter = [
		"---",
		`title: ${yaml(post.spec.title)}`,
		`published: ${post.spec.publishTime || post.metadata.creationTimestamp}`,
		`updated: ${post.status.lastModifyTime || post.spec.publishTime}`,
		"draft: false",
		`description: ${yaml(post.status.excerpt || post.spec.excerpt?.raw || "")}`,
		`image: ${JSON.stringify(normalizeCover(post.spec.cover))}`,
		`category: ${yaml(categories)}`,
		`tags: ${yaml(tags)}`,
		`pinned: ${post.spec.pinned === true}`,
		`haloName: ${yaml(post.metadata.name)}`,
		`allowComment: ${post.spec.allowComment !== false}`,
		"---",
		"",
	].join("\n");
	await fs.writeFile(path.join(outputDir, `${slug}.md`), `${frontmatter}${body}\n`);
	manifest.push({ slug, haloName: post.metadata.name, title: post.spec.title, allowComment: post.spec.allowComment !== false });
	process.stdout.write(`\rImported ${index + 1}/${posts.length}`);
}

await fs.mkdir("public", { recursive: true });
await fs.writeFile("public/comment-subjects.json", JSON.stringify({ posts: manifest.filter((post) => post.allowComment).map((post) => post.haloName) }));
await fs.writeFile("public/halo-content-manifest.json", JSON.stringify({ generatedAt: new Date().toISOString(), posts: manifest }, null, 2));
console.log(`\nImported ${posts.length} published posts (${manifest.filter((post) => post.allowComment).length} comment-enabled).`);
