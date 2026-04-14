export interface ItemRect {
  top: number;
  bottom: number;
  left: number;
  right: number;
  width: number;
  height: number;
  midX: number;
  midY: number;
}

/**
 * Given cached bounding rects, determines the drop index based on cursor
 * position. Works for both list (vertical) and grid (2D) layouts.
 */
export function calcDropIndex(
  rects: ItemRect[],
  itemCount: number,
  layout: "list" | "grid",
  clientX: number,
  clientY: number
): number {
  if (rects.length === 0) return itemCount;

  if (layout === "grid") {
    for (let i = 0; i < rects.length; i++) {
      const r = rects[i];
      if (clientY < r.top) return i;
      if (clientY < r.bottom && clientX < r.midX) return i;
    }
    return itemCount;
  }

  for (let i = 0; i < rects.length; i++) {
    if (clientY < rects[i].midY) return i;
  }
  return itemCount;
}

/**
 * Snapshots bounding rects from a container's child elements matching a selector.
 */
export function snapshotItemRects(
  container: HTMLElement,
  selector: string
): ItemRect[] {
  const items = container.querySelectorAll(selector);
  return Array.from(items).map((el) => {
    const r = el.getBoundingClientRect();
    return {
      top: r.top,
      bottom: r.bottom,
      left: r.left,
      right: r.right,
      width: r.width,
      height: r.height,
      midX: r.left + r.width / 2,
      midY: r.top + r.height / 2,
    };
  });
}

/**
 * Computes per-item {x, y} translate offsets so that items visually shift
 * to create a gap at `dropIndex` while filling the gap left by `dragIndex`.
 * Returns null for the dragged item itself.
 */
export function calcItemTransforms(
  rects: ItemRect[],
  dragIndex: number,
  dropIndex: number,
  layout: "list" | "grid"
): Array<{ x: number; y: number } | null> {
  const n = rects.length;
  if (n === 0) return [];

  const effectiveDropIndex =
    dragIndex < dropIndex ? dropIndex - 1 : dropIndex;

  const result: Array<{ x: number; y: number } | null> = new Array(n);

  // No movement needed — item dropping back in its own slot
  if (effectiveDropIndex === dragIndex) {
    for (let i = 0; i < n; i++) result[i] = i === dragIndex ? null : { x: 0, y: 0 };
    return result;
  }

  // When the last item needs to shift one slot forward, there is no DOM
  // element at that position to read coordinates from. We extrapolate a
  // virtual slot by projecting the delta between the last two items.
  // For a single-item list, we place the virtual slot directly below.
  let extraSlotLeft = 0;
  let extraSlotTop = 0;
  if (n >= 2) {
    const last = rects[n - 1];
    const prev = rects[n - 2];
    extraSlotLeft = last.left + (last.left - prev.left);
    extraSlotTop = last.top + (last.top - prev.top);
  } else {
    extraSlotLeft = rects[0].left;
    extraSlotTop = rects[0].top + rects[0].height;
  }

  for (let i = 0; i < n; i++) {
    if (i === dragIndex) {
      result[i] = null;
      continue;
    }

    // Map each item to its visual slot position:
    // 1) Items after the dragged item shift back to close its vacated gap
    // 2) Items at or after the drop target shift forward to open a gap
    let slot = i;
    if (i > dragIndex) slot -= 1;
    if (slot >= effectiveDropIndex) slot += 1;

    let targetLeft: number;
    let targetTop: number;
    if (slot < n) {
      targetLeft = rects[slot].left;
      targetTop = rects[slot].top;
    } else {
      targetLeft = extraSlotLeft;
      targetTop = extraSlotTop;
    }

    if (layout === "list") {
      result[i] = { x: 0, y: targetTop - rects[i].top };
    } else {
      result[i] = {
        x: targetLeft - rects[i].left,
        y: targetTop - rects[i].top,
      };
    }
  }

  return result;
}
