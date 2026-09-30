import { readingNavigation } from "../src/ui/reading-nav.js";
import assert from "node:assert/strict";
import { inScope, readScope, levelRank } from "../src/learning.js";
import { readFile } from "node:fs/promises";
import { indexContent } from "../src/content.js";
import { createViews } from "../src/ui/views.js";
import { detailHTML } from "../src/ui/detail.js";
import { creditHTML } from "../src/ui/helpers.js";
import { linkedText } from "../src/ui/inline-links.js";
import { searchResultsHTML } from "../src/ui/search-results.js";
import { timelineHTML, timelineSplit, contemporaries, inTimeline } from "../src/ui/timeline.js";
import { eraStepHTML } from "../src/ui/era.js";
import { parseYearQuery, workEra, workInEra, spanLabel } from "../src/eras.js";
import { lifeSpan } from "../src/search.js";
import { personHTML, personHash, personFromHash } from "../src/ui/person.js";
import { mergeBackup, backupJSON } from "../src/storage.js";
import { checkEraConsistency } from "./era-consistency.mjs";

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

// Every route exposes its exact next stop and an explicit finish, including detours.
for (const route of c.ROUTES) {
  route.ids.forEach((selected, position) => {
    const nav = readingNavigation({selected, sequence:route.ids, route, position, BYID:c.BYID});
    assert.ok(nav.top.includes(`第 ${position + 1} / ${route.ids.length} 站`));
    if (position < route.ids.length - 1) assert.ok(nav.top.includes(c.BYID[route.ids[position + 1]].zh));
    else assert.ok(nav.top.includes("data-finish-route"));
  });
  const detour = c.DATA.find(d => !route.ids.includes(d.id));
  assert.ok(readingNavigation({selected:detour.id, sequence:route.ids, route, position:0, BYID:c.BYID}).top.includes("data-resume-route"));
}
assert.ok(views.routes(c.DATA).includes('data-route-index="0"'));
assert.deepEqual(c.BYWORK.renaissance.entries, ["renaissance"]);
assert.ok(!c.BYWORK["met-435658"].entries.includes("proto"));
assert.ok(!c.BYWORK["cma-159234"].entries.includes("proto"));
assert.ok(!c.BYWORK["met-454662"].entries.includes("fatimid"));

// People: anonymous and workshop credits never become people; shared credits join known makers.
const people = new Map(c.search.authors.map((a) => [a.name, a]));
for (const name of people.keys()) assert.ok(!/不详|未详|工坊|画工|追随者|模仿者|团队/.test(name), name);
assert.equal(people.get("莫奈").life, "1840—1926");
assert.equal(people.get("沈周").life, "1427—1509", "dates parsed from museum credits");
assert.ok(people.get("朱莉娅·玛格丽特·卡梅伦").works.length >= 3, "multi-artist credit shared");
assert.ok(!people.has("奥古斯都·韦尔比·诺斯莫尔·普金（设计）"));
const monet = personHTML(people.get("莫奈"), c, { seen: new Set() });
assert.ok(monet.includes('id="personTitle"') && monet.includes('data-person-work=') && monet.includes('data-node="impressionism"'));
assert.equal(personFromHash("#" + personHash("伦勃朗")), "伦勃朗");
assert.equal(personFromHash("#baroque"), null);
assert.ok(detailHTML(c.BYID.impressionism, c, { saved: new Set(), compare: [] }).includes('data-person="莫奈"'), "captions link to people");

// Timeline: every entry has a bar; zooming into an era keeps overlapping, not long-running, entries.
const tl = timelineHTML(c.DATA, c);
for (const d of c.DATA) assert.ok(tl.includes(`data-tl="${d.id}"`), d.id);
const modern = c.DATA.filter((d) => inTimeline(d, "3"));
assert.ok(modern.some((d) => d.id === "impressionism") && !modern.some((d) => d.id === "egypt"));
const zoomed = timelineHTML(modern, c, { era: "3" });
assert.ok(zoomed.includes('data-tl="ukiyoe"') && !zoomed.includes('data-tl="calligraphy"'));
const peers = contemporaries(c.BYID.impressionism, c);
assert.ok(peers.length >= 4 && peers.every((e) => e.lane !== "west" && e.years[0] <= 1886 && e.years[1] >= 1860));
assert.deepEqual(contemporaries(c.BYID.calligraphy, c), [], "no contemporaries for millennia-long traditions");

// Era placement follows the years; a start year on a boundary belongs to the later era.
const bounds = [-50000, 500, 1400, 1750, 1900, 1945, 1980, 2026];
assert.deepEqual(checkEraConsistency(c.DATA, bounds), []);
const eraProblems = (d, warnings) => checkEraConsistency([{ id: "x", date: "", ...d }], bounds, { warnings });
assert.equal(eraProblems({ era: 1, years: [220, 589] }).length, 1, "mostly before 500");
assert.deepEqual(eraProblems({ era: 1, years: [220, 589], eraNote: "有意归入较晚时代的示例说明。" }), []);
assert.deepEqual(eraProblems({ era: 3, years: [1890, 1910] }), [], "an even split may use either era");
assert.deepEqual(eraProblems({ era: 2, years: [-475, 1911] }), [], "long traditions are placed by their peak");
assert.match(eraProblems({ era: 1, years: [1400, 1520] })[0], /does not overlap/);
const dateWarnings = [];
assert.deepEqual(eraProblems({ era: 4, years: [1915, 1939], date: "约1920—1930年代" }, dateWarnings), []);
assert.equal(dateWarnings.length, 1, "small date disagreements only warn");
assert.match(eraProblems({ era: 2, years: [1500, 1900], date: "约13世纪以来" })[0], /disagrees/);
assert.deepEqual(eraProblems({ era: 0, years: [-800, -27], date: "约前8—前1世纪" }, dateWarnings), []);
assert.equal(dateWarnings.length, 1);

// Backups merge without losing local notes and refuse unrelated files.
const known = (id) => !!c.BYID[id];
const mine = { saved: new Set(["baroque"]), seen: new Set(), notes: { baroque: "光" } };
const file = backupJSON(new Set(["pop"]), new Set(["pop"]), { baroque: "戏剧", pop: "广告", nope: "x" });
assert.equal(mergeBackup(file, { ...mine, known }), 3);
assert.ok(mine.saved.has("pop") && mine.seen.has("pop") && mine.notes.pop === "广告" && !mine.notes.nope);
assert.ok(mine.notes.baroque.startsWith("光") && mine.notes.baroque.includes("戏剧"));
assert.equal(mergeBackup(file, { ...mine, known }), 0, "importing twice adds nothing");
assert.throws(() => mergeBackup('{"saved":[]}', { ...mine, known }), /备份/);

// Route filtering runs one search per render, not one per route member.
let queries = 0;
const counted = { ...c, search: { ...c.search, query: (...args) => (queries++, c.search.query(...args)) } };
createViews(counted, { ...state, q: "山水" }, new Set(), new Set()).matchingRoutes(c.DATA);
assert.equal(queries, 1);
// Era switching: one era is a lane-by-lane card grid showing every entry, never a stretched table column.
const eraState = { ...state, view: "map", era: "2", lane: "all", level: "all" };
const eraViews = createViews(c, eraState, new Set(), new Set());
const inEra2 = c.DATA.filter((d) => d.era === 2);
const slice = eraViews.map(inEra2, { carry: c.DATA.filter((d) => d.era !== 2 && inTimeline(d, "2")) });
assert.ok(slice.includes('class="era-slice"') && !slice.includes("map-table") && !slice.includes("另外"));
for (const d of inEra2) assert.ok(slice.includes(`data-node="${d.id}"`), d.id);
assert.ok(slice.includes('class="carry-chip core" data-node="calligraphy"'), "long traditions still active are listed");
const coreSlice = eraViews.map(inEra2.filter((d) => d.level === "core"), { widen: (lane) => inEra2.filter((d) => d.lane === lane && d.level !== "core").length });
assert.ok(coreSlice.includes('data-level="all"'), "core scope offers the rest of the era");
assert.ok(!views.map(c.DATA).includes("▧"), "every entry is illustrated, so no picture marker");
assert.ok(!eraStepHTML(c, 0).includes('data-era-dir="prev"') && eraStepHTML(c, 0).includes('data-era="1"'));
assert.ok(!eraStepHTML(c, 6).includes('data-era-dir="next"') && eraStepHTML(c, 6).includes(c.ERAS[6][2]));

// Zoomed timeline: an era's own entries always get a bar; traditions spanning it become chips; every lane stays.
const era0 = timelineSplit(c.DATA.filter((d) => inTimeline(d, "0")), "0");
assert.ok(era0.bars.some((d) => d.id === "prehistoric"));
const era2 = timelineSplit(c.DATA.filter((d) => inTimeline(d, "2")), "2");
assert.ok(["garden", "lacquer"].every((id) => era2.bars.some((d) => d.id === id)));
assert.ok(era2.chips.some((d) => d.id === "calligraphy") && era2.chips.every((d) => d.era !== 2));
const coreZoom = timelineHTML(c.DATA.filter((d) => d.level === "core" && inTimeline(d, "2")), c, { era: "2", fit: 700 });
for (const [id] of c.LANES) assert.ok(coreZoom.includes(`data-lane="${id}"`), `lane ${id} kept in zoom`);
assert.ok(!coreZoom.includes('style="width:1100px'), "zoom follows the width it is given");

// Year search answers "what was happening then".
assert.deepEqual(parseYearQuery("1500"), { from: 1500, to: 1500, label: "1500年" });
assert.deepEqual(parseYearQuery("前5世纪"), { from: -500, to: -401, label: "前5世纪" });
assert.equal(parseYearQuery("十六世纪").from, 1500);
assert.equal(parseYearQuery("20"), null);
const around1500 = c.search.query("1500");
assert.ok(around1500.years && around1500.entries.some((d) => d.id === "renaissance") && around1500.entries.every((d) => d.years[0] <= 1500 && d.years[1] >= 1500));

assert.equal(parseYearQuery("1500s").label, "16世纪");
assert.deepEqual([parseYearQuery("20世纪60年代").from, parseYearQuery("约1500年前后").from, parseYearQuery("2030年代")], [1960, 1500, null]);
assert.deepEqual([parseYearQuery("前500—300").from, parseYearQuery("前500—300").to], [-500, -300]);
// People are found by their lives, living artists and "active" dates included.
for (const [a, name] of [["1960年代", "草间弥生"], ["16世纪", "提香"], ["1550", "丁托列托"], ["11世纪", "范宽"]])
  assert.ok(c.search.query(a).authors.some((p) => p.name === name), `${a} → ${name}`);
assert.ok(c.search.authors.filter((p) => p.life).every((p) => lifeSpan(p)), "every life date parses");
assert.ok(!c.search.authors.find((p) => p.name === "拉斐尔").entries.includes("netart"), "Raphael is not Rafael Lozano-Hemmer");
// Chips say "今" only when a tradition really reaches the present.
assert.equal(spanLabel(c.BYID.icons), "500—1500");
assert.ok(spanLabel(c.BYID.calligraphy).endsWith("今"));

// Works are placed by their own date; broad dates defer to a fitting entry era.
assert.equal(workEra(c.BYWORK["met-310542"], c.BYID), 0, "a 400–500 CE whistle stays in antiquity");
const byWork = (id) => c.BYWORK[id];
assert.equal(workEra(byWork("cma-118676"), c.BYID), 4, "a 1900s toy stays with streamline design");
assert.ok(c.WORKS.filter((w) => w.years).every((w) => [0, 1, 2, 3, 4, 5, 6].some((e) => workInEra(w, e, c.BYID))));

// Routes under an era filter say which stops fall in it.
const routeHTML = createViews(c, { ...state, view: "routes", era: "6" }, new Set(), new Set()).routes(c.DATA);
assert.ok(routeHTML.includes('class="route-focus"') && routeHTML.includes('class="hit"'));
assert.ok(!views.routes(c.DATA).includes('class="hit"'));
console.log(`Passed people (${people.size}), timeline, era placement, era switching, backup and search-count checks.`);
