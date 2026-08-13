import { supabase } from './supabase';
import { blockRuntimeAtom } from '../state/atoms';
import { executeWorkflow, recalculateAllFormulas } from './bindingEngine';
import {
  IMAGE_BUCKET,
  checkImageFile,
  describeUploadError,
  storagePathFor,
} from './images';

/**
 * The one place that moves bytes.
 *
 * Everything decidable without a network already happened in images.ts. What is
 * left is genuinely about the server, and all of it is failure handling: this
 * function's job is to make sure that when an upload does not work, the page
 * says why in words, rather than doing nothing and leaving someone clicking.
 */

function randomSegment(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID().replace(/-/g, '').slice(0, 8);
  }
  return Math.random().toString(36).slice(2, 10);
}

function activePageId(): string | null {
  try {
    return localStorage.getItem('creora_active_page_id');
  } catch {
    return null;
  }
}

/**
 * Every write re-reads the block's state first. Spreading a copy captured
 * before an await is the stale-closure bug that made a Database show a count
 * from two edits ago, and an upload has two awaits in it.
 */
function patch(blockId: string, store: any, changes: Record<string, unknown>) {
  const current = store.get(blockRuntimeAtom(blockId));
  if (!current) return;
  store.set(blockRuntimeAtom(blockId), { ...current, ...changes });
}

export interface UploadResult {
  url: string | null;
  error: string | null;
}

export async function uploadImage(
  file: File | null | undefined,
  blockId: string,
  store: any
): Promise<UploadResult> {
  const refusal = checkImageFile(file || null);
  if (refusal) {
    // A refused file never reaches the network, so this costs nothing and is
    // the message the person actually needed.
    patch(blockId, store, { uploadError: refusal, loading: false });
    return { url: null, error: refusal };
  }

  const chosen = file as File;
  patch(blockId, store, { loading: true, uploadError: null });

  const path = storagePathFor(activePageId(), blockId, chosen.name, randomSegment());

  try {
    const { error } = await supabase.storage
      .from(IMAGE_BUCKET)
      .upload(path, chosen, { cacheControl: '31536000', upsert: false, contentType: chosen.type });

    if (error) {
      const message = describeUploadError(error);
      patch(blockId, store, { loading: false, uploadError: message });
      return { url: null, error: message };
    }

    const { data } = supabase.storage.from(IMAGE_BUCKET).getPublicUrl(path);
    const url = data?.publicUrl || '';

    if (!url) {
      const message =
        'The file uploaded, but the store did not give back an address for it. The bucket is probably private - it needs to be public.';
      patch(blockId, store, { loading: false, uploadError: message });
      return { url: null, error: message };
    }

    patch(blockId, store, { value: url, loading: false, uploadError: null });

    // The new picture is a new value, so anything wired to this block hears
    // about it exactly as it would if someone had typed the address in.
    executeWorkflow(blockId, 'onChange', store);
    recalculateAllFormulas(store);

    return { url, error: null };
  } catch (err) {
    const message = describeUploadError(err);
    patch(blockId, store, { loading: false, uploadError: message });
    return { url: null, error: message };
  }
}
