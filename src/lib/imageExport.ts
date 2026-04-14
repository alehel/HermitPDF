import type { ExtractedImage } from "./types";
import { buildZip } from "./zipBuilder";

/** Trigger a browser download from a Blob. */
function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** Download a single PNG image. */
export function downloadSingleImage(pngData: Uint8Array, filename: string): void {
  const blob = new Blob([pngData as BlobPart], { type: "image/png" });
  triggerBlobDownload(blob, filename);
}

/**
 * Download extracted images. Single image downloads as PNG directly;
 * multiple images are bundled into a ZIP.
 */
export function downloadImages(
  images: ExtractedImage[],
  docName: string,
  multiDoc = false
): void {
  const stem = docName.replace(/\.pdf$/i, "");

  if (images.length === 0) return;

  if (images.length === 1) {
    const img = images[0];
    downloadSingleImage(img.pngData, `${stem}_p${img.pageIndex + 1}_img${img.imageIndex + 1}.png`);
    return;
  }

  // Build file entries for the ZIP
  const entries: { name: string; data: Uint8Array }[] = images.map((img) => ({
    name: `${stem}_p${img.pageIndex + 1}_img${img.imageIndex + 1}.png`,
    data: img.pngData,
  }));

  const zipData = buildZip(entries);
  const zipName = multiDoc ? "hermitpdf_images.zip" : `${stem}_images.zip`;
  const blob = new Blob([zipData as BlobPart], { type: "application/zip" });
  triggerBlobDownload(blob, zipName);
}
