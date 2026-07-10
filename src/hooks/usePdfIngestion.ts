"use client";

import { useCallback, useState } from "react";
import { ingestDocument, MAX_INGEST_BYTES } from "@/lib/pdfIngest";
import { isAcceptedFile, detectFile } from "@/lib/fileDetect";
import type { WizardFile } from "@/lib/types";

interface IngestResult {
  files: WizardFile[];
  fileCount: number;
}

interface UsePdfIngestionOptions {
  // When true, password-protected PDFs are accepted with `needsPassword: true`
  // on the resulting WizardFile instead of being rejected. The caller is
  // responsible for prompting for the password and authenticating the doc.
  allowProtected?: boolean;
  acceptImages?: boolean;
}

function isPdf(file: File): boolean {
  return (
    file.type === "application/pdf" ||
    file.name.toLowerCase().endsWith(".pdf")
  );
}

// Ingestion needs crypto.randomUUID, OPFS, and Web Locks — all of which
// browsers expose only in secure contexts (HTTPS or localhost) and some
// disable in private browsing. Without this check every file would fail
// ingestion and be misreported as "not a PDF".
function isStorageSupported(): boolean {
  return (
    typeof crypto?.randomUUID === "function" &&
    typeof navigator?.storage?.getDirectory === "function" &&
    typeof navigator?.locks?.request === "function"
  );
}

export function usePdfIngestion(hookOptions?: UsePdfIngestionOptions) {
  const [rejectedFiles, setRejectedFiles] = useState<string[]>([]);
  const [passwordProtectedFiles, setPasswordProtectedFiles] = useState<
    string[]
  >([]);
  const [oversizedFiles, setOversizedFiles] = useState<string[]>([]);
  const [environmentUnsupported, setEnvironmentUnsupported] = useState(false);
  // Counter rather than a boolean so overlapping batches (more files dropped
  // while a previous batch is still parsing) don't clear the flag early.
  const [pendingIngests, setPendingIngests] = useState(0);

  const allowProtected = hookOptions?.allowProtected ?? false;
  const acceptImages = hookOptions?.acceptImages ?? false;

  const isFileAccepted = acceptImages ? isAcceptedFile : isPdf;

  const ingestFiles = useCallback(
    async (
      fileList: FileList,
      options?: { maxFiles?: number }
    ): Promise<IngestResult> => {
      if (!isStorageSupported()) {
        setEnvironmentUnsupported(true);
        return { files: [], fileCount: 0 };
      }
      setPendingIngests((n) => n + 1);
      try {
        const allFiles = Array.from(fileList);
        const accepted = allFiles.filter(isFileAccepted);
        const rejected = allFiles
          .filter((f) => !isFileAccepted(f))
          .map((f) => f.name);
        const pwProtected: string[] = [];
        const oversized = accepted
          .filter((f) => f.size > MAX_INGEST_BYTES)
          .map((f) => f.name);

        const candidates = accepted.filter((f) => f.size <= MAX_INGEST_BYTES);
        const toProcess =
          options?.maxFiles != null
            ? candidates.slice(0, options.maxFiles)
            : candidates;

        const results = await Promise.all(
          toProcess.map(async (f) => {
            try {
              const detected = acceptImages
                ? await detectFile(f)
                : { data: f as Blob, magic: "application/pdf" };
              const result = await ingestDocument(
                detected.data,
                f.name,
                f.size,
                { allowProtected, magic: detected.magic }
              );
              const wizardFile: WizardFile = {
                id: crypto.randomUUID(),
                stack: result.stack,
                name: f.name,
                pageCount: result.stack.pages.length,
                fileSize: f.size,
                sourceDocId: result.sourceDocId,
                needsPassword: result.needsPassword,
                isImage: detected.magic.startsWith("image/"),
              };
              return wizardFile;
            } catch (err) {
              console.error(`Failed to ingest ${f.name}:`, err);
              const msg = err instanceof Error ? err.message.toLowerCase() : "";
              if (msg.includes("password") || msg.includes("encrypted")) {
                pwProtected.push(f.name);
              } else {
                rejected.push(f.name);
              }
              return null;
            }
          })
        );

        const files = results.filter((r): r is WizardFile => r !== null);

        if (rejected.length > 0) setRejectedFiles(rejected);
        if (pwProtected.length > 0) setPasswordProtectedFiles(pwProtected);
        if (oversized.length > 0) setOversizedFiles(oversized);

        return { files, fileCount: accepted.length };
      } finally {
        setPendingIngests((n) => n - 1);
      }
    },
    [isFileAccepted, acceptImages, allowProtected]
  );

  return {
    ingestFiles,
    isIngesting: pendingIngests > 0,
    rejectedFiles,
    setRejectedFiles,
    passwordProtectedFiles,
    setPasswordProtectedFiles,
    oversizedFiles,
    setOversizedFiles,
    environmentUnsupported,
    setEnvironmentUnsupported,
  };
}
