import { PageStack, PageRef } from "./types";

/** Rearrange a page within a stack. Returns a new stack with same id. */
export function reorderPageInStack(
  stack: PageStack,
  fromIndex: number,
  toIndex: number
): PageStack {
  const pages = [...stack.pages];
  const [moved] = pages.splice(fromIndex, 1);
  const insertAt = toIndex > fromIndex ? toIndex - 1 : toIndex;
  pages.splice(insertAt, 0, moved);
  return { ...stack, pages };
}

/** Remove a page from a stack, creating a new single-page stack for it. */
export function extractPageFromStack(
  stack: PageStack,
  pageIndex: number
): { extracted: PageStack; remainder: PageStack | null } {
  const pageRef = stack.pages[pageIndex];
  const remaining = stack.pages.filter((_, i) => i !== pageIndex);

  const extracted: PageStack = {
    id: crypto.randomUUID(),
    pages: [pageRef],
    name: stack.name,
    size: 0,
  };

  const remainder: PageStack | null =
    remaining.length > 0
      ? { ...stack, pages: remaining }
      : null;

  return { extracted, remainder };
}

/** Insert pages into a stack at a given position. Returns updated stack with same id. */
export function insertPagesIntoStack(
  target: PageStack,
  sourcePages: PageRef[],
  insertAtIndex: number
): PageStack {
  const pages = [...target.pages];
  pages.splice(insertAtIndex, 0, ...sourcePages);
  return { ...target, pages };
}

/** Move a single page from one stack to another. */
export function movePageBetweenStacks(
  source: PageStack,
  sourcePageIndex: number,
  target: PageStack,
  insertAtPageIndex: number
): { updatedSource: PageStack | null; updatedTarget: PageStack } {
  const pageRef = source.pages[sourcePageIndex];
  const sourcePages = source.pages.filter((_, i) => i !== sourcePageIndex);
  const targetPages = [...target.pages];
  targetPages.splice(insertAtPageIndex, 0, pageRef);

  return {
    updatedSource: sourcePages.length > 0 ? { ...source, pages: sourcePages } : null,
    updatedTarget: { ...target, pages: targetPages },
  };
}
