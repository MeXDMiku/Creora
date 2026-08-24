/**
 * Stands in for the real Supabase client while the checks run.
 *
 * By default every call resolves with no data and no error, which is what the
 * binding engine already treats as "the write went somewhere else". The checks
 * assert on local state, which is the half that has to be right first: a page
 * whose local state is wrong is wrong no matter what the server says.
 *
 * IT CAN ALSO BE TOLD TO FAIL, AND THAT IS NOT A CONVENIENCE.
 * `bindingEngine` imports this module directly, and the note beside the add-row
 * checks used to say that therefore "there is no seam to hand it a failing
 * client" -- so what a failure DID could only be checked by reading the source
 * for four call sites. There is a seam: this file is it. A double that can only
 * ever succeed can only ever prove the happy path, and every interesting thing
 * about a refusal is on the other one.
 *
 * `failNext` is one-shot on purpose. A stub left failing leaks into whatever
 * check runs next, and the failure would appear to come from the code.
 */
type Recorded = { fn: string; args: unknown };

const calls: Recorded[] = [];
let failNext: { message?: string; code?: string } | null = null;

export const supabase = {
  rpc: (fn: string, args?: unknown) => {
    calls.push({ fn, args });
    const error = failNext;
    failNext = null;
    return Promise.resolve({ data: error ? null : [], error });
  },
  from: () => ({ select: () => Promise.resolve({ data: [], error: null }) }),
  auth: {
    getSession: () => Promise.resolve({ data: { session: null }, error: null }),
    getUser: () => Promise.resolve({ data: { user: null }, error: null }),
  },
  /** What has been asked of the server, oldest first. */
  __calls: calls,
  __lastCall: () => calls[calls.length - 1],
  __reset: () => { calls.length = 0; failNext = null; },
  /** Make the NEXT rpc come back as this failure, once. */
  __failNext: (error: { message?: string; code?: string }) => { failNext = error; },
} as any;
