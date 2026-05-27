"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { ContrastIcon } from "@/components/Icons";
import { DropZone } from "@/components/DropZone";
import { ProcessingOverlay } from "@/components/ProcessingOverlay";
import { WizardBanners } from "@/components/WizardBanners";
import { WizardContainer } from "@/components/WizardContainer";
import { FileCard } from "@/components/FileCard";
import type { WizardFile } from "@/lib/types";
import { formatSize } from "@/lib/formatSize";
import { checkerboardStyle } from "@/lib/utils";
import { releaseWizardFile } from "@/lib/releaseWizardFile";
import {
  applyContrastToImageData,
  configsEqual,
  contrastFilename,
  DEFAULT_CONTRAST_CONFIG,
  DPI_FOR_PRESET,
  isDefaultConfig,
  type ContrastConfig,
  type ExportDpiPreset,
} from "@/lib/contrast";
import {
  buildPdfFromJpegPages,
  getAllPageBounds,
  renderPage,
} from "@/lib/mupdfClient";
import { downloadPdf } from "@/lib/pdfExport";
import { useDelayedFlag } from "@/hooks/useDelayedFlag";
import { useDropZone } from "@/hooks/useDropZone";
import { useFileInput } from "@/hooks/useFileInput";
import { usePdfIngestion } from "@/hooks/usePdfIngestion";

const PREVIEW_DPI = 100;
const PRESETS: ExportDpiPreset[] = ["low", "medium", "high"];

function canvasToJpegBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("toBlob returned null"))),
      "image/jpeg",
      quality
    );
  });
}

export function ContrastWizard() {
  const t = useTranslations("contrastWizard");

  const [file, setFile] = useState<WizardFile | null>(null);
  const [config, setConfig] = useState<ContrastConfig>(DEFAULT_CONTRAST_CONFIG);
  const [dpiPreset, setDpiPreset] = useState<ExportDpiPreset>("medium");
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState<{ done: number; total: number } | null>(null);
  const showOverlay = useDelayedFlag(isExporting);

  const [previewPage, setPreviewPage] = useState(1);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const sourceImageDataRef = useRef<ImageData | null>(null);
  const sourcePageRef = useRef<number | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const fileRef = useRef(file);
  fileRef.current = file;

  const {
    ingestFiles,
    rejectedFiles,
    setRejectedFiles,
    passwordProtectedFiles,
    setPasswordProtectedFiles,
    oversizedFiles,
    setOversizedFiles,
  } = usePdfIngestion();

  /* ---- File ingestion ---- */
  const handleFilesAdded = useCallback(
    async (fileList: FileList) => {
      const { files, fileCount } = await ingestFiles(fileList, { maxFiles: 1 });
      if (files.length === 0) return;

      const newFile = files[0];
      // Side effect outside the updater: Strict Mode double-invokes updaters,
      // which would release the previous file twice and race in OPFS.
      const prev = fileRef.current;
      if (prev) releaseWizardFile(prev);
      setFile(newFile);
      setConfig(DEFAULT_CONTRAST_CONFIG);
      setPreviewPage(1);
      sourceImageDataRef.current = null;
      sourcePageRef.current = null;

      if (fileCount > 1) {
        setRejectedFiles([t("onlyOneFile")]);
      }
    },
    [ingestFiles, setRejectedFiles, t]
  );

  const { isDragOver, handleDropZoneDragOver, handleDropZoneDragLeave, handleDropZoneDrop } = useDropZone(handleFilesAdded);
  const { fileInput, openFilePicker } = useFileInput(handleFilesAdded, { ariaLabel: t("dropTitle") });

  /* ---- Cleanup on unmount ---- */
  useEffect(() => {
    return () => {
      const f = fileRef.current;
      if (f) releaseWizardFile(f);
    };
  }, []);

  const handleRemove = useCallback(() => {
    const prev = fileRef.current;
    if (prev) releaseWizardFile(prev);
    setFile(null);
    setConfig(DEFAULT_CONTRAST_CONFIG);
    sourceImageDataRef.current = null;
    sourcePageRef.current = null;
  }, []);

  /* ---- Render the source page once per page-change, then re-apply the
     filter on every config change. Keeping the unfiltered ImageData in a
     ref keeps slider drags responsive without round-tripping to the
     worker each time. ---- */
  useEffect(() => {
    if (!file) return;
    let cancelled = false;

    const paint = () => {
      const src = sourceImageDataRef.current;
      const canvas = canvasRef.current;
      if (!src || !canvas) return;
      canvas.width = src.width;
      canvas.height = src.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      if (isDefaultConfig(config)) {
        ctx.putImageData(src, 0, 0);
        return;
      }
      // Copy so the cached source stays clean — applyContrast mutates in place.
      const copy = new ImageData(
        new Uint8ClampedArray(src.data),
        src.width,
        src.height
      );
      applyContrastToImageData(copy.data, config);
      ctx.putImageData(copy, 0, 0);
    };

    if (sourcePageRef.current !== previewPage) {
      const sourceDocId = file.sourceDocId;
      setIsPreviewLoading(true);
      renderPage(sourceDocId, previewPage - 1, PREVIEW_DPI / 72)
        .then((imageData) => {
          if (cancelled) return;
          sourceImageDataRef.current = imageData;
          sourcePageRef.current = previewPage;
          paint();
        })
        .finally(() => {
          if (!cancelled) setIsPreviewLoading(false);
        });
    } else {
      paint();
    }

    return () => {
      cancelled = true;
    };
  }, [file, previewPage, config]);

  /* ---- Export ---- */
  const handleExport = useCallback(async () => {
    if (!file) return;
    setIsExporting(true);
    setExportProgress({ done: 0, total: file.pageCount });
    try {
      const bounds = await getAllPageBounds(file.sourceDocId);
      const dpi = DPI_FOR_PRESET[dpiPreset];
      const scale = dpi / 72;

      const offscreen = document.createElement("canvas");

      const pages: { data: ArrayBuffer; widthPt: number; heightPt: number }[] = [];
      for (let i = 0; i < file.pageCount; i++) {
        const imageData = await renderPage(file.sourceDocId, i, scale);
        applyContrastToImageData(imageData.data, config);
        offscreen.width = imageData.width;
        offscreen.height = imageData.height;
        const ctx = offscreen.getContext("2d");
        if (!ctx) throw new Error("Could not get 2D context");
        ctx.putImageData(imageData, 0, 0);
        const blob = await canvasToJpegBlob(offscreen, 0.9);
        const buf = await blob.arrayBuffer();
        pages.push({
          data: buf,
          widthPt: bounds[i].widthPt,
          heightPt: bounds[i].heightPt,
        });
        setExportProgress({ done: i + 1, total: file.pageCount });
      }

      const data = await buildPdfFromJpegPages(pages);
      downloadPdf(data, contrastFilename(file.name));
    } finally {
      setIsExporting(false);
      setExportProgress(null);
    }
  }, [file, config, dpiPreset]);

  const isEmpty = !file;
  const hasChanges = !configsEqual(config, DEFAULT_CONTRAST_CONFIG);
  const totalPages = file?.pageCount ?? 0;

  const exportLabel = isExporting
    ? exportProgress
      ? t("exportingProgress", {
          done: exportProgress.done,
          total: exportProgress.total,
        })
      : t("exporting")
    : t("downloadContrast");

  return (
    <>
      {fileInput}

      <ProcessingOverlay
        visible={showOverlay}
        title={t("overlayTitle")}
        description={t("overlayDescription")}
      />

      <WizardBanners
        rejectedMessage={rejectedFiles.length > 0 ? t("rejectedFiles", { files: rejectedFiles.join(", ") }) : undefined}
        passwordProtectedMessage={passwordProtectedFiles.length > 0 ? t("passwordProtectedFiles", { files: passwordProtectedFiles.join(", ") }) : undefined}
        oversizedMessage={oversizedFiles.length > 0 ? t("oversizedFiles", { files: oversizedFiles.join(", ") }) : undefined}
        dismissLabel={t("dismiss")}
        onDismissRejected={() => setRejectedFiles([])}
        onDismissPasswordProtected={() => setPasswordProtectedFiles([])}
        onDismissOversized={() => setOversizedFiles([])}
      />

      <WizardContainer
        icon={<ContrastIcon size={20} />}
        title={t("title")}
        empty={isEmpty}
        wide={!isEmpty}
        footer={!isEmpty ? {
          statusText: hasChanges
            ? t("readyToExport")
            : t("noChanges"),
          buttonLabel: exportLabel,
          onButtonClick: handleExport,
          disabled: isExporting || !hasChanges,
        } : undefined}
      >
        {isEmpty ? (
          <DropZone
            title={t("dropTitle")}
            subtitle={t("dropSubtitle")}
            privacyNote={t("privacyNote")}
            onClick={openFilePicker}
            onDragOver={handleDropZoneDragOver}
            onDragLeave={handleDropZoneDragLeave}
            onDrop={handleDropZoneDrop}
            isDragOver={isDragOver}
            autoFocus
          />
        ) : (
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-2 lg:items-start">
            <div className="space-y-6">
              <div>
                <h3 className="mb-4 text-xs font-medium uppercase tracking-widest text-muted-foreground">
                  {t("file")}
                </h3>
                <FileCard
                  name={file.name}
                  subtitle={`${t("pageCount", { count: file.pageCount })} · ${formatSize(file.fileSize)}`}
                  onRemove={handleRemove}
                  removeTitle={t("remove")}
                />
              </div>

              <div>
                <h3 className="mb-4 text-xs font-medium uppercase tracking-widest text-muted-foreground">
                  {t("adjustments")}
                </h3>

                <div className="space-y-5 rounded-xl border border-border bg-card p-4">
                  <div>
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-sm font-medium text-foreground">{t("contrast")}</span>
                      <span className="text-xs font-medium text-foreground tabular-nums">
                        {Math.round(config.contrast * 100)}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min={50}
                      max={300}
                      step={5}
                      value={Math.round(config.contrast * 100)}
                      onChange={(e) =>
                        setConfig((c) => ({ ...c, contrast: e.target.valueAsNumber / 100 }))
                      }
                      className="w-full accent-primary"
                    />
                  </div>

                  <div>
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-sm font-medium text-foreground">{t("brightness")}</span>
                      <span className="text-xs font-medium text-foreground tabular-nums">
                        {Math.round(config.brightness * 100)}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min={50}
                      max={200}
                      step={5}
                      value={Math.round(config.brightness * 100)}
                      onChange={(e) =>
                        setConfig((c) => ({ ...c, brightness: e.target.valueAsNumber / 100 }))
                      }
                      className="w-full accent-primary"
                    />
                  </div>

                  <div className="h-px bg-border" />

                  <label className="flex items-center gap-3">
                    <button
                      type="button"
                      role="switch"
                      aria-checked={config.thresholdEnabled}
                      onClick={() =>
                        setConfig((c) => ({ ...c, thresholdEnabled: !c.thresholdEnabled }))
                      }
                      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
                        config.thresholdEnabled ? "bg-primary" : "bg-border"
                      }`}
                    >
                      <span
                        className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                          config.thresholdEnabled ? "translate-x-4" : "translate-x-0.5"
                        }`}
                      />
                    </button>
                    <div>
                      <span className="text-sm font-medium text-foreground">{t("threshold")}</span>
                      <p className="text-xs text-muted-foreground">{t("thresholdDesc")}</p>
                    </div>
                  </label>

                  <div className={config.thresholdEnabled ? "" : "opacity-40"}>
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-xs font-medium text-muted-foreground">
                        {t("thresholdLevel")}
                      </span>
                      <span className="text-xs font-medium text-foreground tabular-nums">
                        {config.threshold}
                      </span>
                    </div>
                    <input
                      type="range"
                      min={1}
                      max={254}
                      step={1}
                      value={config.threshold}
                      onChange={(e) =>
                        setConfig((c) => ({ ...c, threshold: e.target.valueAsNumber }))
                      }
                      disabled={!config.thresholdEnabled}
                      className="w-full accent-primary"
                    />
                  </div>

                  <div className="h-px bg-border" />

                  <button
                    type="button"
                    onClick={() => setConfig(DEFAULT_CONTRAST_CONFIG)}
                    disabled={!hasChanges}
                    className="text-xs font-medium text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
                  >
                    {t("reset")}
                  </button>
                </div>
              </div>

              <div>
                <h3 className="mb-4 text-xs font-medium uppercase tracking-widest text-muted-foreground">
                  {t("exportQuality")}
                </h3>
                <div className="flex gap-2 rounded-xl border border-border bg-card p-1">
                  {PRESETS.map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setDpiPreset(preset)}
                      className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                        dpiPreset === preset
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground hover:bg-accent"
                      }`}
                    >
                      <span className="block">{t(`preset_${preset}`)}</span>
                      <span className="block text-[10px] font-normal opacity-70">
                        {DPI_FOR_PRESET[preset]} DPI
                      </span>
                    </button>
                  ))}
                </div>
                <p className="mt-2 text-xs text-muted-foreground">{t("exportQualityHint")}</p>
              </div>
            </div>

            <div className="lg:sticky lg:top-8">
              <h3 className="mb-4 text-xs font-medium uppercase tracking-widest text-muted-foreground">
                {t("preview")}
              </h3>

              <div className="rounded-xl border border-border bg-card p-4">
                <div className="mb-3 flex items-center gap-3">
                  <label className="flex items-center gap-2">
                    <span className="text-xs font-medium text-muted-foreground">{t("previewPage")}</span>
                    <input
                      type="number"
                      min={1}
                      max={totalPages}
                      value={previewPage}
                      onChange={(e) => { const v = e.target.valueAsNumber; if (!isNaN(v)) setPreviewPage(v); }}
                      onBlur={(e) => { const v = parseInt(e.target.value); setPreviewPage(Math.max(1, Math.min(totalPages, isNaN(v) ? 1 : v))); }}
                      className="w-20 rounded-lg border border-border bg-background px-2 py-1 text-sm text-foreground focus:border-primary focus:outline-none"
                    />
                  </label>
                  <span className="text-xs text-muted-foreground">/ {totalPages}</span>
                  {isPreviewLoading && (
                    <span className="ml-auto text-xs text-muted-foreground">{t("rendering")}</span>
                  )}
                </div>

                <div className="rounded-lg border border-border" style={checkerboardStyle}>
                  <canvas
                    ref={canvasRef}
                    className="block w-full rounded-lg"
                    style={{ maxHeight: "70vh", objectFit: "contain" }}
                  />
                </div>
              </div>
            </div>
          </div>
        )}
      </WizardContainer>
    </>
  );
}
