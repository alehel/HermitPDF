"use client";

import { useCallback, useState } from "react";
import { PageStack } from "@/lib/types";
import { extractImagesFromPage, extractImagesFromDocument } from "@/lib/mupdfClient";
import { downloadImages } from "@/lib/imageExport";
import type { ExtractedImage } from "@/lib/types";

interface UseImageExtractionOptions {
  stacksRef: React.RefObject<PageStack[]>;
  focusedPageId: string | null;
}

interface UseImageExtractionResult {
  isExtracting: boolean;
  noImagesFound: boolean;
  clearNoImagesFound: () => void;
  handleExtractPageImages: (stackId: string, pageIndex: number) => Promise<void>;
  handleExtractStackImages: (stackId: string) => Promise<void>;
  handleExtractAllImages: () => Promise<void>;
  handleExtractFocusedPage: () => Promise<void>;
}

export function useImageExtraction({
  stacksRef,
  focusedPageId,
}: UseImageExtractionOptions): UseImageExtractionResult {
  const [isExtracting, setIsExtracting] = useState(false);
  const [noImagesFound, setNoImagesFound] = useState(false);

  /**
   * Wraps an image extraction operation with loading and empty-result state.
   * Every extraction follows the same lifecycle: set loading, clear previous
   * "no images" state, run the operation, then clear loading on completion.
   */
  const withExtractionState = useCallback(
    async (
      extract: () => Promise<ExtractedImage[]>,
      download: (images: ExtractedImage[]) => void
    ) => {
      setIsExtracting(true);
      setNoImagesFound(false);
      try {
        const images = await extract();
        if (images.length === 0) {
          setNoImagesFound(true);
        } else {
          download(images);
        }
      } finally {
        setIsExtracting(false);
      }
    },
    []
  );

  const handleExtractPageImages = useCallback(
    async (stackId: string, pageIndex: number) => {
      const stack = stacksRef.current.find((s) => s.id === stackId);
      if (!stack) return;
      const pageRef = stack.pages[pageIndex];
      if (!pageRef) return;

      await withExtractionState(
        () => extractImagesFromPage(pageRef.sourceDocId, pageRef.sourcePageIndex),
        (images) => downloadImages(images, stack.name)
      );
    },
    [stacksRef, withExtractionState]
  );

  const handleExtractStackImages = useCallback(
    async (stackId: string) => {
      const stack = stacksRef.current.find((s) => s.id === stackId);
      if (!stack) return;

      await withExtractionState(
        async () => {
          const uniqueDocs = [...new Set(stack.pages.map((p) => p.sourceDocId))];
          const allImages: ExtractedImage[] = [];
          for (const docId of uniqueDocs) {
            const images = await extractImagesFromDocument(docId);
            allImages.push(...images);
          }
          return allImages;
        },
        (images) => downloadImages(images, stack.name)
      );
    },
    [stacksRef, withExtractionState]
  );

  const handleExtractAllImages = useCallback(async () => {
    await withExtractionState(
      async () => {
        const uniqueDocIds = [
          ...new Set(stacksRef.current.flatMap((s) => s.pages.map((p) => p.sourceDocId))),
        ];
        const allImages: ExtractedImage[] = [];
        for (const docId of uniqueDocIds) {
          const images = await extractImagesFromDocument(docId);
          allImages.push(...images);
        }
        return allImages;
      },
      (images) => downloadImages(images, "all", true)
    );
  }, [stacksRef, withExtractionState]);

  const handleExtractFocusedPage = useCallback(async () => {
    if (!focusedPageId) return;
    for (const stack of stacksRef.current) {
      const idx = stack.pages.findIndex((p) => p.id === focusedPageId);
      if (idx !== -1) {
        await handleExtractPageImages(stack.id, idx);
        return;
      }
    }
  }, [focusedPageId, stacksRef, handleExtractPageImages]);

  return {
    isExtracting,
    noImagesFound,
    clearNoImagesFound: useCallback(() => setNoImagesFound(false), []),
    handleExtractPageImages,
    handleExtractStackImages,
    handleExtractAllImages,
    handleExtractFocusedPage,
  };
}
