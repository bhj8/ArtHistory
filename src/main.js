import { loadContent } from "./content.js";
import { readLocal, saveProgress } from "./storage.js";
import { createViews } from "./ui/views.js";

async function start() {
  const { DATA, ART, SOURCES, LANES, ERAS, EDGES, ROUTES, BYID, L } =
    await loadContent();
  const $ = (x) => document.getElementById(x);
  const esc = (x) =>
    String(x ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
  let saved = new Set(readLocal("art-atlas-saved").filter((id) => BYID[id])),
    seen = new Set(readLocal("art-atlas-seen").filter((id) => BYID[id]));
  let state = { view: "map", lane: "all", era: "all", q: "", tag: "" },
    selected = null,
    history = [],
    compare = [],
    routeActive = null,
    trigger = null;
  function persist() {
    saveProgress(saved, seen);
    $("savedCount").textContent = saved.size;
  }
  function imageHTML(id, cls = "", alt) {
    return ART[id]
      ? `<img class="${cls}" src="${ART[id].image}" alt="${esc(alt || ART[id].zh)}" loading="lazy">`
      : "";
  }
  function hits() {
    return DATA.filter(
      (d) =>
        (state.lane === "all" || d.lane === state.lane) &&
        (state.era === "all" || d.era === +state.era) &&
        (!state.tag || d.tags.includes(state.tag)) &&
        (!state.q ||
          Object.values(d)
            .join(" ")
            .toLowerCase()
            .includes(state.q.toLowerCase())),
    );
  }
  const { cards, renderMap, renderRoutes } = createViews({
    DATA,
    ART,
    LANES,
    ERAS,
    ROUTES,
    BYID,
    L,
    seen,
    getState: () => state,
    hits,
    esc,
    imageHTML,
  });
  function renderFilters() {
    $("filters").innerHTML =
      `${[["all", "全部线索", "", null], ...LANES].map((a) => `<button data-lane="${a[0]}" class="${state.lane === a[0] ? "on" : ""}" aria-pressed="${state.lane === a[0]}">${a[3] ? `<i class="swatch" style="--c:${a[3]}"></i>` : ""}${a[1]}</button>`).join("")}<div class="filter-end"><select id="era" aria-label="时代筛选"><option value="all">所有时代</option>${ERAS.map((e, i) => `<option value="${i}" ${state.era == i ? "selected" : ""}>${e[0]} · ${e[1]}</option>`).join("")}</select><span class="small muted" id="visibleCount"></span><button id="reset" ${state.lane === "all" && state.era === "all" && !state.q && !state.tag ? "hidden" : ""}>重置筛选</button></div>`;
    $("era").onchange = (e) => {
      state.era = e.target.value;
      render();
    };
    $("reset").onclick = () => {
      state = { ...state, lane: "all", era: "all", q: "", tag: "" };
      $("search").value = "";
      render();
    };
  }
  function render() {
    persist();
    renderFilters();
    document.querySelectorAll("[data-view]").forEach((b) => {
      b.classList.toggle("on", b.dataset.view === state.view);
      b.setAttribute("aria-pressed", b.dataset.view === state.view);
    });
    let items = hits(),
      html = "";
    if (state.view === "map") {
      html =
        state.q || state.tag
          ? `<div class="results-title"><h2 class="section-title">找到 ${items.length} 个入口</h2></div>${cards(items)}`
          : renderMap(items);
    } else if (state.view === "gallery") {
      items = items.filter((x) => ART[x.id]);
      html = `<h2 class="section-title">先被一件作品吸引。</h2><p class="section-sub">这里精选 ${Object.keys(ART).length} 件馆藏作品作为视觉入口；点击后可看完整图像、解释与出处。它们不是每个流派的唯一代表。</p><div class="themes">${["", "光", "几何", "山水", "人物", "材料", "宗教", "色彩", "版画"].map((t) => `<button data-tag="${t}" class="${state.tag === t ? "on" : ""}">${t || "全部作品"}</button>`).join("")}</div>${cards(items, true)}`;
    } else if (state.view === "routes") {
      html = renderRoutes();
    } else {
      items = items.filter((x) => saved.has(x.id));
      html = `<h2 class="section-title">把好奇心留在这里。</h2><p class="section-sub">收藏保存在当前浏览器。以后使用同一浏览器访问本站，可以接着逛。</p>${cards(items)}`;
    }
    $("content").innerHTML = html;
    $("visibleCount").textContent =
      state.view === "routes"
        ? `${ROUTES.length} 条路线`
        : `${items.length} 个入口`;
  }
  function kindLabel(d) {
    return `<span class="pill">${esc(d.kind)}</span><span class="pill">${esc(d.date)}</span>`;
  }
  function openNode(id, options = {}) {
    if (!BYID[id]) return;
    if (!$("detail").open) {
      trigger = document.activeElement;
      history = [];
      if (!options.route) routeActive = null;
    } else if (selected && selected !== id && !options.back) {
      history.push(selected);
    }
    selected = id;
    seen.add(id);
    persist();
    $("backDetail").hidden = !history.length;
    const d = BYID[id],
      a = ART[id];
    $("crumb").textContent = L[d.lane][1] + " / " + ERAS[d.era][0];
    const rel = EDGES.filter((e) => e[0] === id || e[1] === id);
    let route = "";
    if (routeActive !== null) {
      const r = ROUTES[routeActive],
        idx = r.ids.indexOf(id);
      if (idx >= 0)
        route = `<div class="route-nav"><span>${r.title}<br>第 ${idx + 1} / ${r.ids.length} 站</span><div><button data-route-step="${idx - 1}" ${idx === 0 ? "disabled" : ""}>上一站</button> <button data-route-step="${idx + 1}" ${idx === r.ids.length - 1 ? "disabled" : ""}>下一站</button></div></div>`;
    }
    $("detailBody").innerHTML =
      `${route}<div class="kicker">${esc(d.kind)} · ${L[d.lane][1]}</div><h2 id="detailTitle">${esc(d.zh)}</h2><div class="detail-en">${esc(d.en)}</div><div class="detail-meta">${kindLabel(d)}</div><p class="hook">${esc(d.hook)}</p>${a ? `<button class="detail-image" data-light="${id}" aria-label="放大${esc(a.zh)}">${imageHTML(id)}</button><div class="caption"><strong>${esc(a.zh)}</strong><br>${esc(a.artistZh || a.artist)} · ${esc(a.date)}<br><a href="${a.url}" target="_blank" rel="noopener noreferrer">The Met 馆藏原图与记录 ↗</a> · 点击图片放大</div>` : `<p class="caption">此入口暂未内嵌图片；下方可直接检索代表作品。</p>`}<div class="drawer-actions"><button id="saveNode" class="${saved.has(id) ? "saved" : ""}">${saved.has(id) ? "✓ 已收藏" : "＋ 收藏这个入口"}</button><button id="addCompare">${compare.includes(id) ? "✓ 已加入对照" : "⇄ 加入对照"}</button></div><section class="block"><h3>先认出它 · 视觉线索</h3><p>${esc(d.look)}</p></section><section class="block"><h3>它在问什么</h3><p>${esc(d.idea)}</p></section><section class="block"><h3>人物与观看入口</h3><p>${esc(d.people)}</p><p style="margin-top:9px;color:#68735e">${esc(d.work)}</p></section><div class="distinguish"><b>别混在一起</b><br>${esc(d.distinguish)}</div><section class="block"><h3>接下来可以走向哪里</h3><div class="related">${
        rel.length
          ? rel
              .map((e) => {
                const target = e[0] === id ? e[1] : e[0];
                return `<button data-node="${target}">${esc(BYID[target].zh)} ↗<small>${esc(e[2])} · ${esc(e[3])}</small></button>`;
              })
              .join("")
          : DATA.filter((x) => x.lane === d.lane && x.id !== id)
              .sort((a, b) => Math.abs(a.era - d.era) - Math.abs(b.era - d.era))
              .slice(0, 3)
              .map(
                (x) =>
                  `<button data-node="${x.id}">${esc(x.zh)} ↗<small>同一分区的延伸阅读；不表示直接影响</small></button>`,
              )
              .join("")
      }</div></section><section class="block"><h3>带着问题继续查</h3><div class="links">${d.source && SOURCES[d.source] ? `<a href="${SOURCES[d.source].url}" target="_blank" rel="noopener noreferrer">${esc(SOURCES[d.source].zh)}<span>${SOURCES[d.source].org} 专题 ↗</span></a>` : ""}${a ? `<a href="${a.url}" target="_blank" rel="noopener noreferrer">${esc(a.zh)}<span>馆藏资料 ↗</span></a>` : ""}<a href="https://www.google.com/search?tbm=isch&q=${encodeURIComponent(d.zh + " " + d.en + " art")}" target="_blank" rel="noopener noreferrer">看更多作品图像<span>图片检索 ↗</span></a><a href="https://www.google.com/search?q=${encodeURIComponent(d.zh + " 美术史 介绍 " + d.en)}" target="_blank" rel="noopener noreferrer">中文入门与讲解<span>网页检索 ↗</span></a><a href="https://www.google.com/search?q=${encodeURIComponent("site:smarthistory.org " + d.en)}" target="_blank" rel="noopener noreferrer">查 Smarthistory 的图文／视频<span>站内定向检索 ↗</span></a></div></section><p class="caption">日期是概略讨论范围，流派边界存在不同解释。检索链接用于继续探索，不等于已经核验过的参考来源。</p>`;
    $("saveNode").onclick = () => {
      saved.has(id) ? saved.delete(id) : saved.add(id);
      persist();
      $("saveNode").textContent = saved.has(id)
        ? "✓ 已收藏"
        : "＋ 收藏这个入口";
      $("saveNode").classList.toggle("saved", saved.has(id));
    };
    $("addCompare").onclick = () => {
      if (!compare.includes(id)) {
        if (compare.length === 2) compare.shift();
        compare.push(id);
      }
      updateCompare();
      $("addCompare").textContent = "✓ 已加入对照";
      if (compare.length === 2) showComparison();
    };
    if (!$("detail").open) $("detail").showModal();
    $("detail").scrollTop = 0;
    try {
      window.history.replaceState(null, "", "#" + id);
    } catch {}
  }
  function closeDetail() {
    $("detail").close();
    routeActive = null;
    render();
    try {
      window.history.replaceState(
        null,
        "",
        location.pathname + location.search,
      );
    } catch {}
  }
  function updateCompare() {
    $("comparebar").hidden = !compare.length;
    $("compareSummary").textContent =
      compare.map((id) => BYID[id].zh).join(" ＋ ") +
      (compare.length === 1 ? " · 再选一个入口" : "");
    $("doCompare").disabled = compare.length !== 2;
  }
  function showComparison() {
    if (compare.length !== 2) return;
    const arr = compare.map((id) => BYID[id]);
    $("comparison").innerHTML =
      `<div class="modal-head"><h2 id="comparisonTitle">放在一起，差别就清楚了。</h2><button data-close="comparison">关闭 ×</button></div><table class="compare-table"><thead><tr><th>对照</th>${arr.map((d) => `<th class="coltitle">${esc(d.zh)}<small>${esc(d.en)}</small></th>`).join("")}</tr></thead><tbody><tr><th>作品</th>${arr.map((d) => `<td>${ART[d.id] ? imageHTML(d.id) : '<span class="muted">此入口暂无内嵌作品图</span>'}</td>`).join("")}</tr>${[
        ["date", "时期"],
        ["kind", "类别"],
        ["hook", "核心"],
        ["look", "外观"],
        ["idea", "问题"],
        ["distinguish", "辨别"],
      ]
        .map(
          ([key, title]) =>
            `<tr><th>${title}</th>${arr.map((d) => `<td>${esc(d[key])}</td>`).join("")}</tr>`,
        )
        .join("")}</tbody></table>`;
    $("comparison").showModal();
  }
  function showLight(id) {
    const a = ART[id];
    $("lightbox").innerHTML =
      `<div class="modal-head"><span class="small">${esc(a.zh)}</span><button data-close="lightbox">关闭 ×</button></div>${imageHTML(id)}<p class="caption">${esc(a.title)} · ${esc(a.artist)} · ${esc(a.date)}<br>${esc(a.credit)} · <a href="${a.url}" target="_blank" rel="noopener noreferrer">原始馆藏记录 ↗</a></p>`;
    $("lightbox").showModal();
  }
  function showInfo(sources = false) {
    $("info").innerHTML =
      `<div class="modal-head"><h2 id="infoTitle">${sources ? "资料与出处" : "这张地图怎么用"}</h2><button data-close="info">关闭 ×</button></div>${
        sources
          ? `<p>图片取自大都会艺术博物馆的馆藏记录，标题、作者、年代与原始链接随图保留。以下专题可继续深入；其余条目的外链明确标为检索入口。中文描述为本图的导读性概括。</p><div class="source-list">${Object.values(
              SOURCES,
            )
              .map(
                (s) =>
                  `<a href="${s.url}" target="_blank" rel="noopener noreferrer">${esc(s.zh)}<span>${esc(s.title)} ↗</span></a>`,
              )
              .join(
                "",
              )}</div><p>图片仅作学习导航，保留各馆藏记录中的署名与权利信息。<br>本图以核心传统、主要运动和常用检索词为范围，不是穷尽的世界美术史。非洲、美洲、大洋洲和亚洲各地仍有大量地域与个体历史值得继续展开。分区与学习路线是导航设计，不是学界公认的唯一分类。</p>`
          : `<ol><li><b>先定位：</b>横向看时代，纵向看不同传统。横轴按历史章节分段，不按年份等比例缩放。</li><li><b>再点开：</b>每个入口都有视觉特征、核心问题、人物作品、易混淆点和延伸链接。</li><li><b>不知道名字：</b>去「作品入口」，先找到让你停下来的图像。</li><li><b>想建立一条线：</b>选择「学习路线」。箭头表示建议阅读顺序，不代表谁单向取代谁。</li><li><b>容易混淆：</b>在两个条目中分别点「加入对照」。收藏可以保存想继续研究的入口。</li></ol><p>本图区分历史运动、地区传统、机构／学校、媒介／方法与当代标签。地理分区只承担导航作用，不能把跨国交流切断；许多节点横跨多个时代。留白只表示本版未展开。</p><p>图片随项目保存；本地浏览请运行预览服务。外部资料需要联网。收藏仅保存在当前浏览器；不同浏览器或预览环境间不自动同步。</p>`
      }`;
    $("info").showModal();
  }
  document.addEventListener("click", (e) => {
    const node = e.target.closest("[data-node]");
    if (node) {
      openNode(node.dataset.node);
      return;
    }
    const view = e.target.closest("[data-view]");
    if (view) {
      state.view = view.dataset.view;
      state.tag = "";
      render();
      return;
    }
    const lane = e.target.closest("[data-lane]");
    if (lane) {
      state.lane = lane.dataset.lane;
      render();
      return;
    }
    const tag = e.target.closest("[data-tag]");
    if (tag) {
      state.tag = tag.dataset.tag;
      render();
      return;
    }
    const close = e.target.closest("[data-close]");
    if (close) {
      $(close.dataset.close).close();
      return;
    }
    const light = e.target.closest("[data-light]");
    if (light) {
      showLight(light.dataset.light);
      return;
    }
    const route = e.target.closest("[data-route]");
    if (route) {
      routeActive = +route.dataset.route;
      openNode(ROUTES[routeActive].ids[0], { route: true });
      return;
    }
    const step = e.target.closest("[data-route-step]");
    if (step && routeActive !== null) {
      const r = ROUTES[routeActive];
      openNode(r.ids[+step.dataset.routeStep], { route: true });
    }
  });
  $("closeDetail").onclick = closeDetail;
  $("detail").addEventListener("cancel", (e) => {
    e.preventDefault();
    closeDetail();
  });
  $("backDetail").onclick = () => {
    const id = history.pop();
    if (id) openNode(id, { back: true });
  };
  $("search").oninput = (e) => {
    state.q = e.target.value.trim();
    render();
  };
  $("random").onclick = () => {
    const list = hits();
    if (list.length) openNode(list[Math.floor(Math.random() * list.length)].id);
  };
  $("aboutBtn").onclick = () => showInfo();
  $("sourcesBtn").onclick = () => showInfo(true);
  $("doCompare").onclick = showComparison;
  $("clearCompare").onclick = () => {
    compare = [];
    updateCompare();
  };
  document.addEventListener("keydown", (e) => {
    if (
      e.key === "/" &&
      !["INPUT", "TEXTAREA", "SELECT"].includes(
        document.activeElement.tagName,
      ) &&
      !document.querySelector("dialog[open]")
    ) {
      e.preventDefault();
      $("search").focus();
    }
  });
  $("heroArt").innerHTML = ["ukiyoe", "postimp", "songland"]
    .filter((id) => ART[id])
    .map(
      (id) =>
        `<button data-node="${id}" aria-label="探索${BYID[id].zh}">${imageHTML(id)}<span>${BYID[id].zh} ↗</span></button>`,
    )
    .join("");
  $("entryCount").textContent = DATA.length;
  $("imageCount").textContent = Object.keys(ART).length;
  render();
  if (BYID[location.hash.slice(1)]) openNode(location.hash.slice(1));
}
start().catch((error) => {
  console.error(error);
  document.getElementById("content").innerHTML =
    '<div class="empty" role="alert">内容加载失败，请刷新页面。<br>如果是本地文件，请在项目目录运行 npm run dev 后打开显示的地址。</div>';
});
