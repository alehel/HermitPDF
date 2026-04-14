import { type ReactNode } from "react";
import { WizardTitle } from "./WizardTitle";

interface WizardContainerProps {
  icon: ReactNode;
  title: string;
  badge?: ReactNode;
  empty?: boolean;
  maxWidth?: string;
  children: ReactNode;
}

export function WizardContainer({
  icon,
  title,
  badge,
  empty,
  maxWidth = "max-w-xl",
  children,
}: WizardContainerProps) {
  if (empty) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center px-6 pb-16">
        <WizardTitle icon={icon} title={title} badge={badge} />
        {children}
      </main>
    );
  }

  return (
    <main className="flex flex-1 flex-col items-center px-6 py-8">
      <div className={`w-full ${maxWidth}`}>
        <WizardTitle icon={icon} title={title} badge={badge} />
        {children}
      </div>
    </main>
  );
}
