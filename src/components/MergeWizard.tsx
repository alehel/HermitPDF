"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { MergeIcon, PlusCircleIcon } from "./Icons";
import { DropZone } from "./DropZone";
import { DismissibleBanner } from "./DismissibleBanner";
import { WizardHeader } from "./WizardHeader";
import { WizardContainer } from "./WizardContainer";
import { FileCard } from "./FileCard";
import { WizardFile } from "@/lib/types";
import { formatSize } from "@/lib/formatSize";
import { releaseWizardFile } from "@/lib/releaseWizardFile";
import { exportMergedPdf, downloadPdf } from "@/lib/pdfExport";
import { useSortableDrag } from "@/hooks/useSortableDrag";
import { useDropZone } from "@/hooks/useDropZone";
import { useFileInput } from "@/hooks/useFileInput";
import { usePdfIngestion } from "@/hooks/usePdfIngestion";

/* ------------------------------------------------------------------ */
/*  Types                                                               */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/*  Main component                                                      */
/* ------------------------------------------------------------------ */

export function MergeWizard() {
  const t = useTranslations("mergeWizard");

  const [files, setFiles] = useState<WizardFile[]>([]);
  const [isMerging, setIsMerging] = useState(false);

  const listRef = useRef<HTMLDivElement | null>(null);
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
  const { fileInputRef, handleFileInput, openFilePicker } = useFileInput(handleFilesAdded);

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

  /* ---- Sortable drag for reordering ---- */
  const {
    dragIndex,
    handleDragOver: sortableDragOver,
    handleDragLeave,
    handleDrop: sortableDrop,
    handleItemDragStart,
    handleItemDragEnd,
    getItemStyle,
  } = useSortableDrag({
    itemCount: files.length,
    containerRef: listRef,
    itemSelector: "[data-merge-item]",
    layout: "list",
    acceptDrag: (e) =>
      e.dataTransfer.types.includes("text/x-merge-index") ||
      e.dataTransfer.types.includes("Files"),
    getDropEffect: (e) =>
      e.dataTransfer.types.includes("Files") ? "copy" : "move",
    onDrop: (e, toIndex) => {
      const fromStr = e.dataTransfer.getData("text/x-merge-index");
      if (fromStr) {
        handleReorder(parseInt(fromStr, 10), toIndex);
      } else if (e.dataTransfer.files.length > 0) {
        handleFilesAdded(e.dataTransfer.files);
      }
    },
  });

  /* ---- Computed values ---- */
  const totalPages = files.reduce((sum, f) => sum + f.pageCount, 0);

  /* ---- Hidden file input ---- */
  const fileInput = (
    <input
      ref={fileInputRef}
      type="file"
      accept=".pdf,application/pdf"
      multiple
      className="hidden"
      onChange={handleFileInput}
    />
  );

  const wizardTitleBadge = files.length > 0 ? (
    <span className="rounded-full bg-accent px-2 py-0.5 text-xs font-medium text-primary">
      {t("filesCount", { count: files.length })}
    </span>
  ) : undefined;

  const isEmpty = files.length === 0;

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <WizardHeader />
      {fileInput}

      {rejectedFiles.length > 0 && (
        <DismissibleBanner
          message={t("rejectedFiles", { files: rejectedFiles.join(", ") })}
          dismissLabel={t("dismiss")}
          onDismiss={() => setRejectedFiles([])}
        />
      )}
      {passwordProtectedFiles.length > 0 && (
        <DismissibleBanner
          message={t("passwordProtectedFiles", {
            files: passwordProtectedFiles.join(", "),
          })}
          dismissLabel={t("dismiss")}
          onDismiss={() => setPasswordProtectedFiles([])}
        />
      )}

      <WizardContainer
        icon={<MergeIcon className="!h-4 !w-4" />}
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
          <>
            <p className="mb-3 text-xs font-medium uppercase tracking-widest text-muted-foreground">
              {t("dragToReorder")}
            </p>

            <div
              ref={listRef}
              className="space-y-2"
              onDragOver={sortableDragOver}
              onDragLeave={handleDragLeave}
              onDrop={sortableDrop}
            >
              {files.map((file, i) => (
                <FileCard
                  key={file.id}
                  name={file.name}
                  subtitle={`${t("pageCount", { count: file.pageCount })} \u00b7 ${formatSize(file.fileSize)}`}
                  onRemove={() => handleRemove(file.id)}
                  extraProps={{ "data-merge-item": true } as React.HTMLAttributes<HTMLDivElement>}
                  dragHandle={{
                    onDragStart: (e) => {
                      e.dataTransfer.setData("text/x-merge-index", String(i));
                      handleItemDragStart(i, e);
                    },
                    onDragEnd: handleItemDragEnd,
                  }}
                  orderBadge={
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-medium text-primary">
                      {i + 1}
                    </span>
                  }
                  style={getItemStyle(i)}
                  className={`group flex items-center gap-3 rounded-xl border bg-card p-4 transition-all ${
                    dragIndex === i
                      ? "border-primary opacity-0"
                      : "border-border hover:border-primary/40 hover:shadow-sm"
                  }`}
                />
              ))}
            </div>

            <button
              type="button"
              onClick={openFilePicker}
              onDragOver={handleDropZoneDragOver}
              onDragLeave={handleDropZoneDragLeave}
              onDrop={handleDropZoneDrop}
              className={`mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed py-3 text-sm transition-all ${
                isDragOver
                  ? "border-primary bg-accent/30 text-primary"
                  : "border-border bg-card/50 text-muted-foreground hover:border-primary hover:text-primary"
              }`}
            >
              <PlusCircleIcon />
              {t("addMoreFiles")}
            </button>
          </>
        )}
      </WizardContainer>
    </div>
  );
}
