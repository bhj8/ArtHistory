export const esc = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
export const link = (url, text, cls = "") =>
  `<a class="${cls}" href="${esc(url)}" target="_blank" rel="noopener noreferrer">${text} ↗</a>`;
export function imageHTML(art, cls = "", eager = false) {
  return art
    ? `<img class="${cls}" src="${esc(art.image)}" alt="${esc(art.zh)}" loading="${eager ? "eager" : "lazy"}" decoding="async"${art.width ? ` width="${art.width}" height="${art.height}"` : ""}>`
    : "";
}
export function empty(text = "没有符合条件的内容", action = true) {
  return `<div class="empty"><span aria-hidden="true">⌕</span><h3>${text}</h3>${action ? "<button data-reset>清除筛选</button>" : "<p>在条目中点击「收藏」，即可保存在这里。</p>"}</div>`;
}
