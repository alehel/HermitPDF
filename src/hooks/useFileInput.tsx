"use client";

import { type ReactNode, useCallback, useRef } from "react";

interface UseFileInputOptions {
  multiple?: boolean;
  ariaLabel?: string;
}

export function useFileInput(
  onFilesAdded: (files: FileList) => void,
  options?: UseFileInputOptions
) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length > 0) {
        onFilesAdded(e.target.files);
        e.target.value = "";
      }
    },
    [onFilesAdded]
  );

  const openFilePicker = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const fileInput: ReactNode = (
    <input
      ref={fileInputRef}
      type="file"
      accept=".pdf,application/pdf"
      multiple={options?.multiple ?? false}
      className="hidden"
      onChange={handleFileInput}
      aria-label={options?.ariaLabel}
    />
  );

  return { fileInput, openFilePicker };
}
