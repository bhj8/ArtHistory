import { readingNavigation } from "./ui/reading-nav.js";
import { searchResultsHTML } from "./ui/search-results.js";
import { setupArtComparison } from "./ui/art-comparison.js";
import { SCOPES, inScope, levelRank, readScope } from "./learning.js";
import { loadContent } from "./content.js";
import { readLocal, saveProgress, readNotes, saveNotes, backupJSON, mergeBackup } from "./storage.js";
import { createViews } from "./ui/views.js";
import { detailHTML, comparisonHTML } from "./ui/detail.js";
import { esc, link, imageHTML, creditHTML } from "./ui/helpers.js";
import { setupQuickSearch } from "./ui/quick-search.js";
import { personHTML, personHash, personFromHash } from "./ui/person.js";
import { timelineHTML, inTimeline } from "./ui/timeline.js";

async function start() {
  const c = await loadContent(),
    {
      DATA,
      BYID,
      WORKS,
      BYWORK,
      ART,
      LANES,
      ERAS,
      L,
      ROUTES,
      SOURCES,
    } = c;
  const refreshArtComparison = setupArtComparison(c);
  const $ = (id) => document.getElementById(id);
  const saved = new Set(readLocal("art-atlas-saved").filter((id) => BYID[id]));
  const seen = new Set(readLocal("art-atlas-seen").filter((id) => BYID[id]));
  const notes = readNotes();
  const hasNote = (id) => !!notes[id]?.trim();
  const kept = (id) => saved.has(id) || hasNote(id);
  const state = { view: "map", lane: "all", era: "all", q: "", sort: "time", illustrated: "", level: "core" };
  let selected = null,
    artIndex = 0,
    detailHistory = [],
    sequence = [],
    routeActive = null,
    routePosition = 0,
    compare = [],
    limit = 48,
    toastTimer,
    opener = null,
    browsePosition = null,
    personName = null,
    timelineFocus = null,
    searchTimer,
    composing = false,
    renderRequest = 0,
    detailRequest = 0;
  const views = createViews(c, state, saved, seen, notes);
  const titles = {
    map: "全景地图",
    timeline: "时间轴",
    index: "图解词典",
    recent: "最近读过",
    gallery: "作品图库",
    routes: "学习路线",
    saved: "收藏与笔记",
  };
  function readURL() {
    const p = new URLSearchParams(location.search);
    state.view = titles[p.get("view")] ? p.get("view") : "map";
    state.lane = L[p.get("lane")] ? p.get("lane") : "all";
    state.era = /^[0-6]$/.test(p.get("era")) ? p.get("era") : "all";
    state.q = p.get("q") || "";
    state.level = readScope(p);
    state.illustrated = p.get("illustrated") === "yes" ? "yes" : "";
    $("illustratedOnly").checked = !!state.illustrated;
    state.sort = ["time", "name", "images", "priority"].includes(p.get("sort"))
      ? p.get("sort")
      : "time";
    $("search").value = state.q;
    $("sort").value = state.sort;
  }
  function syncURL(push = false) {
    const u = new URL(location.href);
    u.search = "";
    for (const [k, v] of Object.entries(state)) {
      if (k === "level" || (v && !["all", "time"].includes(v) && !(k === "view" && v === "map")))
        u.searchParams.set(k, v);
    }
    if (selected && routeActive !== null) { u.searchParams.set("route", routeActive); u.searchParams.set("stop", routePosition); }
    u.hash = personName ? personHash(personName) : selected || "";
    history[push ? "pushState" : "replaceState"]({}, "", u);
  }
  function backupBar() {
    const count = Object.keys(notes).filter(hasNote).length;
    return `<div class="backup-bar"><p>收藏 ${saved.size} 条 · 笔记 ${count} 条 · 读过 ${seen.size} 条。只保存在这个浏览器里，换设备或清理浏览数据前请先导出。</p><div><button data-export>导出备份</button><button data-import>导入备份</button></div></div>`;
  }
  function toast(text) {
    $("toast").textContent = text;
    $("toast").classList.add("visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => $("toast").classList.remove("visible"), 2300);
  }
  function persist() {
    saveProgress(saved, seen);
    $("savedCount").textContent = DATA.filter((d) => kept(d.id)).length;
  }
  // Searching and the personal lists always cover every entry; the core/all scope only shapes browsing.
  const personalView = () => state.view === "saved" || state.view === "recent";
  const browseScope = () => (state.q.trim() || personalView() ? "all" : state.level);
  function hits(ignoreQuery = false, scope = browseScope()) {
    const matched = ignoreQuery || !state.q.trim() ? null : new Set(c.search.query(state.q).entries.map((d) => d.id));
    return DATA.filter(
      (d) =>
        inScope(d, scope) &&
        (state.lane === "all" || d.lane === state.lane) &&
        // The timeline zooms into an era by years, so it keeps entries that overlap it.
        (state.era === "all" || (state.view === "timeline" ? inTimeline(d, state.era) : d.era === +state.era)) &&
        (!state.illustrated || ART[d.id].length > 0) &&
        (!matched || matched.has(d.id)),
    ).sort((a, b) =>
      state.sort === "priority"
        ? levelRank(a) - levelRank(b) || a.era - b.era
        : state.sort === "name"
        ? a.zh.localeCompare(b.zh, "zh-CN")
        : state.sort === "images"
          ? ART[b.id].length - ART[a.id].length || a.era - b.era
          : a.era - b.era || levelRank(a) - levelRank(b),
    );
  }
  function currentItems() {
    const items = hits(state.view === "routes");
    if (state.view === "recent") {
      const order = [...seen].reverse();
      return items.filter((d) => seen.has(d.id)).sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
    }
    if (state.view === "routes") {
      const ids = new Set(views.matchingRoutes(items).flatMap((r) => r.ids));
      return items.filter((d) => ids.has(d.id));
    }
    return items.filter((d) => state.view !== "saved" || kept(d.id));
  }
  async function render({ url = true } = {}) {
    const request = ++renderRequest;
    if (state.q.trim() && !c.searchReady) {
      $("content").innerHTML = '<div class="empty" role="status">正在加载搜索…</div>';
      try { await c.ensureSearch(); }
      catch (error) {
        if (request !== renderRequest) return;
        console.error(error);
        $("content").innerHTML = '<div class="empty" role="alert">搜索暂时未能加载。<button data-retry-search>重试</button></div>';
        return;
      }
      if (request !== renderRequest) return;
    }
    persist();
    const items = currentItems(),
      ids = new Set(items.map((d) => d.id));
    $("lanes").innerHTML = [["all", "全部分类", "", null], ...LANES]
      .map(
        (l) =>
          `<button data-lane="${l[0]}" class="${state.lane === l[0] ? "on" : ""}" aria-pressed="${state.lane === l[0]}"><i style="--c:${l[3] || "#333"}"></i><span>${esc(l[1])}</span><small>${l[0] === "all" ? DATA.length : DATA.filter((d) => d.lane === l[0]).length}</small></button>`,
      )
      .join("");
    $("laneSelect").value = state.lane;
    $("eraSelect").value = state.era;
    // Search ignores the core/all scope, so the switch would only mislead while searching.
    $("learningScopes").hidden = !!state.q.trim() || personalView();
    $("learningScopes").innerHTML = Object.entries(SCOPES).map(([scope, label]) => `<button data-level="${scope}" aria-pressed="${state.level === scope}" class="${state.level === scope ? "on" : ""}">${label}<small>${DATA.filter((d) => inScope(d, scope)).length}</small></button>`).join("");
    $("eras").innerHTML =
      `<button data-era="all" aria-pressed="${state.era === "all"}" class="${state.era === "all" ? "on" : ""}">全部时代</button>` +
      ERAS.map(
        (e, i) =>
          `<button data-era="${i}" aria-pressed="${state.era == i}" class="${state.era == i ? "on" : ""}">${e[0]}<small>${e[1]}</small></button>`,
      ).join("");
    document.querySelectorAll("[data-view]").forEach((b) => {
      b.classList.toggle("on", b.dataset.view === state.view);
      b.setAttribute("aria-pressed", b.dataset.view === state.view);
    });
    $("viewTitle").textContent = state.q
      ? `${titles[state.view]} · 搜索结果`
      : titles[state.view];
    const filtered = browseScope() !== "all" || state.lane !== "all" || state.era !== "all" || state.q || state.illustrated;
    $("reset").hidden = !filtered;
    $("clearSearch").hidden = !state.q;
    $("sort").hidden = ["map", "timeline", "routes", "recent"].includes(state.view);
    $("activeFilters").innerHTML = [
      state.lane !== "all"
        ? `<button data-remove="lane">${L[state.lane][1]} ×</button>`
        : "",
      state.era !== "all"
        ? `<button data-remove="era">${ERAS[+state.era][0]} ×</button>`
        : "",
      state.q ? `<button data-remove="q">“${esc(state.q)}” ×</button>` : "",
      state.illustrated ? '<button data-remove="illustrated">只看有图 ×</button>' : "",
    ].join("");
    let count = items.length + " 个条目";
    if (state.q.trim() && !["routes", "saved", "recent", "gallery", "timeline"].includes(state.view)) {
      const allowedIds = new Set(hits(true).map((d) => d.id));
      const results = c.search.query(state.q, allowedIds);
      results.allowedIds = allowedIds;
      $("content").innerHTML = searchResultsHTML(results, views, c, limit);
      count = `${results.entries.length} 条目 · ${results.authors.length} 人物 · ${results.works.length} 作品`;
    } else if (state.view === "gallery") {
      let works = WORKS.filter((a) => a.entries.some((id) => ids.has(id)));
      // If a query directly names a work or its maker, show only those matches.
      const exactWorks = state.q.trim() ? c.search.query(state.q, new Set(hits(true).map((d) => d.id))).works : [];
      if (exactWorks.length) works = exactWorks;
      if (state.sort === "priority")
        works.sort((a, b) => Math.min(...a.entries.map(id => levelRank(BYID[id]))) - Math.min(...b.entries.map(id => levelRank(BYID[id]))));
      else if (state.sort === "name")
        works.sort((a, b) => a.zh.localeCompare(b.zh, "zh-CN"));
      else
        works.sort((a, b) => BYID[a.entries[0]].era - BYID[b.entries[0]].era);
      $("content").innerHTML = views.gallery(works, limit);
      count = works.length + " 幅配图";
    } else if (state.view === "timeline") {
      $("content").innerHTML = timelineHTML(items, c, { era: state.era, lane: state.lane, seen, focus: timelineFocus }) || views.cards([]);
      timelineFocus = null;
    } else if (state.view === "map" && !state.q) {
      $("content").innerHTML = views.map(items);
    } else if (state.view === "routes") {
      $("content").innerHTML = views.routes(items);
      count = views.matchingRoutes(items).length + " 条路线";
    } else $("content").innerHTML = (state.view === "saved" ? backupBar() : "") + views.cards(items);
    refreshArtComparison();
    $("resultCount").textContent = count;
    if (url) syncURL();
  }
  function reset() {
    Object.assign(state, { lane: "all", era: "all", q: "", illustrated: "", level: "all" });
    $("illustratedOnly").checked = false;
    $("search").value = "";
    limit = 48;
    render();
  }
  function updateSave(id) {
    saved.has(id) ? saved.delete(id) : saved.add(id);
    persist();
    document.querySelectorAll(`[data-save="${id}"]`).forEach((b) => {
      b.classList.toggle("on", saved.has(id));
      b.setAttribute("aria-pressed", saved.has(id));
      b.textContent = b.classList.contains("quick-save")
        ? saved.has(id)
          ? "★"
          : "☆"
        : saved.has(id)
          ? "★ 已收藏"
          : "☆ 收藏";
      if (b.classList.contains("quick-save"))
        b.setAttribute(
          "aria-label",
          (saved.has(id) ? "取消收藏" : "收藏") + BYID[id].zh,
        );
    });
    toast(saved.has(id) ? "已收藏" : "已取消收藏");
    if (state.view === "saved" && !$("detail").open) render();
  }
  function drawDetail() {
    const d = BYID[selected];
    $("crumb").textContent = L[d.lane][1] + " / " + ERAS[d.era][0];
    $("backDetail").hidden = !detailHistory.length;
    $("detailBody").innerHTML = detailHTML(d, c, { saved, compare, artIndex, note: notes[d.id] || "" });
    refreshArtComparison();
    const nav = readingNavigation({selected, sequence, route: ROUTES[routeActive], position: routePosition, BYID});
    $("detailNav").innerHTML = nav.bottom;
    $("routeNav").innerHTML = nav.top;
    $("routeNav").hidden = routeActive === null;
    if (routeActive !== null) $("routeStops").onchange = e => openNode(e.target.value);

  }
  async function openNode(id, { art, route, back = false, fromURL = false } = {}) {
    if (!BYID[id]) return;
    if (fromURL) {
      const params = new URLSearchParams(location.search), value = params.get("route");
      route = value !== null && /^\d+$/.test(value) && ROUTES[+value] ? +value : null;
      routePosition = Math.max(0, Math.min((ROUTES[route]?.ids.length || 1) - 1, Number(params.get("stop")) || 0));
    }
    const request = ++detailRequest;
    if (!c.isEntryReady(id)) toast("正在加载条目…");
    try { await c.ensureEntry(id); }
    catch (error) { if (request === detailRequest) toast("条目未能加载，请再次打开重试。"); console.error(error); return; }
    if (request !== detailRequest) return;
    $("toast").classList.remove("visible");
    if (!$("detail").open) {
      opener = document.activeElement;
      // Capture once per reading session, not when following related entries.
      browsePosition = {
        x: window.scrollX,
        y: window.scrollY,
        openDetails: [...$("content").querySelectorAll("details")].map((d) => d.open),
        scrollers: [...$("content").querySelectorAll(".map-scroll")].map((el) => ({ x: el.scrollLeft, y: el.scrollTop })),
        openerData: opener?.dataset ? { ...opener.dataset } : {},
      };
      detailHistory = [];
      routeActive = route ?? null;
      sequence =
        routeActive !== null
          ? ROUTES[routeActive].ids
          : [...currentItems().map((d) => d.id)];
      if (routeActive === null && !sequence.includes(id))
        sequence = DATA.filter((d) => d.lane === BYID[id].lane).map(
          (d) => d.id,
        );
    } else if (selected && selected !== id && !back) {
      detailHistory.push(selected);
    }
    if (route !== undefined) {
      routeActive = route;
      sequence = route !== null ? ROUTES[route].ids : currentItems().map(d => d.id);
    }
    if (routeActive === null && !sequence.includes(id)) {
      routeActive = null;
      sequence = DATA.filter((d) => d.lane === BYID[id].lane).map((d) => d.id);
    }
    if (routeActive !== null && sequence.includes(id)) routePosition = sequence.indexOf(id);
    selected = id;
    artIndex = Math.max(
      0,
      ART[id].findIndex((a) => a.id === art),
    );
    seen.delete(id);
    seen.add(id);
    persist();
    drawDetail();
    if (!$("detail").open) {
      $("detail").showModal();
    }
    $("detail").scrollTop = 0;
    $("closeDetail").focus({ preventScroll: true });
    if (!fromURL) syncURL(true);
  }
  function closeDetail({ fromURL = false } = {}) {
    detailRequest++;
    if (!$("detail").open) return;
    $("detail").close();
    selected = null;
    routeActive = null;
    render({ url: false });
    if (browsePosition) {
      $("content").querySelectorAll("details").forEach((d, i) => { d.open = !!browsePosition.openDetails[i]; });
      $("content").querySelectorAll(".map-scroll").forEach((el, i) => {
        const position = browsePosition.scrollers[i];
        if (position) el.scrollTo(position.x, position.y);
      });
    }
    if (!fromURL) syncURL();
    const openerData = Object.entries(browsePosition?.openerData || {});
    const restoredOpener = opener?.isConnected ? opener : openerData.length
      ? [...$("content").querySelectorAll("button")].find((button) => openerData.every(([key, value]) => button.dataset[key] === value))
      : null;
    (restoredOpener || $("content")).focus({ preventScroll: true });
    if (browsePosition) window.scrollTo({ left: browsePosition.x, top: browsePosition.y, behavior: "instant" });
    browsePosition = null;
  }
  function updateCompare() {
    if ($("detailCompare")) $("detailCompare").hidden = compare.length !== 2;
    $("comparebar").hidden = !compare.length;
    $("compareSummary").textContent =
      compare.map((id) => BYID[id].zh).join(" ＋ ") +
      (compare.length === 1 ? " · 再选一条" : "");
    $("doCompare").disabled = compare.length !== 2;
    document.querySelectorAll("[data-compare]").forEach((b) => {
      const yes = compare.includes(b.dataset.compare);
      b.textContent = yes ? "✓ 已选对照" : "＋ 对照";
      b.setAttribute("aria-pressed", yes);
    });
  }
  async function showComparison() {
    if (compare.length !== 2) return;
    const pair = [...compare];
    try { await Promise.all(pair.map(id => c.ensureEntry(id))); }
    catch (error) { console.error(error); toast("对照资料未能加载，请重试。"); return; }
    if (pair.join() !== compare.join()) return;
    $("comparison").innerHTML = comparisonHTML(compare, c);
    $("comparison").showModal();
  }
  let lightWorks = [],
    lightIndex = 0;
  function drawLight() {
    const a = BYWORK[lightWorks[lightIndex]];
    const artist = a.by?.[0] && a.by[0] !== personName
      ? `<button class="text-link" data-person="${esc(a.by[0])}">${esc(a.artistZh || a.artist)}</button>`
      : esc(a.artistZh || a.artist);
    const entries = a.entries.filter((id) => id !== selected).map((id) => `<button data-node="${id}">${esc(BYID[id].zh)} →</button>`).join("");
    $("lightbox").innerHTML =
      `<div class="light-head"><div><b>${esc(a.zh)}</b><small>${artist} · ${esc(a.date)}</small>${entries ? `<span class="light-entries">所属条目 ${entries}</span>` : ""}</div><button data-close="lightbox" aria-label="关闭大图">关闭 ×</button></div><div class="light-stage">${imageHTML(a, "", true)}</div><div class="light-controls"><button data-zoom aria-pressed="false">放大细节 ＋</button><button data-light-step="-1" ${lightIndex === 0 ? "disabled" : ""}>← 上一幅</button><span>${lightIndex + 1} / ${lightWorks.length}</span><button data-light-step="1" ${lightIndex === lightWorks.length - 1 ? "disabled" : ""}>下一幅 →</button></div><div class="light-credit">${esc(a.title)}<br>${esc(a.museum || "")} · ${creditHTML(a)}</div>`;
  }
  async function showLight(id, list) {
    const ids = list || (selected ? ART[selected] : [BYWORK[id]]).map((a) => a.id);
    try { await c.ensureWorks(ids); }
    catch (error) { console.error(error); toast("作品资料未能加载，请重试。"); return; }
    lightWorks = ids;
    lightIndex = Math.max(0, lightWorks.indexOf(id));
    drawLight();
    if (!$("lightbox").open) $("lightbox").showModal();
  }
  async function openPerson(name, { fromURL = false } = {}) {
    try { await c.ensureSearch(); }
    catch (error) { console.error(error); toast("人物资料未能加载，请重试。"); return; }
    const a = c.search.authors.find((x) => x.name === name);
    if (!a) { toast("没有找到这位人物"); return; }
    personName = a.name;
    $("person").innerHTML = personHTML(a, c, { seen });
    if (!$("person").open) $("person").showModal();
    $("person").scrollTop = 0;
    $("person").querySelector("[data-close]")?.focus({ preventScroll: true });
    if (!fromURL) syncURL(true);
  }
  function closePerson({ fromURL = false } = {}) {
    if (!$("person").open) return;
    if (fromURL) personName = null;
    $("person").close();
  }
  $("person").addEventListener("close", () => {
    if (personName) { personName = null; syncURL(); }
  });
  async function showInfo(sources) {
    if (sources) {
      try { await c.ensureSources(); }
      catch (error) { console.error(error); toast("资料来源未能加载，请重试。"); return; }
    }
    $("info").innerHTML =
      `<div class="modal-head"><h2 id="infoTitle">${sources ? "资料来源" : "收录与使用说明"}</h2><button data-close="info" aria-label="关闭说明">关闭 ×</button></div>${
        sources
          ? `<p>${Object.keys(SOURCES).length} 个专题来源 · 作品出处随图列出</p><div class="source-list">${Object.values(
              SOURCES,
            )
              .map((s) =>
                link(
                  s.url,
                  `<b>${esc(s.zh)}</b><small>${esc(s.org)} · ${esc(s.title)}</small>`,
                ),
              )
              .join("")}</div>`
          : `<p>年代是概略讨论范围，不是精确起止。分区允许跨文化交流；学习路线表示阅读顺序，不代表单向演变。</p><p>中文内容为导读性概括，标题含意译。配图包括作品、建筑、展览与工艺记录；本站学习图解另有明确标注，不是历史作品。作者、摄影者、来源与许可可在图片下方查看；照片许可不等同于作品本身的权利。</p><p>收藏保存在当前浏览器。搜索快捷键：/；关闭详情或大图：Esc；大图切换：左右方向键。</p>`
      }`;
    $("info").showModal();
  }
  document.addEventListener("click", async (e) => {
    const b = e.target.closest("button, a[data-node], a[data-author], a[data-result-section]");
    if (!b) return;
    if (b.tagName === "A") {
      if (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
      e.preventDefault();
    }
    const d = b.dataset;
    if (d.retrySearch !== undefined) { render(); return; }
    if (d.export !== undefined) {
      const url = URL.createObjectURL(new Blob([backupJSON(saved, seen, notes)], { type: "application/json" }));
      const a = Object.assign(document.createElement("a"), { href: url, download: `art-history-atlas-backup-${new Date().toISOString().slice(0, 10)}.json` });
      document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast("备份已导出");
      return;
    }
    if (d.import !== undefined) { $("importFile").click(); return; }
    if (d.timelineFocus) {
      const entry = BYID[d.timelineFocus];
      closeDetail({ fromURL: true });
      const long = entry.years[1] - entry.years[0] > 600;
      Object.assign(state, { view: "timeline", era: long ? "all" : String(entry.era), lane: "all", q: "", level: "all" });
      $("search").value = "";
      timelineFocus = entry.id;
      await render();
      syncURL(true);
      const bar = $("content").querySelector(`[data-tl="${entry.id}"]`);
      bar?.scrollIntoView({ block: "center", inline: "center" });
      bar?.focus({ preventScroll: true });
      return;
    }
    if (d.resultSection) { $(d.resultSection)?.scrollIntoView({ block: "start" }); return; }
    if (d.author || d.person) {
      openPerson(d.author || d.person);
      return;
    }
    if (d.personWork) {
      const a = c.search.authors.find((x) => x.name === personName);
      showLight(d.personWork, a?.works);
      return;
    }
    if (d.query) {
      closePerson();
      state.q = d.query;
      state.view = "index";
      $("search").value = state.q;
      limit = 48;
      render();
      return;
    }
    if (d.save) {
      updateSave(d.save);
      return;
    }
    if (d.node) {
      if ($("lightbox").open) $("lightbox").close();
      closePerson({ fromURL: true }); // the entry pushes its own history state
      openNode(d.node, { art: d.work, route: d.routeIndex !== undefined ? +d.routeIndex : undefined });
      return;
    }
    if (d.art) {
      closePerson();
      const a = BYWORK[d.art];
      const id =
        a.entries.find(
          (id) => inScope(BYID[id], state.level) && (state.lane === "all" || BYID[id].lane === state.lane),
        ) || a.entries[0];
      openNode(id, { art: a.id });
      return;
    }
    if (d.view) {
      state.view = d.view;
      limit = 48;
      render();
      return;
    }
    if (d.level) {
      state.level = d.level;
      limit = 48;
      render();
      document.querySelector(`[data-level="${state.level}"]`)?.focus({ preventScroll: true });
      return;
    }
    if (d.lane) {
      state.lane = d.lane;
      limit = 48;
      render();
      return;
    }
    if (d.era !== undefined) {
      state.era = d.era;
      limit = 48;
      render();
      return;
    }
    if (d.remove) {
      state[d.remove] = ["q", "illustrated"].includes(d.remove) ? "" : "all";
      $("illustratedOnly").checked = !!state.illustrated;
      $("search").value = state.q;
      render();
      return;
    }
    if (d.reset !== undefined) {
      reset();
      return;
    }
    if (d.more !== undefined) {
      const y = window.scrollY;
      limit += 48;
      render();
      window.scrollTo(0, y);
      document.querySelector("[data-more]")?.focus({ preventScroll: true });
      return;
    }
    if (d.close) {
      $(d.close).close();
      return;
    }
    if (d.thumb !== undefined) {
      artIndex = +d.thumb;
      const y = $("detail").scrollTop;
      drawDetail();
      $("detail").scrollTop = y;
      document.querySelector(`.thumbnails [data-thumb="${artIndex}"]`)?.scrollIntoView({ block: "nearest", inline: "nearest" });
      document
        .querySelector(`.thumbnails [data-thumb="${artIndex}"]`)
        ?.focus({ preventScroll: true });
      return;
    }
    if (d.light) {
      showLight(d.light);
      return;
    }
    if (d.zoom !== undefined) {
      const stage = $("lightbox").querySelector(".light-stage");
      const zoomed = stage.classList.toggle("zoomed");
      if (zoomed) {
        stage.scrollLeft = (stage.scrollWidth - stage.clientWidth) / 2;
        stage.scrollTop = (stage.scrollHeight - stage.clientHeight) / 2;
      }
      b.setAttribute("aria-pressed", zoomed);
      b.textContent = zoomed ? "适合窗口 −" : "放大细节 ＋";
      return;
    }
    if (d.lightStep) {
      lightIndex = Math.max(
        0,
        Math.min(lightWorks.length - 1, lightIndex + Number(d.lightStep)),
      );
      drawLight();
      return;
    }
    if (d.route !== undefined) {
      const route = +d.route;
      openNode(ROUTES[route].ids[0], { route });
      return;
    }
    if (d.finishRoute !== undefined) { closeDetail(); return; }
    if (d.resumeRoute !== undefined) { openNode(sequence[routePosition]); return; }
    if (d.step) {
      const id = sequence[(routeActive !== null ? routePosition : sequence.indexOf(selected)) + Number(d.step)];
      if (id) openNode(id);
      return;
    }
    if (d.compare) {
      if (compare.includes(d.compare))
        compare = compare.filter((id) => id !== d.compare);
      else if (compare.length < 2) compare.push(d.compare);
      else {
        toast("已选两条，请先清空对照");
        return;
      }
      updateCompare();
      toast(
        compare.length === 2
          ? "已选两条，可打开对照"
          : "已加入对照，请选择第二条",
      );
      return;
    }
    if (d.openCompare !== undefined) {
      showComparison();
      return;
    }
    if (d.share !== undefined) {
      try {
        await navigator.clipboard.writeText(location.href);
        toast("链接已复制");
      } catch {
        toast("可复制地址栏中的链接");
      }
      return;
    }
  });
  $("closeDetail").onclick = () => closeDetail();
  $("detail").addEventListener("cancel", (e) => {
    e.preventDefault();
    closeDetail();
  });
  $("backDetail").onclick = () => {
    const id = detailHistory.pop();
    if (id) openNode(id, { back: true });
  };
  // A click on the backdrop closes the top dialog without discarding the underlying one.
  document.querySelectorAll("dialog").forEach((dialog) =>
    dialog.addEventListener("click", (e) => {
      if (e.target !== dialog) return;
      const r = dialog.getBoundingClientRect();
      if (
        e.clientX < r.left ||
        e.clientX > r.right ||
        e.clientY < r.top ||
        e.clientY > r.bottom
      ) {
        dialog.id === "detail" ? closeDetail() : dialog.close();
      }
    }),
  );
  // Wait for the IME to settle (pinyin letters are not a query) and for a short pause in typing.
  function commitSearch() {
    clearTimeout(searchTimer);
    if (state.q === $("search").value) return;
    state.q = $("search").value;
    limit = 48;
    render();
  }
  const quick = setupQuickSearch(c, {
    input: $("search"),
    panel: $("quickResults"),
    recent: () => [...seen].reverse(),
    commit: () => {
      commitSearch();
      $("search").blur();
      $("content").scrollIntoView({ block: "start" });
    },
  });
  $("search").addEventListener("compositionstart", () => { composing = true; });
  $("search").addEventListener("compositionend", () => { composing = false; quick.update(); clearTimeout(searchTimer); searchTimer = setTimeout(commitSearch, 160); });
  $("search").oninput = (e) => {
    $("clearSearch").hidden = !e.target.value;
    if (composing || e.isComposing) return;
    quick.update();
    clearTimeout(searchTimer);
    searchTimer = setTimeout(commitSearch, 160);
  };
  $("clearSearch").onclick = () => {
    $("search").value = "";
    commitSearch();
    $("search").focus();
  };
  $("reset").onclick = reset;
  $("importFile").onchange = async (e) => {
    const file = e.target.files[0];
    e.target.value = "";
    if (!file) return;
    try {
      const added = mergeBackup(await file.text(), { saved, seen, notes, known: (id) => !!BYID[id] });
      saveNotes(notes);
      persist();
      render();
      toast(added ? `已导入 ${added} 项收藏或笔记` : "备份中的内容这里都已有");
    } catch (error) {
      console.error(error);
      toast(error instanceof SyntaxError ? "文件无法读取，请选择导出的 JSON 备份" : error.message);
    }
  };
  // Notes save quietly as you type; the list views pick them up on the next render.
  let noteTimer;
  document.addEventListener("input", (e) => {
    const id = e.target.dataset?.note;
    if (!id) return;
    clearTimeout(noteTimer);
    $("noteStatus").textContent = "正在保存…";
    noteTimer = setTimeout(() => {
      if (e.target.value.trim()) notes[id] = e.target.value;
      else delete notes[id];
      $("noteStatus").textContent = saveNotes(notes) ? "已保存在此浏览器" : "未能保存：浏览器禁止了本地存储";
      $("savedCount").textContent = DATA.filter((d) => kept(d.id)).length;
    }, 400);
  });
  $("illustratedOnly").onchange = (e) => {
    state.illustrated = e.target.checked ? "yes" : "";
    limit = 48;
    render();
  };
  $("sort").onchange = (e) => {
    state.sort = e.target.value;
    render();
  };
  $("laneSelect").onchange = (e) => {
    state.lane = e.target.value;
    render();
  };
  $("eraSelect").onchange = (e) => {
    state.era = e.target.value;
    limit = 48;
    render();
  };
  $("random").onclick = () => {
    const ds = currentItems();
    if (ds.length) openNode(ds[Math.floor(Math.random() * ds.length)].id);
    else toast("没有符合筛选的条目");
  };
  $("doCompare").onclick = showComparison;
  $("clearCompare").onclick = () => {
    compare = [];
    updateCompare();
  };
  $("sourcesBtn").onclick = () => showInfo(true);
  const THEMES = { "": "◐ 自动", light: "☀ 浅色", dark: "☾ 深色" };
  const showTheme = () => { $("themeBtn").textContent = THEMES[document.documentElement.dataset.theme || ""]; };
  $("themeBtn").onclick = () => {
    const order = Object.keys(THEMES), next = order[(order.indexOf(document.documentElement.dataset.theme || "") + 1) % order.length];
    if (next) document.documentElement.dataset.theme = next;
    else delete document.documentElement.dataset.theme;
    try { next ? localStorage.setItem("art-atlas-theme", next) : localStorage.removeItem("art-atlas-theme"); } catch {}
    showTheme();
    toast(next ? `已切换为${THEMES[next].slice(2)}` : "配色跟随系统");
  };
  showTheme();
  $("aboutBtn").onclick = () => showInfo(false);
  document.addEventListener("keydown", (e) => {
    const typing = ["INPUT", "TEXTAREA", "SELECT"].includes(
      document.activeElement?.tagName,
    );
    if (((e.key === "/" && !typing) || (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey))) && !document.querySelector("dialog[open]")) {
      e.preventDefault();
      $("search").focus();
      $("search").select();
    }
    if ($("lightbox").open && ["ArrowLeft", "ArrowRight"].includes(e.key)) {
      e.preventDefault();
      lightIndex = Math.max(
        0,
        Math.min(
          lightWorks.length - 1,
          lightIndex + (e.key === "ArrowLeft" ? -1 : 1),
        ),
      );
      drawLight();
    }
  });
  window.addEventListener("popstate", () => {
    readURL();
    const id = location.hash.slice(1), person = personFromHash(location.hash);
    render({ url: false });
    if (person) { openPerson(person, { fromURL: true }); return; }
    closePerson({ fromURL: true });
    if (BYID[id]) openNode(id, { fromURL: true, back: true });
    else closeDetail({ fromURL: true });
  });
  $("eraSelect").innerHTML = [["全部时代"], ...ERAS].map((e, i) => `<option value="${i ? i - 1 : "all"}">${e[0]}${e[1] ? ` · ${e[1]}` : ""}</option>`).join("");
  $("laneSelect").innerHTML = [["all", "全部分类"], ...LANES]
    .map((l) => `<option value="${l[0]}">${l[1]}</option>`)
    .join("");
  $("stats").innerHTML =
    `<b>${DATA.length}</b> 条目 <span>·</span> <b>${WORKS.length}</b> 配图<br><b>${ROUTES.length}</b> 路线 <span>·</span> <b>${c.sourceCount}</b> 专题资料`;
  readURL();
  const initial = location.hash.slice(1);
  await render({ url: false });
  if (BYID[initial]) openNode(initial, { fromURL: true });
  else if (personFromHash(location.hash)) openPerson(personFromHash(location.hash), { fromURL: true });
}
if ("serviceWorker" in navigator)
  addEventListener("load", () => navigator.serviceWorker.register("./sw.js").catch((error) => console.warn("Offline reading unavailable", error)));
start().catch((error) => {
  console.error(error);
  document.getElementById("content").innerHTML =
    '<div class="empty" role="alert"><h3>内容未能加载</h3><p>请检查网络连接后刷新。</p><button onclick="location.reload()">重试</button></div>';
});
