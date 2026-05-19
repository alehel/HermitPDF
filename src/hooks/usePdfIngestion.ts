"use client";

import { useCallback, useState } from "react";
import { ingestDocument, MAX_INGEST_BYTES } from "@/lib/pdfIngest";
import type { WizardFile } from "@/lib/types";

interface IngestResult {
  files: WizardFile[];
  pdfCount: number;
}

interface UsePdfIngestionOptions {
  // When true, password-protected PDFs are accepted with `needsPassword: true`
  // on the resulting WizardFile instead of being rejected. The caller is
  // responsible for prompting for the password and authenticating the doc.
  allowProtected?: boolean;
}

export function usePdfIngestion(hookOptions?: UsePdfIngestionOptions) {
  const [rejectedFiles, setRejectedFiles] = useState<string[]>([]);
  const [passwordProtectedFiles, setPasswordProtectedFiles] = useState<
    string[]
  >([]);
  const [oversizedFiles, setOversizedFiles] = useState<string[]>([]);

  const allowProtected = hookOptions?.allowProtected ?? false;

  const ingestFiles = useCallback(
    async (
      fileList: FileList,
      options?: { maxFiles?: number }
    ): Promise<IngestResult> => {
      const allFiles = Array.from(fileList);
      const pdfFiles = allFiles.filter(
        (f) =>
          f.type === "application/pdf" ||
          f.name.toLowerCase().endsWith(".pdf")
      );
      const rejected = allFiles
        .filter(
          (f) =>
            f.type !== "application/pdf" &&
            !f.name.toLowerCase().endsWith(".pdf")
        )
        .map((f) => f.name);
      const pwProtected: string[] = [];
      const oversized = pdfFiles
        .filter((f) => f.size > MAX_INGEST_BYTES)
        .map((f) => f.name);

      const candidates = pdfFiles.filter((f) => f.size <= MAX_INGEST_BYTES);
      const toProcess =
        options?.maxFiles != null
          ? candidates.slice(0, options.maxFiles)
          : candidates;

      const results = await Promise.all(
        toProcess.map(async (f) => {
          try {
            const data = await f.arrayBuffer();
            const result = await ingestDocument(data, f.name, f.size, {
              allowProtected,
            });
            const wizardFile: WizardFile = {
              id: crypto.randomUUID(),
              stack: result.stack,
              name: f.name,
              pageCount: result.stack.pages.length,
              fileSize: f.size,
              sourceDocId: result.sourceDocId,
              needsPassword: result.needsPassword,
            };
            return wizardFile;
          } catch (err) {
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

      return { files, pdfCount: pdfFiles.length };
    },
    [allowProtected]
  );

  return {
    ingestFiles,
    rejectedFiles,
    setRejectedFiles,
    passwordProtectedFiles,
    setPasswordProtectedFiles,
    oversizedFiles,
    setOversizedFiles,
  };
}
