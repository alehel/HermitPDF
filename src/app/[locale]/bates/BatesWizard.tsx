"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { BatesIcon } from "@/components/Icons";
import { DropZone } from "@/components/DropZone";
import { WizardBanners } from "@/components/WizardBanners";
import { WizardContainer } from "@/components/WizardContainer";
import { SortableFileList } from "@/components/SortableFileList";
import type { BatesConfig, BatesPosition, WizardFile } from "@/lib/types";
import { formatSize } from "@/lib/formatSize";
import { checkerboardStyle } from "@/lib/utils";
import { releaseWizardFile } from "@/lib/releaseWizardFile";
import { DEFAULT_BATES_CONFIG, formatBatesNumber } from "@/lib/batesStamp";
import { exportBatesPdfs, downloadBatesOutput } from "@/lib/batesExport";
import { renderBatesPreview } from "@/lib/mupdfClient";
import { useDropZone } from "@/hooks/useDropZone";
import { useFileInput } from "@/hooks/useFileInput";
import { usePdfIngestion } from "@/hooks/usePdfIngestion";

const POSITIONS: BatesPosition[] = [
  "top-left",
  "top-center",
  "top-right",
  "bottom-left",
  "bottom-center",
  "bottom-right",
];

export function BatesWizard() {
  const t = useTranslations("batesWizard");

  const [files, setFiles] = useState<WizardFile[]>([]);
  const [config, setConfig] = useState<BatesConfig>(DEFAULT_BATES_CONFIG);
  const [isProcessing, setIsProcessing] = useState(false);

  // Preview state
  const [previewPage, setPreviewPage] = useState(1);
  const [previewImageData, setPreviewImageData] = useState<ImageData | null>(null);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const filesRef = useRef(files);
  filesRef.current = files;

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
      const { files: newFiles } = await ingestFiles(fileList);
      if (newFiles.length > 0) {
        setFiles((prev) => [...prev, ...newFiles]);
      }
    },
    [ingestFiles]
  );

  const { isDragOver, handleDropZoneDragOver, handleDropZoneDragLeave, handleDropZoneDrop } = useDropZone(handleFilesAdded);
  const { fileInput, openFilePicker } = useFileInput(handleFilesAdded, { multiple: true });

  /* ---- Cleanup on unmount ---- */
  useEffect(() => {
    return () => {
      for (const file of filesRef.current) {
        releaseWizardFile(file);
      }
    };
  }, []);

  /* ---- Remove a file ---- */
  const handleRemove = useCallback((id: string) => {
    setFiles((prev) => {
      const removed = prev.find((f) => f.id === id);
      if (removed) releaseWizardFile(removed);
      return prev.filter((f) => f.id !== id);
    });
  }, []);

  /* ---- Reorder files ---- */
  const handleReorder = useCallback(
    (fromIndex: number, toIndex: number) => {
      setFiles((prev) => {
        if (fromIndex === toIndex) return prev;
        const next = [...prev];
        const [moved] = next.splice(fromIndex, 1);
        next.splice(toIndex, 0, moved);
        return next;
      });
    },
    []
  );

  /* ---- Apply and download ---- */
  const handleApply = useCallback(async () => {
    if (files.length === 0) return;
    setIsProcessing(true);
    try {
      const results = await exportBatesPdfs(files, config);
      downloadBatesOutput(results);
    } finally {
      setIsProcessing(false);
    }
  }, [files, config]);

  /* ---- Preview ---- */
  const handlePreview = useCallback(async () => {
    if (files.length === 0) return;

    // Resolve global page number to file + local page index
    let remaining = previewPage;
    let targetFile: WizardFile | null = null;
    let localPageIndex = 0;
    let globalOffset = 0;

    for (const file of files) {
      if (remaining <= file.pageCount) {
        targetFile = file;
        localPageIndex = remaining - 1;
        break;
      }
      remaining -= file.pageCount;
      globalOffset += file.pageCount;
    }

    if (!targetFile) return;

    setIsPreviewLoading(true);
    try {
      const previewConfig = {
        ...config,
        startNumber: config.startNumber + globalOffset + localPageIndex,
      };
      const imageData = await renderBatesPreview(
        targetFile.stack.pages[0].sourceDocId,
        localPageIndex,
        previewConfig,
        144
      );
      setPreviewImageData(imageData);
    } finally {
      setIsPreviewLoading(false);
    }
  }, [files, previewPage, config]);

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
  const totalPages = files.reduce((sum, f) => sum + f.pageCount, 0);
  const exampleStamp = formatBatesNumber(config.prefix, config.startNumber, config.digits);
  const isEmpty = files.length === 0;

  const wizardTitleBadge = files.length > 0 ? (
    <span className="rounded-full bg-accent px-2 py-0.5 text-xs font-medium text-primary">
      {t("filesCount", { count: files.length })}
    </span>
  ) : undefined;

  const formatSubtitle = useCallback(
    (file: WizardFile) => `${t("pageCount", { count: file.pageCount })} \u00b7 ${formatSize(file.fileSize)}`,
    [t]
  );

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
        icon={<BatesIcon className="!h-5 !w-5" />}
        title={t("title")}
        badge={wizardTitleBadge}
        empty={isEmpty}
        footer={!isEmpty ? {
          statusText: <><span className="font-medium text-foreground">{totalPages}</span>{" "}{t("pagesTotal")}</>,
          buttonLabel: isProcessing ? t("processing") : t("applyAndDownload"),
          onButtonClick: handleApply,
          disabled: isProcessing,
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
          />
        ) : (
          <>
            <SortableFileList
              files={files}
              dragKey="bates"
              onRemove={handleRemove}
              onReorder={handleReorder}
              onFilesAdded={handleFilesAdded}
              openFilePicker={openFilePicker}
              isDragOver={isDragOver}
              dropZoneHandlers={{
                onDragOver: handleDropZoneDragOver,
                onDragLeave: handleDropZoneDragLeave,
                onDrop: handleDropZoneDrop,
              }}
              formatSubtitle={formatSubtitle}
              labels={{
                dragToReorder: t("dragToReorder"),
                addMoreFiles: t("addMoreFiles"),
              }}
            />

            {/* Configuration */}
            <div className="mt-8">
              <h3 className="mb-4 text-xs font-medium uppercase tracking-widest text-muted-foreground">
                {t("configuration")}
              </h3>

              <div className="space-y-4 rounded-xl border border-border bg-card p-4">
                {/* Prefix + Start number */}
                <div className="grid grid-cols-2 gap-4">
                  <label className="block">
                    <span className="mb-1 block text-xs font-medium text-muted-foreground">{t("prefix")}</span>
                    <input
                      type="text"
                      value={config.prefix}
                      onChange={(e) => setConfig((c) => ({ ...c, prefix: e.target.value }))}
                      placeholder={t("prefixPlaceholder")}
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:border-primary focus:outline-none"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs font-medium text-muted-foreground">{t("startNumber")}</span>
                    <input
                      type="number"
                      min={1}
                      value={config.startNumber}
                      onChange={(e) => { const v = e.target.valueAsNumber; if (!isNaN(v)) setConfig((c) => ({ ...c, startNumber: v })); }}
                      onBlur={(e) => { const v = parseInt(e.target.value); setConfig((c) => ({ ...c, startNumber: Math.max(1, isNaN(v) ? 1 : v) })); }}
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
                    />
                  </label>
                </div>

                {/* Digits + Font size + Padding */}
                <div className="grid grid-cols-3 gap-4">
                  <label className="block">
                    <span className="mb-1 block text-xs font-medium text-muted-foreground">{t("digitPadding")}</span>
                    <input
                      type="number"
                      min={1}
                      max={12}
                      value={config.digits}
                      onChange={(e) => { const v = e.target.valueAsNumber; if (!isNaN(v)) setConfig((c) => ({ ...c, digits: v })); }}
                      onBlur={(e) => { const v = parseInt(e.target.value); setConfig((c) => ({ ...c, digits: Math.max(1, Math.min(12, isNaN(v) ? 6 : v)) })); }}
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs font-medium text-muted-foreground">{t("fontSize")}</span>
                    <input
                      type="number"
                      min={6}
                      max={24}
                      value={config.fontSize}
                      onChange={(e) => { const v = e.target.valueAsNumber; if (!isNaN(v)) setConfig((c) => ({ ...c, fontSize: v })); }}
                      onBlur={(e) => { const v = parseInt(e.target.value); setConfig((c) => ({ ...c, fontSize: Math.max(6, Math.min(24, isNaN(v) ? 10 : v)) })); }}
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs font-medium text-muted-foreground">{t("padding")}</span>
                    <input
                      type="number"
                      min={0}
                      max={72}
                      value={config.padding}
                      onChange={(e) => { const v = e.target.valueAsNumber; if (!isNaN(v)) setConfig((c) => ({ ...c, padding: v })); }}
                      onBlur={(e) => { const v = parseInt(e.target.value); setConfig((c) => ({ ...c, padding: Math.max(0, Math.min(72, isNaN(v) ? 4 : v)) })); }}
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
                    />
                  </label>
                </div>

                {/* Example stamp */}
                <p className="text-xs text-muted-foreground">
                  {t("stampExample", { example: exampleStamp })}
                </p>

                {/* Position selector */}
                <div>
                  <span className="mb-2 block text-xs font-medium text-muted-foreground">{t("position")}</span>
                  <div className="grid grid-cols-3 gap-1.5">
                    {POSITIONS.map((pos) => (
                      <button
                        key={pos}
                        type="button"
                        onClick={() => setConfig((c) => ({ ...c, position: pos }))}
                        className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
                          config.position === pos
                            ? "bg-primary text-white"
                            : "bg-background text-muted-foreground hover:bg-accent hover:text-foreground"
                        }`}
                      >
                        {t(`position${pos.split("-").map((s) => s[0].toUpperCase() + s.slice(1)).join("")}` as Parameters<typeof t>[0])}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Shrink toggle */}
                <label className="flex items-center gap-3">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={config.shrink}
                    onClick={() => setConfig((c) => ({ ...c, shrink: !c.shrink }))}
                    className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
                      config.shrink ? "bg-primary" : "bg-border"
                    }`}
                  >
                    <span
                      className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                        config.shrink ? "translate-x-4" : "translate-x-0.5"
                      }`}
                    />
                  </button>
                  <div>
                    <span className="text-sm font-medium text-foreground">{t("shrinkContent")}</span>
                    <p className="text-xs text-muted-foreground">{t("shrinkContentDesc")}</p>
                  </div>
                </label>
              </div>
            </div>

            {/* Preview */}
            <div className="mt-8">
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
                    {t("updatePreview")}
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </WizardContainer>
    </>
  );
}
