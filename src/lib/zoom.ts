/**
 * Seeing all of a page at once, and moving around one bigger than the window.
 *
 * WHY THIS IS NOT A NICE-TO-HAVE
 * Blocks sit at absolute coordinates on a canvas with no zoom and no way to
 * pan. A page laid out wider than the window has parts of itself that cannot be
 * reached at all -- which is the same class of problem as the Configure Action
 * popup running off the bottom of the screen, and the owner reported both in
 * the same breath. The reference node editor he sent has `- + Fit Reset 72%`
 * in its corner for exactly this reason.
 *
 * Everything here is arithmetic and therefore checkable. The rendering is one
 * CSS transform on the block layer.
 */

export const MIN_ZOOM = 0.25;
export const MAX_ZOOM = 2;

/** The steps the - and + buttons walk, so zooming is predictable rather than smooth-and-vague. */
const STEPS = [0.25, 0.33, 0.5, 0.67, 0.75, 1, 1.25, 1.5, 2];

export function clampZoom(zoom: number): number {
  if (!isFinite(zoom)) return 1;
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
}

/**
 * The next step up or down.
 *
 * Snapping to a list rather than multiplying by 1.2 means the numbers a builder
 * sees are the round ones -- 50%, 75%, 100% -- and pressing + then - returns
 * you exactly where you were, which multiplying does not.
 */
export function stepZoom(current: number, direction: 1 | -1): number {
  const now = clampZoom(current);
  if (direction > 0) {
    for (const step of STEPS) if (step > now + 0.001) return step;
    return MAX_ZOOM;
  }
  for (let i = STEPS.length - 1; i >= 0; i--) {
    if (STEPS[i] < now - 0.001) return STEPS[i];
  }
  return MIN_ZOOM;
}

export interface Extent {
  right: number;
  bottom: number;
}

/**
 * How far the content actually reaches.
 *
 * Widths come from the block's own setting where it has one and a per-type
 * fallback otherwise; heights are unknown, as always, so a generous constant is
 * used. Fit is allowed to be approximate -- it exists so somebody can SEE
 * everything, not so it can be pixel-perfect.
 */
export function contentExtent(
  blocks: { x: number; y: number; width?: number; height?: number }[]
): Extent {
  let right = 0;
  let bottom = 0;
  for (const block of blocks) {
    right = Math.max(right, (block.x || 0) + (block.width ?? 200));
    bottom = Math.max(bottom, (block.y || 0) + (block.height ?? 120));
  }
  return { right, bottom };
}

/**
 * The zoom at which everything fits, with a margin.
 *
 * Never zooms IN to fill the window: a page with three blocks on it blown up to
 * 200% is disorienting and looks broken. Fit means "I can see all of it", and
 * when it already fits, the answer is 100%.
 */
export function zoomToFit(extent: Extent, viewport: { width: number; height: number }, margin = 48): number {
  const usableWidth = Math.max(1, viewport.width - margin);
  const usableHeight = Math.max(1, viewport.height - margin);
  if (extent.right <= 0 || extent.bottom <= 0) return 1;
  const fit = Math.min(usableWidth / extent.right, usableHeight / extent.bottom);
  return clampZoom(Math.min(1, fit));
}

/** For the label. 0.6666 -> "67%". */
export function zoomLabel(zoom: number): string {
  return Math.round(clampZoom(zoom) * 100) + '%';
}

/**
 * Where a pointer really is, once the canvas has been scaled.
 *
 * A drag reads the cursor position relative to the container and writes it
 * straight into a block's coordinates. With a transform applied those are two
 * different coordinate systems, and without this every drag at anything other
 * than 100% would put the block somewhere the cursor is not -- further out the
 * further from the origin, which reads as "dragging is broken" rather than as
 * "there is a zoom".
 */
export function toCanvasPoint(
  clientOffset: { x: number; y: number },
  zoom: number
): { x: number; y: number } {
  const scale = clampZoom(zoom);
  return { x: clientOffset.x / scale, y: clientOffset.y / scale };
}
