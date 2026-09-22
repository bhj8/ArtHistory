import { esc, link, imageHTML, creditHTML } from "./helpers.js";
export function detailHTML(d, c, { saved, compare, artIndex = 0 }) {
  const { ART, BYID, EDGES, SOURCES, L } = c,
    works = ART[d.id],
    a = works[artIndex] || works[0];
  const related = EDGES.filter((e) => e[0] === d.id || e[1] === d.id);
  const sourceIds = [
    ...new Set([d.source, ...(d.sources || [])].filter((s) => SOURCES[s])),
  ];
  const section = (title, text) =>
    text
      ? `<section class="detail-section"><h3>${title}</h3>${(Array.isArray(text) ? text : [text]).map((p) => `<p>${esc(p)}</p>`).join("")}</section>`
      : "";
  return `<div class="detail-heading"><div class="meta">${esc(d.kind)} · ${esc(d.date)}</div><h2 id="detailTitle">${esc(d.zh)}</h2><p class="detail-en">${esc(d.en)}</p><p class="detail-hook">${esc(d.hook)}</p><div class="detail-actions"><button data-save="${d.id}" class="${saved.has(d.id) ? "on" : ""}" aria-pressed="${saved.has(d.id)}">${saved.has(d.id) ? "★ 已收藏" : "☆ 收藏"}</button><button data-compare="${d.id}" aria-pressed="${compare.includes(d.id)}">${compare.includes(d.id) ? "✓ 已选对照" : "＋ 对照"}</button><button data-share>复制链接</button><button id="detailCompare" data-open-compare ${compare.length !== 2 ? "hidden" : ""}>打开对照</button></div></div>
 ${a ? `<section class="detail-gallery" aria-label="作品与学习图解"><div class="gallery-heading"><h3>看图，理解概念</h3><span>${works.length} 幅配图 · 点图放大</span></div>${works.length > 1 ? `<div class="gallery-controls"><button data-thumb="${artIndex - 1}" ${artIndex === 0 ? "disabled" : ""} aria-label="上一幅配图">← 上一幅</button><span>${artIndex + 1} / ${works.length}</span><button data-thumb="${artIndex + 1}" ${artIndex === works.length - 1 ? "disabled" : ""} aria-label="下一幅配图">下一幅 →</button></div>` : ""}<button class="detail-art" data-light="${a.id}" aria-label="放大${esc(a.zh)}">${imageHTML(a, "", true)}<span aria-hidden="true">放大 ↗</span></button><div class="art-caption"><strong>${esc(a.zh)}</strong><span>${esc(a.artistZh || a.artist)} · ${esc(a.date)}</span>${a.medium ? `<span>${esc(a.medium)}</span>` : ""}<span>${esc(a.museum || "")}</span>${link(a.url, esc(a.sourceLabel || "馆藏记录"))}<span class="art-position">${artIndex + 1} / ${works.length}</span></div><details class="image-provenance"><summary>图片来源与署名</summary>${creditHTML(a)}</details><aside class="looking-guide"><strong>这幅图怎么看</strong><p>${esc(a.notes?.[d.id] || d.look)}</p></aside>${works.length > 1 ? `<div class="thumbnails" aria-label="切换配图">${works.map((w, i) => `<button data-thumb="${i}" class="${i === artIndex ? "on" : ""}" aria-label="配图 ${i + 1}：${esc(w.zh)}" aria-pressed="${i === artIndex}">${imageHTML(w)}<span>${esc(w.zh)}</span><small>${esc(w.date)}</small></button>`).join("")}</div>` : ""}</section>` : ""}
 <div class="detail-reading">${section("视觉特征", d.look)}${section("历史背景", d.context || d.idea)}${d.context ? section("核心问题", d.idea) : ""}${section("人物与作品", [d.people, d.work])}${d.reading ? section("观看要点", d.reading) : ""}<aside class="distinguish"><h3>辨别</h3><p>${esc(d.distinguish)}</p></aside>
 ${
   related.length
     ? `<section class="detail-section"><h3>相关条目 <span>${related.length}</span></h3><div class="related">${related
         .map((e) => {
           const target = e[0] === d.id ? e[1] : e[0];
           return `<button class="related-card" data-node="${target}">${ART[target]?.length ? imageHTML(ART[target][0]) : ""}<div><b>${esc(BYID[target].zh)} <span>↗</span></b><small>${esc(e[2])} · ${esc(e[3])}</small></div></button>`;
         })
         .join("")}</div></section>`
     : ""
 }
 <section class="detail-section"><h3>阅读资料</h3><div class="resource-links">${sourceIds
   .map((id) => {
     const s = SOURCES[id];
     return link(
       s.url,
       `<b>${esc(s.zh)}</b><small>${esc(s.org)} · ${esc(s.title)}</small>`,
     );
   })
   .join("")}${works
   .slice(0, 5)
   .map((w) =>
     link(
       w.url,
       `<b>${esc(w.zh)}</b><small>${esc(w.museum || "The Met")} · ${esc(w.sourceLabel || "馆藏记录")}</small>`,
     ),
   )
   .join(
     "",
   )}</div><details class="search-links"><summary>继续检索</summary>${link("https://www.google.com/search?q=" + encodeURIComponent(d.zh + " " + d.en), "中文与英文资料")}${link("https://www.google.com/search?tbm=isch&q=" + encodeURIComponent(d.zh + " " + d.en), "更多作品图像")}${link("https://www.google.com/search?q=" + encodeURIComponent("site:smarthistory.org " + d.en), "Smarthistory 图文与视频")}</details></section></div>`;
}
export function comparisonHTML(ids, c) {
  const ds = ids.map((id) => c.BYID[id]);
  return `<div class="modal-head"><h2 id="comparisonTitle">条目对照</h2><button data-close="comparison" aria-label="关闭对照">关闭 ×</button></div><table class="compare-table"><thead><tr><th scope="col">项目</th>${ds.map((d) => `<th scope="col">${esc(d.zh)}<small>${esc(d.en)}</small></th>`).join("")}</tr></thead><tbody><tr><th scope="row">作品</th>${ds.map((d) => `<td>${imageHTML(c.ART[d.id][0])}</td>`).join("")}</tr>${[
    ["date", "时代"],
    ["look", "视觉"],
    ["idea", "问题"],
    ["people", "人物"],
    ["distinguish", "辨别"],
  ]
    .map(
      ([k, t]) =>
        `<tr><th scope="row">${t}</th>${ds.map((d) => `<td>${esc(d[k])}</td>`).join("")}</tr>`,
    )
    .join("")}</tbody></table>`;
}
