"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { AttachIcon } from "@/components/Icons";
import { DropZone } from "@/components/DropZone";
import { ProcessingOverlay } from "@/components/ProcessingOverlay";
import { WizardBanners } from "@/components/WizardBanners";
import { WizardContainer } from "@/components/WizardContainer";
import { SortableFileList } from "@/components/SortableFileList";
import type { WizardFile } from "@/lib/types";
import { formatSize } from "@/lib/formatSize";
import { releaseWizardFile } from "@/lib/releaseWizardFile";
import { exportAttachedPdfs, downloadAttachOutput } from "@/lib/attachExport";
import { useDelayedFlag } from "@/hooks/useDelayedFlag";
import { useDropZone } from "@/hooks/useDropZone";
import { useFileInput } from "@/hooks/useFileInput";
import { usePdfIngestion } from "@/hooks/usePdfIngestion";

function moveItem(list: WizardFile[], fromIndex: number, toIndex: number): WizardFile[] {
  if (fromIndex === toIndex) return list;
  const next = [...list];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next;
}

export function AttachWizard() {
  const t = useTranslations("attachWizard");

  const [documents, setDocuments] = useState<WizardFile[]>([]);
  const [prepends, setPrepends] = useState<WizardFile[]>([]);
  const [appends, setAppends] = useState<WizardFile[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const showOverlay = useDelayedFlag(isProcessing);

  const allFilesRef = useRef<WizardFile[]>([]);
  allFilesRef.current = [...documents, ...prepends, ...appends];

  const {
    ingestFiles,
    rejectedFiles,
    setRejectedFiles,
    passwordProtectedFiles,
    setPasswordProtectedFiles,
    oversizedFiles,
    setOversizedFiles,
  } = usePdfIngestion();

  /* ---- File ingestion — one flow per list ---- */
  const handleDocumentsAdded = useCallback(
    async (fileList: FileList) => {
      const { files: newFiles } = await ingestFiles(fileList);
      if (newFiles.length > 0) setDocuments((prev) => [...prev, ...newFiles]);
    },
    [ingestFiles]
  );

  const handlePrependsAdded = useCallback(
    async (fileList: FileList) => {
      const { files: newFiles } = await ingestFiles(fileList);
      if (newFiles.length > 0) setPrepends((prev) => [...prev, ...newFiles]);
    },
    [ingestFiles]
  );

  const handleAppendsAdded = useCallback(
    async (fileList: FileList) => {
      const { files: newFiles } = await ingestFiles(fileList);
      if (newFiles.length > 0) setAppends((prev) => [...prev, ...newFiles]);
    },
    [ingestFiles]
  );

  const documentsDrop = useDropZone(handleDocumentsAdded);
  const prependsDrop = useDropZone(handlePrependsAdded);
  const appendsDrop = useDropZone(handleAppendsAdded);

  const { fileInput: documentsInput, openFilePicker: openDocumentsPicker } =
    useFileInput(handleDocumentsAdded, { multiple: true, ariaLabel: t("dropTitle") });
  const { fileInput: prependsInput, openFilePicker: openPrependsPicker } =
    useFileInput(handlePrependsAdded, { multiple: true, ariaLabel: t("addToStart") });
  const { fileInput: appendsInput, openFilePicker: openAppendsPicker } =
    useFileInput(handleAppendsAdded, { multiple: true, ariaLabel: t("addToEnd") });

  /* ---- Cleanup on unmount ---- */
  useEffect(() => {
    return () => {
      for (const file of allFilesRef.current) {
        releaseWizardFile(file);
      }
    };
  }, []);

  /* ---- Remove a file (ids are unique across all three lists) ---- */
  const handleRemove = useCallback((id: string) => {
    // Side effect outside the updater: Strict Mode double-invokes updaters,
    // which would release the file twice and race in OPFS.
    const removed = allFilesRef.current.find((f) => f.id === id);
    if (removed) releaseWizardFile(removed);
    setDocuments((prev) => prev.filter((f) => f.id !== id));
    setPrepends((prev) => prev.filter((f) => f.id !== id));
    setAppends((prev) => prev.filter((f) => f.id !== id));
  }, []);

  /* ---- Reorder files ---- */
  const handleReorderDocuments = useCallback((fromIndex: number, toIndex: number) => {
    setDocuments((prev) => moveItem(prev, fromIndex, toIndex));
  }, []);
  const handleReorderPrepends = useCallback((fromIndex: number, toIndex: number) => {
    setPrepends((prev) => moveItem(prev, fromIndex, toIndex));
  }, []);
  const handleReorderAppends = useCallback((fromIndex: number, toIndex: number) => {
    setAppends((prev) => moveItem(prev, fromIndex, toIndex));
  }, []);

  /* ---- Apply and download ---- */
  const attachmentCount = prepends.length + appends.length;
  const canApply = documents.length > 0 && attachmentCount > 0;

  const handleApply = useCallback(async () => {
    if (documents.length === 0 || prepends.length + appends.length === 0) return;
    setIsProcessing(true);
    try {
      const results = await exportAttachedPdfs(documents, prepends, appends);
      downloadAttachOutput(results);
    } finally {
      setIsProcessing(false);
    }
  }, [documents, prepends, appends]);

  /* ---- Computed values ---- */
  const isEmpty = documents.length === 0 && attachmentCount === 0;

  const wizardTitleBadge = documents.length > 0 ? (
    <span className="rounded-full bg-accent px-2 py-0.5 text-xs font-medium text-primary">
      {t("filesCount", { count: documents.length })}
    </span>
  ) : undefined;

  const formatSubtitle = useCallback(
    (file: WizardFile) => `${t("pageCount", { count: file.pageCount })} · ${formatSize(file.fileSize)}`,
    [t]
  );

  return (
    <>
      {documentsInput}
      {prependsInput}
      {appendsInput}

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
        icon={<AttachIcon size={20} />}
        title={t("title")}
        badge={wizardTitleBadge}
        empty={isEmpty}
        wide={!isEmpty}
        footer={!isEmpty ? {
          statusText: canApply
            ? t("statusSummary", { documents: documents.length, attachments: attachmentCount })
            : t(documents.length === 0 ? "needDocuments" : "needAttachments"),
          buttonLabel: isProcessing ? t("processing") : t("applyAndDownload"),
          onButtonClick: handleApply,
          disabled: isProcessing || !canApply,
        } : undefined}
      >
        {isEmpty ? (
          <DropZone
            title={t("dropTitle")}
            subtitle={t("dropSubtitle")}
            privacyNote={t("privacyNote")}
            onClick={openDocumentsPicker}
            onDragOver={documentsDrop.handleDropZoneDragOver}
            onDragLeave={documentsDrop.handleDropZoneDragLeave}
            onDrop={documentsDrop.handleDropZoneDrop}
            isDragOver={documentsDrop.isDragOver}
            autoFocus
          />
        ) : (
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-2 lg:items-start">
            {/* Documents that will receive the added files */}
            <div>
              <h3 className="mb-4 text-xs font-medium uppercase tracking-widest text-muted-foreground">
                {t("documentsHeading")}
              </h3>
              <p className="mb-4 text-xs text-muted-foreground">{t("documentsHint")}</p>
              <SortableFileList
                files={documents}
                onRemove={handleRemove}
                onReorder={handleReorderDocuments}
                openFilePicker={openDocumentsPicker}
                isDragOver={documentsDrop.isDragOver}
                dropZoneHandlers={{
                  onDragOver: documentsDrop.handleDropZoneDragOver,
                  onDragLeave: documentsDrop.handleDropZoneDragLeave,
                  onDrop: documentsDrop.handleDropZoneDrop,
                }}
                formatSubtitle={formatSubtitle}
                labels={{
                  dragToReorder: t("dragToReorder"),
                  addMoreFiles: t("addMoreDocuments"),
                }}
              />
            </div>

            {/* Files added to every document */}
            <div className="space-y-8 lg:sticky lg:top-8">
              <div>
                <h3 className="mb-4 text-xs font-medium uppercase tracking-widest text-muted-foreground">
                  {t("prependHeading")}
                </h3>
                <p className="mb-4 text-xs text-muted-foreground">{t("prependHint")}</p>
                <SortableFileList
                  files={prepends}
                  onRemove={handleRemove}
                  onReorder={handleReorderPrepends}
                  openFilePicker={openPrependsPicker}
                  isDragOver={prependsDrop.isDragOver}
                  dropZoneHandlers={{
                    onDragOver: prependsDrop.handleDropZoneDragOver,
                    onDragLeave: prependsDrop.handleDropZoneDragLeave,
                    onDrop: prependsDrop.handleDropZoneDrop,
                  }}
                  formatSubtitle={formatSubtitle}
                  labels={{
                    dragToReorder: t("dragToReorder"),
                    addMoreFiles: t("addToStart"),
                  }}
                />
              </div>

              <div>
                <h3 className="mb-4 text-xs font-medium uppercase tracking-widest text-muted-foreground">
                  {t("appendHeading")}
                </h3>
                <p className="mb-4 text-xs text-muted-foreground">{t("appendHint")}</p>
                <SortableFileList
                  files={appends}
                  onRemove={handleRemove}
                  onReorder={handleReorderAppends}
                  openFilePicker={openAppendsPicker}
                  isDragOver={appendsDrop.isDragOver}
                  dropZoneHandlers={{
                    onDragOver: appendsDrop.handleDropZoneDragOver,
                    onDragLeave: appendsDrop.handleDropZoneDragLeave,
                    onDrop: appendsDrop.handleDropZoneDrop,
                  }}
                  formatSubtitle={formatSubtitle}
                  labels={{
                    dragToReorder: t("dragToReorder"),
                    addMoreFiles: t("addToEnd"),
                  }}
                />
              </div>
            </div>
          </div>
        )}
      </WizardContainer>
    </>
  );
}
