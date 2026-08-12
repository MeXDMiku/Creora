import { blockRuntimeAtom } from '../state/atoms';
import { executeWorkflow, recalculateAllFormulas } from './bindingEngine';
import { valueAtPath } from './jsonPaths';

/**
 * Fetch a Data Source block's URL and put the result into its runtime state.
 *
 * Shared by the editor and the published renderer, because a live page has to
 * behave identically for a visitor -- the whole point of the block is that the
 * data is live where people actually see it.
 *
 * No server involved. A public API that sends CORS headers can be called
 * straight from the browser, which is why this ships before the Edge Function
 * layer. An API needing a secret key cannot: the key would sit in a published
 * page for anyone to read. That version waits.
 */
export async function fetchDataSource(blockId: string, store: any): Promise<void> {
  const atom = blockRuntimeAtom(blockId);
  const state = store.get(atom);
  const url = (state?.url || '').trim();
  if (!url) return;

  store.set(atom, { ...state, loading: true, fetchError: null });

  try {
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`The server answered ${res.status}`);

    const text = await res.text();
    let data: any;
    try {
      data = JSON.parse(text);
    } catch {
      // Not JSON. Plain text is still usable as a single value.
      data = text;
    }

    const current = store.get(atom);
    const nextValue = current?.outputPath ? valueAtPath(data, current.outputPath) : undefined;

    store.set(atom, {
      ...current,
      loading: false,
      fetchError: null,
      lastResponse: data,
      lastFetchedAt: Date.now(),
      ...(current?.outputPath ? { value: nextValue } : {}),
    });

    // A value arriving IS a change, so anything wired downstream updates.
    executeWorkflow(blockId, 'onChange', store);
    recalculateAllFormulas(store);
  } catch (err: any) {
    const raw = String(err?.message || err);
    // "Failed to fetch" is what a browser says when an API refuses browser
    // calls, and it is indistinguishable from a typo unless we say so. Naming
    // it is the difference between a five-minute fix and an hour lost.
    const friendly = /failed to fetch|networkerror|load failed/i.test(raw)
      ? 'This address refused a browser request. Either it is wrong, or the API does not allow browser access (CORS) — the second kind needs a server, which Creora does not have yet.'
      : raw;
    const current = store.get(atom);
    store.set(atom, { ...current, loading: false, fetchError: friendly, lastFetchedAt: Date.now() });
  }
}
