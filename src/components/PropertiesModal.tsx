"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { PdfMetadata } from "@/lib/types";
import { loadSavedMetadata, saveMetadata } from "@/lib/pdfMetadata";
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

interface PropertiesModalProps {
  onClose: () => void;
  onSaveFailed: () => void;
}

export function PropertiesModal({ onClose, onSaveFailed }: PropertiesModalProps) {
  const t = useTranslations("propertiesModal");
  const [metadata, setMetadata] = useState<PdfMetadata>(loadSavedMetadata);
  const firstInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    firstInputRef.current?.focus();
  }, []);

  const handleSave = useCallback(() => {
    if (!saveMetadata(metadata)) onSaveFailed();
    onClose();
  }, [metadata, onClose, onSaveFailed]);

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
          <Button size="sm" onClick={handleSave}>
            {t("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
