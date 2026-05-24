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
    return JSON.parse(raw);
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
