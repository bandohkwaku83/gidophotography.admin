/** Matches backend `duplicateAction` FormData values for folder media uploads. */
export type DuplicateUploadAction = "replace" | "ignore";

const STORAGE_KEY = "gidostorage.duplicateUploadAction";

export function getDuplicateUploadPreference(): DuplicateUploadAction {
  if (typeof window === "undefined") return "ignore";
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === "replace" || v === "ignore") return v;
  } catch {
    /* ignore */
  }
  return "ignore";
}

export function setDuplicateUploadPreference(value: DuplicateUploadAction): void {
  try {
    localStorage.setItem(STORAGE_KEY, value);
  } catch {
    /* ignore */
  }
}
