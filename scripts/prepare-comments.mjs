import fs from "node:fs/promises";
import path from "node:path";

const sourceDir = path.resolve("../halo-workers-static/dist/static-comment");
const targetDir = path.resolve("public/static-comment");
await fs.mkdir(targetDir, { recursive: true });
for (const name of ["comment-next.css", "comment-next.js", "comment-bridge.js"]) {
	const target = path.join(targetDir, name);
	try {
		await fs.access(target);
	} catch {
		await fs.copyFile(path.join(sourceDir, name), target);
	}
}
