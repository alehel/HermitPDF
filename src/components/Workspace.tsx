"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useTranslations } from "next-intl";
import clsx from "clsx";
import { checkerboardStyle } from "@/lib/utils";
import { FileIcon, ImageIcon } from "./Icons";
import { PageStack, PageRef } from "@/lib/types";
import { PdfPage } from "./PdfPage";
import { ContextMenu } from "./ContextMenu";
import { extractSingleImage } from "@/lib/mupdfClient";
import {
  buildExtractedImageFilename,
  downloadSingleImage,
  pdfNameStem,
} from "@/lib/imageExport";

type WorkspaceItem =
  | { kind: "header"; stackId: string; name: string; isFirst: boolean }
  | { kind: "page"; pageRef: PageRef };

interface WorkspaceProps {
  stacks: PageStack[];
  isResizing?: boolean;
  style?: React.CSSProperties;
  scrollToPageId?: string | null;
  onScrollComplete?: () => void;
}

export function Workspace({
  stacks,
  isResizing,
  style,
  scrollToPageId,
  onScrollComplete,
}: WorkspaceProps) {
  const t = useTranslations("workspace");
  const scrollRef = useRef<HTMLDivElement>(null);
  const [imageContextMenu, setImageContextMenu] = useState<{
    x: number;
    y: number;
    pageRef: PageRef;
    imageIndex: number;
  } | null>(null);

  const handleImageContextMenu = useCallback(
    (event: React.MouseEvent, pageRef: PageRef, imageIndex: number) => {
      setImageContextMenu({
        x: event.clientX,
        y: event.clientY,
        pageRef,
        imageIndex,
      });
    },
    []
  );
  const handleSaveImage = useCallback(async () => {
    if (!imageContextMenu) return;
    const { pageRef, imageIndex } = imageContextMenu;
    const result = await extractSingleImage(
      pageRef.sourceDocId,
      pageRef.sourcePageIndex,
      imageIndex
    );
    if (result) {
      const stackName =
        stacks.find((s) => s.pages.some((p) => p.id === pageRef.id))?.name ??
        "image";
      const filename = buildExtractedImageFilename(pdfNameStem(stackName), {
        pageIndex: pageRef.sourcePageIndex,
        imageIndex,
        extension: result.extension,
      });
      downloadSingleImage(result.data, filename, result.mimeType);
    }
  }, [imageContextMenu, stacks]);

  const items = useMemo<WorkspaceItem[]>(() => {
    const result: WorkspaceItem[] = [];
    stacks.forEach((stack, si) => {
      result.push({
        kind: "header",
        stackId: stack.id,
        name: stack.name,
        isFirst: si === 0,
      });
      for (const pageRef of stack.pages) {
        result.push({ kind: "page", pageRef });
      }
    });
    return result;
  }, [stacks]);

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (i) => (items[i].kind === "header" ? 50 : 800),
    overscan: 3,
    getItemKey: (i) => {
      const item = items[i];
      return item.kind === "header" ? `header-${item.stackId}` : item.pageRef.id;
    },
  });

  // Scroll to a specific page when requested
  useEffect(() => {
    if (!scrollToPageId) return;
    const index = items.findIndex(
      (item) => item.kind === "page" && item.pageRef.id === scrollToPageId
    );
    if (index >= 0) {
      virtualizer.scrollToIndex(index, { align: "start" });
    }
    onScrollComplete?.();
  }, [scrollToPageId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (stacks.length === 0) {
    return (
      <div style={style} className="flex flex-1 flex-col overflow-hidden">
        <div className="flex flex-1 items-center justify-center bg-secondary">
          <div className="flex flex-col items-center">
            <FileIcon className="mb-4 text-muted-foreground" />
            <h2 className="mb-2 text-sm font-medium text-foreground">
              {t("emptyTitle")}
            </h2>
            <p className="max-w-[300px] text-center text-xs text-muted-foreground">
              {t("emptyMessage")}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={style} className="flex flex-1 flex-col overflow-hidden">
      <div
        ref={scrollRef}
        className={clsx(
          "flex-1 overflow-y-auto px-10",
          isResizing && "pointer-events-none"
        )}
        style={checkerboardStyle}
      >
        <div
          style={{
            height: virtualizer.getTotalSize(),
            position: "relative",
            width: "100%",
          }}
        >
          {virtualizer.getVirtualItems().map((virtualRow) => {
            const item = items[virtualRow.index];
            return (
              <div
                key={virtualRow.key}
                ref={virtualizer.measureElement}
                data-index={virtualRow.index}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              >
                {item.kind === "header" ? (
                  <div
                    className={clsx(
                      "border-b border-border pb-2",
                      item.isFirst ? "pt-4 mb-4" : "pt-8 mb-4"
                    )}
                  >
                    <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      {item.name}
                    </h3>
                  </div>
                ) : (
                  <div className="flex flex-col items-center py-2">
                    <PdfPage
                      pageRef={item.pageRef}
                      onImageContextMenu={handleImageContextMenu}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {imageContextMenu && (
        <ContextMenu
          x={imageContextMenu.x}
          y={imageContextMenu.y}
          onClose={() => setImageContextMenu(null)}
          items={[
            {
              label: t("saveImage"),
              icon: <ImageIcon />,
              onClick: handleSaveImage,
            },
          ]}
        />
      )}
    </div>
  );
}
