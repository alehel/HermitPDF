import { type ReactNode } from "react";
import { DownloadIcon } from "./Icons";
import { WizardTitle } from "./WizardTitle";

const MAX_WIDTH = "max-w-xl";

interface WizardFooterProps {
  statusText: ReactNode;
  buttonLabel: string;
  onButtonClick: () => void;
  disabled?: boolean;
  buttonIcon?: ReactNode;
}

interface WizardContainerProps {
  icon: ReactNode;
  title: string;
  badge?: ReactNode;
  empty?: boolean;
  footer?: WizardFooterProps;
  children: ReactNode;
}

export function WizardContainer({
  icon,
  title,
  badge,
  empty,
  footer,
  children,
}: WizardContainerProps) {
  if (empty) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center px-6 pb-16">
        <div className={`w-full ${MAX_WIDTH}`}>
          <WizardTitle icon={icon} title={title} badge={badge} />
          {children}
        </div>
      </main>
    );
  }

  return (
    <>
      <main className="flex flex-1 flex-col items-center px-6 py-8">
        <div className={`w-full ${MAX_WIDTH}`}>
          <WizardTitle icon={icon} title={title} badge={badge} />
          {children}
        </div>
      </main>
      {footer && (
        <footer className="border-t border-border bg-card px-6 py-4">
          <div className={`mx-auto flex ${MAX_WIDTH} items-center justify-between`}>
            <div className="text-sm text-muted-foreground">{footer.statusText}</div>
            <button
              type="button"
              onClick={footer.onButtonClick}
              disabled={footer.disabled}
              className="flex items-center gap-2 rounded-xl bg-primary px-6 py-3 font-medium text-white transition-all hover:shadow-lg disabled:opacity-60"
            >
              {footer.buttonIcon ?? <DownloadIcon />}
              {footer.buttonLabel}
            </button>
          </div>
        </footer>
      )}
    </>
  );
}
