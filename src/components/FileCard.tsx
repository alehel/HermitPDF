import { type CSSProperties, type HTMLAttributes, type ReactNode, type Ref } from "react";
import { FileDocIcon, GripIcon, TrashIcon } from "./Icons";

interface FileCardProps {
  name: string;
  subtitle: string;
  onRemove: () => void;
  removeTitle?: string;
  showDragHandle?: boolean;
  orderBadge?: ReactNode;
  className?: string;
  style?: CSSProperties;
  ref?: Ref<HTMLDivElement>;
  extraProps?: HTMLAttributes<HTMLDivElement>;
}

export function FileCard({
  name,
  subtitle,
  onRemove,
  removeTitle,
  showDragHandle,
  orderBadge,
  className = "group flex items-center gap-3 rounded-xl border border-border bg-card p-4",
  style,
  ref,
  extraProps,
}: FileCardProps) {
  return (
    <div ref={ref} className={className} style={style} {...extraProps}>
      {showDragHandle && (
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
        onPointerDown={(e) => e.stopPropagation()}
        className="rounded-lg p-1.5 text-muted-foreground opacity-60 transition-all hover:bg-red-500/10 hover:text-red-500 md:opacity-0 md:group-hover:opacity-100"
        title={removeTitle}
      >
        <TrashIcon />
      </button>
    </div>
  );
}
