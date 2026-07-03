import * as fs from "fs";
import * as path from "path";
import { execFileSync } from "child_process";
import type { Download, Page } from "@playwright/test";

export const FIXTURES = path.resolve(__dirname, "..", "test-fixtures");

export function fixture(name: string): string {
  return path.join(FIXTURES, name);
}

// mupdf is ESM-only while Playwright transpiles these specs as CommonJS, so
// load it through a dynamic import and cache the module promise.
type Mupdf = typeof import("mupdf");
let mupdfPromise: Promise<Mupdf> | null = null;
export function getMupdf(): Promise<Mupdf> {
  if (!mupdfPromise) mupdfPromise = import("mupdf");
  return mupdfPromise;
}

/** Save a Playwright download into the test's output dir and return its path. */
export async function saveDownload(download: Download, dir: string): Promise<string> {
  const target = path.join(dir, download.suggestedFilename());
  await download.saveAs(target);
  return target;
}

/** Page count of a PDF file on disk. */
export async function pdfPageCount(file: string): Promise<number> {
  const mupdf = await getMupdf();
  const doc = mupdf.Document.openDocument(fs.readFileSync(file), "application/pdf");
  try {
    return doc.countPages();
  } finally {
    doc.destroy();
  }
}

/** Extracted text of one page of a PDF file on disk. */
export async function pdfPageText(file: string, pageIndex: number): Promise<string> {
  const mupdf = await getMupdf();
  const doc = mupdf.Document.openDocument(fs.readFileSync(file), "application/pdf");
  try {
    const page = doc.loadPage(pageIndex);
    try {
      const stext = page.toStructuredText("");
      try {
        const json = JSON.parse(stext.asJSON()) as {
          blocks?: { lines?: { text?: string }[] }[];
        };
        return (json.blocks ?? [])
          .flatMap((b) => b.lines ?? [])
          .map((l) => l.text ?? "")
          .join(" ");
      } finally {
        stext.destroy();
      }
    } finally {
      page.destroy();
    }
  } finally {
    doc.destroy();
  }
}

/** Number of image blocks across all pages of a PDF file on disk. */
export async function pdfImageBlockCount(file: string): Promise<number> {
  const mupdf = await getMupdf();
  const doc = mupdf.Document.openDocument(fs.readFileSync(file), "application/pdf");
  try {
    let images = 0;
    for (let i = 0; i < doc.countPages(); i++) {
      const page = doc.loadPage(i);
      try {
        const stext = page.toStructuredText("preserve-images");
        try {
          stext.walk({
            onImageBlock() {
              images++;
            },
          });
        } finally {
          stext.destroy();
        }
      } finally {
        page.destroy();
      }
    }
    return images;
  } finally {
    doc.destroy();
  }
}

/**
 * Luminance mean and standard deviation of page 1 rendered at a small fixed
 * size. Used to compare exported pixels against a reference transform.
 */
export async function pdfPageLuminance(
  file: string
): Promise<{ mean: number; sd: number }> {
  const mupdf = await getMupdf();
  const doc = mupdf.Document.openDocument(fs.readFileSync(file), "application/pdf");
  try {
    const page = doc.loadPage(0);
    try {
      const pixmap = new mupdf.Pixmap(mupdf.ColorSpace.DeviceRGB, [0, 0, 200, 260], false);
      try {
        pixmap.clear(255);
        const device = new mupdf.DrawDevice(mupdf.Matrix.scale(200 / 612, 200 / 612), pixmap);
        page.run(device, mupdf.Matrix.identity);
        device.close();
        device.destroy();
        return luminanceStats(pixmap.getPixels());
      } finally {
        pixmap.destroy();
      }
    } finally {
      page.destroy();
    }
  } finally {
    doc.destroy();
  }
}

/** Luminance stats of packed RGB samples (3 bytes per pixel). */
export function luminanceStats(rgb: Uint8ClampedArray): { mean: number; sd: number } {
  let sum = 0;
  let sq = 0;
  const n = rgb.length / 3;
  for (let i = 0; i < rgb.length; i += 3) {
    const l = 0.2126 * rgb[i] + 0.7152 * rgb[i + 1] + 0.0722 * rgb[i + 2];
    sum += l;
    sq += l * l;
  }
  const mean = sum / n;
  return { mean, sd: Math.sqrt(sq / n - mean * mean) };
}

/**
 * Reference luminance stats for the contrast wizard: render the source page
 * the same way pdfPageLuminance does, then apply the CSS contrast formula
 * (out = (in - 128) * amount + 128) in plain JS.
 */
export async function referenceContrastLuminance(
  file: string,
  amount: number
): Promise<{ mean: number; sd: number }> {
  const mupdf = await getMupdf();
  const doc = mupdf.Document.openDocument(fs.readFileSync(file), "application/pdf");
  try {
    const page = doc.loadPage(0);
    try {
      const pixmap = new mupdf.Pixmap(mupdf.ColorSpace.DeviceRGB, [0, 0, 200, 260], false);
      try {
        pixmap.clear(255);
        const device = new mupdf.DrawDevice(mupdf.Matrix.scale(200 / 612, 200 / 612), pixmap);
        page.run(device, mupdf.Matrix.identity);
        device.close();
        device.destroy();
        const px = Uint8ClampedArray.from(pixmap.getPixels());
        for (let i = 0; i < px.length; i++) {
          px[i] = (px[i] - 128) * amount + 128;
        }
        return luminanceStats(px);
      } finally {
        pixmap.destroy();
      }
    } finally {
      page.destroy();
    }
  } finally {
    doc.destroy();
  }
}

/** Extract a ZIP to a directory (validates it in the process) and list its files. */
export function extractZip(zipFile: string, destDir: string): string[] {
  fs.mkdirSync(destDir, { recursive: true });
  execFileSync("unzip", ["-o", "-d", destDir, zipFile], { stdio: "pipe" });
  return fs.readdirSync(destDir).sort();
}

/** Upload files through a wizard's (hidden) file input. */
export async function uploadFiles(page: Page, files: string[]): Promise<void> {
  await page.locator('input[type="file"]').first().setInputFiles(files);
}
