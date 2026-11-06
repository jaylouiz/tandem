// Edge auto-scroll while a Card drag is held near the Board's edge (#49); grouped by repo the sticky head row sits over its top edge.

/** How close to an edge (px) the pointer starts the scroll, and the speed (px/s) at the edge itself. */
export const EDGE = 56;
export const MAX_SPEED = 900;

export interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** Speed on one axis: 0 outside the zone, rising with the square of how far into it the pointer is (a gentle start), full at and beyond the edge. Negative = towards `lo`. */
export function axisSpeed(p: number, lo: number, hi: number): number {
  const into = (d: number) => Math.min(1, Math.max(0, (EDGE - d) / EDGE)) ** 2;
  return into(hi - p) * MAX_SPEED - into(p - lo) * MAX_SPEED;
}

/** The scroll velocity (px/s) for a pointer at x/y over the scroll area `box`. `headH` is the sticky head row over its top: the zone starts below it, measured from the area's edge. */
export function edgeVelocity(x: number, y: number, box: Box, headH = 0): { x: number; y: number } {
  return { x: axisSpeed(x, box.left, box.right), y: axisSpeed(y, box.top + headH, box.bottom) };
}

/**
 * Scrolls the Board while the pointer is held at its edge. `pointer()` is read every frame. The column under a still pointer changes
 * with each scroll: the caller listens for the scroll event. Returns the stop function.
 */
export function autoScroll(pointer: () => { x: number; y: number }): () => void {
  let raf = 0;
  let last = 0;
  let carry = { x: 0, y: 0 }; // fractions of a pixel that a frame could not scroll
  const frame = (t: number) => {
    raf = requestAnimationFrame(frame);
    const dt = last ? Math.min(t - last, 50) / 1000 : 0; // a stalled frame does not jump
    last = t;
    const scroller = document.querySelector<HTMLElement>(".board")?.closest<HTMLElement>(".scroll");
    if (!scroller || !dt) return;
    const { x, y } = pointer();
    const v = edgeVelocity(x, y, scroller.getBoundingClientRect(), document.querySelector<HTMLElement>(".board-heads")?.offsetHeight ?? 0);
    if (!v.x && !v.y) {
      carry = { x: 0, y: 0 };
      return;
    }
    const want = { x: carry.x + v.x * dt, y: carry.y + v.y * dt };
    const dx = Math.trunc(want.x);
    const dy = Math.trunc(want.y);
    carry = { x: want.x - dx, y: want.y - dy };
    if (!dx && !dy) return;
    scroller.scrollBy({ left: dx, top: dy, behavior: "instant" });
  };
  raf = requestAnimationFrame(frame);
  return () => cancelAnimationFrame(raf);
}
