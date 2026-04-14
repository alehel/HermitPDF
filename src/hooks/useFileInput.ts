"use client";

import { useCallback, useRef } from "react";

export function useFileInput(onFilesAdded: (files: FileList) => void) {
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

  return { fileInputRef, handleFileInput, openFilePicker };
}
