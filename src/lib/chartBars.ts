/**
 * Where the bars of a History Chart go.
 *
 * WHY THIS IS ITS OWN FILE
 * It was forty lines of arithmetic written out twice -- once in the editor's
 * block and once in the published renderer -- and arithmetic is the worst thing
 * to keep in two places. A rendering difference is visible. A geometry
 * difference is a chart that is subtly wrong in one of the two, which is the
 * shape nobody notices: a bar an eighth too tall reads as data.
 *
 * Nothing here draws. It answers "given these numbers and this box, where does
 * each bar sit", and the two renderers turn that into <rect>s.
 *
 * THE DECISIONS IT CARRIES, WHICH LOOK LIKE DETAILS AND ARE NOT
 *
 *  - the range always includes ZERO (`max(..., 1)` and `min(..., 0)`), so a
 *    chart of 100, 101, 102 does not draw as a full-height cliff. Bars measured
 *    from an arbitrary floor exaggerate every change, which is the classic way
 *    to make a chart lie without writing a wrong number.
 *  - a bar is never thinner than 2px, so a zero is a visible line rather than
 *    nothing at all. "No bar" and "a bar of zero" mean different things.
 *  - negatives hang BELOW the baseline rather than being flipped up, so a drop
 *    reads as a drop.
 */

export interface ChartBar {
  x: number;
  y: number;
  width: number;
  height: number;
  /** True when the value is below zero, so a renderer can colour it. */
  negative: boolean;
}

export interface ChartBox {
  width: number;
  height: number;
  /** Vertical breathing room, taken off the tallest bar. */
  padding: number;
}

/** The smallest a bar is ever drawn, so a zero is still a line. */
export const MIN_BAR_HEIGHT = 2;
/** The gap between bars. */
export const BAR_GAP = 2;

export function chartBars(history: number[] | undefined | null, box: ChartBox): ChartBar[] {
  const values = (history || []).filter(v => typeof v === 'number' && isFinite(v));
  if (values.length === 0) return [];

  // Zero is always in range. Without this a chart of 100, 101, 102 draws as a
  // full-height cliff and reads as a tripling.
  const maxVal = Math.max(...values, 1);
  const minVal = Math.min(...values, 0);
  const range = maxVal - minVal === 0 ? 1 : maxVal - minVal;

  const count = values.length;
  const barWidth = (box.width - (count - 1) * BAR_GAP) / count;
  const baselineY = box.height - ((0 - minVal) / range) * box.height;

  return values.map((value, index) => {
    let height = (Math.abs(value) / range) * (box.height - 2 * box.padding);
    if (height < MIN_BAR_HEIGHT) height = MIN_BAR_HEIGHT;

    // Negatives hang below the baseline. Flipping them up would draw a fall as
    // a rise, which is worse than not drawing it.
    const negative = value < 0;
    const y = negative ? baselineY : baselineY - height;

    return { x: index * (barWidth + BAR_GAP), y, width: barWidth, height, negative };
  });
}
