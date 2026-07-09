"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { RotateIcon, RotateLeftIcon, RotateRightIcon } from "@/components/Icons";
import { DropZone } from "@/components/DropZone";
import { ProcessingOverlay } from "@/components/ProcessingOverlay";
import { WizardBanners } from "@/components/WizardBanners";
import { WizardContainer } from "@/components/WizardContainer";
import { FileCard } from "@/components/FileCard";
import { PdfThumbnail } from "@/components/PdfThumbnail";
import { PageStack, WizardFile } from "@/lib/types";
import { formatSize } from "@/lib/formatSize";
import { releaseWizardFile } from "@/lib/releaseWizardFile";
import { exportMergedPdf, downloadPdf } from "@/lib/pdfExport";
import { normalizeRotation } from "@/lib/rotationUtils";
import { useDelayedFlag } from "@/hooks/useDelayedFlag";
import { useDropZone } from "@/hooks/useDropZone";
import { useFileInput } from "@/hooks/useFileInput";
import { usePdfIngestion } from "@/hooks/usePdfIngestion";

function rotatedStem(name: string): string {
  return name.replace(/\.pdf$/i, "") + "_rotated.pdf";
}

export function RotateWizard() {
  const t = useTranslations("rotateWizard");

  const [file, setFile] = useState<WizardFile | null>(null);
  const [stack, setStack] = useState<PageStack | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const showOverlay = useDelayedFlag(isExporting);

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
    environmentUnsupported,
    setEnvironmentUnsupported,
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
      setStack(newFile.stack);

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

  /* ---- Remove the file ---- */
  const handleRemove = useCallback(() => {
    const prev = fileRef.current;
    if (prev) releaseWizardFile(prev);
    setFile(null);
    setStack(null);
  }, []);

  /* ---- Rotate a single page ---- */
  const handleRotatePage = useCallback((pageId: string, delta: number) => {
    setStack((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        pages: prev.pages.map((p) =>
          p.id === pageId
            ? { ...p, rotation: normalizeRotation(p.rotation, delta) }
            : p
        ),
      };
    });
  }, []);

  /* ---- Rotate all pages ---- */
  const handleRotateAll = useCallback((delta: number) => {
    setStack((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        pages: prev.pages.map((p) => ({
          ...p,
          rotation: normalizeRotation(p.rotation, delta),
        })),
      };
    });
  }, []);

  /* ---- Export ---- */
  const handleExport = useCallback(async () => {
    if (!file || !stack) return;
    setIsExporting(true);
    try {
      const data = await exportMergedPdf([stack]);
      downloadPdf(data, rotatedStem(file.name));
    } finally {
      setIsExporting(false);
    }
  }, [file, stack]);

  const rotatedCount = useMemo(
    () => (stack ? stack.pages.filter((p) => p.rotation !== 0).length : 0),
    [stack]
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
        environmentUnsupported={environmentUnsupported}
        onDismissEnvironmentUnsupported={() => setEnvironmentUnsupported(false)}
      />

      <WizardContainer
        icon={<RotateIcon size={20} />}
        title={t("title")}
        empty={!file}
        footer={file && stack ? {
          statusText: rotatedCount > 0
            ? t("rotatedCount", { count: rotatedCount })
            : t("noChanges"),
          buttonLabel: isExporting ? t("exporting") : t("downloadRotated"),
          onButtonClick: handleExport,
          disabled: isExporting || rotatedCount === 0,
        } : undefined}
      >
        {!file || !stack ? (
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
          <>
            <FileCard
              name={file.name}
              subtitle={`${t("pageCount", { count: file.pageCount })} \u00b7 ${formatSize(file.fileSize)}`}
              onRemove={handleRemove}
              removeTitle={t("remove")}
            />

            <div className="mt-4 flex items-center justify-between gap-2 rounded-xl border border-border bg-card p-3">
              <p className="text-xs text-muted-foreground">{t("rotateAllHint")}</p>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => handleRotateAll(-90)}
                  className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-accent"
                  title={t("rotateAllLeft")}
                >
                  <RotateLeftIcon />
                  <span className="hidden sm:inline">{t("rotateAllLeft")}</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleRotateAll(90)}
                  className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-accent"
                  title={t("rotateAllRight")}
                >
                  <RotateRightIcon />
                  <span className="hidden sm:inline">{t("rotateAllRight")}</span>
                </button>
              </div>
            </div>

            <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
              {stack.pages.map((page, i) => (
                <div
                  key={page.id}
                  className="group/page flex flex-col items-center gap-2 rounded-xl border border-border bg-card p-3"
                >
                  <div className="flex w-full items-center justify-center" style={{ minHeight: 140 }}>
                    {/* Square box: only ratio that treats both rotations
                        equally — for any page, rotation 0 vs 90 produce
                        the same-sized visual (just on a different axis),
                        so no rotation looks "squished" relative to another.
                        Mixed-aspect docs render uniformly; the trade-off
                        is portrait pages don't reach their full natural
                        height. */}
                    <PdfThumbnail pageRef={page} width={120} boxAspectRatio={1} />
                  </div>
                  <div className="flex w-full items-center justify-between">
                    <span className="text-xs text-muted-foreground">
                      {t("pageLabel", { page: i + 1 })}
                    </span>
                    <div className="flex items-center gap-0.5">
                      <button
                        type="button"
                        onClick={() => handleRotatePage(page.id, -90)}
                        className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                        title={t("rotateLeft")}
                        aria-label={t("rotateLeft")}
                      >
                        <RotateLeftIcon />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRotatePage(page.id, 90)}
                        className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                        title={t("rotateRight")}
                        aria-label={t("rotateRight")}
                      >
                        <RotateRightIcon />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </WizardContainer>
    </>
  );
}
