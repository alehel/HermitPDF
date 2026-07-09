import type { PageRef } from "./types";

/**
 * Interleave the pages of two documents into a single ordered list.
 *
 * The result alternates one page from each source — `a[0]`, `b[0]`, `a[1]`,
 * `b[1]`, … This is the classic collation used to reassemble a double-sided
 * document scanned in two passes (all fronts, then all backs).
 *
 * When the two documents have different page counts, the leftover pages of the
 * longer document are appended, in order, after the interleaved run.
 *
 * `reverseSecond` reverses the second document before interleaving. Duplex
 * scanners often produce the back sides in reverse order (last sheet first), so
 * reversing `b` puts each back page next to its matching front.
 */
export function interleavePages(
  a: PageRef[],
  b: PageRef[],
  options?: { reverseSecond?: boolean }
): PageRef[] {
  const second = options?.reverseSecond ? [...b].reverse() : b;
  const result: PageRef[] = [];
  const max = Math.max(a.length, second.length);
  for (let i = 0; i < max; i++) {
    if (i < a.length) result.push(a[i]);
    if (i < second.length) result.push(second[i]);
  }
  return result;
}
