import { parseYearQuery } from "./eras.js";
export function normalize(value) {
  return String(value || "").normalize("NFKD").replace(/\p{M}/gu, "").toLocaleLowerCase()
    .replace(/[·・’'“”"—–-]/g, " ").replace(/\s+/g, " ").trim();
}
function distance(a, b, max = 2) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const grid = Array.from({ length: a.length + 1 }, () => Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) grid[i][0] = i;
  for (let j = 0; j <= b.length; j++) grid[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) {
    grid[i][j] = Math.min(grid[i - 1][j] + 1, grid[i][j - 1] + 1, grid[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) grid[i][j] = Math.min(grid[i][j], grid[i - 2][j - 2] + 1);
  }
  return grid[a.length][b.length];
}
export function compileSearch(entries, works, seeds = []) {
  const hasName = (value, name) => normalize(value).includes(normalize(name));
  const authors = seeds.map((s) => ({ ...s, names: [s.name, ...s.aliases].map(normalize),
    works: works.filter((w) => s.aliases.some((a) => hasName(`${w.artistZh} ${w.artist}`, a))).map((w) => w.id),
    entries: entries.filter((d) => s.aliases.some((a) => hasName(d.people, a))).map((d) => d.id),
  }));
  const byName = (name) => authors.find((a) => a.name === name || a.aliases.includes(name));
  for (const w of works) {
    if (!w.artistZh || authors.some((a) => a.works.includes(w.id))) continue;
    // Credits naming several makers join the people already known; anonymous, workshop
    // and "follower of" credits never become people.
    const names = w.artistZh.split(/[、；]/).map((n) => n.replace(/^(?:传为|可能为)/, "").replace(/（(?:设计|题字|制作|绘)）$/, "").trim());
    const anonymous = /佚名|工匠|作坊|工作室|归属|本站|中国|地区|王朝|文化|摄影|集体|原记录|不详|未详|画工|画坊|工坊|雕刻师|雕刻者|复制者|追随者|模仿者|风格仿自|团队|群体|多位|公司|苏美尔|艺术家$|Workshop|Master|Toys/.test(w.artistZh);
    if (names.length > 1) for (const n of names) byName(n)?.works.push(w.id);
    if (anonymous || names.length > 1) continue;
    let author = byName(names[0]);
    if (!author) {
      const dates = String(w.artist || "").match(/(active\s+|c\.\s*)?(\d{3,4})(?:\/\d+)?\s*[–-]\s*(c\.\s*|after\s+)?(\d{3,4})\)/);
      author = { name: names[0], aliases: [...new Set([names[0], w.artist?.replace(/\s*\(.*$/, "").replace(/^(?:attributed to|possibly by)\s+/i, "")].filter(Boolean))], works: [], entries: [] };
      if (dates) author.life = `${dates[1]?.startsWith("active") ? "活动于" : dates[1] ? "约" : ""}${dates[2]}—${dates[4]}${dates[3]?.startsWith("after") ? "后" : ""}`;
      author.names = author.aliases.map(normalize);
      authors.push(author);
    }
    author.works.push(w.id);
  }
  const byWork = new Map(works.map((w) => [w.id, w]));
  for (const a of authors) a.entries = [...new Set([...a.entries, ...a.works.flatMap((id) => byWork.get(id).entries)])];
  const authorWords = (w) => authors.filter((a) => a.works.includes(w.id)).flatMap((a) => a.aliases).join(" ");
  const workIndex = works.map((w) => ({ value: w, names: [w.zh, w.title, ...(w.aliases || [])].map(normalize), text: normalize([w.zh, w.title, w.artist, w.artistZh, w.medium, authorWords(w)].join(" ")) }));
  const entryIndex = entries.map((d) => ({ value: d, names: [d.zh, d.en, ...(d.aliases || [])].map(normalize), text: normalize([d.zh, d.en, ...(d.aliases || []), d.tags, d.look, d.context, d.region, d.people, d.work, d.influence, ...authors.filter((a) => a.entries.includes(d.id)).flatMap((a) => a.aliases), ...workIndex.filter((w) => w.value.entries.includes(d.id)).map((w) => w.text)].join(" ")) }));
  return { authors, entries: entryIndex.map(({value, ...r}) => ({...r, id: value.id})), works: workIndex.map(({value, ...r}) => ({...r, id: value.id})) };
}
export function createSearch(entries, works, seeds = []) {
  return hydrateSearch(compileSearch(entries, works, seeds), entries, works);
}
export function hydrateSearch(compiled, entries, works) {
  const byEntry = new Map(entries.map(d => [d.id, d])), byWork = new Map(works.map(w => [w.id, w]));
  const authors = compiled.authors;
  const entryIndex = compiled.entries.map(r => ({...r, value: byEntry.get(r.id)}));
  const workIndex = compiled.works.map(r => ({...r, value: byWork.get(r.id)}));
  const vocabulary = [...entryIndex.map((r) => ({ label: r.value.zh, names: r.names })), ...authors.map((a) => ({ label: a.name, names: a.names })), ...workIndex.map((r) => ({ label: r.value.zh, names: [r.names[0]] }))];
  // "1500", "16世纪": everything active at that time, rather than digits that happen to appear in text.
  function queryYears(span, allowedIds) {
    const overlaps = (y) => y && y[0] <= span.to && y[1] >= span.from;
    const mid = (y) => (y[0] + y[1]) / 2, target = (span.from + span.to) / 2, width = span.to - span.from;
    const near = (a, b) => Math.abs(mid(a) - target) - Math.abs(mid(b) - target);
    const life = (a) => { const m = /(前)?(\d{3,4})\D{0,4}?(前)?(\d{3,4})/.exec(a.life || ""); return m && [m[1] ? -m[2] : +m[2], m[3] ? -m[4] : +m[4]]; };
    return {
      entries: entries.filter((d) => allowedIds.has(d.id) && overlaps(d.years))
        .sort((a, b) => (a.level === "core" ? 0 : 1) - (b.level === "core" ? 0 : 1) || (a.years[1] - a.years[0]) - (b.years[1] - b.years[0])),
      works: works.filter((w) => overlaps(w.years) && w.years[1] - w.years[0] <= Math.max(100, width * 2) && w.entries.some((id) => allowedIds.has(id)))
        .sort((a, b) => near(a.years, b.years)),
      authors: authors.filter((a) => overlaps(life(a)) && a.entries.some((id) => allowedIds.has(id))).sort((a, b) => near(life(a), life(b))),
      suggestions: [],
      years: span,
    };
  }
  function query(value, allowedIds = new Set(entries.map((d) => d.id))) {
    const span = parseYearQuery(value);
    if (span) return queryYears(span, allowedIds);
    const q = normalize(value), tokens = q.split(" ").filter(Boolean);
    const match = (text) => tokens.length > 0 && tokens.every((t) => text.includes(t));
    const rank = (record) => record.names.includes(q) ? 0 : record.names.some((n) => n.startsWith(q)) ? 1 : record.names.some(match) ? 2 : 3;
    const matchingEntries = entryIndex.filter((r) => allowedIds.has(r.value.id) && match(r.text)).sort((a, b) => rank(a) - rank(b));
    const matchingWorks = workIndex.filter((r) => r.value.entries.some((id) => allowedIds.has(id)) && match(r.text)).sort((a, b) => rank(a) - rank(b));
    const matchingAuthors = authors.filter((a) => a.entries.some((id) => allowedIds.has(id)) && match(a.names.join(" ")));
    let suggestions = [];
    if (q.length >= 3 && q.length <= 40 && !matchingEntries.length && !matchingWorks.length && !matchingAuthors.length) {
      const max = /[\u3400-\u9fff]/.test(q) || q.length < 6 ? 1 : 2;
      suggestions = vocabulary.map((v) => ({ label: v.label, score: Math.min(...v.names.filter((n) => Math.abs(n.length - q.length) <= max).map((n) => distance(q, n, max)), max + 1) }))
        .filter((v) => v.score > 0 && v.score <= max).sort((a, b) => a.score - b.score).filter((v, i, all) => all.findIndex((x) => x.label === v.label) === i).slice(0, 3).map((v) => v.label);
    }
    return { entries: matchingEntries.map((r) => r.value), works: matchingWorks.map((r) => r.value), authors: matchingAuthors, suggestions };
  }
  return { query, authors };
}
