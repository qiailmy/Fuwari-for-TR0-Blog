const COMMENT_PATHS = [
	"/apis/api.commentnext.xhhao.com/v1alpha1/",
	"/apis/api.halo.run/v1alpha1/comments",
	"/apis/api.console.halo.run/v1alpha1/users/-",
	"/actuator/globalinfo",
	"/static-api/post-stats",
];

const WORKERS_USAGE_PATH = "/static-api/workers-usage";
const WORKERS_USAGE_ORIGIN = "https://worker.wuw.li/api/usage";
const R2_ASSET_PREFIX = "/r2-assets/";
const HALO_SYNC_PATH = "/static-api/halo-sync";
const HALO_OBSERVED_KEY = "halo:observed-signature";
const HALO_DEPLOYED_KEY = "halo:deployed-signature";

function publishedPostSnapshot(post) {
	return {
		name: post.metadata?.name,
		slug: post.spec?.slug,
		publish: post.spec?.publish,
		deleted: post.spec?.deleted,
		visible: post.spec?.visible,
		allowComment: post.spec?.allowComment,
		phase: post.status?.phase,
		publishTime: post.spec?.publishTime,
		lastModifyTime: post.status?.lastModifyTime,
	};
}

async function sha256(value) {
	const bytes = new TextEncoder().encode(value);
	const digest = await crypto.subtle.digest("SHA-256", bytes);
	return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function fetchHaloSignature(env) {
	const origin = new URL(env.HALO_ORIGIN).origin;
	const response = await fetch(`${origin}/apis/api.content.halo.run/v1alpha1/posts?page=1&size=1000`, {
		headers: { Accept: "application/json", "User-Agent": "Fuwari-Halo-Cron/1.0" },
	});
	if (!response.ok) throw new Error(`Halo content check failed: HTTP ${response.status}`);
	const listing = await response.json();
	const snapshot = (listing.items || [])
		.map(publishedPostSnapshot)
		.sort((a, b) => String(a.name).localeCompare(String(b.name)));
	return { signature: await sha256(JSON.stringify(snapshot)), records: snapshot.length };
}

async function checkHaloAndQueue(env) {
	const current = await fetchHaloSignature(env);
	const previous = await env.HALO_SYNC_STATE.get(HALO_OBSERVED_KEY);
	if (current.signature === previous) {
		console.log(`Halo content unchanged (${current.records} records).`);
		return { changed: false, ...current };
	}
	await env.HALO_SYNC_STATE.put(HALO_OBSERVED_KEY, current.signature, {
		metadata: { records: current.records, observedAt: new Date().toISOString() },
	});
	console.log(`Halo content changed (${current.records} records); deployment queued.`);
	return { changed: true, ...current };
}

async function haloSyncStatus(request, env) {
	if (request.method === "GET") {
		const [observed, deployed] = await Promise.all([
			env.HALO_SYNC_STATE.getWithMetadata(HALO_OBSERVED_KEY),
			env.HALO_SYNC_STATE.get(HALO_DEPLOYED_KEY),
		]);
		return Response.json({
			pending: Boolean(observed.value && observed.value !== deployed),
			signature: observed.value,
			records: observed.metadata?.records ?? null,
			observedAt: observed.metadata?.observedAt ?? null,
		}, { headers: { "Cache-Control": "no-store" } });
	}
	if (request.method !== "POST") {
		return new Response("Method Not Allowed", { status: 405, headers: { Allow: "GET, POST" } });
	}
	if (!env.HALO_SYNC_CALLBACK_TOKEN || request.headers.get("Authorization") !== `Bearer ${env.HALO_SYNC_CALLBACK_TOKEN}`) {
		return new Response("Unauthorized", { status: 401 });
	}
	const { signature } = await request.json();
	const observed = await env.HALO_SYNC_STATE.get(HALO_OBSERVED_KEY);
	if (!signature || signature !== observed) return new Response("Conflict", { status: 409 });
	await env.HALO_SYNC_STATE.put(HALO_DEPLOYED_KEY, signature, {
		metadata: { deployedAt: new Date().toISOString() },
	});
	return Response.json({ ok: true, signature });
}

async function serveR2Asset(request, env, url) {
	if (request.method !== "GET" && request.method !== "HEAD") {
		return new Response("Method Not Allowed", { status: 405, headers: { Allow: "GET, HEAD" } });
	}
	let key;
	try {
		key = decodeURIComponent(url.pathname.slice(R2_ASSET_PREFIX.length));
	} catch {
		return new Response("Bad Request", { status: 400 });
	}
	if (!key) return new Response("Not Found", { status: 404 });
	const object = await env.IMAGE_BUCKET.get(key, request.headers.has("Range")
		? { range: request.headers }
		: undefined);
	if (!object) return new Response("Not Found", { status: 404 });
	const headers = new Headers();
	object.writeHttpMetadata(headers);
	headers.set("etag", object.httpEtag);
	headers.set("cache-control", "public, max-age=31536000, immutable");
	if (object.range) {
		headers.set("content-range", `bytes ${object.range.offset}-${object.range.offset + object.range.length - 1}/${object.size}`);
		headers.set("content-length", String(object.range.length));
	}
	return new Response(request.method === "HEAD" ? null : object.body, {
		status: object.range ? 206 : 200,
		headers,
	});
}

async function proxyWorkersUsage() {
	const upstream = await fetch(WORKERS_USAGE_ORIGIN, {
		headers: { Accept: "application/json" },
		cf: { cacheEverything: true, cacheTtl: 30 },
	});
	if (!upstream.ok) return Response.json({ error: "Workers usage backend unavailable" }, { status: 502 });
	const data = await upstream.json();
	const requests = Number(data?.usage?.requests);
	const requestPercent = Number(data?.usage?.requestPercent);
	if (!Number.isFinite(requests) || !Number.isFinite(requestPercent)) {
		return Response.json({ error: "Workers usage response is invalid" }, { status: 502 });
	}
	return Response.json({ requests, requestPercent }, {
		headers: { "Cache-Control": "public, max-age=30, stale-while-revalidate=60" },
	});
}

export default {
	async fetch(request, env) {
		const url = new URL(request.url);
		if (url.pathname === HALO_SYNC_PATH) {
			return haloSyncStatus(request, env);
		}
		if (url.pathname.startsWith(R2_ASSET_PREFIX)) {
			return serveR2Asset(request, env, url);
		}
		if (url.pathname === WORKERS_USAGE_PATH && request.method === "GET") {
			try {
				return await proxyWorkersUsage();
			} catch {
				return Response.json({ error: "Workers usage backend unavailable" }, { status: 502 });
			}
		}
		if (COMMENT_PATHS.some((prefix) => url.pathname.startsWith(prefix))) {
			const target = new URL(`${url.pathname}${url.search}`, env.COMMENT_PROXY_ORIGIN);
			return fetch(new Request(target, request));
		}
		return env.ASSETS.fetch(request);
	},
	async scheduled(_controller, env, ctx) {
		ctx.waitUntil(checkHaloAndQueue(env));
	},
};
