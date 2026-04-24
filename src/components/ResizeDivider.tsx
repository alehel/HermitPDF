"use client";

interface ResizeDividerProps {
  onPointerDown: (e: React.PointerEvent) => void;
}

export function ResizeDivider({ onPointerDown }: ResizeDividerProps) {
  return (
    <div
      className="group flex w-3 shrink-0 cursor-col-resize touch-none items-center justify-center md:w-1.5"
      onPointerDown={onPointerDown}
      style={{ touchAction: "none" }}
    >
      <div className="h-full w-px bg-border transition-colors group-hover:w-0.5 group-hover:bg-primary" />
    </div>
  );
}
