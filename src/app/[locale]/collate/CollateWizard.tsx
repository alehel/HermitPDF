"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { CollateIcon, CollateFilesIcon } from "@/components/Icons";
import { DropZone } from "@/components/DropZone";
import { ProcessingOverlay } from "@/components/ProcessingOverlay";
import { WizardBanners } from "@/components/WizardBanners";
import { IngestionOverlay } from "@/components/IngestionOverlay";
import { WizardContainer } from "@/components/WizardContainer";
import { SortableFileList } from "@/components/SortableFileList";
import { WizardFile } from "@/lib/types";
import { formatSize } from "@/lib/formatSize";
import { releaseWizardFile } from "@/lib/releaseWizardFile";
import { exportCollatedPdf, downloadPdf } from "@/lib/pdfExport";
import { useDelayedFlag } from "@/hooks/useDelayedFlag";
import { useDropZone } from "@/hooks/useDropZone";
import { useFileInput } from "@/hooks/useFileInput";
import { usePdfIngestion } from "@/hooks/usePdfIngestion";

const MAX_FILES = 2;
const PDF_ACCEPT = ".pdf,application/pdf";

export function CollateWizard() {
  const t = useTranslations("collateWizard");

  const [files, setFiles] = useState<WizardFile[]>([]);
  const [reverseSecond, setReverseSecond] = useState(false);
  const [isCollating, setIsCollating] = useState(false);
  const showOverlay = useDelayedFlag(isCollating);

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
  } = usePdfIngestion();

  /* ---- File ingestion (capped at two PDFs) ---- */
  const handleFilesAdded = useCallback(
    async (fileList: FileList) => {
      const remaining = MAX_FILES - filesRef.current.length;
      if (remaining <= 0) return;
      const { files: newFiles } = await ingestFiles(fileList, { maxFiles: remaining });
      if (newFiles.length > 0) {
        setFiles((prev) => [...prev, ...newFiles].slice(0, MAX_FILES));
      }
    },
    [ingestFiles]
  );

  const { isDragOver, handleDropZoneDragOver, handleDropZoneDragLeave, handleDropZoneDrop } = useDropZone(handleFilesAdded);
  const { fileInput, openFilePicker } = useFileInput(handleFilesAdded, { multiple: true, ariaLabel: t("dropTitle"), accept: PDF_ACCEPT });

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

  /* ---- Reorder files (swap which document leads) ---- */
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

  /* ---- Collate and download ---- */
  const handleCollate = useCallback(async () => {
    if (files.length < MAX_FILES) return;
    setIsCollating(true);
    try {
      const [first, second] = files;
      const data = await exportCollatedPdf(first.stack, second.stack, reverseSecond);
      downloadPdf(data, "collated.pdf");
    } finally {
      setIsCollating(false);
    }
  }, [files, reverseSecond]);

  /* ---- Computed values ---- */
  const totalPages = files.reduce((sum, f) => sum + f.pageCount, 0);
  const isEmpty = files.length === 0;
  const isReady = files.length === MAX_FILES;

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
        icon={<CollateIcon size={20} />}
        title={t("title")}
        badge={wizardTitleBadge}
        empty={isEmpty}
        footer={!isEmpty ? {
          statusText: isReady ? (
            <><span className="font-medium text-foreground">{totalPages}</span>{" "}{t("pagesTotal")}</>
          ) : (
            t("addSecondFile")
          ),
          buttonLabel: isCollating ? t("collating") : t("collateAndDownload"),
          onButtonClick: handleCollate,
          disabled: isCollating || !isReady,
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
            icon={CollateFilesIcon}
            autoFocus
          />
        ) : (
          <>
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
                addMoreFiles: isReady ? t("replaceFiles") : t("addSecondFile"),
              }}
            />

            <p className="mt-4 text-xs text-muted-foreground">{t("collateHint")}</p>

            {isReady && (
              <label className="mt-4 flex items-center gap-3 rounded-xl border border-border bg-card p-4">
                <button
                  type="button"
                  role="switch"
                  aria-checked={reverseSecond}
                  onClick={() => setReverseSecond((v) => !v)}
                  className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
                    reverseSecond ? "bg-primary" : "bg-border"
                  }`}
                >
                  <span
                    className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                      reverseSecond ? "translate-x-4" : "translate-x-0.5"
                    }`}
                  />
                </button>
                <div>
                  <span className="text-sm font-medium text-foreground">{t("reverseSecond")}</span>
                  <p className="text-xs text-muted-foreground">{t("reverseSecondDesc")}</p>
                </div>
              </label>
            )}
          </>
        )}
      </WizardContainer>
    </>
  );
}
