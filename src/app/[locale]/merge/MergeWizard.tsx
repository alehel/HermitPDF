"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { MergeIcon, MergeFilesIcon } from "@/components/Icons";
import { DropZone } from "@/components/DropZone";
import { ProcessingOverlay } from "@/components/ProcessingOverlay";
import { WizardBanners } from "@/components/WizardBanners";
import { WizardContainer } from "@/components/WizardContainer";
import { SortableFileList } from "@/components/SortableFileList";
import { WizardFile } from "@/lib/types";
import { formatSize } from "@/lib/formatSize";
import { releaseWizardFile } from "@/lib/releaseWizardFile";
import { exportMergedPdf, downloadPdf } from "@/lib/pdfExport";
import { useDelayedFlag } from "@/hooks/useDelayedFlag";
import { useDropZone } from "@/hooks/useDropZone";
import { useFileInput } from "@/hooks/useFileInput";
import { usePdfIngestion } from "@/hooks/usePdfIngestion";
import { ACCEPT_ATTRIBUTE } from "@/lib/fileDetect";
import {
  DEFAULT_IMAGE_PROCESS_CONFIG,
  PAGE_SIZE_KEYS,
  DPI_PRESETS,
  type ImageProcessConfig,
  type PageSizeKey,
  type DpiPreset,
} from "@/lib/imageResize";

export function MergeWizard() {
  const t = useTranslations("mergeWizard");

  const [files, setFiles] = useState<WizardFile[]>([]);
  const [isMerging, setIsMerging] = useState(false);
  const [imageConfig, setImageConfig] = useState<ImageProcessConfig>(DEFAULT_IMAGE_PROCESS_CONFIG);
  const showOverlay = useDelayedFlag(isMerging);

  const filesRef = useRef(files);
  filesRef.current = files;

  const {
    ingestFiles,
    rejectedFiles,
    setRejectedFiles,
    passwordProtectedFiles,
    setPasswordProtectedFiles,
    oversizedFiles,
    setOversizedFiles,
  } = usePdfIngestion({ acceptImages: true });

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
  const { fileInput, openFilePicker } = useFileInput(handleFilesAdded, { multiple: true, ariaLabel: t("dropTitle"), accept: ACCEPT_ATTRIBUTE });

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
    // Side effect outside the updater: Strict Mode double-invokes updaters,
    // which would release the file twice and race in OPFS.
    const removed = filesRef.current.find((f) => f.id === id);
    if (removed) releaseWizardFile(removed);
    setFiles((prev) => prev.filter((f) => f.id !== id));
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

  /* ---- Image-derived files ---- */
  const imageFiles = useMemo(() => files.filter((f) => f.isImage), [files]);
  const hasImageFiles = imageFiles.length > 0;

  /* ---- Merge and download ---- */
  const handleMerge = useCallback(async () => {
    if (files.length === 0) return;
    setIsMerging(true);
    try {
      const stacks = files.map((f) => f.stack);
      // Apply image processing only to image-derived files, and only when at
      // least one of the toggles would actually change something.
      const willProcess = hasImageFiles && (imageConfig.recompress || imageConfig.resize.enabled);
      const imageProcessByDocId = willProcess
        ? new Map(imageFiles.map((f) => [f.sourceDocId, imageConfig]))
        : undefined;
      const data = await exportMergedPdf(stacks, undefined, imageProcessByDocId);
      downloadPdf(data, "merged.pdf");
    } finally {
      setIsMerging(false);
    }
  }, [files, hasImageFiles, imageFiles, imageConfig]);

  /* ---- Computed values ---- */
  const totalPages = files.reduce((sum, f) => sum + f.pageCount, 0);
  const isEmpty = files.length === 0;

  const wizardTitleBadge = files.length > 0 ? (
    <span className="rounded-full bg-accent px-2 py-0.5 text-xs font-medium text-primary">
      {t("filesCount", { count: files.length })}
    </span>
  ) : undefined;

  const formatSubtitle = useCallback(
    (file: WizardFile) => `${t("pageCount", { count: file.pageCount })} · ${formatSize(file.fileSize)}`,
    [t]
  );

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
        icon={<MergeIcon size={20} />}
        title={t("title")}
        badge={wizardTitleBadge}
        empty={isEmpty}
        wide={!isEmpty && hasImageFiles}
        footer={!isEmpty ? {
          statusText: <><span className="font-medium text-foreground">{totalPages}</span>{" "}{t("pagesTotal")}</>,
          buttonLabel: isMerging ? t("merging") : t("mergeAndDownload"),
          onButtonClick: handleMerge,
          disabled: isMerging,
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
            icon={MergeFilesIcon}
            autoFocus
          />
        ) : hasImageFiles ? (
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-2 lg:items-start">
            <div>
              <SortableFileList
                files={files}
                dragKey="merge"
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
            </div>

            <div className="lg:sticky lg:top-8">
              <h3 className="mb-4 text-xs font-medium uppercase tracking-widest text-muted-foreground">
                {t("imageSettings")}
              </h3>
              <div className="space-y-4 rounded-xl border border-border bg-card p-4">
                <p className="text-xs text-muted-foreground">
                  {t("imageSettingsHint", { count: imageFiles.length })}
                </p>

                {/* Recompress images toggle */}
                <label className="flex items-center gap-3">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={imageConfig.recompress}
                    onClick={() => setImageConfig((c) => ({ ...c, recompress: !c.recompress }))}
                    className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
                      imageConfig.recompress ? "bg-primary" : "bg-border"
                    }`}
                  >
                    <span
                      className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                        imageConfig.recompress ? "translate-x-4" : "translate-x-0.5"
                      }`}
                    />
                  </button>
                  <div>
                    <span className="text-sm font-medium text-foreground">{t("recompressImages")}</span>
                    <p className="text-xs text-muted-foreground">{t("recompressImagesDesc")}</p>
                  </div>
                </label>

                {/* Image quality slider */}
                <div className={imageConfig.recompress ? "" : "opacity-40"}>
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-xs font-medium text-muted-foreground">{t("imageQuality")}</span>
                    <span className="text-xs font-medium text-foreground tabular-nums">{imageConfig.quality}%</span>
                  </div>
                  <input
                    type="range"
                    min={30}
                    max={100}
                    step={5}
                    value={imageConfig.quality}
                    onChange={(e) => setImageConfig((c) => ({ ...c, quality: e.target.valueAsNumber }))}
                    disabled={!imageConfig.recompress}
                    className="w-full accent-primary"
                  />
                  <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
                    <span>{t("smaller")}</span>
                    <span>{t("higherQuality")}</span>
                  </div>
                </div>

                <div className="h-px bg-border" />

                {/* Resize images toggle */}
                <label className="flex items-center gap-3">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={imageConfig.resize.enabled}
                    onClick={() => setImageConfig((c) => ({ ...c, resize: { ...c.resize, enabled: !c.resize.enabled } }))}
                    className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
                      imageConfig.resize.enabled ? "bg-primary" : "bg-border"
                    }`}
                  >
                    <span
                      className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                        imageConfig.resize.enabled ? "translate-x-4" : "translate-x-0.5"
                      }`}
                    />
                  </button>
                  <div>
                    <span className="text-sm font-medium text-foreground">{t("resizeImages")}</span>
                    <p className="text-xs text-muted-foreground">{t("resizeImagesDesc")}</p>
                  </div>
                </label>

                <div className={`grid grid-cols-2 gap-3 ${imageConfig.resize.enabled ? "" : "opacity-40"}`}>
                  <label className="block">
                    <span className="mb-1 block text-xs font-medium text-muted-foreground">{t("pageSize")}</span>
                    <select
                      value={imageConfig.resize.pageSize}
                      onChange={(e) =>
                        setImageConfig((c) => ({
                          ...c,
                          resize: { ...c.resize, pageSize: e.target.value as PageSizeKey },
                        }))
                      }
                      disabled={!imageConfig.resize.enabled}
                      className="w-full rounded-lg border border-border bg-background px-2 py-1 text-sm text-foreground focus:border-primary focus:outline-none"
                    >
                      {PAGE_SIZE_KEYS.map((key) => (
                        <option key={key} value={key}>{key}</option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs font-medium text-muted-foreground">{t("dpi")}</span>
                    <select
                      value={imageConfig.resize.dpi}
                      onChange={(e) =>
                        setImageConfig((c) => ({
                          ...c,
                          resize: { ...c.resize, dpi: Number(e.target.value) as DpiPreset },
                        }))
                      }
                      disabled={!imageConfig.resize.enabled}
                      className="w-full rounded-lg border border-border bg-background px-2 py-1 text-sm text-foreground focus:border-primary focus:outline-none"
                    >
                      {DPI_PRESETS.map((dpi) => (
                        <option key={dpi} value={dpi}>{dpi}</option>
                      ))}
                    </select>
                  </label>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <SortableFileList
            files={files}
            dragKey="merge"
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
        )}
      </WizardContainer>
    </>
  );
}
