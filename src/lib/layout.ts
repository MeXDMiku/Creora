/**
 * Where a block sits, on the size of screen it is being looked at.
 *
 * WHAT THIS DELIBERATELY IS NOT
 * It is not containers, stacking contexts and flex rules. That is the thing
 * everybody means by "a layout model", and building it here would be building
 * Webflow: it imposes a paradigm, and Creora's premise is the opposite one --
 * somebody brings a design and Creora attaches behaviour behind it. A system
 * that reflows their design into stacks is fighting the product.
 *
 * It is also, practically, a rewrite of dragging and selection, which is the
 * expensive and browser-dependent half. Nothing here touches the drag system.
 * What changes is which key the drag writes to.
 *
 * THE MODEL
 * Absolute positioning stays, and becomes per screen size.
 *
 *   1. A phone placement INHERITS the desktop one, field by field. Override the
 *      x and keep the width, if that is all that is wrong.
 *   2. A block never placed on a phone is AUTOMATIC: it stacks in reading order
 *      with everything else that was never placed.
 *   3. The moment a builder moves it on a phone it stops being automatic.
 *
 * Auto by default, authored the instant you touch it. A default is never a
 * ceiling, applied to position.
 */

export interface BlockLayout {
  x: number;
  y: number;
  /** Optional override; blocks otherwise size themselves from their own state. */
  width?: number;
  height?: number;
  /** Present on this screen size at all. */
  hidden?: boolean;
}

/**
 * What is stored for a block. `phone` is partial on purpose -- the absence of a
 * field means "inherit", and the absence of x AND y means "never placed here,
 * stack me".
 */
export interface BlockPlacement extends BlockLayout {
  phone?: Partial<BlockLayout>;
}

export type Breakpoint = 'base' | 'phone';

/** Below this, a page is a phone. Above it, it is what the builder drew. */
export const PHONE_MAX_WIDTH = 640;

/** The column an automatic phone layout stacks into. */
export const PHONE_GUTTER = 16;
export const PHONE_STACK_GAP = 16;

export function breakpointForWidth(viewportWidth: number): Breakpoint {
  return viewportWidth <= PHONE_MAX_WIDTH ? 'phone' : 'base';
}

/** Has this block been given a place of its own on a phone? */
export function isPlacedOnPhone(placement: BlockPlacement | null | undefined): boolean {
  const phone = placement?.phone;
  if (!phone) return false;
  return typeof phone.x === 'number' && typeof phone.y === 'number';
}

/**
 * The placement to draw with, for one block, at one screen size.
 *
 * Field-by-field inheritance rather than all-or-nothing. A builder who nudges a
 * block left on a phone should not also have to restate its width, and a design
 * where overriding one thing silently resets four others is a design people
 * stop trusting.
 */
export function resolveLayout(
  placement: BlockPlacement | null | undefined,
  breakpoint: Breakpoint
): BlockLayout {
  const base: BlockLayout = {
    x: placement?.x ?? 0,
    y: placement?.y ?? 0,
    width: placement?.width,
    height: placement?.height,
    hidden: placement?.hidden,
  };
  if (breakpoint === 'base' || !placement?.phone) return base;

  const phone = placement.phone;
  return {
    x: phone.x ?? base.x,
    y: phone.y ?? base.y,
    width: phone.width ?? base.width,
    height: phone.height ?? base.height,
    hidden: phone.hidden ?? base.hidden,
  };
}

export interface StackItem {
  id: string;
  placement: BlockPlacement;
  /** Measured or assumed, used only for the column-grouping heuristic. */
  width: number;
  /** Measured or assumed, used to leave room when stacking. */
  height: number;
}

/**
 * The order automatic blocks stack in on a phone.
 *
 * Column by column, then down each column -- not simply top-to-bottom. A page
 * laid out as two columns reads as "everything in the left column, then
 * everything in the right", and sorting by y alone interleaves them into
 * nonsense: label, label, value, value.
 *
 * Two blocks belong to the same column when one starts before the previous one
 * ends. That is a heuristic and it is allowed to be, because the builder can
 * override any of it by placing the block themselves -- which is the entire
 * point of the model.
 */
export function stackOrder(items: StackItem[]): string[] {
  const measured = items.map((item) => ({
    id: item.id,
    x: item.placement.x ?? 0,
    y: item.placement.y ?? 0,
    right: (item.placement.x ?? 0) + item.width,
  }));

  measured.sort((a, b) => a.x - b.x || a.y - b.y);

  const columns: (typeof measured)[] = [];
  let current: typeof measured = [];
  let currentRight = -Infinity;
  for (const m of measured) {
    if (current.length === 0 || m.x < currentRight) {
      current.push(m);
      currentRight = Math.max(currentRight, m.right);
    } else {
      columns.push(current);
      current = [m];
      currentRight = m.right;
    }
  }
  if (current.length) columns.push(current);

  return columns.flatMap((col) =>
    [...col].sort((a, b) => a.y - b.y || a.x - b.x).map((m) => m.id)
  );
}

export interface PageLayout {
  /** Blocks with real coordinates, drawn absolutely. */
  placed: Record<string, BlockLayout>;
  /** Blocks with no place of their own, in the order they should stack. */
  auto: string[];
  /** Hidden-ness, resolved for every block whether placed or automatic. */
  hidden: Record<string, boolean>;
}

/**
 * The whole answer for a page at one screen size.
 *
 * Automatic blocks come back as an ORDER, not as coordinates.
 *
 * That distinction was a correction. The first version of this returned
 * fabricated y positions computed from assumed heights -- and heights are the
 * one thing nothing here knows. A Text label is however tall its text made it.
 * Inventing 40px and stacking on that arithmetic produces a page whose blocks
 * overlap by an amount nobody can predict, and it would have looked completely
 * reasonable in a test that supplied the heights.
 *
 * So the model says which blocks stack and in what order, and CSS -- which does
 * know how tall things are -- decides the pixels. Placed blocks keep the exact
 * coordinates the builder gave them.
 */
export function layoutPage(items: StackItem[], breakpoint: Breakpoint): PageLayout {
  const hidden: Record<string, boolean> = {};
  for (const item of items) {
    hidden[item.id] = !!resolveLayout(item.placement, breakpoint).hidden;
  }

  if (breakpoint === 'base') {
    const placed: Record<string, BlockLayout> = {};
    for (const item of items) placed[item.id] = resolveLayout(item.placement, 'base');
    return { placed, auto: [], hidden };
  }

  const placed: Record<string, BlockLayout> = {};
  const automatic: StackItem[] = [];
  for (const item of items) {
    if (isPlacedOnPhone(item.placement)) {
      placed[item.id] = resolveLayout(item.placement, 'phone');
    } else {
      automatic.push(item);
    }
  }

  return { placed, auto: stackOrder(automatic), hidden };
}
