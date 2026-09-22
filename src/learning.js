// Keep editorial levels in the data; the interface only distinguishes core entries.
export const SCOPES = { core: "核心", all: "全部" };
export function inScope(entry, scope = "all") {
  return scope !== "core" || entry.level === "core";
}
export function levelRank(entry) { return entry.level === "core" ? 0 : 1; }
export function readScope(params) {
  const scope = params.get("level");
  if (Object.hasOwn(SCOPES, scope)) return scope;
  if (scope === "focus") return "all";
  return params.has("view") || params.has("q") || params.has("lane") || params.has("era") ? "all" : "core";
}
export function levelBadge(entry) {
  return entry.level === "core" ? '<span class="level-badge level-core">核心</span>' : "";
}
