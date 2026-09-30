// Keeps each entry's era, `years` and display `date` in agreement, so that choosing an era
// shows the movements that were actually active in it.
//
// `bounds` lists the era boundaries: era i covers [bounds[i], bounds[i + 1]); a start year on a
// boundary belongs to the later era. The first era is open towards the past, the last towards now.

const LONG_TRADITION = 600; // longer spans are placed by their peak, not by share of years
const TOLERANCE = 0.15; // the assigned era may hold at most this much less than the best era
const DATE_SLACK = 50; // date text off by more years than this fails; less only warns

const CENTURY_PART = {
  初: [0, 1 / 3], 前期: [0, 1 / 3], 前半叶: [0, 0.5], 上半叶: [0, 0.5],
  中叶: [0.25, 0.75], 中期: [0.25, 0.75],
  后半叶: [0.5, 1], 下半叶: [0.5, 1], 后期: [2 / 3, 1], 末: [2 / 3, 1],
};
// Like centuries, a decade reaches the start of the next one: "1950年代" covers 1950—1960.
const DECADE_PART = { 初: [0, 3], 中: [3, 7], 中期: [3, 7], 中后期: [4, 10], 末: [6, 10] };
const TOKEN = new RegExp(
  [
    "(公元前|前)?(?<!\\d)(\\d{1,2})\\s*[—–-]\\s*(公元前|前)?(\\d{1,2})\\s*世纪(初|末|中叶|中期|前半叶|上半叶|后半叶|下半叶|前期|后期)?",
    "(公元前|前)?(?<!\\d)(\\d{1,2})\\s*世纪(初|末|中叶|中期|前半叶|上半叶|后半叶|下半叶|前期|后期)?",
    "(公元前|前)?(?<!\\d)(\\d{3,4})\\s*年代(中后期|中期|初|末|中)?",
    "(公元前|前)?(?<!\\d)(\\d{3,4})(?!\\d)",
    "至今",
  ].map((p) => `(?:${p})`).join("|"),
  "g",
);
const OPEN_END = /^\s*年?\s*(及以后|以后|之后|以来|起|后)/;

function century(bce, n, part) {
  const [lo, hi] = bce ? [-n * 100, -(n - 1) * 100] : [(n - 1) * 100, n * 100];
  const [a, b] = CENTURY_PART[part] || [0, 1];
  return { lo: lo + a * 100, hi: lo + b * 100, kind: "century" };
}

// Reads explicit years, decades and centuries from display text such as "约前8—前1世纪",
// "约1860年代—1886年" or "1909年起，主要至1940年代".
export function dateSpans(text, now) {
  const spans = [];
  for (const m of String(text).matchAll(TOKEN)) {
    const end = m.index + m[0].length;
    if (m[2]) spans.push(century(!!m[1], +m[2]), { ...century(!!m[3], +m[4], m[5]), end });
    else if (m[7]) spans.push({ ...century(!!m[6], +m[7], m[8]), end });
    else if (m[10]) {
      const n = (m[9] ? -1 : 1) * +m[10], [a, b] = DECADE_PART[m[11]] || [0, 10];
      spans.push({ lo: n + a, hi: n + b, kind: "decade", end });
    } else if (m[13]) {
      const n = (m[12] ? -1 : 1) * +m[13];
      spans.push({ lo: n, hi: n, kind: "year", end });
    } else spans.push({ lo: now, hi: Infinity, kind: "now", end });
  }
  return spans;
}

const distance = (year, span) => Math.max(0, span.lo - year, year - span.hi);

// Returns problem strings; mild date-text disagreements go to the optional `warnings` array.
// - The era must overlap `years` at all.
// - For spans up to 600 years, the era's share of `years` must be within 0.15 of the best era's
//   share, unless `eraNote` explains a deliberate placement. Longer traditions are exempt.
// - Explicit years, decades and centuries in `date` must agree with `years` (warn up to 50 years).
export function checkEraConsistency(entries, bounds, { warnings = [] } = {}) {
  const problems = [];
  const eras = bounds.length - 1;
  const lo = (i) => (i === 0 ? -Infinity : bounds[i]);
  const hi = (i) => (i === eras - 1 ? Infinity : bounds[i + 1]);
  const pct = (x) => `${Math.round(x * 100)}%`;
  for (const entry of entries) {
    const { id, era, years } = entry;
    if (!Number.isInteger(era) || era < 0 || era >= eras) continue; // reported by check.mjs
    if (!Array.isArray(years) || !(years[0] < years[1])) continue;
    const [start, end] = years, span = end - start;
    const shares = Array.from({ length: eras }, (_, i) => Math.max(0, Math.min(end, hi(i)) - Math.max(start, lo(i))) / span);
    const best = shares.indexOf(Math.max(...shares));
    if (entry.eraNote !== undefined && !(typeof entry.eraNote === "string" && entry.eraNote.trim()))
      problems.push(`${id}: eraNote must be a non-empty string`);
    if (shares[era] === 0)
      problems.push(`${id}: era ${era} does not overlap years [${start}, ${end}]`);
    else if (span <= LONG_TRADITION) {
      const consistent = shares[era] >= shares[best] - TOLERANCE;
      if (!consistent && !entry.eraNote)
        problems.push(`${id}: era ${era} holds ${pct(shares[era])} of years [${start}, ${end}] but era ${best} holds ${pct(shares[best])}; correct years, move the era or explain it in eraNote`);
      if (consistent && entry.eraNote)
        warnings.push(`${id}: eraNote is no longer needed; era ${era} already matches years [${start}, ${end}]`);
    }
    const spans = dateSpans(entry.date, bounds[eras]);
    const dated = spans.filter((s) => s.kind !== "now"); // "至今" only speaks about the end
    if (!dated.length) continue;
    const first = dated.reduce((a, b) => (b.lo < a.lo ? b : a));
    const last = spans.reduce((a, b) => (b.hi > a.hi ? b : a));
    const final = spans.at(-1);
    const openEnd = OPEN_END.test(String(entry.date).slice(final.end)) ||
      (spans.length === 1 && (final.kind === "year" || entry.ongoing));
    const off = Math.max(distance(start, first), openEnd ? 0 : distance(end, last));
    if (!off) continue;
    const message = `${id}: date "${entry.date}" disagrees with years [${start}, ${end}] by ${Math.round(off)} years`;
    (off > DATE_SLACK ? problems : warnings).push(message);
  }
  return problems;
}
