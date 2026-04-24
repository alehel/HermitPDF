"use client";

import { useTranslations } from "next-intl";
import { PageRef, PageStack, formatFileSize } from "@/lib/types";
import { PdfThumbnail } from "./PdfThumbnail";

interface StackDragPreviewProps {
  stack: PageStack;
  layout: "list" | "grid";
}

export function StackDragPreview({ stack, layout }: StackDragPreviewProps) {
  if (layout === "grid") {
    return (
      <div className="scale-105 rounded-lg border border-primary/30 bg-card p-1.5 shadow-xl">
        <div className="overflow-hidden rounded">
          <PdfThumbnail pageRef={stack.pages[0]} width={80} />
        </div>
        <p className="mt-1 max-w-[80px] truncate text-[11px] text-muted-foreground">
          {stack.name}
        </p>
      </div>
    );
  }

  return (
    <div className="flex max-w-[200px] scale-105 items-center gap-2 rounded-lg border border-primary/30 bg-card p-2 shadow-xl">
      <div className="flex h-[42px] w-[32px] shrink-0 items-center justify-center overflow-hidden rounded border border-border bg-card">
        <PdfThumbnail pageRef={stack.pages[0]} width={32} />
      </div>
      <div className="min-w-0">
        <p className="truncate text-[12px] font-medium text-foreground">
          {stack.name}
        </p>
        <p className="text-[10px] text-muted-foreground">
          {formatFileSize(stack.size)}
        </p>
      </div>
    </div>
  );
}

interface PageDragPreviewProps {
  pageRef: PageRef;
  pageIndex: number;
  layout: "row" | "tile";
}

export function PageDragPreview({ pageRef, pageIndex, layout }: PageDragPreviewProps) {
  const t = useTranslations("documentItem");

  if (layout === "tile") {
    return (
      <div className="flex scale-105 flex-col items-center rounded-lg border border-primary/30 bg-card p-1.5 shadow-xl">
        <div className="overflow-hidden rounded border border-border bg-card">
          <PdfThumbnail pageRef={pageRef} width={80} />
        </div>
        <p className="mt-1 text-[11px] text-muted-foreground">
          {t("pageLabel", { page: pageIndex + 1 })}
        </p>
      </div>
    );
  }

  return (
    <div className="flex scale-105 items-center gap-2 rounded-lg border border-primary/30 bg-card p-1.5 shadow-xl">
      <div className="flex h-[46px] w-[36px] shrink-0 items-center justify-center overflow-hidden rounded border border-border bg-card">
        <PdfThumbnail pageRef={pageRef} width={36} />
      </div>
      <p className="text-[12px] text-muted-foreground">
        {t("pageLabel", { page: pageIndex + 1 })}
      </p>
    </div>
  );
}
