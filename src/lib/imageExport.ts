import type { ExtractedImage } from "./types";
import { buildZip } from "./zipBuilder";
import { downloadBlob } from "./download";

/** Strip the .pdf extension from a filename so it can be used as a base for derived files. */
export function pdfNameStem(name: string): string {
  return name.replace(/\.pdf$/i, "");
}

/**
 * Build the canonical filename for an extracted image: `<stem>_p<page>_img<idx>.<ext>`.
 * Single source of truth — single-file download, ZIP entry, and single-image
 * context menu all go through here so filenames stay consistent.
 */
export function buildExtractedImageFilename(
  stem: string,
  img: { pageIndex: number; imageIndex: number; extension: string }
): string {
  return `${stem}_p${img.pageIndex + 1}_img${img.imageIndex + 1}.${img.extension}`;
}

/** Download a single image with an explicit mime type. */
export function downloadSingleImage(
  data: Uint8Array,
  filename: string,
  mimeType: string = "image/png"
): void {
  downloadBlob(new Blob([data as BlobPart], { type: mimeType }), filename);
}

/**
 * Download extracted images. Single image downloads directly; multiple images
 * are bundled into a ZIP. Each image keeps its own extension/mime type so a
 * mixed JPEG/PNG/JP2 extraction doesn't get mislabelled.
 */
export function downloadImages(
  images: ExtractedImage[],
  docName: string,
  multiDoc = false
): void {
  if (images.length === 0) return;
  const stem = pdfNameStem(docName);

  if (images.length === 1) {
    const img = images[0];
    downloadSingleImage(img.data, buildExtractedImageFilename(stem, img), img.mimeType);
    return;
  }

  const entries = images.map((img) => ({
    name: buildExtractedImageFilename(stem, img),
    data: img.data,
  }));

  const zipName = multiDoc ? "hermitpdf_images.zip" : `${stem}_images.zip`;
  downloadBlob(buildZip(entries), zipName);
}
