import { artworkPickButton } from "./art-comparison.js";
import { levelBadge, levelRank } from "../learning.js";
import { esc, imageHTML, empty } from "./helpers.js";
import { yearLabel } from "../eras.js";
export function createViews(c, state, saved, seen, notes = {}) {
  const { ART, LANES, ERAS, ROUTES, BYID, L } = c;
  const seenMark = (d) => (seen.has(d.id) ? '<i class="seen-mark" aria-label="已读">✓</i>' : "");
  const node = (d) =>
    `<button class="map-node node-${d.level}" data-node="${d.id}" title="${esc(`${d.en} · ${d.date}`)}"><span>${esc(d.zh)}</span>${levelBadge(d)}${seenMark(d)}</button>`;
  const byTime = (a, b) => (a.years?.[0] ?? 0) - (b.years?.[0] ?? 0) || levelRank(a) - levelRank(b);
  const span = (d) => `${yearLabel(d.years[0])}—${d.ongoing ? "今" : yearLabel(d.years[1])}`;
  function cards(items) {
    if (!items.length)
      return empty(
        state.view === "saved" ? "还没有符合条件的收藏或笔记" : state.view === "recent" ? "还没有符合条件的阅读记录" : "没有符合条件的条目",
        state.view !== "saved" ||
          !!(state.q || state.lane !== "all" || state.era !== "all"),
      );
    return `<div class="entry-list visual-dictionary">${items.map((d) => `<article class="entry-card entry-${d.level}" style="--c:${L[d.lane][3]}"><button class="entry-open" data-node="${d.id}"><div class="entry-thumb">${ART[d.id].length ? imageHTML(ART[d.id][0]) : `<span>${esc(d.zh.slice(0, 1))}</span>`}</div><div class="entry-copy"><div class="meta">${levelBadge(d)} ${esc(L[d.lane][1])} · ${esc(d.date)}</div><h3>${esc(d.zh)} <span>${esc(d.en)}</span></h3><p>${esc(d.hook)}</p><div class="entry-tags">${esc(d.kind)}${ART[d.id].length ? ` · ${ART[d.id].length} 幅配图` : ""}${seen.has(d.id) ? " · 已读" : ""}${notes[d.id]?.trim() ? " · ✎ 有笔记" : ""}</div></div><span class="open-arrow" aria-hidden="true">↗</span></button>${ART[d.id].length > 1 ? `<div class="entry-preview" aria-label="${esc(d.zh)}的更多配图">${ART[d.id].slice(1, 4).map((a) => `<button data-node="${d.id}" data-work="${a.id}" aria-label="查看${esc(a.zh)}">${imageHTML(a, "", false, "90px")}<span>${esc(a.zh)}</span></button>`).join("")}</div>` : ""}<button class="quick-save ${saved.has(d.id) ? "on" : ""}" data-save="${d.id}" aria-label="${saved.has(d.id) ? "取消收藏" : "收藏"}${esc(d.zh)}" aria-pressed="${saved.has(d.id)}">${saved.has(d.id) ? "★" : "☆"}</button></article>`).join("")}</div>`;
  }
  // `carry`: entries filed under other eras whose years reach into the selected one.
  // `widen(lane, era)`: how many more entries the 全部 scope would show there (0 outside 核心).
  function map(items, { carry = [], widen = null } = {}) {
    const lanes = LANES.filter(
      (l) => state.lane === "all" || l[0] === state.lane,
    );
    if (state.era !== "all") return eraSlice(items, +state.era, lanes, carry, widen);
    if (!items.length) return empty();
    const one = lanes.length === 1;
    function cell(ds, lane, era) {
      if (!ds.length) {
        const more = widen?.(lane, era) || 0;
        return more ? `<button class="cell-more" data-level="all" title="核心范围在这里没有条目">全部范围有 ${more} 条 →</button>` : '<span class="cell-empty">—</span>';
      }
      ds = [...ds].sort((a, b) => levelRank(a) - levelRank(b) || byTime(a, b));
      const cap = one ? Infinity : 5;
      const arts = ds.filter((d) => ART[d.id].length).slice(0, 2);
      return `${arts.length ? `<div class="map-pictures">${arts.map((d) => `<button data-node="${d.id}" aria-label="查看${esc(d.zh)}">${imageHTML(ART[d.id][0], "", false, "146px")}</button>`).join("")}</div>` : ""}${ds.slice(0, cap).map(node).join("")}${ds.length > cap ? `<details class="more-nodes"><summary>另外 ${ds.length - cap} 条 <span>＋</span></summary>${ds.slice(cap).map(node).join("")}</details>` : ""}`;
    }
    const table = `<div class="map-scroll" tabindex="0" role="region" aria-label="全景地图"><table class="map-table"><thead><tr><th scope="col">分类 / 时代</th>${ERAS.map((e, i) => `<th scope="col"><button data-era="${i}" title="只看${esc(e[0])}">${esc(e[0])}<small>${esc(e[1])}</small></button></th>`).join("")}</tr></thead><tbody>${lanes.map((l) => `<tr style="--c:${l[3]}"><th scope="row"><button data-lane="${l[0]}" title="只看${esc(l[1])}"><b>${esc(l[1])}</b><small>${items.filter((d) => d.lane === l[0]).length} 条</small></button></th>${ERAS.map((_, i) => `<td>${cell(items.filter((d) => d.lane === l[0] && d.era === i), l[0], i)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
    const mobile = `<div class="mobile-map">${ERAS
      .map((e, i) => {
        const ds = items.filter((d) => d.era === i);
        return ds.length
          ? `<section class="era-section"><h3><button data-era="${i}" aria-label="只看${esc(e[0])}"><span>${esc(e[0])}<small>${esc(e[1])} · ${ds.length} 条</small></span><em>只看此时代 ›</em></button></h3>${lanes
              .map((l) => {
                const group = ds.filter((d) => d.lane === l[0]).sort((a, b) => levelRank(a) - levelRank(b) || byTime(a, b));
                return group.length
                  ? `<details class="mobile-group" style="--c:${l[3]}" ${one ? "open" : ""}><summary><b>${esc(l[1])}</b><span class="mg-peek">${group.slice(0, 3).map((d) => esc(d.zh)).join("、")}</span><span class="mg-count">${group.length} 条 ＋</span></summary>${cell(group, l[0], i)}</details>`
                  : "";
              })
              .join("")}</section>`
          : "";
      })
      .join("")}</div>`;
    return table + mobile;
  }
  // One era: every entry as a picture card, lane by lane, in date order; the same layout on every width.
  function eraSlice(items, era, lanes, carry, widen) {
    const card = (d) =>
      `<button class="slice-card node-${d.level}" data-node="${d.id}" title="${esc(d.en)}"><span class="slice-thumb">${ART[d.id].length ? imageHTML(ART[d.id][0], "", false, "(max-width: 560px) 45vw, (min-width: 1750px) 220px, 180px") : `<i>${esc(d.zh.slice(0, 1))}</i>`}</span><span class="slice-text"><b>${esc(d.zh)}</b>${levelBadge(d)}<small>${esc(d.date)}${seen.has(d.id) ? " · 已读 ✓" : ""}</small></span></button>`;
    const chip = (d) =>
      `<button class="carry-chip${d.level === "core" ? " core" : ""}" data-node="${d.id}" title="${esc(`${d.zh} · ${d.date}`)}">${esc(d.zh)}<small>${span(d)}</small></button>`;
    const rows = lanes.map((l) => ({
      l,
      own: items.filter((d) => d.lane === l[0]).sort(byTime),
      cont: carry.filter((d) => d.lane === l[0]).sort((a, b) => levelRank(a) - levelRank(b) || byTime(a, b)),
      more: widen?.(l[0], era) || 0,
    }));
    const shown = rows.filter((r) => r.own.length || r.cont.length || r.more);
    const blank = rows.filter((r) => !r.own.length && !r.cont.length && !r.more);
    if (!shown.length) return empty();
    return `<div class="era-slice">${shown.map(({ l, own, cont, more }) => `<section class="slice-lane" style="--c:${l[3]}"><header class="slice-lane-head"><h3><button data-lane="${l[0]}" title="只看${esc(l[1])}">${esc(l[1])}</button></h3><small>${own.length ? `${own.length} 条` : "这一时期没有新兴条目"}${cont.length ? ` · 另有 ${cont.length} 条延续` : ""}</small></header>${own.length ? `<div class="slice-grid">${own.map(card).join("")}</div>` : ""}${cont.length ? `<div class="slice-carry"><span>同期延续</span>${cont.map(chip).join("")}</div>` : ""}${more ? `<button class="slice-more" data-level="all">核心之外，这一时期还有 ${more} 条 →</button>` : ""}</section>`).join("")}${blank.length ? `<p class="slice-blank">这一时期暂无收录：${blank.map((r) => esc(r.l[1])).join("、")}</p>` : ""}</div>`;
  }
  function gallery(works, limit, { eraOf = null } = {}) {
    if (!works.length) return empty("没有符合条件的作品");
    const perEra = {};
    if (eraOf) for (const w of works) perEra[eraOf(w)] = (perEra[eraOf(w)] || 0) + 1;
    let last = null;
    return `<div class="art-grid">${works
      .slice(0, limit)
      .map((a) => {
        let head = "";
        if (eraOf && eraOf(a) !== last) {
          last = eraOf(a);
          head = `<h3 class="art-era">${esc(ERAS[last][0])}<small>${esc(ERAS[last][1])} · ${perEra[last]} 幅</small></h3>`;
        }
        return `${head}<article class="gallery-item"><button class="art-card" data-art="${a.id}"><div class="art-stage">${imageHTML(a)}<span class="art-zoom" aria-hidden="true">↗</span></div><div class="art-info"><h3>${esc(a.zh)}</h3><p>${esc(a.artistZh || a.artist)}<span>${esc(a.date)}</span></p><small>${a.entries.map((id) => esc(BYID[id].zh)).join(" · ")}</small></div></button>${artworkPickButton(a.id)}</article>`;
      })
      .join(
        "",
      )}</div>${works.length > limit ? `<div class="load-more"><button data-more>再显示 ${Math.min(48, works.length - limit)} 幅配图</button><span>已显示 ${limit} / ${works.length}</span></div>` : ""}`;
  }
  function matchingRoutes(items) {
    const ids = new Set(items.map((d) => d.id));
    const words = state.q.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
    // One search per render: querying per route member made typing lag in this view.
    const matched = words.length ? new Set(c.search.query(state.q).entries.map((d) => d.id)) : null;
    return ROUTES.filter((r) => {
      const members = r.ids.filter((id) => ids.has(id));
      const text = `${r.title} ${r.desc}`.toLocaleLowerCase();
      return members.length && (!matched || words.every((w) => text.includes(w)) || members.some((id) => matched.has(id)));
    });
  }
  function routes(items) {
    const rs = matchingRoutes(items);
    if (!rs.length) return empty("没有符合条件的路线");
    // With an era or lane chosen, say where each route touches it and list the closest matches first.
    const eraOn = state.era !== "all", laneOn = state.lane !== "all", focus = eraOn || laneOn;
    const label = eraOn && laneOn ? "符合筛选" : eraOn ? "这一时期" : "这一分类";
    const inFocus = (id) => (!eraOn || BYID[id].era === +state.era) && (!laneOn || BYID[id].lane === state.lane);
    const rows = rs.map((r) => ({ r, index: ROUTES.indexOf(r), hits: focus ? r.ids.filter(inFocus) : [] }));
    if (focus) rows.sort((a, b) => b.hits.length - a.hits.length || b.hits.length / b.r.ids.length - a.hits.length / a.r.ids.length || a.index - b.index);
    return `<div class="route-grid">${rows
      .map(({ r, index, hits }) => {
        const pic = (ids) => ids.map((id) => ART[id][0]).find(Boolean);
        const cover = pic(hits) || pic(r.ids);
        const partial = focus && hits.length < r.ids.length;
        return `<article class="route-card"><div class="route-cover">${imageHTML(cover)}<span>${r.ids.length} 站</span></div><div class="route-copy"><div class="meta">路线 ${String(index + 1).padStart(2, "0")} · 已读 ${r.ids.filter((id) => seen.has(id)).length}/${r.ids.length}</div><h3>${esc(r.title)}</h3><p>${esc(r.desc)}</p>${focus ? `<div class="route-focus">${label} ${hits.length} / ${r.ids.length} 站</div>` : ""}<div class="route-stops">${r.ids.map((id) => { const hit = partial && inFocus(id); return `<button data-node="${id}" data-route-index="${index}"${hit ? ' class="hit"' : ""}>${esc(BYID[id].zh)}${hit ? `<span class="sr-only">（${label}）</span>` : ""}</button>`; }).join("")}</div><button class="primary" data-route="${index}">开始阅读 →</button></div></article>`;
      })
      .join("")}</div>`;
  }
  return { cards, map, gallery, routes, matchingRoutes };
}
