/**
 * Turning a real API response into something a non-coder can point at.
 *
 * Nobody who cannot code should type `current.temperature_2m`. So: fetch once,
 * flatten the actual response into a list of value paths, show it, and let them
 * click the one they want. The label they see is the key; the path is Creora's
 * problem, not theirs.
 */

export type JsonValueType = 'number' | 'text' | 'boolean' | 'list' | 'empty';

export interface JsonLeaf {
  /** Dotted path with [i] for arrays — "daily.temperature_2m[0]" */
  path: string;
  /** What to show: the last meaningful key, e.g. "temperature_2m" */
  label: string;
  /** How deep, for indenting the picker */
  depth: number;
  type: JsonValueType;
  /** The value at fetch time, so the picker can show a real example */
  preview: string;
}

function typeOf(v: any): JsonValueType {
  if (v === null || v === undefined || v === '') return 'empty';
  if (Array.isArray(v)) return 'list';
  if (typeof v === 'number') return 'number';
  if (typeof v === 'boolean') return 'boolean';
  return 'text';
}

function previewOf(v: any): string {
  if (v === null || v === undefined) return '—';
  if (Array.isArray(v)) return `${v.length} item${v.length === 1 ? '' : 's'}`;
  const s = String(v);
  return s.length > 40 ? s.slice(0, 40) + '…' : s;
}

/**
 * Flatten a response into pickable leaves.
 *
 * Arrays are represented by their first element only. A weather forecast has 7
 * days with identical shape; listing 7 identical branches would bury the useful
 * ones. The array itself is offered too, so it can be fed to something that
 * repeats once `for each row` exists.
 */
export function flattenJson(value: any, maxLeaves = 200): JsonLeaf[] {
  const out: JsonLeaf[] = [];

  const walk = (v: any, path: string, label: string, depth: number) => {
    if (out.length >= maxLeaves || depth > 6) return;

    if (Array.isArray(v)) {
      out.push({ path, label, depth, type: 'list', preview: previewOf(v) });
      if (v.length > 0 && (typeof v[0] === 'object' || Array.isArray(v[0]))) {
        walk(v[0], `${path}[0]`, `${label} (first)`, depth + 1);
      } else if (v.length > 0) {
        out.push({
          path: `${path}[0]`,
          label: `${label} (first)`,
          depth: depth + 1,
          type: typeOf(v[0]),
          preview: previewOf(v[0]),
        });
      }
      return;
    }

    if (v && typeof v === 'object') {
      for (const key of Object.keys(v)) {
        walk(v[key], path ? `${path}.${key}` : key, key, depth + (path ? 1 : 0));
      }
      return;
    }

    out.push({ path, label, depth, type: typeOf(v), preview: previewOf(v) });
  };

  walk(value, '', 'response', 0);
  return out;
}

/** Read a value back out at runtime using a path the picker produced. */
export function valueAtPath(source: any, path: string): any {
  if (!path) return source;
  let cur = source;
  // "daily.temperature_2m[0]" -> ["daily", "temperature_2m", "0"]
  const parts = path.replace(/\[(\d+)\]/g, '.$1').split('.').filter(Boolean);
  for (const part of parts) {
    if (cur === null || cur === undefined) return undefined;
    cur = cur[part];
  }
  return cur;
}

/** A sensible name for an output, derived from the path the user clicked. */
export function suggestOutputName(path: string): string {
  const last = path.replace(/\[\d+\]/g, '').split('.').filter(Boolean).pop() || 'value';
  return last.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
