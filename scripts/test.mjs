import assert from "node:assert/strict";
import { inScope, readScope, levelRank } from "../src/learning.js";
import { readFile } from "node:fs/promises";
import { indexContent } from "../src/content.js";
import { createViews } from "../src/ui/views.js";
import { detailHTML } from "../src/ui/detail.js";
import { creditHTML } from "../src/ui/helpers.js";
import { linkedText } from "../src/ui/inline-links.js";
import { searchResultsHTML } from "../src/ui/search-results.js";

const json = async (name) => JSON.parse(await readFile(new URL(`../data/${name}.json`, import.meta.url), "utf8"));
const taxonomy = await json("taxonomy");
const c = indexContent({
  taxonomy,
  groups: await Promise.all(taxonomy.lanes.map(([id]) => json(`entries/${id}`))),
  artworks: await json("artworks"),
  SOURCES: await json("sources"),
  EDGES: await json("relationships"),
  ROUTES: await json("routes"),
  authors: await json("authors"),
});
const state = { view: "index", q: "", lane: "all", era: "all" };
const views = createViews(c, state, new Set(), new Set());
for (const alias of ["梵高", "凡高", "Van Gogh", "Vincent van Gogh"]) {
  const result = c.search.query(alias);
  assert.ok(result.authors.some((a) => a.name === "梵高"), alias);
  assert.ok(result.works.some((a) => a.id === "met-436535"), alias);
}
assert.equal(c.search.query("印象派").entries[0].id, "impressionism");
assert.ok(c.search.query("印像派").suggestions.includes("印象主义"));
assert.ok(c.search.query("Monnet").suggestions.includes("莫奈"));
assert.ok(c.search.query("神奈川冲浪里").works.some((a) => a.id === "ukiyoe"));
assert.equal(c.search.query("梵高", new Set(["egypt"])).works.length, 0);
assert.equal(c.search.query("梵高", new Set(["egypt"])).authors.length, 0);
const linkSample = linkedText('文艺复兴与油画，<img src=x>；Surrealism.', "baroque", c.TERMS);
assert.ok(linkSample.includes('data-node="renaissance"') && linkSample.includes('data-node="oilpainting"'));
assert.ok(linkSample.includes("&lt;img") && !linkSample.includes('<img src=x>'));
assert.ok(!linkedText("油画", "oilpainting", c.TERMS).includes("<a"));
assert.ok(!linkedText("NotSurrealismSuffix", "baroque", c.TERMS).includes("<a"));
const resultHTML = searchResultsHTML(c.search.query("梵高"), views, c);
assert.ok(resultHTML.includes('id="searchAuthors"') && resultHTML.includes('id="searchWorks"') && resultHTML.includes('id="searchEntries"'));
for (const d of c.DATA.filter((d) => d.level === "core")) {
  assert.ok(d.featuredWorks.length >= 3 && d.featuredWorks.length <= 5, d.id);
  assert.deepEqual(c.ART[d.id].slice(0, d.featuredWorks.length).map((w) => w.id), d.featuredWorks);
}
assert.equal(readScope(new URLSearchParams()), "core");
assert.equal(readScope(new URLSearchParams("view=index")), "all");
assert.equal(readScope(new URLSearchParams("q=敦煌")), "all");
assert.equal(readScope(new URLSearchParams("level=all")), "all");
assert.equal(readScope(new URLSearchParams("level=focus&view=index")), "all");
assert.equal(readScope(new URLSearchParams("level=invalid")), "core");
assert.equal(c.DATA.filter((d) => inScope(d, "core")).length, 42);
assert.equal(c.DATA.filter((d) => inScope(d, "focus")).length, 233);
assert.equal(c.DATA.filter((d) => inScope(d, "all")).length, 233);
for (const d of c.DATA.filter((d) => d.level === "core")) {
  const html = detailHTML(d, c, { saved: new Set(), compare: [] });
  assert.ok(html.includes(">核心</span>") && !html.includes("为什么先读") && !html.includes("试着说清楚"));
  for (const id of d.next) assert.ok(html.includes(`data-node="${id}"`));
}
const core = c.DATA.find((d) => d.level === "core" && c.DATA.some((x) => x.lane === d.lane && x.era === d.era && x.level === "extended"));
const extension = c.DATA.find((d) => d.lane === core.lane && d.era === core.era && d.level === "extended");
assert.ok(levelRank(core) < levelRank(extension));
const priorityMap = views.map([extension, core]);
assert.ok(priorityMap.indexOf(`data-node="${core.id}"`) < priorityMap.indexOf(`data-node="${extension.id}"`));

// A shared artwork preview must open in the entry being browsed, not its first association.
const sharedEntry = c.DATA.find((d) => c.ART[d.id].slice(1, 4).some((a) => a.entries[0] !== d.id));
assert.ok(sharedEntry);
const cards = views.cards([sharedEntry]);
for (const a of c.ART[sharedEntry.id].slice(1, 4)) {
  assert.ok(cards.includes(`data-node="${sharedEntry.id}" data-work="${a.id}"`));
}

// All entries stay illustrated; imported photos and original guides both count.
for (const d of c.DATA) {
  const works = c.ART[d.id];
  assert.ok(works.length > 0, `${d.id} must have an illustration`);
  const html = detailHTML(d, c, { saved: new Set(), compare: [], artIndex: Math.max(0, works.length - 1) });
  assert.ok(!html.includes("undefined"), d.id);
  if (works.length) {
    assert.ok(html.includes(`${works.length} / ${works.length}`), d.id);
    assert.ok(html.includes(works.at(-1).image), d.id);
  }
  for (const a of works) assert.ok(c.BYWORK[a.id].entries.includes(d.id));
}

// A photographer's license must remain visibly attributed and linked.
const photo = c.BYWORK['commons-57035370'];
const credit = creditHTML(photo);
assert.ok(credit.includes('Donald Woodman'));
assert.ok(credit.includes(photo.licenseUrl));
assert.ok(credit.includes('图片许可：'));
for (const guide of c.WORKS.filter((a) => a.kind === 'guide')) {
  assert.ok(guide.zh.includes('学习图解'));
  assert.ok(creditHTML(guide).includes('非历史作品'));
}
const gallery = detailHTML(c.BYID.feminist, c, { saved: new Set(), compare: [], artIndex: 0 });
assert.ok(gallery.indexOf('class="thumbnails"') < gallery.indexOf('class="detail-art"'));
assert.ok(!gallery.includes('这幅图怎么看') && !gallery.includes('study-check'));
assert.match(gallery, /data-thumb="-1" disabled aria-label="上一幅配图"/);
const lastImage = detailHTML(c.BYID.feminist, c, { saved: new Set(), compare: [], artIndex: c.ART.feminist.length - 1 });
assert.match(lastImage, /disabled aria-label="下一幅配图"/);

// Teaching notes are scoped to an artwork/entry pair and escaped as text.
const noteEntry = c.DATA.find((d) => c.ART[d.id].some((a) => a.notes?.[d.id]));
const noteIndex = c.ART[noteEntry.id].findIndex((a) => a.notes?.[noteEntry.id]);
const art = c.ART[noteEntry.id][noteIndex];
const note = art.notes[noteEntry.id];
art.notes[noteEntry.id] = '<img src=x onerror="alert(1)">';
const html = detailHTML(noteEntry, c, { saved: new Set(), compare: [], artIndex: noteIndex });
assert.ok(html.includes("&lt;img"));
assert.ok(!html.includes('<img src=x'));
art.notes[noteEntry.id] = note;

// These historically distinct media must not collapse into a broad keyword match.
assert.ok(!c.ART.cyanotype.some((a) => a.id === "cma-161234"));
assert.ok(c.ART.print.some((a) => a.id === "cma-161234"));
assert.ok(!c.ART.songland.some((a) => a.id === "cma-154086"));
assert.ok(c.ART.southernsong.some((a) => a.id === "cma-154086"));
console.log(`Passed artwork context, all ${c.DATA.length} detail views, teaching notes and media classification checks.`);
