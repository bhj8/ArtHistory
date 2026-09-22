// Editorial learning order, not a ranking of the value of cultures or artworks.
export const LEVELS = {
  core: { label: "核心必读", rank: 0 },
  focus: { label: "重点了解", rank: 1 },
  extended: { label: "专题拓展", rank: 2 },
};
export const SCOPES = { core: "核心必读", focus: "核心＋重点", all: "全部条目" };
export function inScope(entry, scope = "all") {
  return scope === "all" || entry.level === "core" || (scope === "focus" && entry.level === "focus");
}
export function levelRank(entry) { return LEVELS[entry.level]?.rank ?? 2; }
export function readScope(params) {
  const scope = params.get("level");
  if (Object.hasOwn(SCOPES, scope)) return scope;
  // Existing search/view links continue to search their full original collection.
  return params.has("view") || params.has("q") || params.has("lane") || params.has("era") ? "all" : "core";
}
export function levelBadge(entry) {
  const level = LEVELS[entry.level] || LEVELS.extended;
  return `<span class="level-badge level-${Object.hasOwn(LEVELS, entry.level) ? entry.level : "extended"}">${level.label}</span>`;
}
