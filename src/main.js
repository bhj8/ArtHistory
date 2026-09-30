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
import { timelineHTML, inTimeline, eraX } from "./ui/timeline.js";
import { eraStepHTML } from "./ui/era.js";
import { eraOfYear, workEra, workInEra, workMid, parseYearQuery } from "./eras.js";

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
    yearMark = null,
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
    state.q = (p.get("q") || "").trim() ? p.get("q") : "";
    state.level = readScope(p);
    const year = state.view === "timeline" && parseYearQuery(p.get("year") || "");
    yearMark = year ? { from: year.from, to: year.to, label: year.label } : null;
    state.illustrated = p.get("illustrated") === "yes" ? "yes" : "";
    $("illustratedOnly").checked = !!state.illustrated;
    state.sort = ["time", "name", "images", "priority"].includes(p.get("sort"))
      ? p.get("sort")
      : "time";
    $("search").value = state.q;
    $("sort").value = state.sort;
    navKey = placeOf();
  }
  // Changing view, lane or era is a step the reader can go Back from; typing a search,
  // switching scope or sorting only refines the current place.
  let navKey = "";
  const placeOf = () => [state.view, state.lane, state.era].join("|");
  // Entries and people opened from the page are history steps: `dlg` counts how many, so closing
  // them goes Back to the page instead of leaving a duplicate entry; `trail` feeds "← 返回".
  let lastHref = location.href, lastState = history.state;
  const remember = () => { lastHref = location.href; lastState = history.state; };
  function syncURL(push = false, dialog = "") {
    const u = new URL(location.href);
    u.search = "";
    for (const [k, v] of Object.entries(state)) {
      if (k === "level" || (v && !["all", "time"].includes(v) && !(k === "view" && v === "map")))
        u.searchParams.set(k, v);
    }
    if (yearMark && state.view === "timeline") u.searchParams.set("year", yearMark.label);
    if (selected && routeActive !== null) { u.searchParams.set("route", routeActive); u.searchParams.set("stop", routePosition); }
    u.hash = personName ? personHash(personName) : selected || "";
    const moved = placeOf() !== navKey;
    navKey = placeOf();
    let st = {};
    if (push && dialog) {
      const depth = history.state?.dlg || (location.hash ? 0 : 0.5);
      st = depth ? { dlg: Math.floor(depth) + 1, person: dialog === "person", trail: detailHistory.slice() } : {};
    } else if (!push && !moved) st = { ...(history.state || {}) };
    if (u.href === location.href && !push) return;
    try { history[push || moved ? "pushState" : "replaceState"](st, "", u); }
    catch { history.replaceState(st, "", u); }
    remember();
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
  // Routes are whole reading orders, so the core/all switch does not hide them either.
  const browseScope = () => (state.q.trim() || personalView() || state.view === "routes" ? "all" : state.level);
  let matchKey = null, matchSet = null;
  function matched() {
    const q = state.q.trim();
    if (!q) return null;
    if (matchKey !== q + c.searchReady) { matchKey = q + c.searchReady; matchSet = new Set(c.search.query(q).entries.map((d) => d.id)); }
    return matchSet;
  }
  // One predicate for every list and count, so a number next to a control always matches what it shows.
  function passes(d, { scope = browseScope(), lane = state.lane, era = state.era, ignoreQuery = false } = {}) {
    const m = ignoreQuery ? null : matched();
    return inScope(d, scope) &&
      (lane === "all" || d.lane === lane) &&
      // The timeline zooms into an era by years, so it keeps entries that overlap it.
      (era === "all" || (state.view === "timeline" ? inTimeline(d, era) : d.era === +era)) &&
      (!state.illustrated || ART[d.id].length > 0) &&
      (!m || m.has(d.id));
  }
  const inView = (d) => (state.view === "saved" ? kept(d.id) : state.view === "recent" ? seen.has(d.id) : true);
  // The gallery lists works placed by their own dates; one selector feeds both the list and its counts.
  function galleryWorks({ scope = browseScope(), lane = state.lane, era = state.era } = {}) {
    const base = new Set(DATA.filter((d) => passes(d, { scope, lane, era: "all" })).map((d) => d.id));
    let works = WORKS.filter((a) => a.entries.some((id) => base.has(id)));
    // If a query directly names a work or its maker, show only those matches.
    if (state.q.trim()) {
      const exact = c.search.query(state.q, new Set(DATA.filter((d) => passes(d, { scope, lane, era: "all", ignoreQuery: true })).map((d) => d.id))).works;
      if (exact.length) works = exact;
    }
    return era === "all" ? works : works.filter((w) => workInEra(w, +era, BYID));
  }
  const countEntries = (options) => DATA.reduce((n, d) => n + (inView(d) && passes(d, options) ? 1 : 0), 0);
  // Every number next to a control counts what that view lists: entries, works or routes.
  const count = (options) =>
    state.view === "gallery" ? galleryWorks(options).length
      : state.view === "routes" ? views.matchingRoutes(DATA.filter((d) => passes(d, { ...options, ignoreQuery: true })), matched()).length
        : countEntries(options);
  const unitOf = () => (state.view === "gallery" ? "幅" : state.view === "routes" ? "条路线" : "条");
  function hits(ignoreQuery = false, scope = browseScope()) {
    return DATA.filter((d) => passes(d, { scope, ignoreQuery })).sort((a, b) =>
      state.sort === "priority"
        ? levelRank(a) - levelRank(b) || a.era - b.era
        : state.sort === "name"
        ? a.zh.localeCompare(b.zh, "zh-CN")
        : state.sort === "images"
          ? ART[b.id].length - ART[a.id].length || a.era - b.era
          : a.era - b.era || a.years[0] - b.years[0] || levelRank(a) - levelRank(b),
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
  // The "load more" limit belongs to one list; any change of filters starts a fresh list.
  let shownKey = null;
  const scrollbarWidth = (() => {
    const probe = Object.assign(document.createElement("div"), { style: "position:absolute;top:-999px;width:100px;height:100px;overflow:scroll" });
    document.body.append(probe);
    const width = probe.offsetWidth - probe.clientWidth;
    probe.remove();
    return width;
  })();
  // Rebuilt controls lose keyboard focus; put it back on the equivalent control.
  function focusKey(el) {
    if (!el || el === document.body || !el.dataset) return null;
    const key = ["eraDir", "era", "lane", "level", "view", "remove", "reset"].find((k) => el.dataset[k] !== undefined);
    if (!key) return null;
    const attr = `data-${key.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)}`;
    return { selector: `[${attr}="${el.dataset[key]}"]`, within: el.closest("#eras, #lanes, #learningScopes, #content, .tabs") };
  }
  function restoreFocus(key) {
    if (!key || (document.activeElement && document.activeElement !== document.body)) return;
    const root = key.within?.id ? $(key.within.id) : key.within?.classList.contains("tabs") ? document.querySelector(".tabs") : document;
    const visible = (list) => [...list].find((el) => el.offsetParent && el.tabIndex >= 0);
    // A control that disappeared (a strip link, a map header) hands focus to the chosen era or lane.
    const target = visible((root || document).querySelectorAll(key.selector)) || visible(document.querySelectorAll(key.selector)) ||
      visible(document.querySelectorAll(/lane/.test(key.selector) ? "#lanes .on, #laneSelect" : "#eras .on, #eraSelect"));
    target?.focus({ preventScroll: true });
  }
  function scopeNote(shown, all, unit = unitOf()) {
    return browseScope() === "core" && all > shown
      ? ` · 仅核心范围，全部范围有 ${all} ${unit} <button class="text-link" data-level="all">显示全部</button>`
      : "";
  }
  async function renderRevealed() {
    await render();
    if ($("filterRow").getBoundingClientRect().top < 0) $("filterRow").scrollIntoView({ block: "start" });
  }
  // Keep the timeline where the year a reader asked about is.
  function centreOnMark() {
    const tl = $("content").querySelector(".timeline"), mark = tl?.querySelector(".tl-mark");
    if (!tl || !mark || tl.scrollWidth <= tl.clientWidth) return;
    const lane = tl.querySelector(".tl-lane-name")?.offsetWidth || 0;
    tl.scrollLeft = mark.offsetLeft + mark.offsetWidth / 2 - (tl.clientWidth - lane) / 2;
    syncAxis(tl);
  }
  const timelineFit = (phone = matchMedia("(max-width: 600px)").matches) =>
    $("content").clientWidth - (phone ? 76 : 132) - 3 - (document.documentElement.scrollHeight > innerHeight ? 0 : scrollbarWidth);
  let fittedFit = 0, markedQuery = null;
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
    const listKey = JSON.stringify([state.view, state.lane, state.era, state.q, state.level, state.illustrated, state.sort]);
    if (listKey !== shownKey) { limit = 48; shownKey = listKey; }
    if (state.view !== "timeline") yearMark = null;
    const focus = focusKey(document.activeElement);
    persist();
    const items = currentItems(),
      eraOn = state.era !== "all",
      era = +state.era;
    // Counts follow the other filters, so each number says what that choice would show.
    const unit = unitOf();
    // In a map era, entries from other eras still active there also make a lane or era worth visiting.
    const carryIn = (o = {}) => state.view === "map" && !state.q.trim()
      ? DATA.filter((d) => (o.era ?? state.era) !== "all" && d.era !== +(o.era ?? state.era) && inTimeline(d, o.era ?? state.era) && passes(d, { ...o, era: "all" })).length
      : 0;
    const laneN = Object.fromEntries([["all"], ...LANES].map((l) => [l[0], count({ lane: l[0] })]));
    $("lanes").innerHTML = [["all", "全部分类", "", null], ...LANES]
      .map((l) => {
        const n = laneN[l[0]], dim = !n && !(eraOn && carryIn({ lane: l[0] }));
        return `<button data-lane="${l[0]}" class="${state.lane === l[0] ? "on" : ""}${dim ? " zero" : ""}" aria-pressed="${state.lane === l[0]}"><i style="--c:${l[3] || "#333"}"></i><span>${esc(l[1])}</span><small>${n}</small></button>`;
      })
      .join("");
    // Search, the personal lists and routes ignore the core/all scope, so the switch would only mislead.
    $("learningScopes").hidden = !!state.q.trim() || personalView() || state.view === "routes";
    $("learningScopes").innerHTML = Object.entries(SCOPES).map(([scope, label]) => `<button data-level="${scope}" aria-pressed="${state.level === scope}" class="${state.level === scope ? "on" : ""}">${label}<small>${count({ scope })}</small></button>`).join("");
    const perEra = ERAS.map((_, i) => count({ era: String(i) }));
    $("eras").innerHTML =
      `<button data-era="all" aria-pressed="${state.era === "all"}" class="${state.era === "all" ? "on" : ""}">全部时代</button>` +
      ERAS.map(
        (e, i) =>
          `<button data-era="${i}" aria-pressed="${state.era == i}" class="${state.era == i ? "on" : ""}${perEra[i] || carryIn({ era: String(i) }) ? "" : " zero"}" title="${esc(`${e[0]} · ${e[1]} · ${perEra[i]} ${unit}`)}">${e[0]}<small>${e[1]}</small></button>`,
      ).join("");
    // Phones use the two selects, so they carry the same counts as the chips and the sidebar.
    [...$("eraSelect").options].forEach((o, i) => { o.textContent = i ? `${ERAS[i - 1][0]}（${perEra[i - 1]}）· ${ERAS[i - 1][1]}` : `全部时代（${count({ era: "all" })}）`; });
    [...$("laneSelect").options].forEach((o) => { o.textContent = `${o.value === "all" ? "全部分类" : L[o.value][1]}（${laneN[o.value]}）`; });
    $("laneSelect").value = state.lane;
    $("eraSelect").value = state.era;
    const tabsChanged = document.querySelector(".tabs .on")?.dataset.view !== state.view;
    document.querySelectorAll("[data-view]").forEach((b) => {
      b.classList.toggle("on", b.dataset.view === state.view);
      b.setAttribute("aria-pressed", b.dataset.view === state.view);
    });
    $("viewTitle").textContent = state.q
      ? `${titles[state.view]} · 搜索结果`
      : titles[state.view];
    const filtered = state.lane !== "all" || state.era !== "all" || state.q || state.illustrated;
    $("reset").hidden = !filtered;
    $("clearSearch").hidden = !state.q;
    $("sort").hidden = ["map", "timeline", "routes", "recent"].includes(state.view);
    // Lane and era already show in their own controls; only the search and image filter need a chip.
    $("activeFilters").innerHTML = [
      state.q ? `<button data-remove="q">“${esc(state.q)}” ×</button>` : "",
      state.illustrated ? '<button data-remove="illustrated">只看有图 ×</button>' : "",
    ].join("");
    const yearQuery = parseYearQuery(state.q);
    const yearHint = (text) => yearQuery ? `<p class="year-hint"><span>按年代检索 <b>${esc(yearQuery.label)}</b>：${text}</span><button data-year="${yearQuery.from}:${yearQuery.to}" data-year-label="${esc(yearQuery.label)}">在时间轴上看 →</button></p>` : "";
    const nothingKept = personalView() && !DATA.some(inView);
    let count_ = items.length + " 个条目", html, timeline = null, stats = eraOn ? `${items.length} 条` : "", tall = items.length > 8;
    if (state.q.trim() && !["routes", "saved", "recent", "gallery", "timeline"].includes(state.view)) {
      const allowedIds = new Set(hits(true).map((d) => d.id));
      const results = c.search.query(state.q, allowedIds);
      results.allowedIds = allowedIds;
      html = searchResultsHTML(results, views, c, limit);
      count_ = `${results.entries.length} 条目 · ${results.authors.length} 人物 · ${results.works.length} 作品`;
      stats = `这一时期有 ${results.entries.length} 个相关条目`;
    } else if (state.view === "gallery") {
      // Works are placed by their own date when it is known, not by the era of their entry.
      const works = galleryWorks();
      if (state.sort === "priority")
        works.sort((a, b) => Math.min(...a.entries.map(id => levelRank(BYID[id]))) - Math.min(...b.entries.map(id => levelRank(BYID[id]))));
      else if (state.sort === "name")
        works.sort((a, b) => a.zh.localeCompare(b.zh, "zh-CN"));
      else if (state.sort === "images")
        works.sort((a, b) => ART[b.entries[0]].length - ART[a.entries[0]].length);
      else if (eraOn)
        works.sort((a, b) => workMid(a, BYID) - workMid(b, BYID));
      else // era headings follow the same key as the order, so each era appears once
        works.sort((a, b) => workEra(a, BYID) - workEra(b, BYID) || workMid(a, BYID) - workMid(b, BYID));
      html = yearHint("创作于这一时期的作品") + views.gallery(works, limit, { eraOf: !eraOn && state.sort === "time" ? (w) => workEra(w, BYID) : null });
      count_ = works.length + " 幅配图";
      stats = `${works.length} 幅作品，按创作年代归入本时代（未注明年代的随所属条目）${scopeNote(works.length, count({ scope: "all" }))}`;
      tall = works.length > 8;
    } else if (state.view === "timeline") {
      const prev = $("content").querySelector(".tl-wrap"), prevEra = prev?.dataset.era,
        prevLeft = prev?.querySelector(".timeline")?.scrollLeft || 0;
      const leaving = state.era === "all" && prevEra && prevEra !== "all" ? +prevEra : null;
      const phone = matchMedia("(max-width: 600px)").matches;
      // Fill the width available now; leave room for a page scrollbar that the new content may add.
      const fit = timelineFit(phone);
      fittedFit = Math.floor(fit);
      const widen = browseScope() === "core" ? (lane) => count({ scope: "all", lane }) - count({ lane }) : null;
      html = items.length ? timelineHTML(items, c, { era: state.era, lane: state.lane, seen, focus: timelineFocus, fit, phone, narrowed: !!(state.q.trim() || state.illustrated), widen, pulse: leaving, mark: yearMark || yearQuery }) : "";
      if (!html) html = views.cards([]);
      timelineFocus = null;
      if (eraOn) {
        const own = items.filter((d) => d.era === era).length;
        stats = items.length
          ? `这一时期 ${items.length} 个条目：本时代 ${own} 个，另有 ${items.length - own} 个跨时代并存${scopeNote(items.length, count({ scope: "all" }))}`
          : `这一时期没有条目${scopeNote(0, count({ scope: "all" }))}`;
      }
      timeline = [prev, prevEra, prevLeft, leaving];
    } else if (state.view === "map" && !state.q) {
      const carry = eraOn ? DATA.filter((d) => d.era !== era && inTimeline(d, state.era) && passes(d, { era: "all" })) : [];
      const widen = browseScope() === "core"
        ? (lane, i) => count({ scope: "all", lane, era: String(i) }) - count({ lane, era: String(i) })
        : null;
      html = views.map(items, { carry, widen });
      if (eraOn) stats = `本时代 ${items.length} 个条目${carry.length ? `，另有 ${carry.length} 个跨时代并存` : ""}${scopeNote(items.length, count({ scope: "all" }))}`;
      // Every lane of a single era is shown, so the page is always long enough for a second strip.
      tall = state.lane === "all" || items.length > 8;
    } else if (state.view === "routes") {
      const n = views.matchingRoutes(items, matched()).length;
      html = yearHint("经过这一时期仍在进行的条目的路线") + views.routes(items);
      count_ = n + " 条路线";
      stats = `${n} 条路线经过这一时期`;
      tall = n > 3;
    } else {
      const headings = state.sort === "time" && !eraOn && state.view !== "recent" && items.length > 8;
      html = (state.view === "saved" ? backupBar() : "") + views.cards(items, { headings });
      if (eraOn) stats = `${items.length} 个条目${scopeNote(items.length, count({ scope: "all" }))}`;
    }
    const strip = eraOn && !nothingKept ? eraStepHTML(c, era, { counts: perEra, unit, stats }) : "";
    const stripEnd = eraOn && tall && !nothingKept ? eraStepHTML(c, era, { counts: perEra, unit, bottom: true }) : "";
    $("content").innerHTML = strip + html + stripEnd;
    const blank = $("content").querySelector(":scope > .empty");
    if (blank) blank.outerHTML = emptyState(blank);
    if (timeline) placeTimeline(...timeline);
    // A year typed while on the timeline: bring its marker into view once per query.
    const markKey = state.view === "timeline" && !yearMark && yearQuery ? `${state.q}|${state.era}` : null;
    if (markKey && markKey !== markedQuery) centreOnMark();
    markedQuery = markKey;
    refreshArtComparison();
    $("resultCount").textContent = count_;
    if (tabsChanged) revealTab();
    restoreFocus(focus);
    if (url) syncURL();
  }
  // Keep the timeline where the reader was: same era keeps its scroll, leaving an era centres it.
  function placeTimeline(prev, prevEra, prevLeft, leaving) {
    const tl = $("content").querySelector(".timeline");
    tl?.parentElement.querySelector(".tl-stick")?.addEventListener("wheel", (e) => {
      const dx = e.deltaX || (e.shiftKey ? e.deltaY : 0);
      if (!dx || tl.scrollWidth <= tl.clientWidth) return;
      e.preventDefault();
      tl.scrollLeft += dx;
    }, { passive: false });
    if (tl) syncAxis(tl);
    if (!tl || !prev) return;
    if (prevEra === String(state.era)) tl.scrollLeft = prevLeft;
    else if (leaving !== null) {
      const seg = $("content").querySelector(`.tl-era[data-era="${leaving}"]`);
      const lane = $("content").querySelector(".tl-corner")?.offsetWidth || 0;
      tl.scrollLeft = seg ? seg.offsetLeft - (tl.clientWidth - lane - seg.offsetWidth) / 2 : eraX(leaving);
    }
    syncAxis(tl);
  }
  const syncAxis = (tl) => {
    const strip = tl.parentElement?.querySelector(".tl-stick");
    if (!strip) return;
    strip.scrollLeft = tl.scrollLeft;
    const max = tl.scrollWidth - tl.clientWidth;
    strip.querySelectorAll("[data-tl-scroll]").forEach((b) => {
      b.setAttribute("aria-disabled", Number(b.dataset.tlScroll) < 0 ? tl.scrollLeft <= 1 : tl.scrollLeft >= max - 1);
    });
  };
  // Tabs scroll sideways on phones; keep the current one in view without moving the page.
  function revealTab() {
    const bar = document.querySelector(".tabs"), on = bar?.querySelector(".on");
    if (on && bar.scrollWidth > bar.clientWidth) {
      const pad = Math.ceil(bar.clientWidth * 0.14) + 8;
      const left = on.offsetLeft - bar.offsetLeft, right = left + on.offsetWidth;
      if (left < bar.scrollLeft) bar.scrollLeft = left - 12;
      else if (right + pad > bar.scrollLeft + bar.clientWidth) bar.scrollLeft = right - bar.clientWidth + pad;
    }
    markTabs();
  }
  const markTabs = () => {
    const bar = document.querySelector(".tabs");
    bar?.classList.toggle("more", bar.scrollLeft + bar.clientWidth < bar.scrollWidth - 4);
  };
  document.querySelector(".tabs")?.addEventListener("scroll", markTabs, { passive: true });
  addEventListener("resize", revealTab);
  // An empty result names what is missing and offers the nearest way out, not only a full reset.
  function emptyState(el) {
    const q = state.q.trim(), unit = unitOf();
    const what = { saved: "收藏或笔记", recent: "阅读记录", gallery: "作品", routes: "路线" }[state.view] || "条目";
    if (personalView() && !DATA.some(inView))
      return `<div class="empty"><span aria-hidden="true">${state.view === "saved" ? "☆" : "⌕"}</span><h3>还没有${what}</h3><p>${state.view === "saved" ? "在条目中点击「收藏」或写下笔记，就会出现在这里。" : "打开条目后会自动记录在这里。"}</p></div>`;
    const where = [state.era !== "all" && ERAS[+state.era][0], state.lane !== "all" && L[state.lane][1]].filter(Boolean).join(" · ");
    const core = browseScope() === "core";
    const title = q
      ? `${where ? `在「${esc(where)}」中` : ""}没有找到“${esc(q)}”`
      : `${where ? `「${esc(where)}」` : "当前筛选"}${core ? "的核心范围" : ""}里没有${what}`;
    const actions = [];
    if (state.era !== "all") {
      const near = ERAS.map((e, i) => ({ i, n: count({ era: String(i) }) }))
        .filter((x) => x.n && x.i !== +state.era)
        .sort((a, b) => Math.abs(a.i - state.era) - Math.abs(b.i - state.era) || a.i - b.i)
        .slice(0, 3).sort((a, b) => a.i - b.i);
      actions.push(...near.map((x) => `<button data-era="${x.i}">${esc(ERAS[x.i][0])} · ${x.n} ${unit}</button>`));
      const all = count({ era: "all" });
      if (all) actions.push(`<button data-remove="era">全部时代 · ${all} ${unit}</button>`);
    }
    if (core) { const n = count({ scope: "all" }); if (n) actions.push(`<button data-level="all">显示全部范围 · ${n} ${unit}</button>`); }
    if (state.lane !== "all") { const n = count({ lane: "all" }); if (n) actions.push(`<button data-remove="lane">全部分类 · ${n} ${unit}</button>`); }
    const suggestions = el.querySelector(".search-suggestions");
    const active = [state.era !== "all", state.lane !== "all", !!q, !!state.illustrated].filter(Boolean).length;
    const years = q && !actions.length && /\d|世纪|年代/.test(q) ? '<p>也可以按年代检索，例如：1500、16世纪、前5世纪、1960年代、1400—1500。</p>' : "";
    return `<div class="empty"><span aria-hidden="true">⌕</span><h3>${title}</h3>${suggestions ? `<p>相近名称</p>${suggestions.outerHTML}` : ""}${actions.length ? `<p>${q ? "其他地方有结果：" : "可以换个范围看看："}</p><div class="empty-actions">${actions.join("")}</div>` : ""}${years}${active >= 2 || !actions.length ? `<button class="text-link" data-reset>清除全部筛选</button>` : ""}</div>`;
  }
  function reset() {
    Object.assign(state, { lane: "all", era: "all", q: "", illustrated: "" });
    $("illustratedOnly").checked = false;
    $("search").value = "";
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
    $("crumb").innerHTML = `<button class="text-link" data-crumb-lane="${d.lane}" title="浏览这一分类">${esc(L[d.lane][1])}</button> / <button class="text-link" data-crumb-era="${d.era}" title="浏览这一时代">${esc(ERAS[d.era][0])}</button>`;
    $("backDetail").hidden = !detailHistory.length;
    $("detailBody").innerHTML = detailHTML(d, c, { saved, compare, artIndex, note: notes[d.id] || "" });
    refreshArtComparison();
    const nav = readingNavigation({selected, sequence, route: ROUTES[routeActive], position: routePosition, BYID});
    $("detailNav").innerHTML = nav.bottom;
    $("routeNav").innerHTML = nav.top;
    $("routeNav").hidden = routeActive === null;
    if (routeActive !== null) $("routeStops").onchange = e => openNode(e.target.value);

  }
  async function openNode(id, { art, route, back = false, fromURL = false, trail = null } = {}) {
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
    if (trail) detailHistory = trail.slice();
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
    if (!fromURL) syncURL(true, "detail");
  }
  function closeDetail({ fromURL = false } = {}) {
    detailRequest++;
    if (!$("detail").open) return;
    // Opened from the page: step back through the entries read, and the page restores itself.
    if (!fromURL && history.state?.dlg && !history.state.person) { history.go(-history.state.dlg); return; }
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
    const usable = opener && opener !== document.body && opener.isConnected && opener.getClientRects().length ? opener : null;
    const restoredOpener = usable || openerData.length
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
    if (!fromURL) syncURL(true, "person");
  }
  function closePerson({ fromURL = false } = {}) {
    if (!$("person").open) return;
    if (fromURL) personName = null;
    $("person").close();
  }
  $("person").addEventListener("close", () => {
    if (!personName) return;
    personName = null;
    if (history.state?.person) history.back();
    else syncURL();
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
          : `<p>年代是概略讨论范围，不是精确起止。分区允许跨文化交流；学习路线表示阅读顺序，不代表单向演变。</p><p>中文内容为导读性概括，标题含意译。配图包括作品、建筑、展览与工艺记录；本站学习图解另有明确标注，不是历史作品。作者、摄影者、来源与许可可在图片下方查看；照片许可不等同于作品本身的权利。</p><p>收藏保存在当前浏览器。搜索快捷键：/ 或 Ctrl/⌘ + K；切换时代：[ 上一个、] 下一个；关闭详情或大图：Esc；大图切换：左右方向键。在搜索框输入 1500、16世纪、前5世纪 或 1960年代，可以查看那时正在发生的事。</p>`
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
      yearMark = null;
      await render();
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
    if (d.crumbLane || d.crumbEra !== undefined) {
      const entry = BYID[selected];
      closeDetail({ fromURL: true });
      if (d.crumbLane) state.lane = d.crumbLane;
      else state.era = d.crumbEra;
      if (personalView() || state.view === "routes") state.view = "map";
      if (entry && !inScope(entry, state.level)) state.level = "all";
      await render();
      $("filterRow").scrollIntoView({ block: "start" });
      return;
    }
    if (d.year) {
      const [from, to] = d.year.split(":").map(Number), mid = (from + to) / 2;
      closePerson({ fromURL: true });
      closeDetail({ fromURL: true });
      yearMark = { from, to, label: d.yearLabel || `${from}` };
      Object.assign(state, { view: "timeline", era: eraOfYear(from) === eraOfYear(to) ? String(eraOfYear(mid)) : "all", q: "", lane: "all", level: "all" });
      $("search").value = "";
      await render();
      centreOnMark();
      $("content").scrollIntoView({ block: "start" });
      const tl = $("content").querySelector(".timeline");
      tl?.setAttribute("aria-label", `时间轴，标记 ${yearMark.label}`);
      tl?.focus({ preventScroll: true });
      return;
    }
    if (d.tlScroll) {
      const tl = $("content").querySelector(".timeline");
      tl?.scrollBy({ left: Number(d.tlScroll) * tl.clientWidth * 0.7, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
      return;
    }
    if (d.top !== undefined) {
      $("filterRow").scrollIntoView({ block: "start" });
      document.querySelector(`#content .era-step:not(.bottom) [data-era-dir="${document.activeElement?.dataset.eraDir?.slice(1) || "next"}"]`)?.focus({ preventScroll: true });
      return;
    }
    if (d.topic) {
      closePerson({ fromURL: true });
      Object.assign(state, { q: d.topic, era: "all", lane: "all" });
      if (personalView()) state.view = "index";
      $("search").value = d.topic;
      await renderRevealed();
      return;
    }
    if (d.query) {
      closePerson({ fromURL: true });
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
      closePerson({ fromURL: true });
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
      render();
      return;
    }
    if (d.level) {
      const host = b.closest("#content [data-anchor]"), anchor = host?.dataset.anchor, top = host?.getBoundingClientRect().top;
      state.level = d.level;
      await render();
      const now = anchor && $("content").querySelector(`[data-anchor="${anchor}"]`);
      if (now) {
        window.scrollBy({ top: now.getBoundingClientRect().top - top, behavior: "instant" });
        now.querySelector(".slice-card:not(.node-core), .map-node:not(.node-core), .mobile-group summary, [data-node]")?.focus({ preventScroll: true });
        return;
      }
      document.querySelector(`[data-level="${state.level}"]`)?.focus({ preventScroll: true });
      return;
    }
    if (d.lane) {
      state.lane = d.lane;
      await renderRevealed();
      return;
    }
    if (d.era !== undefined) {
      stepEra(d.era, !!b.closest("#content"));
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
    if (history.state?.dlg > 1 && !history.state.person) { history.back(); return; }
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
    const value = $("search").value, next = value.trim() ? value : "";
    if (state.q === next) return;
    state.q = next;
    renderRevealed();
  }
  const quick = setupQuickSearch(c, {
    input: $("search"),
    panel: $("quickResults"),
    recent: () => [...seen].reverse(),
    // What the page shows under the current era and lane; "global" widens to everything.
    scope: () => ({
      ids: new Set(DATA.filter((d) => passes(d, { scope: "all", ignoreQuery: true })).map((d) => d.id)),
      label: [state.era !== "all" && ERAS[+state.era][0], state.lane !== "all" && L[state.lane][1]].filter(Boolean).join(" · "),
    }),
    commit: async ({ global = false } = {}) => {
      if (global) {
        clearTimeout(searchTimer);
        const value = $("search").value;
        Object.assign(state, { q: value.trim() ? value : "", era: "all", lane: "all" });
        await render();
      } else commitSearch();
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
  $("eraSelect").onchange = (e) => stepEra(e.target.value, false);
  // Switching era from far down a page lands at the top of the new era, just under the filters.
  async function stepEra(value, fromContent) {
    if (String(value) === String(state.era)) return;
    const active = document.activeElement, dir = active?.dataset?.eraDir, leaving = state.era;
    const inAxis = !!active?.closest?.(".tl-head"), inContent = $("content").contains(active);
    state.era = String(value);
    await render();
    if (fromContent && $("filterRow").getBoundingClientRect().top < 0) $("filterRow").scrollIntoView({ block: "start" });
    // Keep keyboard focus on the equivalent control: the axis corner or header in the timeline,
    // the same-direction step button, or the heading of the era just opened.
    const content = $("content");
    let target = null;
    if (inAxis) target = content.querySelector(state.era === "all" ? `.tl-era[data-era="${leaving}"]` : '.tl-corner [data-era="all"]');
    else if (dir && dir !== "all") target = content.querySelector(`.era-step:not(.bottom) [data-era-dir="${dir.replace(/^b/, "")}"]`);
    if (!target && (inContent || (fromContent && active === document.body))) target = content.querySelector(".era-step:not(.bottom) h3");
    target?.focus({ preventScroll: true });
  }

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
    if (!typing && !e.metaKey && (!e.ctrlKey || e.getModifierState?.("AltGraph")) && ["[", "]"].includes(e.key) && !document.querySelector("dialog[open]")) {
      const next = state.era === "all" ? (e.key === "]" ? 0 : ERAS.length - 1) : +state.era + (e.key === "]" ? 1 : -1);
      if (next >= 0 && next < ERAS.length) { e.preventDefault(); stepEra(next, true); }
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
  document.addEventListener("scroll", (e) => {
    const t = e.target;
    if (t.classList?.contains("timeline")) syncAxis(t);
    // Tabbing to an off-screen era header scrolls the axis strip; the chart follows it.
    else if (t.classList?.contains("tl-stick")) {
      const tl = t.parentElement.querySelector(".timeline");
      if (tl && Math.abs(tl.scrollLeft - t.scrollLeft) > 1) tl.scrollLeft = t.scrollLeft;
    }
  }, true);
  // A bar reached with the keyboard should not sit under the sticky lane names.
  document.addEventListener("focusin", (e) => {
    const bar = e.target.closest?.(".tl-bar"), tl = bar?.closest(".timeline");
    if (!tl) return;
    const box = tl.getBoundingClientRect(), r = bar.getBoundingClientRect();
    const edge = box.left + (tl.querySelector(".tl-lane-name")?.offsetWidth || 0) + 8, room = Math.min(r.width, 160);
    if (r.right < edge + 40) tl.scrollLeft -= edge + room - r.right;
    else if (r.left > box.right - 40) tl.scrollLeft += r.left - (box.right - room);
  });
  new ResizeObserver(() => {
    if (state.view !== "timeline" || state.era === "all" || $("detail").open) return;
    if (Math.floor(timelineFit()) !== fittedFit) render({ url: false });
  }).observe($("content"));
  // The skip link moves focus without adding "#content" to the address or the history.
  document.querySelector(".skip")?.addEventListener("click", (e) => {
    e.preventDefault();
    $("content").focus({ preventScroll: true });
    $("content").scrollIntoView({ block: "start" });
  });
  window.addEventListener("popstate", (event) => {
    // Back first dismisses a picture, comparison or note window, leaving the page where it was.
    const overlays = ["info", "lightbox", "comparison", "artComparison"].map($).filter((d) => d.open);
    if (overlays.length) {
      overlays.forEach((d) => d.close());
      history.pushState(lastState, "", lastHref);
      return;
    }
    remember();
    readURL();
    const id = location.hash.slice(1), person = personFromHash(location.hash);
    render({ url: false });
    if (person) { openPerson(person, { fromURL: true }); return; }
    closePerson({ fromURL: true });
    if (BYID[id]) openNode(id, { fromURL: true, back: true, trail: event.state?.trail || [] });
    else closeDetail({ fromURL: true });
  });
  $("eraSelect").innerHTML = [["全部时代"], ...ERAS].map((e, i) => `<option value="${i ? i - 1 : "all"}">${e[0]}${e[1] ? ` · ${e[1]}` : ""}</option>`).join("");
  $("laneSelect").innerHTML = [["all", "全部分类"], ...LANES]
    .map((l) => `<option value="${l[0]}">${l[1]}</option>`)
    .join("");
  $("stats").innerHTML =
    `<b>${DATA.length}</b> 条目 <span>·</span> <b>${WORKS.length}</b> 配图<br><b>${ROUTES.length}</b> 路线 <span>·</span> <b>${c.sourceCount}</b> 专题资料`;
  // Every entry is illustrated, so the image filter would never change anything.
  $("illustratedOnly").closest(".image-filter").hidden = DATA.every((d) => ART[d.id].length);
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
