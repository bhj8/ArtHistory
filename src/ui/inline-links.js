import { esc } from "./helpers.js";

export function makeTermIndex(entries) {
  const terms = new Map();
  for (const d of entries) {
    for (const name of [d.zh, d.en, ...(d.aliases || [])]) {
      if (name.length >= 2 && !terms.has(name)) terms.set(name, d.id);
    }
  }
  return [...terms].sort((a, b) => b[0].length - a[0].length);
}

export function linkedText(text, currentId, terms, authors = []) {
  const targets = [...terms.filter(([, id]) => id !== currentId).map(([name, id]) => ({ name, id })), ...authors]
    .sort((a, b) => b.name.length - a.name.length);
  const used = new Set();
  let result = "", i = 0;
  while (i < text.length) {
    const target = used.size < 6 && targets.find((t) => !used.has(t.id || t.author) && text.startsWith(t.name, i) &&
      (!/^[A-Za-z]/.test(t.name) || ((!i || !/[A-Za-z]/.test(text[i - 1])) && !/[A-Za-z]/.test(text[i + t.name.length] || ""))));
    if (!target) { result += esc(text[i++]); continue; }
    used.add(target.id || target.author);
    result += target.id
      ? `<a class="term-link" href="?view=index&amp;level=all#${target.id}" data-node="${target.id}">${esc(target.name)}</a>`
      : `<a class="term-link" href="?view=index&amp;level=all&amp;q=${encodeURIComponent(target.author)}" data-author="${esc(target.author)}">${esc(target.name)}</a>`;
    i += target.name.length;
  }
  return result;
}
