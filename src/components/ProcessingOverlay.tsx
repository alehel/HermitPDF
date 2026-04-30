"use client";

import { type ReactNode } from "react";

interface ProcessingOverlayProps {
  visible: boolean;
  title: ReactNode;
  description?: ReactNode;
}

export function ProcessingOverlay({ visible, title, description }: ProcessingOverlayProps) {
  if (!visible) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 backdrop-blur-sm"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="mx-4 flex max-w-sm flex-col items-center gap-4 rounded-2xl border border-border bg-card px-8 py-6 shadow-xl">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-muted-foreground border-t-primary" />
        <div className="text-center">
          <p className="text-sm font-medium text-foreground">{title}</p>
          {description && (
            <p className="mt-1 text-xs text-muted-foreground">{description}</p>
          )}
        </div>
      </div>
    </div>
  );
}
