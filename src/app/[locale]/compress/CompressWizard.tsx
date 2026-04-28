"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { CompressIcon } from "@/components/Icons";
import { DropZone } from "@/components/DropZone";
import { WizardBanners } from "@/components/WizardBanners";
import { WizardContainer } from "@/components/WizardContainer";
import { FileCard } from "@/components/FileCard";
import type { CompressConfig, WizardFile } from "@/lib/types";
import { formatSize } from "@/lib/formatSize";
import { checkerboardStyle } from "@/lib/utils";
import { releaseWizardFile } from "@/lib/releaseWizardFile";
import { DEFAULT_COMPRESS_CONFIG, compressedFilename } from "@/lib/compress";
import { compressPdf, renderCompressedPreview } from "@/lib/mupdfClient";
import { downloadPdf } from "@/lib/pdfExport";
import { useDropZone } from "@/hooks/useDropZone";
import { useFileInput } from "@/hooks/useFileInput";
import { usePdfIngestion } from "@/hooks/usePdfIngestion";

interface CompressionResult {
  originalSize: number;
  newSize: number;
  data: Uint8Array;
  configUsed: CompressConfig;
}

function configsEqual(a: CompressConfig, b: CompressConfig): boolean {
  return (
    a.recompressImages === b.recompressImages &&
    a.imageQuality === b.imageQuality &&
    a.subsetFonts === b.subsetFonts &&
    a.deduplicateObjects === b.deduplicateObjects &&
    a.sanitizeStreams === b.sanitizeStreams
  );
}

export function CompressWizard() {
  const t = useTranslations("compressWizard");

  const [file, setFile] = useState<WizardFile | null>(null);
  const [config, setConfig] = useState<CompressConfig>(DEFAULT_COMPRESS_CONFIG);
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState<CompressionResult | null>(null);

  // Preview state
  const [previewPage, setPreviewPage] = useState(1);
  const [previewImageData, setPreviewImageData] = useState<ImageData | null>(null);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const fileRef = useRef(file);
  fileRef.current = file;

  const {
    ingestFiles,
    rejectedFiles,
    setRejectedFiles,
    passwordProtectedFiles,
    setPasswordProtectedFiles,
  } = usePdfIngestion();

  /* ---- File ingestion ---- */
  const handleFilesAdded = useCallback(
    async (fileList: FileList) => {
      const { files, pdfCount } = await ingestFiles(fileList, { maxFiles: 1 });
      if (files.length === 0) return;

      const newFile = files[0];
      setFile((prev) => {
        if (prev) releaseWizardFile(prev);
        return newFile;
      });
      setResult(null);
      setPreviewImageData(null);
      setPreviewPage(1);

      if (pdfCount > 1) {
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

  /* ---- Remove the file ---- */
  const handleRemove = useCallback(() => {
    setFile((prev) => {
      if (prev) releaseWizardFile(prev);
      return null;
    });
    setResult(null);
    setPreviewImageData(null);
  }, []);

  /* ---- Calculate savings (compress to memory, no download) ---- */
  const handleCalculate = useCallback(async () => {
    if (!file) return;
    setIsProcessing(true);
    try {
      const data = await compressPdf(file.sourceDocId, config);
      setResult({
        originalSize: file.fileSize,
        newSize: data.byteLength,
        data,
        configUsed: { ...config },
      });
    } finally {
      setIsProcessing(false);
    }
  }, [file, config]);

  /* ---- Download the in-memory compressed file ---- */
  const handleDownload = useCallback(() => {
    if (!file || !result) return;
    downloadPdf(result.data, compressedFilename(file.name));
  }, [file, result]);

  /* ---- Preview ---- */
  const handlePreview = useCallback(async () => {
    if (!file) return;
    setIsPreviewLoading(true);
    try {
      const imageData = await renderCompressedPreview(
        file.sourceDocId,
        previewPage - 1,
        config,
        144
      );
      setPreviewImageData(imageData);
    } finally {
      setIsPreviewLoading(false);
    }
  }, [file, previewPage, config]);

  /* ---- Paint preview to canvas ---- */
  useEffect(() => {
    if (!previewImageData || !canvasRef.current) return;
    const canvas = canvasRef.current;
    canvas.width = previewImageData.width;
    canvas.height = previewImageData.height;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.putImageData(previewImageData, 0, 0);
    }
  }, [previewImageData]);

  /* ---- Computed values ---- */
  const isEmpty = !file;
  const totalPages = file?.pageCount ?? 0;

  const isStale = result !== null && !configsEqual(result.configUsed, config);
  const hasFreshResult = result !== null && !isStale;

  const savings = result
    ? Math.max(0, result.originalSize - result.newSize)
    : 0;
  const savingsPct = result && result.originalSize > 0
    ? Math.round((savings / result.originalSize) * 100)
    : 0;

  return (
    <>
      {fileInput}

      <WizardBanners
        rejectedMessage={rejectedFiles.length > 0 ? t("rejectedFiles", { files: rejectedFiles.join(", ") }) : undefined}
        passwordProtectedMessage={passwordProtectedFiles.length > 0 ? t("passwordProtectedFiles", { files: passwordProtectedFiles.join(", ") }) : undefined}
        dismissLabel={t("dismiss")}
        onDismissRejected={() => setRejectedFiles([])}
        onDismissPasswordProtected={() => setPasswordProtectedFiles([])}
      />

      <WizardContainer
        icon={<CompressIcon size={20} />}
        title={t("title")}
        empty={isEmpty}
        wide={!isEmpty}
        footer={!isEmpty ? {
          statusText: hasFreshResult
            ? <>{t("compressedTo")} <span className="font-medium text-foreground">{formatSize(result!.newSize)}</span> ({savingsPct}% {t("smaller")})</>
            : isStale
              ? <span className="italic">{t("settingsChanged")}</span>
              : <><span className="font-medium text-foreground">{formatSize(file.fileSize)}</span>{" "}{t("readyToCompress")}</>,
          buttonLabel: isProcessing
            ? t("calculating")
            : hasFreshResult
              ? t("downloadCompressed")
              : isStale
                ? t("recalculate")
                : t("calculateSavings"),
          onButtonClick: hasFreshResult ? handleDownload : handleCalculate,
          disabled: isProcessing,
          buttonIcon: hasFreshResult ? undefined : <span />,
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
            {/* Left column — file card (top), settings (middle), result (bottom) */}
            <div className="space-y-6">
            {/* File card */}
            <div>
              <h3 className="mb-4 text-xs font-medium uppercase tracking-widest text-muted-foreground">
                {t("file")}
              </h3>
              <FileCard
                name={file.name}
                subtitle={`${t("pageCount", { count: file.pageCount })} \u00b7 ${formatSize(file.fileSize)}`}
                onRemove={handleRemove}
                removeTitle={t("remove")}
              />
            </div>

            <div>
              <h3 className="mb-4 text-xs font-medium uppercase tracking-widest text-muted-foreground">
                {t("configuration")}
              </h3>

              <div className="space-y-4 rounded-xl border border-border bg-card p-4">
                {/* Recompress images toggle */}
                <label className="flex items-center gap-3">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={config.recompressImages}
                    onClick={() => setConfig((c) => ({ ...c, recompressImages: !c.recompressImages }))}
                    className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
                      config.recompressImages ? "bg-primary" : "bg-border"
                    }`}
                  >
                    <span
                      className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                        config.recompressImages ? "translate-x-4" : "translate-x-0.5"
                      }`}
                    />
                  </button>
                  <div>
                    <span className="text-sm font-medium text-foreground">{t("recompressImages")}</span>
                    <p className="text-xs text-muted-foreground">{t("recompressImagesDesc")}</p>
                  </div>
                </label>

                {/* Image quality slider */}
                <div className={config.recompressImages ? "" : "opacity-40"}>
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-xs font-medium text-muted-foreground">
                      {t("imageQuality")}
                    </span>
                    <span className="text-xs font-medium text-foreground tabular-nums">
                      {config.imageQuality}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={30}
                    max={100}
                    step={5}
                    value={config.imageQuality}
                    onChange={(e) => setConfig((c) => ({ ...c, imageQuality: e.target.valueAsNumber }))}
                    disabled={!config.recompressImages}
                    className="w-full accent-primary"
                  />
                  <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
                    <span>{t("smaller")}</span>
                    <span>{t("higherQuality")}</span>
                  </div>
                </div>

                {/* Divider */}
                <div className="h-px bg-border" />

                {/* Subset fonts toggle */}
                <label className="flex items-center gap-3">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={config.subsetFonts}
                    onClick={() => setConfig((c) => ({ ...c, subsetFonts: !c.subsetFonts }))}
                    className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
                      config.subsetFonts ? "bg-primary" : "bg-border"
                    }`}
                  >
                    <span
                      className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                        config.subsetFonts ? "translate-x-4" : "translate-x-0.5"
                      }`}
                    />
                  </button>
                  <div>
                    <span className="text-sm font-medium text-foreground">{t("subsetFonts")}</span>
                    <p className="text-xs text-muted-foreground">{t("subsetFontsDesc")}</p>
                  </div>
                </label>

                {/* Deduplicate objects toggle */}
                <label className="flex items-center gap-3">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={config.deduplicateObjects}
                    onClick={() => setConfig((c) => ({ ...c, deduplicateObjects: !c.deduplicateObjects }))}
                    className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
                      config.deduplicateObjects ? "bg-primary" : "bg-border"
                    }`}
                  >
                    <span
                      className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                        config.deduplicateObjects ? "translate-x-4" : "translate-x-0.5"
                      }`}
                    />
                  </button>
                  <div>
                    <span className="text-sm font-medium text-foreground">{t("deduplicateObjects")}</span>
                    <p className="text-xs text-muted-foreground">{t("deduplicateObjectsDesc")}</p>
                  </div>
                </label>

                {/* Sanitize streams toggle */}
                <label className="flex items-center gap-3">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={config.sanitizeStreams}
                    onClick={() => setConfig((c) => ({ ...c, sanitizeStreams: !c.sanitizeStreams }))}
                    className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
                      config.sanitizeStreams ? "bg-primary" : "bg-border"
                    }`}
                  >
                    <span
                      className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                        config.sanitizeStreams ? "translate-x-4" : "translate-x-0.5"
                      }`}
                    />
                  </button>
                  <div>
                    <span className="text-sm font-medium text-foreground">{t("sanitizeStreams")}</span>
                    <p className="text-xs text-muted-foreground">{t("sanitizeStreamsDesc")}</p>
                  </div>
                </label>
              </div>
            </div>

            {/* Result card — always visible once a file is added */}
            <div>
              <h3 className="mb-4 text-xs font-medium uppercase tracking-widest text-muted-foreground">
                {t("result")}
              </h3>
              <div className="rounded-xl border border-border bg-card p-4">
                {result ? (
                  <>
                    <div className="grid grid-cols-3 gap-3 text-center">
                      <div>
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                          {t("original")}
                        </p>
                        <p className="mt-1 text-sm font-medium text-foreground">
                          {formatSize(result.originalSize)}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                          {t("compressed")}
                        </p>
                        <p className="mt-1 text-sm font-medium text-foreground">
                          {formatSize(result.newSize)}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                          {t("savings")}
                        </p>
                        <p className={`mt-1 text-sm font-medium ${savings > 0 ? "text-primary" : "text-muted-foreground"}`}>
                          {savings > 0 ? `−${formatSize(savings)}` : t("none")}
                        </p>
                      </div>
                    </div>
                    {isStale ? (
                      <p className="mt-3 text-xs text-amber-600 dark:text-amber-500">
                        {t("outdated")}
                      </p>
                    ) : savings === 0 ? (
                      <p className="mt-3 text-xs text-muted-foreground">
                        {t("noSavingsHint")}
                      </p>
                    ) : null}
                  </>
                ) : (
                  <p className="py-6 text-center text-sm text-muted-foreground">
                    {t("resultPlaceholder")}
                  </p>
                )}
              </div>
            </div>
            </div>

            {/* Right column — preview only, sticky on desktop */}
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
                    <button
                      type="button"
                      onClick={handlePreview}
                      disabled={isPreviewLoading}
                      className="ml-auto rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-foreground transition-all hover:bg-accent/80 disabled:opacity-60"
                    >
                      {isPreviewLoading ? "..." : t("updatePreview")}
                    </button>
                  </div>

                  {previewImageData ? (
                    <div
                      className="rounded-lg border border-border"
                      style={checkerboardStyle}
                    >
                      <canvas
                        ref={canvasRef}
                        className="w-full rounded-lg"
                        style={{ maxHeight: "500px", objectFit: "contain", display: "block" }}
                      />
                    </div>
                  ) : (
                    <div className="flex h-48 items-center justify-center rounded-lg border border-dashed border-border text-xs text-muted-foreground">
                      {t("previewHint")}
                    </div>
                  )}
              </div>
            </div>
          </div>
        )}
      </WizardContainer>
    </>
  );
}
