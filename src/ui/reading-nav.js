import { esc } from "./helpers.js";

export function readingNavigation({ selected, sequence, route, position, BYID }) {
  const selectedIndex = sequence.indexOf(selected);
  const index = route ? position : selectedIndex;
  const previous = sequence[index - 1], next = sequence[index + 1];
  const step = (id, delta) => `<button data-step="${delta}" ${!id ? "disabled" : ""} class="${delta > 0 ? "primary" : ""}"><span>${delta > 0 ? (route ? "下一站 →" : "下一条 →") : (route ? "← 上一站" : "← 上一条")}</span>${id ? `<strong>${esc(BYID[id].zh)}</strong>` : ""}</button>`;
  const nextButton = next ? step(next, 1) : route ? '<button class="primary" data-finish-route>本路线结束 · 返回路线</button>' : step(null, 1);
  const progress = `${index + 1} / ${sequence.length}`;
  return {
    bottom: `${step(previous, -1)}<span>${route ? "路线进度" : "连续阅读"}<small>${progress}</small></span>${nextButton}`,
    top: route ? `<div class="route-status"><strong>${esc(route.title)}</strong><span>${selectedIndex < 0 ? "相关条目 · 原路线" : "当前"}第 ${position + 1} / ${sequence.length} 站</span><select aria-label="路线目录" id="routeStops">${sequence.map((id, i) => `<option value="${id}" ${i === position ? "selected" : ""}>${i + 1}. ${esc(BYID[id].zh)}</option>`).join("")}</select></div><div class="route-controls">${selectedIndex < 0 ? `<button data-resume-route>返回第 ${position + 1} 站</button>` : step(previous, -1)}${nextButton}</div>` : "",
  };
}
