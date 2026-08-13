/**
 * Everything about an image that can be decided without a network.
 *
 * WHY THIS FILE IS PURE
 * The parts of an upload that go wrong are almost never the transfer. They are
 * the file that is 40MB, the .heic from an iPhone that browsers will not show,
 * the pasted address with a stray space, and the "it silently did nothing"
 * that turns out to be a bucket nobody created. All of those can be decided
 * before a byte moves, which means they can be checked by `npm run check`
 * rather than by uploading things and watching.
 *
 * The one function that actually talks to storage lives in imageUpload.ts.
 */

/** What a browser will reliably draw. */
export const IMAGE_MIME_TYPES = [
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/avif',
  'image/svg+xml',
] as const;

/**
 * 5MB. Not a technical limit -- Supabase allows far more -- but a 12MP phone
 * photo dropped straight into a page is a four-second load on a phone, and the
 * builder will blame the page rather than the photo. The number is here, in one
 * place, so raising it is a decision rather than an edit in six files.
 */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/** The one bucket. Named in the setup doc; changing it means changing both. */
export const IMAGE_BUCKET = 'creora-images';

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return bytes + ' bytes';
  if (bytes < 1024 * 1024) return Math.round(bytes / 1024) + 'KB';
  return (bytes / (1024 * 1024)).toFixed(1) + 'MB';
}

/** The shape of a File, without needing the DOM to say so. */
export interface PickedFile {
  name: string;
  type: string;
  size: number;
}

/**
 * Refuse a file, in words, before uploading it. Null means go ahead.
 *
 * HEIC is called out by name because it is the single most common failure: it
 * is what an iPhone produces by default, it is not a mistake on the visitor's
 * part, and "image/heic is not supported" tells them nothing about what to do.
 */
export function checkImageFile(file: PickedFile | null | undefined): string | null {
  if (!file) return 'No file was chosen';
  if (file.size === 0) return 'That file is empty';
  if (file.size > MAX_IMAGE_BYTES) {
    return 'That image is ' + formatBytes(file.size) + '. The limit is ' + formatBytes(MAX_IMAGE_BYTES) + ' - try exporting it smaller.';
  }
  const type = (file.type || '').toLowerCase();
  if (type === 'image/heic' || type === 'image/heif' || /\.hei[cf]$/i.test(file.name)) {
    return 'iPhone photos are saved as HEIC, which browsers cannot show. Export or convert it to JPEG first.';
  }
  if (!(IMAGE_MIME_TYPES as readonly string[]).includes(type)) {
    return type
      ? type + ' is not an image format a browser can show. Use PNG, JPEG, GIF, WebP, AVIF or SVG.'
      : 'That does not look like an image. Use PNG, JPEG, GIF, WebP, AVIF or SVG.';
  }
  return null;
}

const CONTROL_CHARS = /[\u0000-\u0020]/g;
const SCHEME = /^([a-z][a-z0-9+.-]*):/i;
const DATA_IMAGE = /^data:image\//i;
const BARE_DOMAIN = /^[^\s/]+\.[^\s/]+/;
const QUERY_OR_HASH = /[?#]/;
const IMAGE_EXTENSION = /\.(png|jpe?g|gif|webp|avif|svg)$/i;

/**
 * Tidy an address someone typed or pasted, and refuse the dangerous ones.
 *
 * A javascript: scheme in an image address is not hypothetical - it is what an
 * attacker puts in a field that ends up in a src. The allowlist mirrors
 * sanitizeHtml.ts on purpose: two places that decide what a URL may be must
 * agree, or the stricter one is decoration.
 *
 * Returns an empty string for anything refused, so a caller that forgets to
 * check still renders nothing rather than something hostile.
 */
export function normalizeImageUrl(raw: string | null | undefined): string {
  if (!raw) return '';
  const url = String(raw).trim();
  if (url === '') return '';

  // Strip whitespace and control characters first, because a newline inside a
  // scheme is a real way of smuggling one past a naive check.
  const flat = url.replace(CONTROL_CHARS, '');
  const scheme = SCHEME.exec(flat);

  if (scheme) {
    const proto = scheme[1].toLowerCase();
    if (proto === 'http' || proto === 'https' || proto === 'blob') return flat;
    // Inline images are fine. A data URL holding markup is a page pretending
    // to be a picture.
    if (proto === 'data') return DATA_IMAGE.test(flat) ? flat : '';
    return '';
  }

  // Site-relative and protocol-relative addresses are ordinary and safe.
  if (flat.startsWith('/')) return flat;

  // A bare "example.com/logo.png" is what people paste. Assume https rather
  // than leaving it to be read as a relative path that will never resolve.
  if (BARE_DOMAIN.test(flat)) return 'https://' + flat;

  return flat;
}

/** A quick "does this look like it points at a picture", for the inspector hint. */
export function isProbablyImageUrl(raw: string | null | undefined): boolean {
  const url = normalizeImageUrl(raw);
  if (!url) return false;
  if (url.startsWith('data:image/')) return true;
  const withoutQuery = url.split(QUERY_OR_HASH)[0];
  return IMAGE_EXTENSION.test(withoutQuery);
}

const UNSAFE_NAME_CHARS = /[^a-z0-9.\-_]+/g;
const DOT_RUNS = /\.{2,}/g;
const EDGE_PUNCTUATION = /^[-.]+|[-.]+$/g;
const UNSAFE_ID_CHARS = /[^a-zA-Z0-9\-_]/g;

/**
 * Where a file lands in the bucket.
 *
 * Page first so a page's images can be found and removed together, and a random
 * segment so two people uploading photo.jpg at the same moment do not overwrite
 * one another. The original name is kept on the end because a folder full of
 * a7f3c2.bin is unusable when you go looking six months later.
 */
export function storagePathFor(
  pageId: string | null | undefined,
  blockId: string,
  fileName: string,
  randomSegment: string
): string {
  // Slashes are already gone by the time dots are collapsed, so a name like
  // ../../secret.png cannot climb anywhere -- but leaving it as
  // ..-..-secret.png means a bucket full of names nobody can read, and a name
  // that still LOOKS like an attack is one someone will waste an afternoon on.
  const safeName =
    (fileName || 'image')
      .toLowerCase()
      .replace(UNSAFE_NAME_CHARS, '-')
      .replace(DOT_RUNS, '.')
      .slice(-60)
      .replace(EDGE_PUNCTUATION, '') || 'image';
  const page = (pageId || 'unfiled').replace(UNSAFE_ID_CHARS, '');
  const block = blockId.replace(UNSAFE_ID_CHARS, '');
  return page + '/' + block + '/' + randomSegment + '-' + safeName;
}

/**
 * Turn a storage failure into something a person can act on.
 *
 * The default here matters more than the special cases. Supabase says
 * "new row violates row-level security policy", which is true and useless; the
 * builder needs to know a bucket has to exist and be writable, and where the
 * instructions are.
 */
export function describeUploadError(error: unknown): string {
  let message = '';
  if (typeof error === 'string') {
    message = error;
  } else if (error && typeof error === 'object' && 'message' in error) {
    message = String((error as { message?: unknown }).message ?? '');
  }
  const lower = message.toLowerCase();

  if (lower.includes('bucket not found') || lower.includes('not_found') || lower.includes('does not exist')) {
    return 'The image store has not been set up yet. Create a public bucket called "' + IMAGE_BUCKET + '" in Supabase - docs/SETUP_STORAGE.md has the steps.';
  }
  if (lower.includes('row-level security') || lower.includes('violates') || lower.includes('unauthorized') || lower.includes('403')) {
    return 'The image store exists but is refusing uploads. Its policies need to allow this - docs/SETUP_STORAGE.md has the steps.';
  }
  if (lower.includes('payload too large') || lower.includes('413') || lower.includes('exceeded the maximum')) {
    return 'The image store rejected that file for being too big. Raise the bucket file size limit, or use a smaller image.';
  }
  if (lower.includes('failed to fetch') || lower.includes('networkerror') || lower.includes('network')) {
    return 'The upload could not reach the server. Check the connection and try again.';
  }
  if (lower.includes('duplicate') || lower.includes('already exists')) {
    return 'A file with that exact name is already there. Try again - the next attempt uses a new name.';
  }
  return message ? 'The upload failed: ' + message : 'The upload failed, and the server did not say why.';
}
