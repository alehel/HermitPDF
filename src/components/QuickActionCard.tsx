import { type ReactNode, useId } from "react";
import { Link } from "@/i18n/navigation";

interface QuickActionCardProps {
  href: string;
  icon: ReactNode;
  title: string;
  description: string;
}

export function QuickActionCard({
  href,
  icon,
  title,
  description,
}: QuickActionCardProps) {
  const descId = useId();
  return (
    <Link
      href={href}
      aria-label={title}
      aria-describedby={descId}
      className="group flex flex-1 flex-col items-center gap-2 rounded-xl border border-border bg-card px-4 py-4 transition-all hover:border-primary hover:shadow-md sm:py-6"
    >
      <div className="text-muted-foreground transition-colors group-hover:text-primary">
        {icon}
      </div>
      <span className="text-sm font-medium text-foreground">{title}</span>
      <span id={descId} className="hidden text-xs text-muted-foreground sm:inline">{description}</span>
    </Link>
  );
}
