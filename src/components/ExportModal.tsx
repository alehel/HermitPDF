"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { DownloadIcon } from "./Icons";
import { PageStack, PdfMetadata } from "@/lib/types";
import { exportMergedPdf, downloadPdf } from "@/lib/pdfExport";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

const STORAGE_KEY = "pw-export-metadata";

function loadSavedMetadata(): PdfMetadata {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return { title: "", author: "", subject: "", keywords: "" };
}

function saveMetadata(metadata: PdfMetadata) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(metadata));
  } catch {}
}

interface ExportModalProps {
  stacks: PageStack[];
  onClose: () => void;
}

export function ExportModal({ stacks, onClose }: ExportModalProps) {
  const t = useTranslations("exportModal");
  const tWorkspace = useTranslations("workspace");
  const [metadata, setMetadata] = useState<PdfMetadata>(loadSavedMetadata);
  const [exporting, setExporting] = useState(false);
  const firstInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    firstInputRef.current?.focus();
  }, []);

  const handleExport = useCallback(async () => {
    setExporting(true);
    try {
      saveMetadata(metadata);
      const data = await exportMergedPdf(stacks, metadata);
      downloadPdf(data, "hermitpdf-merged.pdf");
      onClose();
    } finally {
      setExporting(false);
    }
  }, [stacks, metadata, onClose]);

  function update(field: keyof PdfMetadata, value: string) {
    setMetadata((prev) => ({ ...prev, [field]: value }));
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="pdf-title">{t("pdfTitle")}</Label>
            <Input
              id="pdf-title"
              ref={firstInputRef}
              value={metadata.title}
              onChange={(e) => update("title", e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="pdf-author">{t("author")}</Label>
            <Input
              id="pdf-author"
              value={metadata.author}
              onChange={(e) => update("author", e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="pdf-subject">{t("subject")}</Label>
            <Input
              id="pdf-subject"
              value={metadata.subject}
              onChange={(e) => update("subject", e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="pdf-keywords">{t("keywords")}</Label>
            <Input
              id="pdf-keywords"
              value={metadata.keywords}
              onChange={(e) => update("keywords", e.target.value)}
            />
            <p className="text-xs text-muted-foreground">{t("keywordsHint")}</p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={onClose}>
            {t("cancel")}
          </Button>
          <Button size="sm" disabled={exporting} onClick={handleExport}>
            <DownloadIcon />
            {exporting ? tWorkspace("exporting") : tWorkspace("export")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
