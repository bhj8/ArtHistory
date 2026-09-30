import { esc, imageHTML } from "./helpers.js";
import { levelBadge } from "../learning.js";

export const personHash = (name) => `person=${encodeURIComponent(name)}`;
export function personFromHash(hash) {
  const match = /^#?person=(.+)$/.exec(hash);
  if (!match) return null;
  try { return decodeURIComponent(match[1]); } catch { return null; }
}

export function personHTML(a, c, { seen }) {
  const english = a.aliases.find((n) => /^[A-Za-zÀ-ž]/.test(n) && n !== a.name);
  const others = a.aliases.filter((n) => n !== a.name && n !== english);
  const entries = a.entries.map((id) => c.BYID[id]).filter(Boolean).sort((x, y) => x.era - y.era);
  const works = a.works.map((id) => c.BYWORK[id]).filter(Boolean);
  const cover = works[0] || entries.map((d) => c.ART[d.id][0]).find(Boolean);
  return `<div class="modal-head person-head"><span class="person-kicker">人物</span><button data-close="person" aria-label="关闭人物页">关闭 ×</button></div>
<header class="person-hero">
  <div class="person-portrait">${cover ? imageHTML(cover, "", true) : `<span>${esc(a.name.slice(0, 1))}</span>`}</div>
  <div>
    <h2 id="personTitle">${esc(a.name)}</h2>
    ${english ? `<p class="person-en">${esc(english)}</p>` : ""}
    ${a.life || a.note ? `<p class="person-life">${[a.life && `<b>${esc(a.life)}</b>`, a.note && esc(a.note)].filter(Boolean).join(" · ")}</p>` : ""}
    ${others.length ? `<p class="person-aliases">又名：${others.map(esc).join("、")}</p>` : ""}
    <p class="person-stats">${works.length} 件收录作品 · ${entries.length} 个相关条目</p>
  </div>
</header>
${works.length ? `<section class="person-section"><h3>作品 <small>${works.length}</small></h3><div class="person-works">${works.map((w) => `<button data-person-work="${w.id}" aria-label="放大${esc(w.zh)}">${imageHTML(w, "", false, "(max-width: 600px) 45vw, 200px")}<b>${esc(w.zh)}</b><small>${esc(w.date)}</small></button>`).join("")}</div></section>` : ""}
${entries.length ? `<section class="person-section"><h3>相关条目 <small>${entries.length}</small></h3><div class="person-entries">${entries.map((d) => `<button data-node="${d.id}" style="--c:${c.L[d.lane][3]}">${c.ART[d.id][0] ? imageHTML(c.ART[d.id][0], "", false, "64px") : "<span></span>"}<div><b>${esc(d.zh)} ${levelBadge(d)}</b><small>${esc(c.L[d.lane][1])} · ${esc(d.date)}${seen.has(d.id) ? " · 已读" : ""}</small><small>${esc(d.hook)}</small></div></button>`).join("")}</div></section>` : ""}`;
}
