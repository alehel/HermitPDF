import { type CSSProperties, type DragEvent, type HTMLAttributes, type ReactNode } from "react";
import { FileDocIcon, GripIcon, TrashIcon } from "./Icons";

interface FileCardProps {
  name: string;
  subtitle: string;
  onRemove: () => void;
  removeTitle?: string;
  dragHandle?: {
    onDragStart: (e: DragEvent) => void;
    onDragEnd: (e: DragEvent) => void;
  };
  orderBadge?: ReactNode;
  className?: string;
  style?: CSSProperties;
  extraProps?: HTMLAttributes<HTMLDivElement>;
}

export function FileCard({
  name,
  subtitle,
  onRemove,
  removeTitle,
  dragHandle,
  orderBadge,
  className = "group flex items-center gap-3 rounded-xl border border-border bg-card p-4",
  style,
  extraProps,
}: FileCardProps) {
  return (
    <div className={className} style={style} draggable={!!dragHandle} onDragStart={dragHandle?.onDragStart} onDragEnd={dragHandle?.onDragEnd} {...extraProps}>
      {dragHandle && (
        <div className="cursor-grab text-muted-foreground/50 transition-colors hover:text-muted-foreground active:cursor-grabbing">
          <GripIcon />
        </div>
      )}
      {orderBadge}
      <div className="text-primary">
        <FileDocIcon />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">{name}</p>
        <p className="text-xs text-muted-foreground">{subtitle}</p>
      </div>
      <button
        type="button"
        onClick={onRemove}
        className="rounded-lg p-1.5 text-muted-foreground opacity-0 transition-all hover:bg-red-500/10 hover:text-red-500 group-hover:opacity-100"
        title={removeTitle}
      >
        <TrashIcon />
      </button>
    </div>
  );
}
