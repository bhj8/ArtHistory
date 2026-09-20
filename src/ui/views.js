import { esc, imageHTML, empty } from "./helpers.js";
export function createViews(c, state, saved, seen) {
  const { ART, LANES, ERAS, ROUTES, BYID, L, SEARCH } = c;
  const node = (d) =>
    `<button class="map-node" data-node="${d.id}" title="${esc(d.en)}"><span>${esc(d.zh)}</span>${ART[d.id].length ? '<i aria-label="有作品图">▧</i>' : ""}${seen.has(d.id) ? '<i aria-label="已读">·</i>' : ""}</button>`;
  function cards(items) {
    if (!items.length)
      return empty(
        state.view === "saved" ? "还没有符合条件的收藏" : "没有符合条件的条目",
        state.view !== "saved" ||
          !!(state.q || state.lane !== "all" || state.era !== "all"),
      );
    return `<div class="entry-list">${items.map((d) => `<article class="entry-card" style="--c:${L[d.lane][3]}"><button class="entry-open" data-node="${d.id}"><div class="entry-thumb">${ART[d.id].length ? imageHTML(ART[d.id][0]) : `<span>${esc(d.zh.slice(0, 1))}</span>`}</div><div class="entry-copy"><div class="meta">${esc(L[d.lane][1])} · ${esc(d.date)}</div><h3>${esc(d.zh)} <span>${esc(d.en)}</span></h3><p>${esc(d.hook)}</p><div class="entry-tags">${esc(d.kind)}${ART[d.id].length ? ` · ${ART[d.id].length} 件作品` : ""}${seen.has(d.id) ? " · 已读" : ""}</div></div><span class="open-arrow" aria-hidden="true">↗</span></button><button class="quick-save ${saved.has(d.id) ? "on" : ""}" data-save="${d.id}" aria-label="${saved.has(d.id) ? "取消收藏" : "收藏"}${esc(d.zh)}" aria-pressed="${saved.has(d.id)}">${saved.has(d.id) ? "★" : "☆"}</button></article>`).join("")}</div>`;
  }
  function map(items) {
    if (!items.length) return empty();
    const lanes = LANES.filter(
      (l) => state.lane === "all" || l[0] === state.lane,
    );
    const eras = ERAS.map((e, i) => [e, i]).filter(
      ([, i]) => state.era === "all" || i === +state.era,
    );
    function cell(ds) {
      const arts = ds.filter((d) => ART[d.id].length).slice(0, 2);
      return `${arts.length ? `<div class="map-pictures">${arts.map((d) => `<button data-node="${d.id}" aria-label="查看${esc(d.zh)}">${imageHTML(ART[d.id][0])}</button>`).join("")}</div>` : ""}${ds.slice(0, 5).map(node).join("")}${ds.length > 5 ? `<details class="more-nodes"><summary>另外 ${ds.length - 5} 条 <span>＋</span></summary>${ds.slice(5).map(node).join("")}</details>` : ""}${!ds.length ? '<span class="cell-empty">—</span>' : ""}`;
    }
    const table = `<div class="map-scroll" tabindex="0" role="region" aria-label="全景地图，可横向滚动"><table class="map-table ${eras.length === 1 ? "single-era" : ""}"><thead><tr><th scope="col">分类 / 时代</th>${eras.map(([e, i]) => `<th scope="col"><button data-era="${i}">${e[0]}<small>${e[1]}</small></button></th>`).join("")}</tr></thead><tbody>${lanes.map((l) => `<tr style="--c:${l[3]}"><th scope="row"><button data-lane="${l[0]}"><b>${l[1]}</b><small>${items.filter((d) => d.lane === l[0]).length} 条</small></button></th>${eras.map(([, i]) => `<td>${cell(items.filter((d) => d.lane === l[0] && d.era === i))}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
    const mobile = `<div class="mobile-map">${eras
      .map(([e, i]) => {
        const ds = items.filter((d) => d.era === i);
        return ds.length
          ? `<section class="era-section"><h3>${e[0]}<small>${e[1]} · ${ds.length} 条</small></h3>${lanes
              .map((l) => {
                const group = ds.filter((d) => d.lane === l[0]);
                return group.length
                  ? `<details class="mobile-group" style="--c:${l[3]}" ${state.lane !== "all" ? "open" : ""}><summary>${l[1]}<span>${group.length} 条 ＋</span></summary>${cell(group)}</details>`
                  : "";
              })
              .join("")}</section>`
          : "";
      })
      .join("")}</div>`;
    return table + mobile;
  }
  function gallery(works, limit) {
    if (!works.length) return empty("没有符合条件的作品");
    return `<div class="art-grid">${works
      .slice(0, limit)
      .map(
        (a) =>
          `<button class="art-card" data-art="${a.id}"><div class="art-stage">${imageHTML(a)}<span class="art-zoom" aria-hidden="true">↗</span></div><div class="art-info"><h3>${esc(a.zh)}</h3><p>${esc(a.artistZh || a.artist)}<span>${esc(a.date)}</span></p><small>${a.entries.map((id) => esc(BYID[id].zh)).join(" · ")}</small></div></button>`,
      )
      .join(
        "",
      )}</div>${works.length > limit ? `<div class="load-more"><button data-more>再显示 ${Math.min(48, works.length - limit)} 件作品</button><span>已显示 ${limit} / ${works.length}</span></div>` : ""}`;
  }
  function matchingRoutes(items) {
    const ids = new Set(items.map((d) => d.id));
    const words = state.q.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
    return ROUTES.filter((r) => {
      const members = r.ids.filter((id) => ids.has(id));
      const text = `${r.title} ${r.desc}`.toLocaleLowerCase();
      return members.length && (
        words.every((w) => text.includes(w)) ||
        members.some((id) => words.every((w) => SEARCH[id].includes(w)))
      );
    });
  }
  function routes(items) {
    const rs = matchingRoutes(items);
    if (!rs.length) return empty("没有符合条件的路线");
    return `<div class="route-grid">${rs
      .map((r) => {
        const cover = r.ids.map((id) => ART[id][0]).find(Boolean);
        return `<article class="route-card"><div class="route-cover">${imageHTML(cover)}<span>${r.ids.length} 站</span></div><div class="route-copy"><div class="meta">路线 ${String(ROUTES.indexOf(r) + 1).padStart(2, "0")} · 已读 ${r.ids.filter((id) => seen.has(id)).length}/${r.ids.length}</div><h3>${esc(r.title)}</h3><p>${esc(r.desc)}</p><div class="route-stops">${r.ids.map((id) => `<button data-node="${id}">${esc(BYID[id].zh)}</button>`).join("")}</div><button class="primary" data-route="${ROUTES.indexOf(r)}">开始阅读 →</button></div></article>`;
      })
      .join("")}</div>`;
  }
  return { cards, map, gallery, routes, matchingRoutes };
}
