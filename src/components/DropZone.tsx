import { UploadCloudIcon } from "./Icons";

interface DropZoneProps {
  title: string;
  subtitle: string;
  privacyNote: string;
  onClick: () => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDragLeave?: (e: React.DragEvent) => void;
  onDrop?: (e: React.DragEvent) => void;
  isDragOver?: boolean;
  fill?: boolean;
}

export function DropZone({
  title,
  subtitle,
  privacyNote,
  onClick,
  onDragOver,
  onDragLeave,
  onDrop,
  isDragOver = false,
  fill = false,
}: DropZoneProps) {
  return (
    <div className={`flex flex-col items-center justify-center ${fill ? "h-full" : ""}`}>
      <button
        type="button"
        onClick={onClick}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        className={`group flex w-full flex-col items-center gap-4 rounded-2xl border-2 border-dashed px-8 transition-all ${
          fill
            ? "flex-1 justify-center"
            : "max-w-lg py-14"
        } ${
          isDragOver
            ? "border-primary bg-accent/30"
            : "border-border bg-card/50 hover:border-primary hover:bg-accent/30"
        }`}
      >
        <UploadCloudIcon
          className={`transition-colors ${
            isDragOver
              ? "text-primary"
              : "text-muted-foreground group-hover:text-primary"
          }`}
        />
        <div className="text-center">
          <p className="font-medium text-foreground">{title}</p>
          <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
        </div>
      </button>
      <p className="mt-4 text-xs text-muted-foreground">{privacyNote}</p>
    </div>
  );
}
