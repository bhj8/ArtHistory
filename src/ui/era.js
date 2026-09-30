import { esc } from "./helpers.js";

// The band shown when one era is selected: step to the neighbouring eras (with how much each
// holds under the current filters), read what the era was about, or go back to all eras.
export function eraStepHTML(c, era, { counts = [], carried = [], unit = "条", stats = "", bottom = false } = {}) {
  const i = +era, E = c.ERAS;
  const side = (j, dir) => {
    if (j < 0 || j >= E.length) return `<span class="era-step-gap" aria-hidden="true"></span>`;
    const n = counts[j], more = carried[j] || 0;
    // An era with no entries of its own may still hold traditions that continue into it.
    const detail = n == null ? E[j][1] : n === 0 && more ? `0 ${unit} · 并存 ${more}` : `${n} ${unit}`;
    return `<button class="era-step-btn ${dir}${n === 0 && !more ? " zero" : ""}" data-era="${j}" data-era-dir="${bottom ? "b" : ""}${dir}" aria-keyshortcuts="${dir === "prev" ? "[" : "]"}" title="${esc(`${E[j][0]} · ${E[j][1]}${n == null ? "" : ` · ${detail}`}（快捷键 ${dir === "prev" ? "[" : "]"}）`)}"><span class="era-step-arrow" aria-hidden="true">${dir === "prev" ? "‹" : "›"}</span><span class="era-step-label"><small>${dir === "prev" ? "上一时代" : "下一时代"}</small><b>${esc(E[j][0])}</b><small>${esc(detail)}</small></span></button>`;
  };
  const now = bottom
    ? `<div class="era-step-now"><b>${esc(E[i][0])}</b><span>${esc(E[i][1])}</span><button class="text-link" data-top>回到顶部 ↑</button></div>`
    : `<div class="era-step-now"><div class="era-step-title"><h3 tabindex="-1">${esc(E[i][0])}</h3><span>${esc(E[i][1])}</span><button class="text-link" data-era="all" data-era-dir="all">全部时代</button></div>${E[i][2] ? `<p class="era-step-summary">${esc(E[i][2])}</p>` : ""}${stats ? `<p class="era-step-stats">${stats}</p>` : ""}</div>`;
  return `<nav class="era-step${bottom ? " bottom" : ""}" aria-label="${bottom ? "继续浏览其他时代" : "切换时代"}">${side(i - 1, "prev")}${now}${side(i + 1, "next")}</nav>`;
}
