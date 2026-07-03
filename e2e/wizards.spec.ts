import { test, expect } from "@playwright/test";
import * as path from "path";
import {
  extractZip,
  fixture,
  pdfImageBlockCount,
  pdfPageCount,
  pdfPageLuminance,
  pdfPageText,
  referenceContrastLuminance,
  saveDownload,
  uploadFiles,
} from "./helpers";

// Downloaded artifacts are re-opened with mupdf in Node and asserted on —
// page counts, stamp text, pixel statistics — instead of trusting the UI.
// doc1.pdf has 10 pages, doc2.pdf has 7.

test("merge combines two PDFs into one download", async ({ page }, testInfo) => {
  await page.goto("/en/merge");
  await uploadFiles(page, [fixture("doc1.pdf"), fixture("doc2.pdf")]);

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Merge & Download" }).click(),
  ]);
  const merged = await saveDownload(download, testInfo.outputDir);

  expect(await pdfPageCount(merged)).toBe(17);
});

test("split exports two page ranges as a ZIP", async ({ page }, testInfo) => {
  await page.goto("/en/split");
  await uploadFiles(page, [fixture("doc1.pdf")]);
  await page.getByRole("button", { name: "Add range" }).waitFor();

  const nums = page.locator('input[type="number"]');
  await nums.nth(0).fill("1");
  await nums.nth(1).fill("3");
  await page.getByRole("button", { name: "Add range" }).click();
  await nums.nth(2).fill("4");
  await nums.nth(3).fill("10");

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Split & Download" }).click(),
  ]);
  const zip = await saveDownload(download, testInfo.outputDir);

  const files = extractZip(zip, path.join(testInfo.outputDir, "split"));
  expect(files).toHaveLength(2);
  const counts = await Promise.all(
    files.map((f) => pdfPageCount(path.join(testInfo.outputDir, "split", f)))
  );
  expect(counts.reduce((a, b) => a + b, 0)).toBe(10);
});

test("contrast export rasterizes pages with the expected pixel transform", async ({
  page,
}, testInfo) => {
  await page.goto("/en/contrast");
  await uploadFiles(page, [fixture("doc1.pdf")]);

  // Raise contrast to 200% so the export button enables.
  const contrastSlider = page.locator('input[type="range"]').first();
  await contrastSlider.waitFor();
  await contrastSlider.fill("200");
  // The live preview paints before exporting.
  await page.waitForFunction(() => {
    const c = document.querySelector("canvas");
    return c !== null && c.width > 50;
  });

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Download Adjusted PDF" }).click(),
  ]);
  const out = await saveDownload(download, testInfo.outputDir);

  expect(await pdfPageCount(out)).toBe(10);
  // Every page of the export is a rasterized image.
  expect(await pdfImageBlockCount(out)).toBe(10);

  // The exported pixels must match the CSS contrast formula applied to the
  // source render (small tolerance for the JPEG round trip), and must have a
  // wider luminance spread than the source.
  const source = await pdfPageLuminance(fixture("doc1.pdf"));
  const output = await pdfPageLuminance(out);
  const reference = await referenceContrastLuminance(fixture("doc1.pdf"), 2);
  expect(Math.abs(output.mean - reference.mean)).toBeLessThan(4);
  expect(Math.abs(output.sd - reference.sd)).toBeLessThan(8);
  expect(output.sd).toBeGreaterThan(source.sd);
});

test("bates numbering stamps sequential numbers onto every page", async ({
  page,
}, testInfo) => {
  await page.goto("/en/bates");
  await uploadFiles(page, [fixture("doc1.pdf")]);

  // The auto preview renders a stamped page to the canvas.
  await page.waitForFunction(() => {
    const c = document.querySelector("canvas");
    return c !== null && c.width > 50;
  });

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Apply & Download" }).click(),
  ]);
  const out = await saveDownload(download, testInfo.outputDir);

  expect(await pdfPageCount(out)).toBe(10);
  expect(await pdfPageText(out, 0)).toContain("000001");
  expect(await pdfPageText(out, 9)).toContain("000010");
});

test("extract images shows previews and downloads a valid ZIP", async ({
  page,
}, testInfo) => {
  await page.goto("/en/extract");
  await uploadFiles(page, [fixture("doc1.pdf")]);
  await page.getByRole("button", { name: "Download All" }).waitFor();

  // Every grid preview is a painted blob image.
  const previews = await page.evaluate(() => {
    const imgs = [...document.querySelectorAll("img")].filter((i) =>
      i.src.startsWith("blob:")
    );
    return {
      count: imgs.length,
      loaded: imgs.filter((i) => i.complete && i.naturalWidth > 0).length,
    };
  });
  expect(previews.count).toBeGreaterThan(0);
  expect(previews.loaded).toBe(previews.count);

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Download All" }).click(),
  ]);
  const zip = await saveDownload(download, testInfo.outputDir);

  const files = extractZip(zip, path.join(testInfo.outputDir, "images"));
  expect(files.length).toBeGreaterThan(0);
  expect(files.every((f) => /_p\d+_img\d+\./.test(f))).toBe(true);
});

test("compress produces a smaller PDF with the same page count", async ({
  page,
}, testInfo) => {
  await page.goto("/en/compress");
  await uploadFiles(page, [fixture("doc1.pdf")]);

  await page.getByRole("button", { name: "Calculate savings" }).click();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Download Compressed PDF" }).click(),
  ]);
  const out = await saveDownload(download, testInfo.outputDir);

  expect(await pdfPageCount(out)).toBe(10);
  const { statSync } = await import("fs");
  expect(statSync(out).size).toBeLessThan(statSync(fixture("doc1.pdf")).size);
});

test("unlock rejects a wrong password with a visible error", async ({ page }) => {
  await page.goto("/en/unlock");
  await uploadFiles(page, [fixture("protected.pdf")]);

  const password = page.locator('input[type="password"]');
  await password.fill("definitely-wrong");
  await page.getByRole("button", { name: "Unlock", exact: true }).click();

  await expect(page.getByText("Incorrect password").first()).toBeVisible();
});
