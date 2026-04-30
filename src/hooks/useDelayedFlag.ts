"use client";

import { useEffect, useRef, useState } from "react";

interface DelayedFlagOptions {
  showAfterMs?: number;
  minDurationMs?: number;
}

/**
 * Mirrors a boolean flag with two safeguards:
 *   - delays turning ON until `active` has been true for `showAfterMs` (so brief
 *     operations never flash an indicator),
 *   - keeps the flag ON for at least `minDurationMs` once it appears (so a
 *     barely-late operation doesn't flash off after a few ms).
 */
export function useDelayedFlag(
  active: boolean,
  { showAfterMs = 500, minDurationMs = 500 }: DelayedFlagOptions = {}
): boolean {
  const [visible, setVisible] = useState(false);
  const shownAtRef = useRef<number | null>(null);

  useEffect(() => {
    let showTimer: ReturnType<typeof setTimeout> | null = null;
    let hideTimer: ReturnType<typeof setTimeout> | null = null;

    if (active && !visible) {
      showTimer = setTimeout(() => {
        shownAtRef.current = Date.now();
        setVisible(true);
      }, showAfterMs);
    } else if (!active && visible) {
      const shownAt = shownAtRef.current ?? Date.now();
      const remaining = Math.max(0, minDurationMs - (Date.now() - shownAt));
      if (remaining === 0) {
        shownAtRef.current = null;
        setVisible(false);
      } else {
        hideTimer = setTimeout(() => {
          shownAtRef.current = null;
          setVisible(false);
        }, remaining);
      }
    }

    return () => {
      if (showTimer) clearTimeout(showTimer);
      if (hideTimer) clearTimeout(hideTimer);
    };
  }, [active, visible, showAfterMs, minDurationMs]);

  return visible;
}
