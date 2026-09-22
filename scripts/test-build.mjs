import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import { performance } from "node:perf_hooks";
import { catalogContent, indexContent } from "../src/content.js";
import { createViews } from "../src/ui/views.js";
import { detailHTML } from "../src/ui/detail.js";
import { imageHTML } from "../src/ui/helpers.js";

const root = new URL("../dist/", import.meta.url);
const read = p => readFile(new URL(p, root));
const json = async p => JSON.parse(await read(`data/${p}`));
const catalog = await json("catalog.json");
const requests = [];
const fetchJSON = async p => { requests.push(p); return json(p); };
const start = performance.now();
const c = catalogContent(catalog, fetchJSON);
const startupMs = performance.now() - start;
assert.equal(c.DATA.length, 233);
assert.equal(c.WORKS.length, 660);
assert.equal(c.sourceCount, 85);
assert.deepEqual(requests, [], "browsing must not fetch search or detail payloads");
assert.ok(c.DATA.every(d => !d.context && !d.work && !d.people));
assert.ok(c.WORKS.every(w => !w.credit && !w.notes));
const entryRef = c.BYID.impressionism, workRef = c.ART.impressionism[0];
await Promise.all([c.ensureEntry("impressionism"), c.ensureEntry("impressionism")]);
assert.deepEqual(requests, ["details/impressionism.json"]);
assert.equal(c.BYID.impressionism, entryRef, "references must survive hydration");
assert.equal(c.ART.impressionism[0], workRef);
assert.ok(entryRef.context && workRef.credit && c.AUTHOR_TERMS.length);
assert.ok(detailHTML(entryRef, c, {saved:new Set(), compare:[]}).includes('data-author="莫奈"'));
const beforeWorks = requests.length;
await c.ensureWorks([workRef.id]);
assert.equal(requests.length, beforeWorks, "reuse rights metadata from entry payload");
await c.ensureWorks(["commons-57035370"]);
assert.ok(c.BYWORK["commons-57035370"].credit.includes("Donald Woodman"));
await Promise.all([c.ensureSearch(), c.ensureSearch()]);
assert.equal(requests.filter(p => p === "search-index.json").length, 1);
const full = indexContent({taxonomy:catalog.taxonomy,
  groups:await Promise.all(catalog.taxonomy.lanes.map(([id]) => json(`entries/${id}.json`))),
  artworks:await json("artworks.json"), SOURCES:await json("sources.json"), EDGES:await json("relationships.json"),
  ROUTES:catalog.routes, authors:await json("authors.json")});
for (const q of ["Van Gogh", "凡高", "印像派", "Monnet", "神奈川冲浪里", "木版", "梵高 油画"]) {
  const actual = c.search.query(q), expected = full.search.query(q);
  for (const key of ["entries", "works"]) assert.deepEqual(actual[key].map(v=>v.id), expected[key].map(v=>v.id), q);
  assert.deepEqual(actual.authors.map(v=>v.name), expected.authors.map(v=>v.name), q);
  assert.deepEqual(actual.suggestions, expected.suggestions, q);
}
let attempts = 0;
const retry = catalogContent(catalog, async p => { if (++attempts === 1) throw new Error("offline"); return json(p); });
await assert.rejects(retry.ensureSearch(), /offline/);
await retry.ensureSearch();
assert.equal(attempts, 2, "failed requests must remain retryable");
const art = c.BYWORK["commons-8624693"];
assert.ok(imageHTML(art).includes("assets/thumbnails/"));
assert.ok(!imageHTML(art, "", true).includes("srcset"));
assert.ok(imageHTML(art, "", true).includes(art.image));
const home = createViews(c, {lane:"all",era:"all"}, new Set(),new Set()).map(c.DATA.filter(d=>d.level==="core"));
const paths = [...new Set([...home.matchAll(/src="([^"?]+)(?:\?[^\"]*)?"/g)].map(m=>m[1]))];
const previewBytes = (await Promise.all(paths.map(async p=>(await read(p)).length))).reduce((a,b)=>a+b,0);
const catalogBytes = gzipSync(await read("data/catalog.json")).length;
assert.ok(previewBytes < 550_000, `homepage preview budget: ${previewBytes}`);
assert.ok(catalogBytes < 120_000, `catalogue budget: ${catalogBytes}`);
const html = (await read("index.html")).toString();
assert.match(html, /rel="modulepreload"/);
assert.match(html, /as="fetch" href="\.\/data\/catalog.json\?v=/);
assert.ok(!html.includes("search-index.json"), "do not preload search on the home page");
console.log(`Built-site checks passed; catalogue ${catalogBytes} B gzip, ${paths.length} previews ${previewBytes} B, catalogue indexing ${startupMs.toFixed(1)} ms.`);
