import { PdfMetadata } from "./types";

const STORAGE_KEY = "pw-export-metadata";

export function loadSavedMetadata(): PdfMetadata {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return { title: "", author: "", subject: "", keywords: "" };
}

export function saveMetadata(metadata: PdfMetadata) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(metadata));
  } catch {}
}
