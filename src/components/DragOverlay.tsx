"use client";

import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { PdfThumbnail } from "./PdfThumbnail";
import { PageRef } from "@/lib/types";
import type { ReactNode, RefObject } from "react";

/* ------------------------------------------------------------------ */
/*  DragOverlayShell – shared portal + positioning wrapper             */
/* ------------------------------------------------------------------ */

export interface DragOverlayShellProps {
  overlayElRef: RefObject<HTMLDivElement | null>;
  initialPos?: { x: number; y: number } | null;
  children: ReactNode;
}

export function DragOverlayShell({
  overlayElRef,
  initialPos,
  children,
}: DragOverlayShellProps) {
  return createPortal(
    <div
      ref={overlayElRef}
      className="pointer-events-none fixed left-0 top-0 z-40"
      style={{
        willChange: "transform",
        transform: initialPos
          ? `translate(${initialPos.x}px, ${initialPos.y}px)`
          : undefined,
      }}
    >
      {children}
    </div>,
    document.body,
  );
}

/* ------------------------------------------------------------------ */
/*  DragOverlay – page drag ghost                                      */
/* ------------------------------------------------------------------ */

interface DragOverlayProps {
  pageRef: PageRef;
  pageIndex: number;
  overlayElRef: RefObject<HTMLDivElement | null>;
  layout: "row" | "tile";
  initialPos?: { x: number; y: number } | null;
}

export function DragOverlay({
  pageRef,
  pageIndex,
  overlayElRef,
  layout,
  initialPos,
}: DragOverlayProps) {
  const t = useTranslations("documentItem");
  const isTile = layout === "tile";
  const width = isTile ? 80 : 36;

  return (
    <DragOverlayShell overlayElRef={overlayElRef} initialPos={initialPos}>
      {isTile ? (
        <div className="flex scale-105 flex-col items-center rounded-lg border border-primary/30 bg-card p-1.5 shadow-xl">
          <div className="overflow-hidden rounded border border-border bg-card">
            <PdfThumbnail
              pageRef={pageRef}
              width={width}
            />
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {t("pageLabel", { page: pageIndex + 1 })}
          </p>
        </div>
      ) : (
        <div className="flex scale-105 items-center gap-2 rounded-lg border border-primary/30 bg-card p-1.5 shadow-xl">
          <div className="flex h-[46px] w-[36px] shrink-0 items-center justify-center overflow-hidden rounded border border-border bg-card">
            <PdfThumbnail
              pageRef={pageRef}
              width={width}
            />
          </div>
          <p className="text-[12px] text-muted-foreground">
            {t("pageLabel", { page: pageIndex + 1 })}
          </p>
        </div>
      )}
    </DragOverlayShell>
  );
}
