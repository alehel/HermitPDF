"use client";

import { PageStack, formatFileSize } from "@/lib/types";
import { PdfThumbnail } from "./PdfThumbnail";
import { DragOverlayShell } from "./DragOverlay";
import type { RefObject } from "react";

interface StackDragOverlayProps {
  stack: PageStack;
  overlayElRef: RefObject<HTMLDivElement | null>;
  layout: "list" | "grid";
  initialPos?: { x: number; y: number } | null;
}

export function StackDragOverlay({
  stack,
  overlayElRef,
  layout,
  initialPos,
}: StackDragOverlayProps) {
  return (
    <DragOverlayShell overlayElRef={overlayElRef} initialPos={initialPos}>
      {layout === "grid" ? (
        <div className="scale-105 rounded-lg border border-primary/30 bg-card p-1.5 shadow-xl">
          <div className="overflow-hidden rounded">
            <PdfThumbnail pageRef={stack.pages[0]} width={80} />
          </div>
          <p className="mt-1 max-w-[80px] truncate text-[11px] text-muted-foreground">
            {stack.name}
          </p>
        </div>
      ) : (
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
      )}
    </DragOverlayShell>
  );
}
