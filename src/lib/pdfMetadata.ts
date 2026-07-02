import { PdfMetadata } from "./types";

const STORAGE_KEY = "pw-export-metadata";

function emptyMetadata(): PdfMetadata {
  return { title: "", author: "", subject: "", keywords: "" };
}

export function loadSavedMetadata(): PdfMetadata {
  let raw: string | null;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch {
    return emptyMetadata();
  }
  if (!raw) return emptyMetadata();
  try {
    // Merge onto defaults so fields added after the value was stored (or a
    // partially-corrupt value) can't surface as `undefined` in the UI.
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null || typeof parsed !== "object") return emptyMetadata();
    return { ...emptyMetadata(), ...(parsed as Partial<PdfMetadata>) };
  } catch (err) {
    console.warn("Failed to parse saved PDF metadata; using defaults.", err);
    return emptyMetadata();
  }
}

export function saveMetadata(metadata: PdfMetadata): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(metadata));
    return true;
  } catch {
    return false;
  }
}
