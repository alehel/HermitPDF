"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Same-origin path of the PdfCraft web build, unpacked into public/pdfcraft/
 * by scripts/fetch-pdfcraft.mjs. index.html is named explicitly because
 * Next.js doesn't serve directory indexes from public/.
 */
const PDFCRAFT_SRC = "/pdfcraft/index.html";

type FrameWindow = Window & { wasmBindings?: unknown };

interface PdfCraftFrameProps {
  title: string;
  loadingLabel: string;
}

/**
 * Hosts the PdfCraft editor in an iframe. The app runs unmodified, in its
 * default (standalone) mode: Save and Export are ordinary browser downloads,
 * and nothing leaves the browser.
 */
export function PdfCraftFrame({ title, loadingLabel }: PdfCraftFrameProps) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [ready, setReady] = useState(false);

  // The frame's HTML loads quickly, but the ~59 MB wasm app takes a while to
  // download and start; its Trunk bootstrap sets `window.wasmBindings` once it
  // has. Poll for that instead of relying on the iframe's load event: on a
  // direct page load the server-rendered iframe can finish loading before
  // React hydrates and attaches onLoad, so that event may never be seen.
  useEffect(() => {
    if (ready) return;
    const id = setInterval(() => {
      try {
        const win = frameRef.current?.contentWindow as FrameWindow | null;
        if (win?.wasmBindings) setReady(true);
      } catch {
        // Not same-origin (shouldn't happen): don't keep the editor hidden.
        setReady(true);
      }
    }, 200);
    return () => clearInterval(id);
  }, [ready]);

  return (
    <div className="relative flex-1">
      <iframe
        ref={frameRef}
        src={PDFCRAFT_SRC}
        title={title}
        allow="fullscreen; clipboard-read; clipboard-write"
        allowFullScreen
        className="absolute inset-0 h-full w-full border-0"
      />
      {!ready && (
        <div
          className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-background"
          role="status"
          aria-live="polite"
          aria-busy="true"
        >
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted-foreground border-t-primary" />
          <p className="text-sm text-muted-foreground">{loadingLabel}</p>
        </div>
      )}
    </div>
  );
}
