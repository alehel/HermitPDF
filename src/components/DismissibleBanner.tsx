"use client";

interface DismissibleBannerProps {
  message: string;
  dismissLabel: string;
  onDismiss: () => void;
}

export function DismissibleBanner({
  message,
  dismissLabel,
  onDismiss,
}: DismissibleBannerProps) {
  return (
    <div role="status" aria-live="polite" className="flex items-center justify-between bg-accent px-4 py-2">
      <p className="text-xs text-foreground">{message}</p>
      <button
        type="button"
        onClick={onDismiss}
        className="ml-4 shrink-0 text-xs font-medium text-primary hover:underline"
      >
        {dismissLabel}
      </button>
    </div>
  );
}
