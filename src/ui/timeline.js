import { esc } from "./helpers.js";
import { levelRank } from "../learning.js";

// Era boundaries in years (BCE negative). Each era gets its own width so that the dense
// modern decades and the long ancient millennia are both readable.
const BOUNDS = [-3500, 500, 1400, 1750, 1900, 1945, 1980, 2026];
const WIDTHS = [300, 250, 270, 270, 250, 270, 250];
const TICKS = [[-3000, -2000, -1000, 0], [600, 800, 1000, 1200], [1500, 1600, 1700], [1800, 1850], [1910, 1920, 1930, 1940], [1950, 1960, 1970], [1990, 2000, 2010, 2020]];
const ROW = 30, GAP = 6;

export const yearLabel = (y) => (y < 0 ? `前${-y}` : `${y}`);

function scale(eraFilter) {
  const eras = eraFilter === "all" ? BOUNDS.slice(0, -1).map((_, i) => i) : [+eraFilter];
  const width = eras.length === 1 ? 1100 : null;
  const segments = [];
  let offset = 0;
  for (const i of eras) {
    const w = width || WIDTHS[i];
    segments.push({ era: i, from: BOUNDS[i], to: BOUNDS[i + 1], x: offset, w });
    offset += w;
  }
  const x = (year) => {
    const first = segments[0], last = segments.at(-1);
    if (year <= first.from) return first.x;
    if (year >= last.to) return last.x + last.w;
    const s = segments.find((seg) => year <= seg.to);
    return s.x + ((year - s.from) / (s.to - s.from)) * s.w;
  };
  return { segments, x, total: offset };
}

// Greedy row packing; a bar reserves room for its label even when the bar itself is short.
function pack(items, x) {
  const rows = [];
  const bars = items.map((d) => {
    const left = x(d.years[0]), right = x(d.years[1]);
    const end = Math.max(right, left + d.zh.length * 13 + 22);
    let row = rows.findIndex((edge) => edge + GAP <= left);
    if (row < 0) row = rows.push(0) - 1;
    rows[row] = end;
    return { d, left, width: Math.max(4, right - left), row };
  });
  return { bars, rows: rows.length };
}

export function inTimeline(d, era) {
  if (era === "all") return true;
  return d.years[1] > BOUNDS[+era] && d.years[0] < BOUNDS[+era + 1];
}

export function timelineHTML(items, c, { era = "all", lane = "all", seen = new Set(), focus = null } = {}) {
  const { segments, x, total } = scale(era);
  const range = segments.at(-1).to - segments[0].from;
  // Zoomed into one era, traditions spanning many centuries would only fill rows edge to edge.
  const visible = items.filter((d) => d.years && d.years[1] > segments[0].from && d.years[0] < segments.at(-1).to &&
    (era === "all" || d.years[1] - d.years[0] <= Math.max(600, range * 2.5)));
  const hidden = items.length - visible.length;
  if (!visible.length) return "";
  const lanes = c.LANES.filter((l) => lane === "all" || l[0] === lane);
  const axis = `<div class="tl-head"><div class="tl-corner">${era === "all" ? "年代" : `<button data-era="all">← 全部时代</button>`}</div><div class="tl-axis" style="width:${total}px">${segments.map((s) => `<button class="tl-era" data-era="${era === "all" ? s.era : "all"}" style="left:${s.x}px;width:${s.w}px" title="${era === "all" ? "只看这个时代" : "返回全部时代"}"><b>${esc(c.ERAS[s.era][0])}</b><small>${esc(c.ERAS[s.era][1])}</small></button>`).join("")}${segments.flatMap((s) => (era === "all" ? TICKS[s.era] : niceTicks(s.from, s.to)).map((y) => `<span class="tl-tick" style="left:${x(y)}px">${yearLabel(y)}</span>`)).join("")}</div></div>`;
  const grid = segments.map((s) => `<i class="tl-line" style="left:${s.x}px"></i>`).join("");
  const body = lanes.map((l) => {
    const group = visible.filter((d) => d.lane === l[0]).sort((a, b) => a.years[0] - b.years[0] || levelRank(a) - levelRank(b) || (b.years[1] - b.years[0]) - (a.years[1] - a.years[0]));
    if (!group.length) return "";
    const { bars, rows } = pack(group, x);
    return `<section class="tl-lane" style="--c:${l[3]}"><h3 class="tl-lane-name"><button data-lane="${l[0]}">${esc(l[1])}<small>${group.length}</small></button></h3><div class="tl-track" style="width:${total}px;height:${rows * ROW + 8}px">${grid}${bars.map(({ d, left, width, row }) => {
      const long = d.years[1] - d.years[0] > 600;
      const clipped = d.years[0] < segments[0].from;
      const cls = ["tl-bar", d.level === "core" && "core", long && "long", d.ongoing && "ongoing", clipped && "clipped", seen.has(d.id) && "seen", focus === d.id && "focus"].filter(Boolean).join(" ");
      return `<button class="${cls}" data-node="${d.id}" data-tl="${d.id}" style="left:${left}px;top:${row * ROW + 4}px;--w:${width}px" title="${esc(`${d.zh} · ${d.date}`)}"><span>${clipped ? "← " : ""}${esc(d.zh)}</span></button>`;
    }).join("")}</div></section>`;
  }).join("");
  return `<div class="timeline" role="region" aria-label="时间轴，可横向滚动" tabindex="0"><div class="tl-inner" style="width:calc(${total}px + var(--lane-w))">${axis}${body}</div></div><p class="tl-note">条形为大致活跃期；虚尾表示传统延续至后世，“←”表示起点更早。${era === "all" ? "点击时代标题可放大该时代。" : `${hidden ? `另有 ${hidden} 个跨越多个时代的长期传统，可在全部时代中查看。` : ""}点击时代标题返回全部时代。`}</p>`;
}

function niceTicks(from, to) {
  const span = to - from, step = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000].find((s) => span / s <= 8);
  const ticks = [];
  for (let y = Math.ceil(from / step) * step; y < to; y += step) if (y > from) ticks.push(y);
  return ticks;
}

// Entries elsewhere in the world during roughly the same years, one or two per region.
export function contemporaries(d, c, limit = 8) {
  if (!d.years) return [];
  const span = d.years[1] - d.years[0];
  if (span > 450) return [];
  const scored = c.DATA.filter((e) => e.lane !== d.lane && e.years && e.years[1] - e.years[0] <= Math.max(350, span * 3))
    .map((e) => {
      const overlap = Math.min(d.years[1], e.years[1]) - Math.max(d.years[0], e.years[0]);
      const union = Math.max(d.years[1], e.years[1]) - Math.min(d.years[0], e.years[0]);
      return { e, score: overlap / union };
    })
    .filter((r) => r.score > 0.15)
    .sort((a, b) => b.score - a.score || levelRank(a.e) - levelRank(b.e));
  const picked = [], perLane = {};
  for (const round of [1, 2])
    for (const r of scored) {
      if (picked.length >= limit || picked.includes(r.e)) continue;
      if ((perLane[r.e.lane] || 0) < round) { picked.push(r.e); perLane[r.e.lane] = (perLane[r.e.lane] || 0) + 1; }
    }
  return picked.sort((a, b) => a.years[0] - b.years[0]);
}
