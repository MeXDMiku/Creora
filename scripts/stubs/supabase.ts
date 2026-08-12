/**
 * Stands in for the real Supabase client while the checks run.
 *
 * Every call resolves with no data and no error, which is what the binding
 * engine already treats as "the write went somewhere else". The checks assert on
 * local state, which is the half that has to be right first: a page whose local
 * state is wrong is wrong no matter what the server says.
 */
export const supabase = {
  rpc: (_fn: string, _args?: unknown) => Promise.resolve({ data: [], error: null }),
  from: () => ({ select: () => Promise.resolve({ data: [], error: null }) }),
  auth: {
    getSession: () => Promise.resolve({ data: { session: null }, error: null }),
    getUser: () => Promise.resolve({ data: { user: null }, error: null }),
  },
} as any;
