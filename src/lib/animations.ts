/**
 * Animation presets.
 *
 * A value changing is already an event in the binding engine, so "animate when
 * this changes" is a property on a block rather than a timeline editor. One
 * primitive, many effects — the same shape as everything else here.
 *
 * Deliberately a short fixed list, not a free animation editor. Modern-looking
 * output comes from constraint: a handful of choices that cannot be combined
 * badly beats infinite freedom that requires skill. See docs/DIRECTION.md.
 */
export type AnimationPreset = 'none' | 'pulse' | 'flash' | 'rise' | 'shake';

export const ANIMATION_PRESETS: { id: AnimationPreset; label: string; hint: string }[] = [
  { id: 'none',  label: 'None',            hint: 'no animation' },
  { id: 'pulse', label: 'Pulse',           hint: 'grows briefly — good for counts' },
  { id: 'flash', label: 'Flash',           hint: 'brightens once — good for status' },
  { id: 'rise',  label: 'Rise',            hint: 'lifts and fades in — good for new rows' },
  { id: 'shake', label: 'Shake',           hint: 'nudges side to side — good for errors' },
];

/** Must match the CSS in index.css. */
export const ANIMATION_DURATION_MS = 460;

export function animationClass(preset: string | undefined | null): string | null {
  if (!preset || preset === 'none') return null;
  return ANIMATION_PRESETS.some((p) => p.id === preset) ? `creora-anim-${preset}` : null;
}
