import { esc } from "./helpers.js";
import { levelRank } from "../learning.js";
import { BOUNDS, yearLabel } from "../eras.js";

export { yearLabel };
// Each era gets its own width so that the dense modern decades and the long ancient millennia
// are both readable in the all-eras view. A zoomed era fills the width it is given instead.
const WIDTHS = [300, 250, 270, 270, 250, 270, 250];
const TICKS = [[-3000, -2000, -1000, 0], [600, 800, 1000, 1200], [1500, 1600, 1700], [1800, 1850], [1910, 1920, 1930, 1940], [1950, 1960, 1970], [1990, 2000, 2010, 2020]];
const ROW = 30, GAP = 6;
export const ZOOM_MIN = { desktop: 400, phone: 240 };

// Left edge of an era in the all-eras view, used to return to where the reader was.
export const eraX = (i) => WIDTHS.slice(0, i).reduce((a, b) => a + b, 0);

function scale(eraFilter, zoomWidth) {
  const eras = eraFilter === "all" ? WIDTHS.map((_, i) => i) : [+eraFilter];
  const segments = [];
  let offset = 0;
  for (const i of eras) {
    const w = eras.length === 1 ? zoomWidth : WIDTHS[i];
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

// Greedy row packing. A bar reserves room for its label even when the bar itself is short;
// labels that would run past the end of the axis are drawn ending at the bar's right edge.
function pack(items, x, total, from, to) {
  const rows = [];
  const bars = items.map((d) => {
    const left = x(d.years[0]), right = x(d.years[1]);
    const clipped = d.years[0] < from, cont = d.years[1] > to && !d.ongoing;
    const label = d.zh.length * 13 + 22 + (clipped ? 14 : 0) + (cont ? 14 : 0);
    const flip = left + label > total && right - label >= 0;
    const start = flip ? Math.min(left, right - label) : left;
    const end = flip ? right : Math.max(right, left + label);
    let row = rows.findIndex((edge) => edge + GAP <= start);
    if (row < 0) row = rows.push(0) - 1;
    rows[row] = end;
    return { d, left, right, width: Math.max(4, right - left), row, flip, clipped, cont };
  });
  return { bars, rows: rows.length };
}

export function inTimeline(d, era) {
  if (era === "all") return true;
  return d.years[1] > BOUNDS[+era] && d.years[0] < BOUNDS[+era + 1];
}

// In a zoomed era, traditions from other eras that span most of it are listed per lane
// instead of drawn edge to edge; everything else, including the era's own entries, gets a bar.
export function timelineSplit(items, era = "all") {
  if (era === "all") return { bars: items.filter((d) => d.years), chips: [] };
  const from = BOUNDS[+era], to = BOUNDS[+era + 1], range = to - from;
  const cover = (d) => (Math.min(d.years[1], to) - Math.max(d.years[0], from)) / range;
  const ambient = (d) => d.era !== +era && d.years[1] - d.years[0] > 600 && cover(d) >= 0.5;
  const shown = items.filter((d) => d.years && d.years[1] > from && d.years[0] < to);
  return { bars: shown.filter((d) => !ambient(d)), chips: shown.filter(ambient) };
}

export function timelineHTML(items, c, { era = "all", lane = "all", seen = new Set(), focus = null, fit = 0, phone = false, narrowed = false, widen = null, pulse = null, mark = null } = {}) {
  const zoomWidth = Math.max(phone ? ZOOM_MIN.phone : ZOOM_MIN.desktop, Math.floor(fit) || 1100);
  const { segments, x, total } = scale(era, zoomWidth);
  const from = segments[0].from, to = segments.at(-1).to;
  const { bars: barItems, chips } = timelineSplit(items, era);
  if (narrowed && !barItems.length && !chips.length) return "";
  const lanes = c.LANES.filter((l) => lane === "all" || l[0] === lane);
  const zoom = era !== "all";
  const eraHead = (s) => zoom
    ? `<div class="tl-era" style="left:${s.x}px;width:${s.w}px"><b>${esc(c.ERAS[s.era][0])}</b><small>${esc(c.ERAS[s.era][1])}</small></div>`
    : `<button class="tl-era${pulse === s.era ? " from" : ""}" data-era="${s.era}" style="left:${s.x}px;width:${s.w}px" title="放大这个时代"><b>${esc(c.ERAS[s.era][0])}</b><small>${esc(c.ERAS[s.era][1])}</small></button>`;
  const ticks = segments.flatMap((s) => (zoom ? niceTicks(s.from, s.to, s.w) : TICKS[s.era]).map((y) => `<span class="tl-tick" style="left:${x(y)}px">${yearLabel(y)}</span>`)).join("");
  const markX = mark && [x(Math.max(from, mark.from)), x(Math.min(to, mark.to))];
  const markHTML = (label) => markX && mark.to >= from && mark.from <= to
    ? `<i class="tl-mark" style="left:${markX[0]}px;width:${Math.max(2, markX[1] - markX[0])}px">${label ? `<span>${esc(mark.label)}</span>` : ""}</i>` : "";
  const corner = zoom
    ? `<button data-era="all" title="返回全部时代">← 全部</button>`
    : `<span>年代</span><span class="tl-pan"><button data-tl-scroll="-1" aria-label="时间轴向左">‹</button><button data-tl-scroll="1" aria-label="时间轴向右">›</button></span>`;
  const width = `width:calc(${total}px + var(--lane-w))`;
  const head = `<div class="tl-stick"><div class="tl-head" style="${width}"><div class="tl-corner">${corner}</div><div class="tl-axis" style="width:${total}px">${segments.map(eraHead).join("")}${ticks}${markHTML(true)}</div></div></div>`;
  const grid = segments.map((s) => `<i class="tl-line" style="left:${s.x}px"></i>`).join("") + markHTML(false);
  const order = (a, b) => a.years[0] - b.years[0] || levelRank(a) - levelRank(b) || (b.years[1] - b.years[0]) - (a.years[1] - a.years[0]);
  const body = lanes.map((l) => {
    const group = barItems.filter((d) => d.lane === l[0]).sort(order);
    const ambient = chips.filter((d) => d.lane === l[0]).sort((a, b) => levelRank(a) - levelRank(b) || a.years[0] - b.years[0]);
    const n = group.length + ambient.length;
    if (!n && narrowed) return "";
    const name = `<h3 class="tl-lane-name"><button data-lane="${l[0]}">${esc(l[1])}<small>${n}</small></button></h3>`;
    const chipRow = ambient.length
      ? `<div class="tl-ambient"><span>贯穿本时代</span>${ambient.map((d) => `<button data-node="${d.id}" class="${d.level === "core" ? "core" : ""}" title="${esc(`${d.zh} · ${d.date}`)}">${esc(d.zh)}<small>${yearLabel(d.years[0])}—${d.ongoing ? "今" : yearLabel(d.years[1])}</small></button>`).join("")}</div>`
      : "";
    if (!group.length) {
      const more = widen?.(l[0]) || 0;
      const note = ambient.length ? "" : more
        ? `<div class="tl-empty">核心范围在这一时期没有条目 <button data-level="all">看全部 ${more} 条</button></div>`
        : `<div class="tl-empty">这一时期暂无收录条目</div>`;
      return `<section class="tl-lane tl-lane-empty" style="--c:${l[3]}">${name}<div class="tl-track" style="width:${total}px">${chipRow}${note}</div></section>`;
    }
    const { bars, rows } = pack(group, x, total, from, to);
    if (zoom) {
      // Rows holding only stubs carried over from the previous era sink below the era's own bars.
      const stub = (b) => b.clipped && b.width < 0.25 * total;
      const byRow = Array.from({ length: rows }, () => []);
      bars.forEach((b) => byRow[b.row].push(b));
      const keys = [...byRow.keys()];
      const moved = [...keys.filter((r) => !byRow[r].every(stub)), ...keys.filter((r) => byRow[r].every(stub))];
      const remap = new Map(moved.map((r, i) => [r, i]));
      bars.forEach((b) => { b.row = remap.get(b.row); });
    }
    return `<section class="tl-lane" style="--c:${l[3]}">${name}<div class="tl-track" style="width:${total}px">${chipRow}<div class="tl-bars" style="height:${rows * ROW + 8}px">${grid}${bars.map(({ d, left, right, width, row, flip, clipped, cont }) => {
      const long = d.years[1] - d.years[0] > 600;
      const cls = ["tl-bar", d.level === "core" && "core", long && "long", d.ongoing && "ongoing", clipped && "clipped", cont && "cont", flip && "flip", seen.has(d.id) && "seen", focus === d.id && "focus"].filter(Boolean).join(" ");
      const place = flip ? `right:${(total - right).toFixed(1)}px` : `left:${left.toFixed(1)}px`;
      return `<button class="${cls}" data-node="${d.id}" data-tl="${d.id}" style="${place};top:${row * ROW + 4}px;--w:${width.toFixed(1)}px" title="${esc(`${d.zh} · ${d.date}`)}"><span>${clipped ? "← " : ""}${esc(d.zh)}${cont ? " →" : ""}</span></button>`;
    }).join("")}</div></div></section>`;
  }).join("");
  const note = zoom
    ? "条形为大致活跃期；“←”表示起点更早，“→”表示延续到下一时代，虚线表示延续至今的传统。“贯穿本时代”列出横跨多个时代的长期传统。"
    : "条形为大致活跃期；虚线表示延续至今的传统，“←”表示起点更早。点击时代标题可放大该时代。";
  return `<div class="tl-wrap${zoom ? " zoom" : ""}" data-era="${era}">${head}<div class="timeline" role="region" aria-label="时间轴${zoom ? "" : "，可横向滚动"}" tabindex="0"><div class="tl-inner" style="${width}">${body}</div></div></div><p class="tl-note">${note}</p>`;
}

function niceTicks(from, to, width = 1100) {
  const span = to - from, room = Math.max(2, Math.floor(width / 80));
  const step = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000].find((s) => span / s <= room) || 2000;
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
