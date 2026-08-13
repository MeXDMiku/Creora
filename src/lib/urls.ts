/**
 * One answer to "may this address go in a page?".
 *
 * WHY THIS FILE EXISTS
 * There were three answers, and they disagreed. sanitizeHtml.ts had a denylist
 * that rejected javascript:, vbscript: and non-image data: URLs. images.ts had
 * an allowlist that permitted http, https, blob and data:image and refused
 * everything else. The Image block had a third, implicit one: whatever the
 * browser did with whatever it was handed.
 *
 * A denylist and an allowlist for the same question will always drift, and the
 * denylist had a hole worth the whole file: it compared against a trimmed,
 * lowercased string but never removed control characters, so
 *
 *     <a href="java&#10;script:alert(1)">
 *
 * decoded to an attribute containing a real newline, did not start with
 * "javascript:", passed, and then ran -- because browsers strip whitespace out
 * of a scheme before acting on it.
 *
 * Allowlist, control characters removed first, one file.
 */

/**
 * Anything a browser will ignore when reading a scheme, and therefore anything
 * an attacker can hide inside one: NUL through space, plus the delete
 * character and the zero-width and BOM characters that survive a copy-paste.
 */
const IGNORABLE = /[\u0000-\u0020\u007f\u00a0\u200b-\u200f\u2028\u2029\ufeff]/g;
const SCHEME = /^([a-z][a-z0-9+.\-]*):/i;
const LOOKS_LIKE_DOMAIN = /^[^\s/]+\.[^\s/]+/;

/** The schemes that may appear in a page Creora renders. */
export const SAFE_SCHEMES = ['http', 'https', 'mailto', 'tel', 'blob'] as const;

/**
 * Remove what a browser would ignore anyway.
 *
 * This runs before every other decision in this file. It is the difference
 * between checking the address a person sees and checking the address the
 * browser will actually act on.
 */
export function stripIgnorable(value: string): string {
  return value.replace(IGNORABLE, '');
}

/** The scheme, lowercased, or null when the address does not carry one. */
export function schemeOf(value: string | null | undefined): string | null {
  if (!value) return null;
  const match = SCHEME.exec(stripIgnorable(String(value)).trim());
  return match ? match[1].toLowerCase() : null;
}

export interface SafeUrlOptions {
  /**
   * Allow `data:image/...`. True where a picture is expected, false in an
   * href -- an inline image is a legitimate picture and a strange link.
   */
  allowInlineImages?: boolean;
  /**
   * Read a bare `example.com/a.png` as an https address rather than as a
   * relative path. What people paste, and never what a page's own markup means.
   */
  assumeHttps?: boolean;
}

/**
 * The address as it may safely be used, or null if it may not be used at all.
 *
 * Returning the cleaned address rather than a boolean is deliberate: a caller
 * that asks "is this safe?" and then uses the original string has checked one
 * value and rendered another, which is how the control-character hole worked.
 * Here there is nothing to use except the answer.
 */
export function safeUrl(
  raw: string | null | undefined,
  options: SafeUrlOptions = {}
): string | null {
  if (raw === null || raw === undefined) return null;
  const cleaned = stripIgnorable(String(raw)).trim();
  if (cleaned === '') return null;

  const scheme = schemeOf(cleaned);

  if (scheme) {
    if ((SAFE_SCHEMES as readonly string[]).includes(scheme)) return cleaned;
    if (scheme === 'data') {
      return options.allowInlineImages && /^data:image\//i.test(cleaned) ? cleaned : null;
    }
    return null;
  }

  // No scheme. Site-relative, protocol-relative and fragment addresses are
  // ordinary markup and cannot change where the page's trust lies.
  if (cleaned.startsWith('/') || cleaned.startsWith('#') || cleaned.startsWith('?')) return cleaned;

  if (options.assumeHttps && LOOKS_LIKE_DOMAIN.test(cleaned)) return 'https://' + cleaned;

  // A plain relative path such as "images/logo.png".
  return cleaned;
}

/** True when the address may be used as-is. Prefer safeUrl, which hands it back cleaned. */
export function isSafeUrlValue(raw: string | null | undefined, options: SafeUrlOptions = {}): boolean {
  // An absent or empty address is not dangerous - it is simply nothing.
  if (raw === null || raw === undefined || String(raw).trim() === '') return true;
  return safeUrl(raw, options) !== null;
}
