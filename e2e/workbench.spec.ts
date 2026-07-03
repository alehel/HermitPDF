import { test, expect } from "@playwright/test";
import { fixture, getMupdf, pdfPageCount, saveDownload, uploadFiles } from "./helpers";
import * as fs from "fs";

test("workbench renders, rotates via CSS, undoes/redoes, and exports", async ({
  page,
}, testInfo) => {
  await page.goto("/en/workbench");
  await uploadFiles(page, [fixture("doc1.pdf"), fixture("doc2.pdf")]);

  // Stack thumbnails and the full-size workspace canvas render.
  await page.waitForFunction(() => {
    const imgs = [
      ...document.querySelectorAll<HTMLImageElement>('img[alt="Page thumbnail"]'),
    ];
    return imgs.length >= 2 && imgs.every((i) => i.complete && i.naturalWidth > 0);
  });
  await page.waitForFunction(() => {
    return [...document.querySelectorAll("canvas")].some((c) => c.width > 300);
  });

  // The preview panel width initialized from the container measurement.
  const panelWidth = await page.evaluate(() => {
    const el = [...document.querySelectorAll("div[style]")].find((d) => {
      const s = d.getAttribute("style") ?? "";
      return s.includes("flex") && /width:\s*\d+/.test(s);
    });
    return el instanceof HTMLElement ? parseFloat(el.style.width) : null;
  });
  expect(panelWidth).not.toBeNull();
  expect(panelWidth!).toBeGreaterThanOrEqual(300);

  // Expanding a stack shows its page tiles with the notch positioned.
  await page.locator("[data-doc-item]").first().hover();
  await page.locator('button[title="Show pages"]').first().click();
  await page.waitForFunction(() => {
    const box = document.querySelector("[data-expansion-box]");
    return box !== null && box.querySelectorAll("img").length >= 2;
  });
  const notchLeft = await page.evaluate(() => {
    const box = document.querySelector("[data-expansion-box]");
    const notch = box?.parentElement?.querySelector<HTMLElement>(":scope > div.absolute");
    return notch ? parseFloat(notch.style.left) : null;
  });
  expect(notchLeft).not.toBeNull();
  expect(notchLeft!).toBeGreaterThan(0);
  await page.locator('button[title="Hide pages"]').first().click();

  // Select the first stack and rotate it — applied as a CSS transform on the
  // cached thumbnail bitmaps, no re-rasterization.
  await page.locator("[data-doc-item]").first().click();
  await page.locator('[aria-label="Rotate"]').click();
  await page.getByRole("menuitem", { name: "Rotate right" }).click();
  await expect
    .poll(async () =>
      page.evaluate(() =>
        [...document.querySelectorAll<HTMLImageElement>('img[alt="Page thumbnail"]')].some(
          (i) => /rotate\(90deg\)/.test(i.style.transform)
        )
      )
    )
    .toBe(true);

  // Undo removes the rotation; Ctrl+Shift+Z (the fixed shortcut) restores it.
  const anyRotated = () =>
    page.evaluate(() =>
      [...document.querySelectorAll<HTMLImageElement>('img[alt="Page thumbnail"]')].some(
        (i) => /rotate\(90deg\)/.test(i.style.transform)
      )
    );
  await page.keyboard.press("Control+z");
  await expect.poll(anyRotated).toBe(false);
  await page.keyboard.press("Control+Shift+z");
  await expect.poll(anyRotated).toBe(true);

  // Export everything — 17 pages, with the rotation persisted as /Rotate.
  await page.locator('[aria-label="Export"]').click();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("menuitem", { name: "Export PDF", exact: true }).click(),
  ]);
  const out = await saveDownload(download, testInfo.outputDir);

  expect(await pdfPageCount(out)).toBe(17);

  const mupdf = await getMupdf();
  const doc = mupdf.Document.openDocument(fs.readFileSync(out), "application/pdf");
  try {
    const pdf = doc.asPDF();
    expect(pdf).not.toBeNull();
    let rotated = 0;
    for (let i = 0; i < doc.countPages(); i++) {
      const rotate = pdf!.findPage(i).get("Rotate");
      if (rotate.isNumber() && rotate.asNumber() % 360 !== 0) rotated++;
    }
    expect(rotated).toBeGreaterThanOrEqual(1);
  } finally {
    doc.destroy();
  }
});
