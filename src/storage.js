// Keep these keys stable: changing them would hide existing browser collections.
export function readLocal(key) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

export function saveProgress(saved, seen) {
  try {
    localStorage.setItem("art-atlas-saved", JSON.stringify([...saved]));
    localStorage.setItem("art-atlas-seen", JSON.stringify([...seen]));
  } catch {
    // Private browsing or a full storage quota must not prevent browsing.
  }
}
