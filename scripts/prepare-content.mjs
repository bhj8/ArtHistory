import { readFile, writeFile, mkdir } from "node:fs/promises";
import { compileSearch } from "../src/search.js";

// Publish a small browsing catalogue separately from search and reading payloads.
export async function prepareContent(root) {
  const json = async (path) => JSON.parse(await readFile(new URL(`data/${path}.json`, root), "utf8"));
  const taxonomy = await json("taxonomy");
  const entries = (await Promise.all(taxonomy.lanes.map(([id]) => json(`entries/${id}`)))).flat();
  const artworks = await json("artworks"), sources = await json("sources"), edges = await json("relationships");
  const works = Object.entries(artworks).map(([id, a]) => ({ ...a, id }));
  const search = compileSearch(entries, works, await json("authors"));
  const pick = (value, fields) => Object.fromEntries(fields.filter(k => value[k] !== undefined).map(k => [k, value[k]]));
  const catalog = {
    taxonomy,
    entries: entries.map(d => pick(d, ["id", "lane", "era", "level", "zh", "en", "date", "kind", "hook", "aliases", "featuredWorks"])),
    artworks: Object.fromEntries(works.map(w => [w.id, pick(w, ["entries", "zh", "artist", "artistZh", "date", "image", "width", "height", "previews", "kind"])])),
    routes: await json("routes"),
    sourceCount: Object.keys(sources).length,
  };
  const authorTerms = search.authors.flatMap(a => a.aliases.filter(name => name.length >= 2).map(name => ({name, author: a.name})));
  const write = async (path, data) => writeFile(new URL(`data/${path}.json`, root), JSON.stringify(data));
  await mkdir(new URL("data/details/", root), {recursive: true});
  await mkdir(new URL("data/works/", root), {recursive: true});
  await write("catalog", catalog);
  await write("search-index", search);
  for (const entry of entries) {
    const ids = [...new Set([entry.source, ...(entry.sources || [])])].filter(id => sources[id]);
    await write(`details/${entry.id}`, {
      authorTerms: authorTerms.filter(t => Object.values(entry).flat().join(" ").includes(t.name)),
      entry, works: works.filter(w => w.entries.includes(entry.id)),
      edges: edges.filter(e => e[0] === entry.id || e[1] === entry.id),
      sources: Object.fromEntries(ids.map(id => [id, sources[id]])),
    });
  }
  for (const work of works) await write(`works/${work.id}`, work);
  return {catalog, search};
}
