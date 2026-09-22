import { readFile, readdir, stat } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const root = new URL("../", import.meta.url);
const errors = [];
const check = (condition, message) => {
  if (!condition) errors.push(message);
};
const json = async (path) =>
  JSON.parse(await readFile(new URL(path, root), "utf8"));
const taxonomy = await json("data/taxonomy.json");
const lanes = new Set(taxonomy.lanes.map((lane) => lane[0]));
check(lanes.size === taxonomy.lanes.length, "Duplicate lane IDs");
const entries = [];
for (const lane of lanes) {
  const group = await json(`data/entries/${lane}.json`);
  check(Array.isArray(group), `${lane}: entries must be an array`);
  for (const entry of group) {
    check(entry.lane === lane, `${entry.id}: wrong lane file`);
    entries.push(entry);
  }
}
const byId = new Map(entries.map((entry) => [entry.id, entry]));
check(byId.size === entries.length, "Duplicate entry IDs");
const sources = await json("data/sources.json");
for (const entry of entries) {
  check(["core", "focus", "extended"].includes(entry.level), `${entry.id}: missing learning level`);
  if (entry.level === "core") {
    const study = entry.study;
    check(typeof entry.context === "string" && entry.context.trim(), `${entry.id}: core needs historical context`);
    check(study && [study.why, study.question, study.answer].every((t) => typeof t === "string" && t.trim()), `${entry.id}: incomplete core study`);
    check(study?.takeaways?.length >= 2 && study.takeaways.every((t) => typeof t === "string" && t.trim()), `${entry.id}: missing takeaways`);
    check(study?.next?.length >= 2 && new Set(study.next).size === study.next.length && study.next.every((id) => byId.has(id) && id !== entry.id), `${entry.id}: invalid next readings`);
  }
  check(/^[a-z][a-z0-9-]*$/.test(entry.id), `${entry.id}: invalid stable ID`);
  for (const key of [
    "zh",
    "en",
    "date",
    "hook",
    "look",
    "idea",
    "people",
    "work",
    "distinguish",
    "tags",
    "kind",
  ]) {
    check(
      typeof entry[key] === "string" && entry[key].trim(),
      `${entry.id}: missing ${key}`,
    );
  }
  check(
    Number.isInteger(entry.era) &&
      entry.era >= 0 &&
      entry.era < taxonomy.eras.length,
    `${entry.id}: invalid era`,
  );
  check(
    !entry.source || sources[entry.source],
    `${entry.id}: unknown source ${entry.source}`,
  );
}
for (const entry of entries)
  for (const source of entry.sources || [])
    check(sources[source], `${entry.id}: unknown source ${source}`);
const safeURL = (value) => {
  try {
    return ["https:", "http:"].includes(new URL(value).protocol);
  } catch {
    return false;
  }
};
for (const [id, source] of Object.entries(sources)) {
  check(safeURL(source.url), `${id}: invalid source URL`);
  check(
    source.zh && source.title && source.org,
    `${id}: incomplete source metadata`,
  );
}
const artworks = await json("data/artworks.json");
const usedImages = new Set();
for (const [id, art] of Object.entries(artworks)) {
  check(
    Array.isArray(art.entries) && art.entries.length > 0,
    `${id}: artwork needs entry IDs`,
  );
  for (const entryId of art.entries || [])
    check(byId.has(entryId), `${id}: unknown entry ${entryId}`);
  check(new Set(art.entries).size === art.entries.length, `${id}: duplicate entry associations`);
  for (const [entryId, note] of Object.entries(art.notes || {})) {
    check(art.entries.includes(entryId), `${id}: note for unlinked entry ${entryId}`);
    check(typeof note === "string" && note.trim(), `${id}: empty viewing note`);
  }
  if (art.license === "CC0") {
    check((art.licenseScope === "image" ? art.imagePublicDomain : art.publicDomain) === true, `${id}: contradictory CC0 metadata`);
    check(safeURL(art.licenseUrl) && safeURL(art.metadataSource), `${id}: missing license or metadata provenance`);
  }
  check(/[\u3400-\u9fff]/.test(art.zh), `${id}: needs Chinese title`);
  check(
    Number.isInteger(art.width) &&
      Number.isInteger(art.height) &&
      art.width > 0 &&
      art.height > 0,
    `${id}: invalid image dimensions`,
  );
  check(
    art.zh && (art.artist || art.artistZh) && art.date && art.credit,
    `${id}: incomplete artwork metadata`,
  );
  check(safeURL(art.url), `${id}: missing original artwork link`);
  check(
    /^assets\/artworks\/[a-z0-9-]+\.(webp|svg)$/.test(art.image),
    `${id}: invalid image path`,
  );
  try {
    const image = await readFile(new URL(art.image, root));
    if (art.image.endsWith(".svg")) {
      const svg = image.toString("utf8");
      check(art.kind === "guide", `${id}: SVG must be an explicitly labelled learning guide`);
      check(svg.includes("<svg") && svg.includes("<title>"), `${id}: incomplete SVG guide`);
      check(!/<script|<foreignObject|\son\w+\s*=|(?:href|src)\s*=/i.test(svg), `${id}: SVG must be static and self-contained`);
    } else check(
      image.toString("ascii", 0, 4) === "RIFF" &&
        image.toString("ascii", 8, 12) === "WEBP",
      `${id}: not a WebP image`,
    );
    check(
      image.length < 2 * 1024 * 1024,
      `${id}: image exceeds 2 MB; optimize before adding`,
    );
    usedImages.add(art.image.split("/").at(-1));
  } catch {
    errors.push(`${id}: missing image ${art.image}`);
  }
}
for (const entry of entries)
  check(Object.values(artworks).some((art) => art.entries.includes(entry.id)), `${entry.id}: missing illustration`);
for (const name of await readdir(new URL("assets/artworks/", root)))
  check(usedImages.has(name), `Unused artwork: ${name}`);
const relationships = await json("data/relationships.json");
const relationKeys = new Set();
for (const edge of relationships) {
  check(
    edge.length === 4 &&
      edge.every((value) => typeof value === "string" && value.trim()),
    "Incomplete relationship",
  );
  check(
    byId.has(edge[0]) && byId.has(edge[1]),
    `Unknown relationship endpoints: ${edge[0]}, ${edge[1]}`,
  );
  check(edge[0] !== edge[1], `Self relationship: ${edge[0]}`);
  const key = [edge[0], edge[1]].sort().join(":");
  check(!relationKeys.has(key), `Duplicate relationship: ${key}`);
  relationKeys.add(key);
}
const routes = await json("data/routes.json");
for (const route of routes) {
  check(
    route.title &&
      route.desc &&
      Array.isArray(route.ids) &&
      route.ids.length > 1,
    "Incomplete learning route",
  );
  check(
    new Set(route.ids).size === route.ids.length,
    `${route.title}: duplicate stops`,
  );
  for (const id of route.ids)
    check(byId.has(id), `${route.title}: unknown stop ${id}`);
}
async function files(dir) {
  const result = [];
  for (const item of await readdir(new URL(dir, root), {
    withFileTypes: true,
  })) {
    const path = `${dir}/${item.name}`;
    if (item.isDirectory()) result.push(...(await files(path)));
    else result.push(path);
  }
  return result;
}
for (const path of [
  ...(await files("src")),
  ...(await files("scripts")),
].filter((p) => /\.(js|mjs)$/.test(p))) {
  const filename = fileURLToPath(new URL(path, root));
  const result = spawnSync(process.execPath, ["--check", filename], {
    encoding: "utf8",
  });
  check(result.status === 0, `${path}: ${result.stderr}`);
  const text = await readFile(filename, "utf8");
  for (const match of text.matchAll(/from\s+['"]([^'"]+)['"]/g)) {
    if (match[1].startsWith(".")) {
      try {
        await stat(new URL(match[1], new URL(path, root)));
      } catch {
        errors.push(`${path}: missing import ${match[1]}`);
      }
    }
  }
}
if (errors.length) {
  console.error(errors.join("\n"));
  process.exitCode = 1;
} else
  console.log(
    `Validated ${entries.length} entries, ${Object.keys(artworks).length} images, ${relationships.length} relationships and ${routes.length} routes.`,
  );
