"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { LinkIcon, ExternalLinkIcon } from "@/components/Icons";
import { DropZone } from "@/components/DropZone";
import { WizardBanners } from "@/components/WizardBanners";
import { IngestionOverlay } from "@/components/IngestionOverlay";
import { WizardContainer } from "@/components/WizardContainer";
import { FileCard } from "@/components/FileCard";
import { WizardFile, ExternalLink } from "@/lib/types";
import { formatSize } from "@/lib/formatSize";
import { releaseWizardFile } from "@/lib/releaseWizardFile";
import { getExternalLinks } from "@/lib/mupdfClient";
import { useDropZone } from "@/hooks/useDropZone";
import { useFileInput } from "@/hooks/useFileInput";
import { usePdfIngestion } from "@/hooks/usePdfIngestion";

interface LinkGroup {
  uri: string;
  /** 0-based page indices the link appears on, ascending. */
  pageIndices: number[];
}

/**
 * Collapse per-page link hits into one row per unique URI, preserving
 * first-seen order and collecting every page the URI appears on.
 */
function groupLinks(links: ExternalLink[]): LinkGroup[] {
  const byUri = new Map<string, LinkGroup>();
  for (const link of links) {
    let group = byUri.get(link.uri);
    if (!group) {
      group = { uri: link.uri, pageIndices: [] };
      byUri.set(link.uri, group);
    }
    group.pageIndices.push(link.pageIndex);
  }
  return [...byUri.values()];
}

export function LinksWizard() {
  const t = useTranslations("linksWizard");

  const [file, setFile] = useState<WizardFile | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [noLinksFound, setNoLinksFound] = useState(false);
  const [links, setLinks] = useState<ExternalLink[]>([]);

  const fileRef = useRef(file);
  fileRef.current = file;

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

  /* ---- Scan for links (auto-triggered on file load) ---- */
  const handleScan = useCallback(async (f: WizardFile) => {
    setIsScanning(true);
    setNoLinksFound(false);
    setLinks([]);
    try {
      const found = await getExternalLinks(f.sourceDocId);
      // If the user removed (or replaced) this file while the scan was
      // running, discard the result.
      if (fileRef.current?.id !== f.id) return;
      if (found.length === 0) {
        setNoLinksFound(true);
      } else {
        setLinks(found);
      }
    } catch (err) {
      // Don't let a rejection here become an unhandled promise rejection (which
      // surfaces as a dev error overlay and breaks the wizard). If this file is
      // already gone, the error is expected — the worker handle was destroyed.
      if (fileRef.current?.id === f.id) {
        console.error("Link extraction failed:", err);
      }
    } finally {
      if (fileRef.current?.id === f.id) {
        setIsScanning(false);
      }
    }
  }, []);

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
      setNoLinksFound(false);
      handleScan(newFile);

      if (fileCount > 1) {
        setRejectedFiles([t("onlyOneFile")]);
      }
    },
    [ingestFiles, setRejectedFiles, handleScan, t]
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
    setNoLinksFound(false);
    setLinks([]);
  }, []);

  const groups = useMemo(() => groupLinks(links), [links]);

  return (
    <>
      {fileInput}

      <IngestionOverlay active={isIngesting} />

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
        icon={<LinkIcon size={20} />}
        title={t("title")}
        empty={!file}
      >
        <p className="mb-4 text-sm leading-relaxed text-muted-foreground">
          {t("note")}
        </p>

        {!file ? (
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
              subtitle={`${t("pageCount", { count: file.pageCount })} · ${formatSize(file.fileSize)}`}
              onRemove={handleRemove}
              removeTitle={t("remove")}
            />

            {isScanning && (
              <div className="mt-6 flex items-center justify-center gap-2 py-8">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                <p className="text-sm text-muted-foreground">{t("scanning")}</p>
              </div>
            )}

            {noLinksFound && (
              <div className="mt-6 rounded-xl border border-border bg-card p-4 text-center">
                <p className="text-sm text-muted-foreground">{t("noLinksFound")}</p>
              </div>
            )}

            {groups.length > 0 && (
              <div className="mt-6">
                <p className="mb-3 text-xs font-medium uppercase tracking-widest text-muted-foreground">
                  {t("linksFound", { count: groups.length })}
                </p>
                <ul className="flex flex-col gap-2">
                  {groups.map((group) => (
                    <li key={group.uri}>
                      <a
                        href={group.uri}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={t("opensInNewTab")}
                        className="group/link flex items-start gap-3 rounded-xl border border-border bg-card p-3 transition-colors hover:border-primary"
                      >
                        <ExternalLinkIcon className="mt-0.5 shrink-0 text-muted-foreground transition-colors group-hover/link:text-primary" />
                        <span className="min-w-0 flex-1">
                          <span className="block break-all text-sm text-foreground transition-colors group-hover/link:text-primary">
                            {group.uri}
                          </span>
                          <span className="mt-0.5 block text-xs text-muted-foreground">
                            {t("onPages", {
                              count: group.pageIndices.length,
                              pages: group.pageIndices.map((p) => p + 1).join(", "),
                            })}
                          </span>
                        </span>
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </WizardContainer>
    </>
  );
}
