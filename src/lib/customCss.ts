import type { CSSProperties } from 'react';

/**
 * Let a builder write their own CSS for any block.
 *
 * The rule this encodes: **a default is a starting point, never a ceiling.**
 * Creora supplies sensible styling so somebody who is not a designer still gets
 * a modern-looking page -- and then gets out of the way for anyone who knows
 * exactly what they want.
 *
 * Declarations only, the inside of a rule:
 *   color: #e11d48; border: 2px solid gold; letter-spacing: 1px;
 *
 * Parsed into a style object and merged LAST, so it beats everything Creora
 * computed. No selectors, no @media, no injected stylesheet -- those can reach
 * outside the block and break the page around it. This is an escape hatch with
 * a fence, not a hole.
 */
export function parseCustomCss(css: string | undefined | null): CSSProperties {
  if (!css || typeof css !== 'string') return {};
  const out: Record<string, string> = {};

  for (const rawDecl of css.split(';')) {
    const decl = rawDecl.trim();
    if (!decl) continue;

    const colon = decl.indexOf(':');
    if (colon < 1) continue;

    const prop = decl.slice(0, colon).trim();
    const value = decl.slice(colon + 1).trim();
    if (!prop || !value) continue;

    // Anything with a brace is a selector or at-rule, not a declaration.
    if (/[{}]/.test(prop) || /[{}]/.test(value)) continue;

    // background-color -> backgroundColor;  --my-var stays as-is.
    const key = prop.startsWith('--')
      ? prop
      : prop.replace(/-([a-z])/g, (_, c) => c.toUpperCase());

    out[key] = value;
  }

  return out as CSSProperties;
}
