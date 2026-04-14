"use client";

import { useCallback, useState } from "react";
import { ingestDocument } from "@/lib/pdfIngest";
import type { WizardFile } from "@/lib/types";

interface IngestResult {
  files: WizardFile[];
  pdfCount: number;
}

export function usePdfIngestion() {
  const [rejectedFiles, setRejectedFiles] = useState<string[]>([]);
  const [passwordProtectedFiles, setPasswordProtectedFiles] = useState<
    string[]
  >([]);

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

      const toProcess =
        options?.maxFiles != null
          ? pdfFiles.slice(0, options.maxFiles)
          : pdfFiles;

      const results = await Promise.all(
        toProcess.map(async (f) => {
          try {
            const data = await f.arrayBuffer();
            const stack = await ingestDocument(data, f.name, f.size);
            return {
              id: crypto.randomUUID(),
              stack,
              name: f.name,
              pageCount: stack.pages.length,
              fileSize: f.size,
            } satisfies WizardFile;
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

      return { files, pdfCount: pdfFiles.length };
    },
    []
  );

  return {
    ingestFiles,
    rejectedFiles,
    setRejectedFiles,
    passwordProtectedFiles,
    setPasswordProtectedFiles,
  };
}
