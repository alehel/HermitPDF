"use client";

interface ResizeDividerProps {
  onMouseDown: (e: React.MouseEvent) => void;
}

export function ResizeDivider({ onMouseDown }: ResizeDividerProps) {
  return (
    <div
      className="group flex w-1.5 shrink-0 cursor-col-resize items-center justify-center"
      onMouseDown={onMouseDown}
    >
      <div className="h-full w-px bg-border transition-colors group-hover:w-0.5 group-hover:bg-primary" />
    </div>
  );
}
