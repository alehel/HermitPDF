import { type ReactNode } from "react";
import { DownloadIcon } from "./Icons";
import { WizardTitle } from "./WizardTitle";

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
  wide?: boolean;
  footer?: WizardFooterProps;
  children: ReactNode;
}

export function WizardContainer({
  icon,
  title,
  badge,
  empty,
  wide,
  footer,
  children,
}: WizardContainerProps) {
  const maxWidth = wide ? "max-w-xl lg:max-w-6xl" : "max-w-xl";
  return (
    <>
      <main className={`flex flex-1 flex-col items-center px-6 ${empty ? "justify-center pb-16" : "py-8"}`}>
        <div className={`w-full ${maxWidth}`}>
          <WizardTitle icon={icon} title={title} badge={badge} />
          {children}
        </div>
      </main>
      {footer && !empty && (
        <div className="border-t border-border bg-card px-6 py-4">
          <div className={`mx-auto flex ${maxWidth} flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4`}>
            <div className="text-sm text-muted-foreground">{footer.statusText}</div>
            <button
              type="button"
              onClick={footer.onButtonClick}
              disabled={footer.disabled}
              className="flex items-center justify-center gap-2 rounded-xl bg-primary px-6 py-3 font-medium text-primary-foreground transition-all hover:shadow-lg disabled:opacity-60"
            >
              {footer.buttonIcon ?? <DownloadIcon />}
              {footer.buttonLabel}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
