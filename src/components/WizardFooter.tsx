import { type ReactNode } from "react";
import { DownloadIcon } from "./Icons";

interface WizardFooterProps {
  statusText: ReactNode;
  buttonLabel: string;
  onButtonClick: () => void;
  disabled?: boolean;
  buttonIcon?: ReactNode;
  maxWidth?: string;
}

export function WizardFooter({
  statusText,
  buttonLabel,
  onButtonClick,
  disabled,
  buttonIcon = <DownloadIcon />,
  maxWidth = "max-w-xl",
}: WizardFooterProps) {
  return (
    <footer className="border-t border-border bg-card px-6 py-4">
      <div className={`mx-auto flex ${maxWidth} items-center justify-between`}>
        <div className="text-sm text-muted-foreground">{statusText}</div>
        <button
          type="button"
          onClick={onButtonClick}
          disabled={disabled}
          className="flex items-center gap-2 rounded-xl bg-primary px-6 py-3 font-medium text-white transition-all hover:shadow-lg disabled:opacity-60"
        >
          {buttonIcon}
          {buttonLabel}
        </button>
      </div>
    </footer>
  );
}
