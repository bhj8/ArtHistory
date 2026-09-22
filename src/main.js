import { SCOPES, inScope, levelRank, readScope } from "./learning.js";
import { loadContent } from "./content.js";
import { readLocal, saveProgress } from "./storage.js";
import { createViews } from "./ui/views.js";
import { detailHTML, comparisonHTML } from "./ui/detail.js";
import { esc, link, imageHTML, creditHTML } from "./ui/helpers.js";

async function start() {
  const c = await loadContent(),
    {
      DATA,
      BYID,
      WORKS,
      BYWORK,
      ART,
      SEARCH,
      LANES,
      ERAS,
      L,
      ROUTES,
      SOURCES,
    } = c;
  const $ = (id) => document.getElementById(id);
  const saved = new Set(readLocal("art-atlas-saved").filter((id) => BYID[id]));
  const seen = new Set(readLocal("art-atlas-seen").filter((id) => BYID[id]));
  const state = { view: "map", lane: "all", era: "all", q: "", sort: "time", illustrated: "", level: "core" };
  let selected = null,
    artIndex = 0,
    detailHistory = [],
    sequence = [],
    routeActive = null,
    compare = [],
    limit = 48,
    toastTimer,
    opener = null;
  const views = createViews(c, state, saved, seen);
  const titles = {
    map: "全景地图",
    index: "图解词典",
    recent: "最近读过",
    gallery: "作品图库",
    routes: "学习路线",
    saved: "我的收藏",
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
    u.hash = selected || "";
    history[push ? "pushState" : "replaceState"]({}, "", u);
  }
  function toast(text) {
    $("toast").textContent = text;
    $("toast").classList.add("visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => $("toast").classList.remove("visible"), 2300);
  }
  function persist() {
    saveProgress(saved, seen);
    $("savedCount").textContent = saved.size;
  }
  function hits(ignoreQuery = false, scope = state.level) {
    const words = state.q
      .toLocaleLowerCase()
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    return DATA.filter(
      (d) =>
        inScope(d, scope) &&
        (state.lane === "all" || d.lane === state.lane) &&
        (state.era === "all" || d.era === +state.era) &&
        (!state.illustrated || ART[d.id].length > 0) &&
        (ignoreQuery || words.every((w) => SEARCH[d.id].includes(w))),
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
    return items.filter((d) => state.view !== "saved" || saved.has(d.id));
  }
  function render({ url = true } = {}) {
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
    $("learningScopes").innerHTML = Object.entries(SCOPES).map(([scope, label]) => `<button data-level="${scope}" aria-pressed="${state.level === scope}" class="${state.level === scope ? "on" : ""}">${label}<small>${DATA.filter((d) => inScope(d, scope)).length}</small></button>`).join("");
    $("learningHint").textContent = state.view === "routes" ? "按层级发现路线；打开路线后按完整顺序阅读，保留必要的拓展内容。" : state.level === "core" ? "先读 42 个核心条目：每条附重点导读、自测和下一步阅读。" : state.level === "focus" ? "保留核心与重点，建立更完整的时代和主题联系。" : "完整词典：核心必读、重点了解、专题拓展均带文字标记。";
    const outside = state.q && state.view !== "routes" && state.level !== "all" ? hits(false, "all").filter((d) => !inScope(d, state.level) && (state.view !== "saved" || saved.has(d.id)) && (state.view !== "recent" || seen.has(d.id))).length : 0;
    $("scopeSearchHint").hidden = !outside;
    $("scopeSearchHint").innerHTML = outside ? `其他学习层级还有 ${outside} 个搜索结果。<button data-level="all">查看全部层级 →</button>` : "";
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
    const filtered = state.level !== "all" || state.lane !== "all" || state.era !== "all" || state.q || state.illustrated;
    $("reset").hidden = !filtered;
    $("clearSearch").hidden = !state.q;
    $("sort").hidden = ["map", "routes", "recent"].includes(state.view);
    $("activeFilters").innerHTML = [
      state.level !== "all" ? `<button data-remove="level">${SCOPES[state.level]} ×</button>` : "",
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
    if (state.view === "gallery") {
      const words = state.q
        .toLocaleLowerCase()
        .trim()
        .split(/\s+/)
        .filter(Boolean);
      let works = WORKS.filter((a) => a.entries.some((id) => ids.has(id)));
      // If a query directly names a work or its maker, show only those matches.
      const exactWorks = works.filter(
        (a) =>
          words.length &&
          words.every((w) =>
            [a.zh, a.title, a.artist, a.artistZh]
              .join(" ")
              .toLocaleLowerCase()
              .includes(w),
          ),
      );
      if (exactWorks.length) works = exactWorks;
      if (state.sort === "priority")
        works.sort((a, b) => Math.min(...a.entries.map(id => levelRank(BYID[id]))) - Math.min(...b.entries.map(id => levelRank(BYID[id]))));
      else if (state.sort === "name")
        works.sort((a, b) => a.zh.localeCompare(b.zh, "zh-CN"));
      else
        works.sort((a, b) => BYID[a.entries[0]].era - BYID[b.entries[0]].era);
      $("content").innerHTML = views.gallery(works, limit);
      count = works.length + " 幅配图";
    } else if (state.view === "map" && !state.q) {
      $("content").innerHTML = views.map(items);
    } else if (state.view === "routes") {
      $("content").innerHTML = views.routes(items);
      count = views.matchingRoutes(items).length + " 条路线";
    } else $("content").innerHTML = views.cards(items);
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
    $("detailBody").innerHTML = detailHTML(d, c, { saved, compare, artIndex });
    const i = sequence.indexOf(selected);
    $("detailNav").innerHTML =
      `<button data-step="-1" ${i <= 0 ? "disabled" : ""}>← 上一条</button><span>${routeActive !== null ? esc(ROUTES[routeActive].title) : "连续阅读"}<small>${i >= 0 ? `${i + 1} / ${sequence.length}` : ""}</small></span><button data-step="1" ${i < 0 || i >= sequence.length - 1 ? "disabled" : ""}>下一条 →</button>`;
  }
  function openNode(id, { art, route, back = false, fromURL = false } = {}) {
    if (!BYID[id]) return;
    if (!$("detail").open) {
      opener = document.activeElement;
      detailHistory = [];
      routeActive = route ?? null;
      sequence =
        routeActive !== null
          ? ROUTES[routeActive].ids
          : [...currentItems().map((d) => d.id)];
      if (!sequence.includes(id))
        sequence = DATA.filter((d) => d.lane === BYID[id].lane).map(
          (d) => d.id,
        );
    } else if (selected && selected !== id && !back) {
      detailHistory.push(selected);
    }
    if (!sequence.includes(id)) {
      routeActive = null;
      sequence = DATA.filter((d) => d.lane === BYID[id].lane).map((d) => d.id);
    }
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
      document.body.classList.add("dialog-open");
    }
    $("detail").scrollTop = 0;
    $("closeDetail").focus({ preventScroll: true });
    if (!fromURL) syncURL(true);
  }
  function closeDetail({ fromURL = false } = {}) {
    if (!$("detail").open) return;
    $("detail").close();
    document.body.classList.remove("dialog-open");
    selected = null;
    routeActive = null;
    render({ url: false });
    if (!fromURL) syncURL();
    if (opener?.isConnected) opener.focus({ preventScroll: true });
    else $("content").focus({ preventScroll: true });
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
  function showComparison() {
    if (compare.length !== 2) return;
    $("comparison").innerHTML = comparisonHTML(compare, c);
    $("comparison").showModal();
  }
  let lightWorks = [],
    lightIndex = 0;
  function drawLight() {
    const a = BYWORK[lightWorks[lightIndex]];
    $("lightbox").innerHTML =
      `<div class="light-head"><div><b>${esc(a.zh)}</b><small>${esc(a.artistZh || a.artist)} · ${esc(a.date)}</small></div><button data-close="lightbox" aria-label="关闭大图">关闭 ×</button></div><div class="light-stage">${imageHTML(a, "", true)}</div><div class="light-controls"><button data-zoom aria-pressed="false">放大细节 ＋</button><button data-light-step="-1" ${lightIndex === 0 ? "disabled" : ""}>← 上一幅</button><span>${lightIndex + 1} / ${lightWorks.length}</span><button data-light-step="1" ${lightIndex === lightWorks.length - 1 ? "disabled" : ""}>下一幅 →</button></div><div class="light-credit">${esc(a.title)}<br>${esc(a.museum || "")} · ${creditHTML(a)}</div>`;
  }
  function showLight(id) {
    lightWorks = (selected ? ART[selected] : [BYWORK[id]]).map((a) => a.id);
    lightIndex = lightWorks.indexOf(id);
    drawLight();
    $("lightbox").showModal();
  }
  function showInfo(sources) {
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
    const b = e.target.closest("button");
    if (!b) return;
    const d = b.dataset;
    if (d.query) {
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
      openNode(d.node, { art: d.work });
      return;
    }
    if (d.art) {
      const a = BYWORK[d.art];
      const id =
        a.entries.find(
          (id) => state.lane === "all" || BYID[id].lane === state.lane,
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
      document
        .querySelector(`[data-thumb="${artIndex}"]`)
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
    if (d.step) {
      const id = sequence[sequence.indexOf(selected) + Number(d.step)];
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
  $("search").oninput = (e) => {
    state.q = e.target.value;
    limit = 48;
    render();
  };
  $("clearSearch").onclick = () => {
    state.q = "";
    $("search").value = "";
    render();
    $("search").focus();
  };
  $("reset").onclick = reset;
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
  $("aboutBtn").onclick = () => showInfo(false);
  document.addEventListener("keydown", (e) => {
    const typing = ["INPUT", "TEXTAREA", "SELECT"].includes(
      document.activeElement?.tagName,
    );
    if (e.key === "/" && !typing && !document.querySelector("dialog[open]")) {
      e.preventDefault();
      $("search").focus();
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
    const id = location.hash.slice(1);
    render({ url: false });
    if (BYID[id]) openNode(id, { fromURL: true, back: true });
    else closeDetail({ fromURL: true });
  });
  $("laneSelect").innerHTML = [["all", "全部分类"], ...LANES]
    .map((l) => `<option value="${l[0]}">${l[1]}</option>`)
    .join("");
  $("stats").innerHTML =
    `<b>${DATA.length}</b> 条目 <span>·</span> <b>${WORKS.length}</b> 配图<br><b>${ROUTES.length}</b> 路线 <span>·</span> <b>${Object.keys(SOURCES).length}</b> 专题资料`;
  readURL();
  const initial = location.hash.slice(1);
  render({ url: false });
  if (BYID[initial]) openNode(initial, { fromURL: true });
}
start().catch((error) => {
  console.error(error);
  document.getElementById("content").innerHTML =
    '<div class="empty" role="alert"><h3>内容未能加载</h3><p>请检查网络连接后刷新。</p><button onclick="location.reload()">重试</button></div>';
});
