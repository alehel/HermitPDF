"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { MergeIcon, MergeFilesIcon } from "@/components/Icons";
import { DropZone } from "@/components/DropZone";
import { ProcessingOverlay } from "@/components/ProcessingOverlay";
import { IngestionOverlay } from "@/components/IngestionOverlay";
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
  type ImageProcessConfig,
} from "@/lib/imageResize";
import { ImageProcessSettings } from "@/components/ImageProcessSettings";

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
    isIngesting,
    rejectedFiles,
    setRejectedFiles,
    passwordProtectedFiles,
    setPasswordProtectedFiles,
    oversizedFiles,
    setOversizedFiles,
    environmentUnsupported,
    setEnvironmentUnsupported,
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
      // Only forward an image-process config when the master toggle is on;
      // otherwise let mergeFromHandles graft image-derived pages as-is.
      const willProcess = hasImageFiles && imageConfig.recompress;
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

      <IngestionOverlay active={isIngesting} />

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
        environmentUnsupported={environmentUnsupported}
        onDismissEnvironmentUnsupported={() => setEnvironmentUnsupported(false)}
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
                onRemove={handleRemove}
                onReorder={handleReorder}
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

                <ImageProcessSettings
                  config={imageConfig}
                  onChange={setImageConfig}
                  labels={{
                    recompressImages: t("recompressImages"),
                    recompressImagesDesc: t("recompressImagesDesc"),
                    imageQuality: t("imageQuality"),
                    smaller: t("smaller"),
                    higherQuality: t("higherQuality"),
                    pageSize: t("pageSize"),
                    dpi: t("dpi"),
                    originalSize: t("originalSize"),
                    resizeHint: t("resizeHint"),
                  }}
                />
              </div>
            </div>
          </div>
        ) : (
          <SortableFileList
            files={files}
            onRemove={handleRemove}
            onReorder={handleReorder}
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
