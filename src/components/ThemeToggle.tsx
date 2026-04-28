"use client";

import { useTheme } from "./ThemeProvider";
import { MoonIcon, SunIcon } from "./Icons";

export function ThemeToggle({
  className = "rounded-lg p-2 text-muted-foreground transition-colors hover:bg-border hover:text-foreground",
  title,
}: {
  className?: string;
  title?: string;
}) {
  const { theme, toggleTheme } = useTheme();
  return (
    <button
      type="button"
      onClick={toggleTheme}
      className={className}
      title={title}
      aria-label={title}
    >
      {theme === "light" ? <MoonIcon /> : <SunIcon />}
    </button>
  );
}
