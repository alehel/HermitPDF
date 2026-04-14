import { type ReactNode } from "react";

interface WizardTitleProps {
  icon: ReactNode;
  title: string;
  badge?: ReactNode;
}

export function WizardTitle({ icon, title, badge }: WizardTitleProps) {
  return (
    <div className="mb-6 flex items-center justify-center gap-2">
      <div className="flex h-7 w-7 items-center justify-center rounded-md bg-accent text-primary">
        {icon}
      </div>
      <h1 className="text-lg font-medium text-foreground">{title}</h1>
      {badge}
    </div>
  );
}
