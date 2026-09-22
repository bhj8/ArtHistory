import { makeTermIndex } from "./ui/inline-links.js";
import { createSearch, hydrateSearch } from "./search.js";
const dataRoot = new URL("../data/", import.meta.url);
async function loadJSON(path) {
  const url = new URL(path, dataRoot);
  const revision = new URL(import.meta.url).searchParams.get("v");
  if (revision) url.searchParams.set("v", revision);
  const response = await fetch(url);
  if (!response.ok)
    throw new Error(`Cannot load ${path}: HTTP ${response.status}`);
  return response.json();
}
export async function loadContent() {
  return catalogContent(await loadJSON("catalog.json"), loadJSON);
}
export function catalogContent(catalog, fetchJSON) {
  const c = indexContent({taxonomy: catalog.taxonomy, groups: [catalog.entries], artworks: catalog.artworks,
    SOURCES: {}, EDGES: [], ROUTES: catalog.routes, deferSearch: true});
  c.sourceCount = catalog.sourceCount;
  c.AUTHOR_TERMS = [];
  c.searchReady = false;
  const readyEntries = new Set(), readyWorks = new Set(), pending = new Map();
  const once = (key, task) => {
    if (!pending.has(key)) pending.set(key, task().catch(error => {pending.delete(key); throw error;}));
    return pending.get(key);
  };
  const mergeWork = w => { Object.assign(c.BYWORK[w.id], w); readyWorks.add(w.id); };
  c.ensureSearch = () => once("search", async () => {
    c.search = hydrateSearch(await fetchJSON("search-index.json"), c.DATA, c.WORKS);
    c.searchReady = true;
  });
  c.isEntryReady = id => readyEntries.has(id);
  c.ensureEntry = id => once(`entry:${id}`, async () => {
    const detail = await fetchJSON(`details/${id}.json`);
    Object.assign(c.BYID[id], detail.entry);
    detail.works.forEach(mergeWork);
    Object.assign(c.SOURCES, detail.sources);
    for (const term of detail.authorTerms) if (!c.AUTHOR_TERMS.some(t => t.name === term.name && t.author === term.author)) c.AUTHOR_TERMS.push(term);
    for (const edge of detail.edges) if (!c.EDGES.some(e => JSON.stringify(e) === JSON.stringify(edge))) c.EDGES.push(edge);
    readyEntries.add(id);
  });
  c.ensureWorks = ids => Promise.all(ids.map(id => readyWorks.has(id) ? undefined : once(`work:${id}`, async () => mergeWork(await fetchJSON(`works/${id}.json`)))));
  c.ensureSources = () => once("sources", async () => Object.assign(c.SOURCES, await fetchJSON("sources.json")));
  return c;
}

export function indexContent({
  taxonomy,
  groups,
  artworks,
  SOURCES,
  EDGES,
  ROUTES,
  authors = [],
  deferSearch = false,
}) {
  const DATA = groups.flat(),
    BYID = Object.fromEntries(DATA.map((d) => [d.id, d]));
  const WORKS = Object.entries(artworks).map(([id, a]) => ({
    ...a,
    id,
    entries: a.entries || [id],
  }));
  const BYWORK = Object.fromEntries(WORKS.map((a) => [a.id, a]));
  const ART = Object.fromEntries(
    DATA.map((d) => {
      const featured = d.featuredWorks || [];
      const rank = (a) => featured.includes(a.id) ? featured.indexOf(a.id) : featured.length;
      return [d.id, WORKS.filter((a) => a.entries.includes(d.id)).sort((a, b) => rank(a) - rank(b))];
    }),
  );
  const search = deferSearch ? {authors: [], query: () => ({entries: [], works: [], authors: [], suggestions: []})} : createSearch(DATA, WORKS, authors);
  return {
    DATA,
    BYID,
    WORKS,
    BYWORK,
    ART,
    TERMS: makeTermIndex(DATA),
    search,
    AUTHOR_TERMS: search.authors.flatMap((a) => a.aliases.filter((name) => name.length >= 2).map((name) => ({ name, author: a.name }))),
    SOURCES,
    EDGES,
    ROUTES,
    LANES: taxonomy.lanes,
    ERAS: taxonomy.eras,
    L: Object.fromEntries(taxonomy.lanes.map((l) => [l[0], l])),
  };
}
