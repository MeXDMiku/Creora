/**
 * Lets `node scripts/checks.ts` run the real source files.
 *
 * Two small gaps between how Vite resolves modules and how Node does:
 *   1. the source imports without file extensions, which Node will not do;
 *   2. src/lib/supabase.ts reads import.meta.env, which does not exist outside
 *      Vite, so merely importing it throws before a single check can run.
 *
 * Both are bridged here rather than by changing the source to suit the test.
 * A test that needs the product bent to fit it is testing the bend.
 */
import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const STUBS = new Map([
  ['lib/supabase.ts', path.resolve(process.cwd(), 'scripts/stubs/supabase.ts')],
]);

export async function resolve(specifier, context, next) {
  if (specifier.startsWith('.') && !path.extname(specifier)) {
    const parentPath = context.parentURL ? fileURLToPath(context.parentURL) : path.join(process.cwd(), 'x');
    const base = path.resolve(path.dirname(parentPath), specifier);
    for (const candidate of [base + '.ts', base + '.tsx', path.join(base, 'index.ts')]) {
      if (existsSync(candidate)) {
        return resolve(pathToFileURL(candidate).href, context, next);
      }
    }
  }
  if (specifier.startsWith('file:')) {
    const asPath = fileURLToPath(specifier);
    for (const [suffix, replacement] of STUBS) {
      if (asPath.replace(/\\/g, '/').endsWith(suffix)) {
        return next(pathToFileURL(replacement).href, context);
      }
    }
  }
  return next(specifier, context);
}
