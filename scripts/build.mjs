import { cp, mkdir, rm, writeFile, readFile, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
const root = new URL("../", import.meta.url);
const dist = new URL("dist/", root);
async function files(path) {
  const result = [];
  for (const item of await readdir(new URL(path, root), {
    withFileTypes: true,
  })) {
    const name = `${path}/${item.name}`;
    if (item.isDirectory()) result.push(...(await files(name)));
    else result.push(name);
  }
  return result.sort();
}
const inputs = [
  "index.html",
  ...(await files("src")),
  ...(await files("data")),
  ...(await files("assets")),
];
const hash = createHash("sha256").update(
  await readFile(new URL(import.meta.url)),
);
for (const path of inputs)
  hash.update(path).update(await readFile(new URL(path, root)));
const revision = hash.digest("hex").slice(0, 12);
await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
for (const path of ["index.html", "src", "data", "assets"])
  await cp(new URL(path, root), new URL(path, dist), { recursive: true });
// Each release loads one coherent module/data version, even for returning visitors.
let html = await readFile(new URL("index.html", dist), "utf8");
html = html.replace(
  /(\.\/src\/(?:main\.js|styles\/main\.css))(?=["'])/g,
  `$1?v=${revision}`,
);
await writeFile(new URL("index.html", dist), html);
for (const path of inputs.filter(
  (p) => p.startsWith("src/") && p.endsWith(".js"),
)) {
  let source = await readFile(new URL(path, dist), "utf8");
  source = source.replace(
    /(from\s+["'])(\.{1,2}\/[^"']+)(["'])/g,
    `$1$2?v=${revision}$3`,
  );
  await writeFile(new URL(path, dist), source);
}
// Images retain independent cache keys: editing text does not invalidate every image.
const artworks = JSON.parse(
  await readFile(new URL("data/artworks.json", dist), "utf8"),
);
for (const art of Object.values(artworks)) {
  const digest = createHash("sha256")
    .update(await readFile(new URL(art.image, root)))
    .digest("hex")
    .slice(0, 12);
  art.image += `?v=${digest}`;
}
await writeFile(new URL("data/artworks.json", dist), JSON.stringify(artworks));
await writeFile(new URL(".nojekyll", dist), "");
console.log(`Static site built: ${fileURLToPath(dist)} (${revision})`);
