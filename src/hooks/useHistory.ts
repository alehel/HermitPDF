import { useCallback, useRef, useState } from "react";
import { PageStack, PageRef } from "@/lib/types";

export interface HistorySnapshot {
  stacks: PageStack[];
  expandedStackIds: Set<string>;
}

const MAX_HISTORY = 50;

/** Collect a set of IDs from every page across all history snapshots. */
function collectIds(
  past: HistorySnapshot[],
  current: HistorySnapshot,
  future: HistorySnapshot[],
  extractId: (page: PageRef) => string
): Set<string> {
  const ids = new Set<string>();
  for (const snap of [...past, current, ...future]) {
    for (const stack of snap.stacks) {
      for (const page of stack.pages) {
        ids.add(extractId(page));
      }
    }
  }
  return ids;
}

export function useHistory(onEvict?: (evicted: HistorySnapshot) => void) {
  const [current, setCurrent] = useState<HistorySnapshot>({
    stacks: [],
    expandedStackIds: new Set(),
  });
  const [pastLength, setPastLength] = useState(0);
  const [futureLength, setFutureLength] = useState(0);

  const pastRef = useRef<HistorySnapshot[]>([]);
  const futureRef = useRef<HistorySnapshot[]>([]);
  // We maintain both React state (`current`) and a ref (`currentRef`) because
  // callbacks created with useCallback([]) need synchronous access to the
  // latest snapshot without re-creating the callback on every commit.
  // State drives re-renders; the ref is for stable callbacks.
  const currentRef = useRef(current);
  currentRef.current = current;
  const onEvictRef = useRef(onEvict);
  onEvictRef.current = onEvict;

  const commit = useCallback((next: HistorySnapshot) => {
    pastRef.current.push(currentRef.current);
    futureRef.current = [];

    if (pastRef.current.length > MAX_HISTORY) {
      const evicted = pastRef.current.shift()!;
      onEvictRef.current?.(evicted);
    }

    setCurrent(next);
    currentRef.current = next;
    setPastLength(pastRef.current.length);
    setFutureLength(0);
  }, []);

  const undo = useCallback((): HistorySnapshot | null => {
    if (pastRef.current.length === 0) return null;
    futureRef.current.push(currentRef.current);
    const restored = pastRef.current.pop()!;
    setCurrent(restored);
    currentRef.current = restored;
    setPastLength(pastRef.current.length);
    setFutureLength(futureRef.current.length);
    return restored;
  }, []);

  const redo = useCallback((): HistorySnapshot | null => {
    if (futureRef.current.length === 0) return null;
    pastRef.current.push(currentRef.current);
    const restored = futureRef.current.pop()!;
    setCurrent(restored);
    currentRef.current = restored;
    setPastLength(pastRef.current.length);
    setFutureLength(futureRef.current.length);
    return restored;
  }, []);

  const replace = useCallback((next: HistorySnapshot) => {
    setCurrent(next);
    currentRef.current = next;
  }, []);

  const allReferencedDocIds = useCallback(
    (): Set<string> =>
      collectIds(pastRef.current, currentRef.current, futureRef.current, (page) => page.sourceDocId),
    []
  );

  const allReferencedPageIds = useCallback(
    (): Set<string> =>
      collectIds(pastRef.current, currentRef.current, futureRef.current, (page) => page.id),
    []
  );

  return {
    current,
    commit,
    undo,
    redo,
    replace,
    canUndo: pastLength > 0,
    canRedo: futureLength > 0,
    allReferencedDocIds,
    allReferencedPageIds,
  };
}
