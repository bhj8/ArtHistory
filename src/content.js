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
  const taxonomy = await loadJSON("taxonomy.json");
  const [groups, artworks, SOURCES, EDGES, ROUTES] = await Promise.all([
    Promise.all(taxonomy.lanes.map(([id]) => loadJSON(`entries/${id}.json`))),
    loadJSON("artworks.json"),
    loadJSON("sources.json"),
    loadJSON("relationships.json"),
    loadJSON("routes.json"),
  ]);
  return indexContent({ taxonomy, groups, artworks, SOURCES, EDGES, ROUTES });
}
export function indexContent({
  taxonomy,
  groups,
  artworks,
  SOURCES,
  EDGES,
  ROUTES,
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
    DATA.map((d) => [d.id, WORKS.filter((a) => a.entries.includes(d.id))]),
  );
  const SEARCH = Object.fromEntries(
    DATA.map((d) => [
      d.id,
      [
        ...Object.values(d).flat(),
        ...(d.study ? [d.study.why, ...d.study.takeaways, d.study.question, d.study.answer] : []),
        ...ART[d.id].flatMap((a) => [
          a.zh,
          a.title,
          a.artist,
          a.artistZh,
          a.medium,
        ]),
      ]
        .join(" ")
        .toLocaleLowerCase(),
    ]),
  );
  return {
    DATA,
    BYID,
    WORKS,
    BYWORK,
    ART,
    SEARCH,
    SOURCES,
    EDGES,
    ROUTES,
    LANES: taxonomy.lanes,
    ERAS: taxonomy.eras,
    L: Object.fromEntries(taxonomy.lanes.map((l) => [l[0], l])),
  };
}
