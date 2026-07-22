import crypto from "node:crypto";
import fs from "node:fs/promises";
import { spawn } from "node:child_process";

const origin = new URL(process.env.HALO_ORIGIN || "https://wuw.wuw.li").origin;
const statePath = new URL("../.halo-sync-state.json", import.meta.url);

function run(command, args, env = process.env) {
	return new Promise((resolve, reject) => {
		const child = spawn(command, args, { stdio: "inherit", env });
		child.once("error", reject);
		child.once("exit", (code) => code === 0 ? resolve() : reject(new Error(`${command} exited with ${code}`)));
	});
}

const response = await fetch(`${origin}/apis/api.content.halo.run/v1alpha1/posts?page=1&size=1000`, {
	headers: { Accept: "application/json", "User-Agent": "Fuwari-Halo-Sync/1.0" },
});
if (!response.ok) throw new Error(`Halo content check failed: HTTP ${response.status}`);

const listing = await response.json();
const snapshot = listing.items
	.map((post) => ({
		name: post.metadata?.name,
		slug: post.spec?.slug,
		publish: post.spec?.publish,
		deleted: post.spec?.deleted,
		visible: post.spec?.visible,
		allowComment: post.spec?.allowComment,
		phase: post.status?.phase,
		publishTime: post.spec?.publishTime,
		lastModifyTime: post.status?.lastModifyTime,
	}))
	.sort((a, b) => String(a.name).localeCompare(String(b.name)));
const signature = crypto.createHash("sha256").update(JSON.stringify(snapshot)).digest("hex");

let previousSignature = "";
try {
	previousSignature = JSON.parse(await fs.readFile(statePath, "utf8")).signature || "";
} catch (error) {
	if (error?.code !== "ENOENT") throw error;
}

if (signature === previousSignature && process.env.FORCE_SYNC !== "1") {
	console.log(`Halo content unchanged (${snapshot.length} records).`);
	process.exit(0);
}

console.log(`Halo content changed; importing ${snapshot.length} records and deploying.`);
await run("npm", ["run", "import:halo"], { ...process.env, HALO_ORIGIN: origin });
await run("npm", ["run", "deploy"]);
await fs.writeFile(statePath, `${JSON.stringify({ signature, syncedAt: new Date().toISOString(), origin }, null, 2)}\n`);
console.log("Halo sync and deployment complete.");
