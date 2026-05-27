"use client";

import { useEffect, useState } from "react";

/**
 * Returns `value` after it has been stable for `delayMs`. Used to coalesce
 * rapid input changes (typing, slider drags) before triggering expensive work.
 */
export function useDebouncedValue<T>(value: T, delayMs: number = 400): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(id);
  }, [value, delayMs]);

  return debounced;
}
