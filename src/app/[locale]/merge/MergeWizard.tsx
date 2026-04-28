"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { MergeIcon } from "@/components/Icons";
import { DropZone } from "@/components/DropZone";
import { WizardBanners } from "@/components/WizardBanners";
import { WizardContainer } from "@/components/WizardContainer";
import { SortableFileList } from "@/components/SortableFileList";
import { WizardFile } from "@/lib/types";
import { formatSize } from "@/lib/formatSize";
import { releaseWizardFile } from "@/lib/releaseWizardFile";
import { exportMergedPdf, downloadPdf } from "@/lib/pdfExport";
import { useDropZone } from "@/hooks/useDropZone";
import { useFileInput } from "@/hooks/useFileInput";
import { usePdfIngestion } from "@/hooks/usePdfIngestion";

export function MergeWizard() {
  const t = useTranslations("mergeWizard");

  const [files, setFiles] = useState<WizardFile[]>([]);
  const [isMerging, setIsMerging] = useState(false);

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

  /* ---- Merge and download ---- */
  const handleMerge = useCallback(async () => {
    if (files.length === 0) return;
    setIsMerging(true);
    try {
      const stacks = files.map((f) => f.stack);
      const data = await exportMergedPdf(stacks);
      downloadPdf(data, "merged.pdf");
    } finally {
      setIsMerging(false);
    }
  }, [files]);

  /* ---- Computed values ---- */
  const totalPages = files.reduce((sum, f) => sum + f.pageCount, 0);
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
        icon={<MergeIcon size={20} />}
        title={t("title")}
        badge={wizardTitleBadge}
        empty={isEmpty}
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
          />
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
