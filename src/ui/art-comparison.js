import { esc, imageHTML, link } from "./helpers.js";

const selectedWorks = [];
export function artworkPickButton(id) {
  return `<button class="art-pick" data-pick-work="${id}" aria-pressed="${selectedWorks.includes(id)}">${selectedWorks.includes(id) ? "✓ 已选作品" : "＋ 作品对照"}</button>`;
}
export function setupArtComparison(c) {
  const dialog = document.getElementById("artComparison");
  const bar = document.getElementById("artComparebar");
  let slots = [], scales = [1, 1], opening = false;
  const changes = [0, 0];
  const loadError = () => {
    const toast = document.getElementById("toast");
    toast.textContent = "作品资料未能加载，请重试。"; toast.classList.add("visible");
    setTimeout(() => toast.classList.remove("visible"), 3000);
  };
  function refreshSelection() {
    bar.hidden = !selectedWorks.length;
    bar.innerHTML = `<span>${selectedWorks.map((id) => esc(c.BYWORK[id].zh)).join(" ＋ ")}</span><button data-show-art-comparison ${selectedWorks.length !== 2 ? "disabled" : ""}>对照作品 (${selectedWorks.length}/2)</button><button data-clear-art-comparison aria-label="清空作品对照">清空 ×</button>`;
    document.querySelectorAll("[data-pick-work]").forEach((button) => {
      const selected = selectedWorks.includes(button.dataset.pickWork);
      button.setAttribute("aria-pressed", selected);
      button.textContent = selected ? "✓ 已选作品" : "＋ 作品对照";
    });
    document.querySelectorAll("[data-show-art-comparison]").forEach((b) => { b.disabled = selectedWorks.length !== 2; });
  }
  const options = [...c.WORKS].sort((a, b) => a.zh.localeCompare(b.zh, "zh-CN"));
  function panel(side) {
    const a = c.BYWORK[slots[side]];
    return `<section class="art-compare-panel" data-panel="${side}"><label>${side ? "右侧作品" : "左侧作品"}<select data-compare-slot="${side}" aria-label="${side ? "右" : "左"}侧作品">${options.map((w) => `<option value="${w.id}" ${w.id === a.id ? "selected" : ""}>${esc(w.zh)} · ${esc(w.artistZh || w.artist)} · ${esc(w.date)}</option>`).join("")}</select></label><div class="art-compare-tools"><button data-scale="${side}" data-delta="-0.25" aria-label="缩小${side ? "右" : "左"}图">−</button><output>${Math.round(scales[side] * 100)}%</output><button data-scale="${side}" data-delta="0.25" aria-label="放大${side ? "右" : "左"}图">＋</button><button data-fit="${side}">适合窗口</button></div><div class="art-compare-stage" tabindex="0" aria-label="${side ? "右" : "左"}图，放大后可拖动或滚动"><div class="art-compare-canvas">${imageHTML(a, "", true)}</div></div><div class="art-compare-caption"><strong>${esc(a.zh)}</strong><span>${esc(a.artistZh || a.artist)} · ${esc(a.date)}</span><span>${esc(a.medium || "")}</span>${link(a.url, esc(a.museum || "作品来源"))}<small>${esc(a.credit)}${a.license ? ` · ${esc(a.license)}` : ""}</small>${a.licenseUrl ? link(a.licenseUrl, "图片许可") : ""}</div></section>`;
  }
  function zoom(side, value) {
    const root = dialog.querySelector(`[data-panel="${side}"]`), stage = root.querySelector(".art-compare-stage");
    const old = scales[side], next = Math.max(1, Math.min(4, value));
    const x = (stage.scrollLeft + stage.clientWidth / 2) / old, y = (stage.scrollTop + stage.clientHeight / 2) / old;
    scales[side] = next;
    const canvas = root.querySelector(".art-compare-canvas");
    canvas.style.width = `${next * 100}%`; canvas.style.height = `${next * 100}%`;
    root.querySelector("output").textContent = `${Math.round(next * 100)}%`;
    stage.scrollTo(x * next - stage.clientWidth / 2, y * next - stage.clientHeight / 2);
    root.querySelector('[data-delta="-0.25"]').disabled = next === 1;
    root.querySelector('[data-delta="0.25"]').disabled = next === 4;
  }
  document.addEventListener("click", (event) => {
    const b = event.target.closest("button"); if (!b) return;
    const d = b.dataset;
    if (d.pickWork) {
      if (selectedWorks.includes(d.pickWork)) selectedWorks.splice(selectedWorks.indexOf(d.pickWork), 1);
      else if (selectedWorks.length < 2) selectedWorks.push(d.pickWork);
      else { document.getElementById("toast").textContent = "已选两件作品；可在对照窗口更换任意一侧。"; dialog.open || show(); return; }
      refreshSelection();
    }
    if (d.showArtComparison !== undefined && selectedWorks.length === 2) show();
    if (d.clearArtComparison !== undefined) { selectedWorks.length = 0; refreshSelection(); }
    if (d.scale !== undefined) zoom(+d.scale, scales[+d.scale] + +d.delta);
    if (d.fit !== undefined) zoom(+d.fit, 1);
  });
  async function show() {
    if (opening || dialog.open) return;
    opening = true;
    const pair = [...selectedWorks];
    try { await c.ensureWorks(pair); }
    catch (error) { console.error(error); loadError(); opening = false; return; }
    opening = false;
    if (pair.join() !== selectedWorks.join()) return;
    slots = pair; scales = [1, 1];
    dialog.innerHTML = `<div class="modal-head"><h2 id="artComparisonTitle">作品对照</h2><button data-close="artComparison" aria-label="关闭作品对照">关闭 ×</button></div><div class="art-compare-grid">${panel(0)}${panel(1)}</div>`;
    dialog.showModal(); zoom(0, 1); zoom(1, 1);
  }
  dialog.addEventListener("change", async (e) => {
    if (e.target.dataset.compareSlot === undefined) return;
    const side = +e.target.dataset.compareSlot;
    const request = ++changes[side], id = e.target.value;
    try { await c.ensureWorks([id]); }
    catch (error) { console.error(error); if (request === changes[side]) {e.target.value = slots[side]; loadError();} return; }
    if (!dialog.open || request !== changes[side]) return;
    slots[side] = id; scales[side] = 1;
    selectedWorks.splice(0, selectedWorks.length, ...slots);
    refreshSelection();
    dialog.querySelector(`[data-panel="${side}"]`).outerHTML = panel(side);
    zoom(side, 1); dialog.querySelector(`[data-compare-slot="${side}"]`).focus({ preventScroll: true });
  });
  let drag = null;
  dialog.addEventListener("close", () => { changes[0]++; changes[1]++; });
  dialog.addEventListener("pointerdown", (e) => {
    const stage = e.target.closest(".art-compare-stage");
    if (!stage || e.button !== 0 || e.pointerType === "touch") return;
    const side = +stage.closest("[data-panel]").dataset.panel; if (scales[side] === 1) return;
    e.preventDefault(); stage.setPointerCapture(e.pointerId);
    drag = { stage, x: e.clientX, y: e.clientY, left: stage.scrollLeft, top: stage.scrollTop };
  });
  dialog.addEventListener("pointermove", (e) => {
    if (drag) drag.stage.scrollTo(drag.left + drag.x - e.clientX, drag.top + drag.y - e.clientY);
  });
  for (const name of ["pointerup", "pointercancel", "lostpointercapture", "close"]) dialog.addEventListener(name, () => { drag = null; });
  return refreshSelection;
}
