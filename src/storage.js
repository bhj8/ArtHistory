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

export function readNotes() {
  try {
    const value = JSON.parse(localStorage.getItem("art-atlas-notes") || "{}");
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  } catch {
    return {};
  }
}

export function saveNotes(notes) {
  try {
    localStorage.setItem("art-atlas-notes", JSON.stringify(notes));
    return true;
  } catch {
    return false;
  }
}

// A portable backup of everything kept in this browser.
export function backupJSON(saved, seen, notes) {
  return JSON.stringify({ app: "art-history-atlas", version: 1, exported: new Date().toISOString(), saved: [...saved], seen: [...seen], notes }, null, 2);
}

// Merge a backup without discarding anything already here; differing notes are both kept.
export function mergeBackup(text, { saved, seen, notes, known }) {
  const data = JSON.parse(text);
  if (data?.app !== "art-history-atlas") throw new Error("不是本站导出的备份文件");
  const ids = (list) => (Array.isArray(list) ? list.filter((id) => typeof id === "string" && known(id)) : []);
  let added = 0;
  for (const id of ids(data.saved)) if (!saved.has(id)) { saved.add(id); added++; }
  for (const id of ids(data.seen)) if (!seen.has(id)) seen.add(id);
  for (const [id, note] of Object.entries(data.notes || {})) {
    if (!known(id) || typeof note !== "string" || !note.trim()) continue;
    const mine = notes[id]?.trim();
    if (!mine) { notes[id] = note; added++; }
    else if (!mine.includes(note.trim())) { notes[id] = `${mine}\n\n——（导入）——\n${note.trim()}`; added++; }
  }
  return added;
}
