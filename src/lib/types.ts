export interface PageRef {
  id: string;
  sourceDocId: string;
  sourcePageIndex: number;
  rotation: number;
}

export interface PageStack {
  id: string;
  pages: PageRef[];
  name: string;
  size: number;
}

export interface PdfMetadata {
  title: string;
  author: string;
  subject: string;
  keywords: string;
}

export interface ExtractedImage {
  pageIndex: number;
  imageIndex: number;
  width: number;
  height: number;
  data: Uint8Array;
  mimeType: string;
  extension: string;
}

export interface WizardFile {
  id: string;
  stack: PageStack;
  name: string;
  pageCount: number;
  fileSize: number;
  sourceDocId: string;
  // Set when the file was ingested with allowProtected and is encrypted —
  // the stack has no pages until the wizard authenticates the document.
  needsPassword?: boolean;
  // Set when the file was ingested from an image (jpeg/png/heic). The wizard
  // can offer image-specific processing (recompress, resize) only for these.
  isImage?: boolean;
}

export interface ImagePosition {
  imageIndex: number;
  bbox: [number, number, number, number];
  width: number;
  height: number;
}

export type BatesPosition =
  | "top-left"
  | "top-center"
  | "top-right"
  | "bottom-left"
  | "bottom-center"
  | "bottom-right";

export interface BatesConfig {
  prefix: string;
  startNumber: number;
  digits: number;
  position: BatesPosition;
  fontSize: number;
  padding: number;
  shrink: boolean;
}

import type { ImageProcessConfig } from "./imageResize";

export interface CompressConfig {
  imageProcess: ImageProcessConfig;
  subsetFonts: boolean;
  deduplicateObjects: boolean;
  sanitizeStreams: boolean;
}

export interface OutlineEntry {
  id: string;
  title: string;
  level: number;
  pageStart: number;
  pageEnd: number;
  hasChildren: boolean;
  parentId: string | null;
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
