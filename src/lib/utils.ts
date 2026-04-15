import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Subtle checkerboard background style for PDF preview areas. */
export const checkerboardStyle: React.CSSProperties = {
  backgroundImage:
    "repeating-conic-gradient(#e5e7eb 0% 25%, #f3f4f6 0% 50%)",
  backgroundSize: "16px 16px",
};

