import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
const root = new URL("../", import.meta.url);
const dist = new URL("dist/", root);
await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
// Explicit allowlist: docs, source-control files and tooling stay out of the website.
for (const path of ["index.html", "src", "data", "assets"]) {
  await cp(new URL(path, root), new URL(path, dist), { recursive: true });
}
await writeFile(new URL(".nojekyll", dist), "");
console.log(`Static site built: ${fileURLToPath(dist)}`);
