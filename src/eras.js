// Era boundaries in years (BCE negative), matching data/taxonomy.json. The first bound is where
// the timeline axis starts; earlier beginnings are drawn clipped.
export const BOUNDS = [-3500, 500, 1400, 1750, 1900, 1945, 1980, Math.max(2026, new Date().getFullYear())];

export const yearLabel = (y) => (y < 0 ? `前${-y}` : `${y}`);

export function eraOfYear(year) {
  for (let i = 1; i < BOUNDS.length - 1; i++) if (year < BOUNDS[i]) return i - 1;
  return BOUNDS.length - 2;
}

// Works carry their own creation dates when known. Broad dates ("1900s", a dynasty) defer to the
// era of their entry when that era fits the range; otherwise the midpoint decides.
function workEras(w, BYID) {
  const own = w.entries.map((id) => BYID[id]?.era).filter((e) => e !== undefined);
  if (!w.years) return own;
  const [a, b] = w.years;
  if (b - a >= 50) {
    const fit = own.filter((e) => BOUNDS[e] <= b && (e === BOUNDS.length - 2 || BOUNDS[e + 1] > a));
    if (fit.length) return fit;
  }
  return [eraOfYear((a + b) / 2)];
}
export const workEra = (w, BYID) => Math.min(...workEras(w, BYID));
export const workInEra = (w, era, BYID) => workEras(w, BYID).includes(era);
export const workMid = (w, BYID) => {
  const years = w.years && w.years[1] - w.years[0] < 50 ? w.years : BYID[w.entries[0]]?.years || w.years;
  return years ? (years[0] + years[1]) / 2 : 0;
};

const DIGITS = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
function chineseNumber(text) {
  if (/^\d+$/.test(text)) return +text;
  const m = /^([一二三四五六七八九])?(十)?([一二三四五六七八九])?$/.exec(text);
  if (!m || (!m[1] && !m[2] && !m[3])) return null;
  if (!m[2]) return m[3] ? null : DIGITS[m[1]];
  return (m[1] ? DIGITS[m[1]] : 1) * 10 + (m[3] ? DIGITS[m[3]] : 0);
}

// "1500", "1500年", "公元前500年", "16世纪", "十六世纪下半叶", "1960年代", "1400—1500"
// become a year range, so a reader can ask what was happening at a given time.
export function parseYearQuery(value) {
  const q = String(value || "").trim().replace(/\s+/g, "").replace(/^公元(?!前)/, "");
  let m = /^(公元前|前|BCE?|-)?(\d{1,5})年?$/i.exec(q);
  if (m) {
    const y = m[1] ? -m[2] : +m[2];
    return y > BOUNDS.at(-1) || (!m[1] && m[2].length < 3) ? null : { from: y, to: y, label: `${yearLabel(y)}年` };
  }
  m = /^(\d{3})0年代$/.exec(q);
  if (m) return { from: m[1] * 10, to: m[1] * 10 + 9, label: `${m[1]}0年代` };
  m = /^(公元前|前)?(\d{1,2}|[一二三四五六七八九十]{1,3})世纪(初|初期|上半叶|前期|中叶|中期|下半叶|后期|晚期|末|末期)?$/.exec(q);
  if (m) {
    const n = chineseNumber(m[2]);
    if (!n || n > 21) return null;
    let from = m[1] ? -n * 100 : (n - 1) * 100, to = from + 99;
    const part = m[3] || "";
    if (/初/.test(part)) to = from + 29;
    else if (/上半|前期/.test(part)) to = from + 49;
    else if (/中/.test(part)) { from += 30; to = from + 39; }
    else if (/下半|后期/.test(part)) from += 50;
    else if (/晚|末/.test(part)) from += 70;
    return { from, to: Math.min(to, BOUNDS.at(-1)), label: q };
  }
  m = /^(前)?(\d{3,4})[-—–~至到](前)?(\d{3,4})年?$/.exec(q);
  if (m) {
    const from = m[1] ? -m[2] : +m[2], to = m[3] ? -m[4] : +m[4];
    return from < to && to <= BOUNDS.at(-1) ? { from, to, label: `${yearLabel(from)}—${yearLabel(to)}` } : null;
  }
  return null;
}
