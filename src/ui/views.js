export function createViews({
  DATA,
  ART,
  LANES,
  ERAS,
  ROUTES,
  BYID,
  L,
  seen,
  getState,
  hits,
  esc,
  imageHTML,
}) {
  function nodeButton(d) {
    const state = getState();
    return `<button class="node" data-node="${d.id}" title="${esc(d.en + " · " + d.date)}"><span>${esc(d.zh)}</span>${seen.has(d.id) ? '<span class="visited" aria-label="已看过">✓</span>' : ""}</button>`;
  }
  function cards(items, artOnly = false) {
    const state = getState();
    if (!items.length)
      return `<div class="empty">这里暂时没有匹配项。<br>${state.view === "saved" ? "打开感兴趣的条目，点击「收藏」即可留在这里。" : "可以换个关键词，或点击「重置筛选」。"}</div>`;
    return `<div class="grid">${items.map((d) => `<button class="card" data-node="${d.id}" style="--c:${L[d.lane][3]}">${ART[d.id] ? `<div class="art-frame">${imageHTML(d.id)}</div>` : `<div class="noart">${String(DATA.indexOf(d) + 1).padStart(3, "0")}<span>${esc(d.kind)}</span></div>`}<div class="card-content"><div class="card-meta">${L[d.lane][1]} · ${esc(d.date)}</div><h3>${esc(d.zh)}</h3><div class="en">${esc(d.en)}</div><p>${artOnly && ART[d.id] ? esc(ART[d.id].zh) : esc(d.hook)}</p></div></button>`).join("")}</div>`;
  }
  function renderMap(items) {
    const state = getState();
    let lanes =
      state.lane === "all" ? LANES : LANES.filter((x) => x[0] === state.lane);
    let eras = ERAS.map((x, i) => [x, i]).filter(
      (x) => state.era === "all" || x[1] === +state.era,
    );
    return `<div class="map-intro"><span><b>横看时代，纵看不同传统。</b>点击名称进入详情；图片是这一区域的一扇窗。</span><span class="extra">分段导航，非等比例时间轴 · 空白不代表没有艺术</span></div><div class="map-wrap"><table class="map-table" style="min-width:${eras.length === 1 ? "0" : "1170px"}" aria-label="按时代与文化线索组织的美术史导航地图"><thead><tr><th><b>并行的美术史</b><span>每格均可继续深入</span></th>${eras.map(([e]) => `<th><b>${e[0]}</b><span>${e[1]}</span></th>`).join("")}</tr></thead><tbody>${lanes
      .map(
        (l) =>
          `<tr style="--c:${l[3]}"><th scope="row"><div class="lane-line"></div><b>${l[1]}</b><span>${l[2]}</span><br><span>${DATA.filter((x) => x.lane === l[0]).length} 个入口</span></th>${eras
            .map(([e, i]) => {
              const cell = items.filter((x) => x.lane === l[0] && x.era === i);
              const img = cell.find((x) => ART[x.id]);
              return `<td>${img ? `<button class="cell-art" data-node="${img.id}" aria-label="从作品进入${esc(img.zh)}">${imageHTML(img.id)}</button>` : ""}${cell.length ? cell.map(nodeButton).join("") : '<span class="emptycell">此分区未列入口<br>可从相邻时期继续</span>'}</td>`;
            })
            .join("")}</tr>`,
      )
      .join(
        "",
      )}</tbody></table></div><div class="bottom-note">地图位置表示便于导航的主要讨论时期，不是精确起止；书法、陶瓷、宗教传统等常跨越多个时段。地理线索与设计、媒介线索有交叉，各条目只在主入口放置一次。<span class="only-mobile"> 表格可向右滑动，左侧分类固定。</span></div>`;
  }
  function renderRoutes() {
    const state = getState();
    const allowed = new Set(hits().map((d) => d.id));
    const routes = ROUTES.filter((r) => r.ids.some((id) => allowed.has(id)));
    return `<h2 class="section-title">从一个问题出发。</h2><p class="section-sub">这些是学习顺序，不是单一继承链。一次逛一条，也可以随时跳走。</p><div class="routegrid">${routes.map((r) => `<article class="route"><span class="route-kicker">ROUTE ${String(ROUTES.indexOf(r) + 1).padStart(2, "0")}</span><h3>${r.title}</h3><p>${r.desc}</p><div class="route-steps">${r.ids.map((id, i) => `${i ? "<span>→</span>" : ""}<button data-node="${id}">${BYID[id].zh.split("／")[0]}</button>`).join("")}</div><button class="start" data-route="${ROUTES.indexOf(r)}">沿这条路线开始 →</button><span class="route-count">${r.ids.length} 站 · ${r.ids.filter((id) => seen.has(id)).length} 站看过</span></article>`).join("")}</div>${!routes.length ? '<div class="empty">暂无匹配路线，可重置筛选后查看。</div>' : ""}`;
  }

  return { nodeButton, cards, renderMap, renderRoutes };
}
