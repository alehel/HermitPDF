"use client";

import { useCallback, useState } from "react";
import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { PlusCircleIcon } from "@/components/Icons";
import { FileCard } from "@/components/FileCard";
import type { WizardFile } from "@/lib/types";

interface SortableFileListProps {
  files: WizardFile[];
  onRemove: (id: string) => void;
  onReorder: (fromIndex: number, toIndex: number) => void;
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

interface SortableFileCardProps {
  file: WizardFile;
  index: number;
  formatSubtitle: (file: WizardFile) => string;
  onRemove: (id: string) => void;
  removeTitle?: string;
}

function SortableFileCard({
  file,
  index,
  formatSubtitle,
  onRemove,
  removeTitle,
}: SortableFileCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: file.id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0 : undefined,
    touchAction: "manipulation",
  };

  return (
    <FileCard
      ref={setNodeRef}
      name={file.name}
      subtitle={formatSubtitle(file)}
      onRemove={() => onRemove(file.id)}
      removeTitle={removeTitle}
      showDragHandle
      extraProps={{ ...attributes, ...listeners }}
      orderBadge={
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-medium text-primary">
          {index + 1}
        </span>
      }
      style={style}
      className="group flex touch-none select-none items-center gap-3 rounded-xl border border-border bg-card p-4 transition-shadow hover:border-primary/40 hover:shadow-sm"
    />
  );
}

export function SortableFileList({
  files,
  onRemove,
  onReorder,
  openFilePicker,
  isDragOver,
  dropZoneHandlers,
  formatSubtitle,
  labels,
}: SortableFileListProps) {
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(MouseSensor, {
      activationConstraint: { distance: 5 },
    }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 180, tolerance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragStart = useCallback((e: DragStartEvent) => {
    setActiveId(String(e.active.id));
  }, []);

  const handleDragEnd = useCallback(
    (e: DragEndEvent) => {
      setActiveId(null);
      const { active, over } = e;
      if (!over || active.id === over.id) return;
      const fromIndex = files.findIndex((f) => f.id === active.id);
      const toIndex = files.findIndex((f) => f.id === over.id);
      if (fromIndex === -1 || toIndex === -1) return;
      // onReorder expects a splice-style toIndex where the dragged item was already removed.
      // dnd-kit gives us the index in the current array — arrayMove semantics match splice
      // after removal, so we can pass toIndex directly.
      onReorder(fromIndex, toIndex);
    },
    [files, onReorder]
  );

  const handleDragCancel = useCallback(() => setActiveId(null), []);

  const activeFile = activeId ? files.find((f) => f.id === activeId) : null;
  const activeIndex = activeId ? files.findIndex((f) => f.id === activeId) : -1;

  return (
    <>
      <p className="mb-3 text-xs font-medium uppercase tracking-widest text-muted-foreground">
        {labels.dragToReorder}
      </p>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        <div
          className="space-y-2"
          onDragOver={dropZoneHandlers.onDragOver}
          onDragLeave={dropZoneHandlers.onDragLeave}
          onDrop={dropZoneHandlers.onDrop}
        >
          <SortableContext
            items={files.map((f) => f.id)}
            strategy={verticalListSortingStrategy}
          >
            {files.map((file, i) => (
              <SortableFileCard
                key={file.id}
                file={file}
                index={i}
                formatSubtitle={formatSubtitle}
                onRemove={onRemove}
              />
            ))}
          </SortableContext>
        </div>

        <DragOverlay>
          {activeFile ? (
            <FileCard
              name={activeFile.name}
              subtitle={formatSubtitle(activeFile)}
              onRemove={() => {}}
              showDragHandle
              orderBadge={
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-medium text-primary">
                  {activeIndex + 1}
                </span>
              }
              className="group flex scale-[1.02] items-center gap-3 rounded-xl border border-primary/40 bg-card p-4 shadow-xl"
            />
          ) : null}
        </DragOverlay>
      </DndContext>

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
