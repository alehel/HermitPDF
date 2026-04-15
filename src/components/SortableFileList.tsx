"use client";

import { useCallback, useRef } from "react";
import { PlusCircleIcon } from "@/components/Icons";
import { FileCard } from "@/components/FileCard";
import type { WizardFile } from "@/lib/types";
import { useSortableDrag } from "@/hooks/useSortableDrag";

interface SortableFileListProps {
  files: WizardFile[];
  dragKey: string;
  onRemove: (id: string) => void;
  onReorder: (fromIndex: number, toIndex: number) => void;
  onFilesAdded: (files: FileList) => void;
  openFilePicker: () => void;
  isDragOver: boolean;
  dropZoneHandlers: {
    onDragOver: (e: React.DragEvent) => void;
    onDragLeave: (e: React.DragEvent) => void;
    onDrop: (e: React.DragEvent) => void;
  };
  formatSubtitle: (file: WizardFile) => string;
  labels: {
    dragToReorder: string;
    addMoreFiles: string;
  };
}

export function SortableFileList({
  files,
  dragKey,
  onRemove,
  onReorder,
  onFilesAdded,
  openFilePicker,
  isDragOver,
  dropZoneHandlers,
  formatSubtitle,
  labels,
}: SortableFileListProps) {
  const listRef = useRef<HTMLDivElement | null>(null);

  const dragDataType = `text/x-${dragKey}-index`;
  const dataAttr = `data-${dragKey}-item`;

  const handleReorderDrop = useCallback(
    (e: React.DragEvent, toIndex: number) => {
      const fromStr = e.dataTransfer.getData(dragDataType);
      if (fromStr) {
        onReorder(parseInt(fromStr, 10), toIndex);
      } else if (e.dataTransfer.files.length > 0) {
        onFilesAdded(e.dataTransfer.files);
      }
    },
    [dragDataType, onReorder, onFilesAdded]
  );

  const {
    dragIndex,
    handleDragOver: sortableDragOver,
    handleDragLeave,
    handleDrop: sortableDrop,
    handleItemDragStart,
    handleItemDragEnd,
    getItemStyle,
  } = useSortableDrag({
    itemCount: files.length,
    containerRef: listRef,
    itemSelector: `[${dataAttr}]`,
    layout: "list",
    acceptDrag: (e) =>
      e.dataTransfer.types.includes(dragDataType) ||
      e.dataTransfer.types.includes("Files"),
    getDropEffect: (e) =>
      e.dataTransfer.types.includes("Files") ? "copy" : "move",
    onDrop: handleReorderDrop,
  });

  return (
    <>
      <p className="mb-3 text-xs font-medium uppercase tracking-widest text-muted-foreground">
        {labels.dragToReorder}
      </p>

      <div
        ref={listRef}
        className="space-y-2"
        onDragOver={sortableDragOver}
        onDragLeave={handleDragLeave}
        onDrop={sortableDrop}
      >
        {files.map((file, i) => (
          <FileCard
            key={file.id}
            name={file.name}
            subtitle={formatSubtitle(file)}
            onRemove={() => onRemove(file.id)}
            extraProps={{ [dataAttr]: true } as React.HTMLAttributes<HTMLDivElement>}
            dragHandle={{
              onDragStart: (e) => {
                e.dataTransfer.setData(dragDataType, String(i));
                handleItemDragStart(i, e);
              },
              onDragEnd: handleItemDragEnd,
            }}
            orderBadge={
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-medium text-primary">
                {i + 1}
              </span>
            }
            style={getItemStyle(i)}
            className={`group flex items-center gap-3 rounded-xl border bg-card p-4 transition-all ${
              dragIndex === i
                ? "border-primary opacity-0"
                : "border-border hover:border-primary/40 hover:shadow-sm"
            }`}
          />
        ))}
      </div>

      <button
        type="button"
        onClick={openFilePicker}
        onDragOver={dropZoneHandlers.onDragOver}
        onDragLeave={dropZoneHandlers.onDragLeave}
        onDrop={dropZoneHandlers.onDrop}
        className={`mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed py-3 text-sm transition-all ${
          isDragOver
            ? "border-primary bg-accent/30 text-primary"
            : "border-border bg-card/50 text-muted-foreground hover:border-primary hover:text-primary"
        }`}
      >
        <PlusCircleIcon />
        {labels.addMoreFiles}
      </button>
    </>
  );
}
