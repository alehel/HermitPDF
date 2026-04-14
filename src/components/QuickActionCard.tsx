import { type ReactNode } from "react";
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
  return (
    <Link
      href={href}
      className="group flex flex-1 flex-col items-center gap-2 rounded-xl border border-border bg-card px-4 py-6 transition-all hover:border-primary hover:shadow-md"
    >
      <div className="text-muted-foreground transition-colors group-hover:text-primary">
        {icon}
      </div>
      <span className="text-sm font-medium text-foreground">{title}</span>
      <span className="text-xs text-muted-foreground">{description}</span>
    </Link>
  );
}
