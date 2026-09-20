// Paths are resolved relative to this module, so /ArtHistory/ works on GitHub Pages.
const dataRoot = new URL("../data/", import.meta.url);
async function loadJSON(path) {
  const response = await fetch(new URL(path, dataRoot));
  if (!response.ok)
    throw new Error(`Cannot load ${path}: HTTP ${response.status}`);
  return response.json();
}

export async function loadContent() {
  const taxonomy = await loadJSON("taxonomy.json");
  const [groups, ART, SOURCES, EDGES, ROUTES] = await Promise.all([
    Promise.all(taxonomy.lanes.map(([id]) => loadJSON(`entries/${id}.json`))),
    loadJSON("artworks.json"),
    loadJSON("sources.json"),
    loadJSON("relationships.json"),
    loadJSON("routes.json"),
  ]);
  const DATA = groups.flat();
  return {
    DATA,
    ART,
    SOURCES,
    EDGES,
    ROUTES,
    LANES: taxonomy.lanes,
    ERAS: taxonomy.eras,
    BYID: Object.fromEntries(DATA.map((entry) => [entry.id, entry])),
    L: Object.fromEntries(taxonomy.lanes.map((lane) => [lane[0], lane])),
  };
}
