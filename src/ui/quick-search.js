import { esc, imageHTML } from "./helpers.js";

const TOPICS = ["山水", "印象派", "浮世绘", "版画", "建筑", "陶瓷", "摄影", "包豪斯", "敦煌"];
const YEARS = [["1500:1500", "1500年"], ["1800:1899", "19世纪"], ["1960:1969", "1960年代"]];

// Typeahead under the header search box: jump straight to an entry, person or work.
export function setupQuickSearch(c, { input, panel, recent, commit, scope = () => ({ label: "" }) }) {
  let active = -1, request = 0, open = false, globalDefault = false;
  const options = () => [...panel.querySelectorAll('[role="option"]')];
  const option = (attrs, body, cls = "") =>
    `<button type="button" role="option" tabindex="-1" class="quick-option ${cls}" ${attrs}>${body}</button>`;
  const lane = (d) => c.L[d.lane];
  const entryOption = (d) => {
    const art = c.ART[d.id][0];
    return option(`data-node="${d.id}"`, `<span class="quick-thumb">${art ? imageHTML(art, "", false, "44px") : `<i style="--c:${lane(d)[3]}">${esc(d.zh.slice(0, 1))}</i>`}</span><span class="quick-text"><b>${esc(d.zh)}</b><small>${esc(d.en)} · ${esc(d.date)}</small></span><span class="quick-kind" style="--c:${lane(d)[3]}">${esc(lane(d)[1])}</span>`);
  };
  const personOption = (a) => {
    const art = a.works.map((id) => c.BYWORK[id]).find(Boolean);
    return option(`data-person="${esc(a.name)}"`, `<span class="quick-thumb round">${art ? imageHTML(art, "", false, "44px") : `<i>${esc(a.name.slice(0, 1))}</i>`}</span><span class="quick-text"><b>${esc(a.name)}</b><small>${esc([a.aliases.find((n) => /^[A-Za-zÀ-ž]/.test(n)), a.life].filter(Boolean).join(" · "))}</small></span><span class="quick-kind">${a.works.length ? `${a.works.length} 件作品` : "人物"}</span>`);
  };
  const workOption = (w) =>
    option(`data-art="${w.id}"`, `<span class="quick-thumb">${imageHTML(w, "", false, "44px")}</span><span class="quick-text"><b>${esc(w.zh)}</b><small>${esc(w.artistZh || w.artist)} · ${esc(w.date)}</small></span><span class="quick-kind">作品</span>`);
  const group = (title, items) => (items ? `<div class="quick-group" role="presentation"><div class="quick-label">${title}</div>${items}</div>` : "");

  function show(html) {
    panel.innerHTML = html;
    panel.hidden = !html;
    open = !!html;
    input.setAttribute("aria-expanded", open);
    setActive(-1);
  }
  function setActive(index) {
    const list = options();
    active = index;
    list.forEach((el, i) => {
      el.classList.toggle("active", i === active);
      el.id = `quick-${i}`;
      el.setAttribute("aria-selected", i === active);
    });
    if (active >= 0) {
      input.setAttribute("aria-activedescendant", `quick-${active}`);
      list[active].scrollIntoView({ block: "nearest" });
    } else input.removeAttribute("aria-activedescendant");
  }
  function idle() {
    const ids = recent().slice(0, 5);
    show(
      group("最近读过", ids.map((id) => entryOption(c.BYID[id])).join("")) +
        `<div class="quick-group quick-topics" role="presentation"><div class="quick-label">随手翻翻</div><div>${TOPICS.map((t) => `<button type="button" role="option" tabindex="-1" class="quick-option quick-chip" data-topic="${t}">${t}</button>`).join("")}${YEARS.map(([y, label]) => `<button type="button" role="option" tabindex="-1" class="quick-option quick-chip quick-when" data-year="${y}" data-year-label="${label}">⌛ ${label}</button>`).join("")}</div></div>` +
        `<p class="quick-hint"><kbd>↑</kbd><kbd>↓</kbd> 选择 · <kbd>Enter</kbd> 打开 · <kbd>Esc</kbd> 关闭</p>`,
    );
  }
  async function update() {
    const value = input.value.trim(), mine = ++request;
    globalDefault = false;
    if (!value) return idle();
    if (!c.searchReady) {
      show('<p class="quick-hint">正在加载搜索…</p>');
      try { await c.ensureSearch(); } catch { if (mine === request) show('<p class="quick-hint">搜索未能加载，请检查网络后重试。</p>'); return; }
      if (mine !== request) return;
    }
    const r = c.search.query(value);
    const total = r.entries.length + r.authors.length + r.works.length;
    // A year or century also offers the timeline at that moment.
    const when = r.years
      ? option(`data-year="${r.years.from}:${r.years.to}" data-year-label="${esc(r.years.label)}"`, `<span class="quick-thumb"><i>⌛</i></span><span class="quick-text"><b>在时间轴上看 ${esc(r.years.label)}</b><small>${r.entries.length} 个条目在这一时期仍在进行</small></span><span class="quick-kind">时间轴</span>`, "quick-year")
      : "";
    if (!total && !when) {
      const numeric = /\d|世纪|年代/.test(value) ? '<p class="quick-hint">也可以按年代检索：1500、16世纪、前5世纪、1960年代。</p>' : "";
      return show(`<p class="quick-hint">没有找到“${esc(value)}”。</p>${r.suggestions.length ? group("是不是要找", r.suggestions.map((s) => option(`data-query="${esc(s)}"`, `<span class="quick-text"><b>${esc(s)}</b></span>`)).join("")) : ""}${numeric}`);
    }
    // The page applies the chosen era and lane, and keeps the reader's view; say so, and offer more when there is more.
    // `own` is set in the saved, recent, gallery and routes views, whose pages count in their own unit.
    const where = scope(value), own = where.own;
    const inScope = where.label && !own ? c.search.query(value, where.ids) : r;
    const shown = own ? own.here : inScope.entries.length + inScope.authors.length + inScope.works.length;
    const wider = own && !own.leaves ? own.all : total;
    const detail = (res) => `${res.entries.length} 条目 · ${res.authors.length} 人物 · ${res.works.length} 作品`;
    const allRow = (global, text, small) => option(`data-quick-all${global ? '="global"' : ""}`, `<span class="quick-text"><b>${text}</b>${small ? `<small>${small}</small>` : ""}</span>${global === !shown ? "<kbd>Enter</kbd>" : ""}`, "quick-all");
    const rows = !where.label
      ? (own ? allRow(false, `查看全部 ${shown} ${own.unit}`, "") : allRow(false, `查看全部 ${total} 个结果`, detail(r)))
      : (shown ? allRow(false, `在「${esc(where.label)}」中查看 ${shown} ${own ? own.unit : "个结果"}`, own ? "" : detail(inScope)) : "") +
        (wider > shown ? allRow(true, own && !own.leaves ? `在全部时代与分类中查看 ${wider} ${own.unit}` : `在全部${own ? "条目" : "时代与分类"}中查看 ${total} 个结果`, own && !own.leaves ? "" : detail(r)) : "");
    globalDefault = !!where.label && !shown && wider > 0;
    show(
      (when ? group("年代", when) : "") +
      group(r.years ? "这一时期的条目" : "条目", r.entries.slice(0, 5).map(entryOption).join("")) +
        group("人物", r.authors.slice(0, 3).map(personOption).join("")) +
        group("作品", r.works.slice(0, 4).map(workOption).join("")) +
        rows,
    );
  }
  function close() {
    request++;
    if (!open) return;
    show("");
  }
  input.setAttribute("role", "combobox");
  input.setAttribute("aria-autocomplete", "list");
  input.setAttribute("aria-controls", panel.id);
  input.setAttribute("aria-expanded", "false");
  input.addEventListener("focus", () => { c.ensureSearch().catch(() => {}); update(); });
  input.addEventListener("keydown", (e) => {
    if (e.isComposing) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) return update();
      const n = options().length, down = e.key === "ArrowDown";
      if (n) setActive(active < 0 ? (down ? 0 : n - 1) : (active + (down ? 1 : -1) + n) % n);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const chosen = options()[active];
      if (chosen) chosen.click();
      else { close(); commit({ global: globalDefault }); }
    } else if (e.key === "Escape" && open) {
      e.preventDefault();
      e.stopPropagation();
      close();
    }
  });
  panel.addEventListener("mousedown", (e) => e.preventDefault());
  panel.addEventListener("click", (e) => {
    const chosen = e.target.closest('[role="option"]');
    if (!chosen) return;
    if (chosen.dataset.quickAll !== undefined) commit({ global: chosen.dataset.quickAll === "global" });
    close();
    if (chosen.dataset.node || chosen.dataset.art || chosen.dataset.person || chosen.dataset.year || chosen.dataset.topic) input.blur();
  });
  document.addEventListener("pointerdown", (e) => {
    if (open && !e.target.closest(".searchbox")) close();
  });
  input.addEventListener("blur", () => setTimeout(() => { if (!input.matches(":focus")) close(); }, 150));
  return { update, close };
}
