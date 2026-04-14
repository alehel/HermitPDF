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
  pngData: Uint8Array;
}

export interface WizardFile {
  id: string;
  stack: PageStack;
  name: string;
  pageCount: number;
  fileSize: number;
}

export interface ImagePosition {
  imageIndex: number;
  bbox: [number, number, number, number];
  width: number;
  height: number;
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
