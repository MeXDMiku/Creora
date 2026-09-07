/**
 * Working out the question a branch block asks.
 *
 * A branch has one input and two outputs. A trigger arrives, this decides which
 * side fires, and the decision is made ONCE per arrival -- not once per step --
 * so a question with a side effect or an expensive read cannot be answered
 * differently for two wires leaving the same port.
 *
 * THE THREE ANSWERS, NOT TWO
 * A condition today is boolean: it passes or it does not. That is fine inside a
 * step, where failing is the same as not running. It is NOT fine here, because
 * a branch that cannot work out its question has two ways to be wrong and only
 * one of them is visible:
 *
 *   taking YES wrongly   something happens that should not have
 *   taking NO wrongly    NOTHING happens, and nothing is the normal-looking
 *                        outcome of a page that is simply quiet
 *
 * An unfinished branch quietly taking NO for ever is the exact shape of defect
 * this engine keeps turning up: a plausible result, no error, nobody looks. So
 * a question that cannot be worked out REFUSES -- neither side fires, and the
 * run log says why. That is the same rule the rest of the engine follows: a
 * filter that cannot be worked out keeps every row, a rule that cannot be
 * worked out refuses. This is a rule.
 */

export type BranchAnswer =
  | { ok: true; value: boolean; describe: string }
  | { ok: false; reason: string };

/**
 * @param question the branch's question, as written by the builder.
 * @param evaluate runs it, and may throw. Injected so this can be checked
 *   without a store, and so the engine keeps using the one evaluator a
 *   condition already uses rather than growing a second one.
 * @param truthy the engine's own idea of true, for the same reason.
 */
export function answerBranch(
  question: string | null | undefined,
  evaluate: (q: string) => unknown,
  truthy: (v: unknown) => boolean,
): BranchAnswer {
  const q = String(question ?? '').trim();
  // Empty is not false. A branch nobody has finished writing must not silently
  // become "always take the NO side".
  if (!q) return { ok: false, reason: 'This branch has not been asked a question yet.' };

  let answer: unknown;
  try {
    answer = evaluate(q);
  } catch (err: any) {
    return { ok: false, reason: err?.message || 'The question could not be worked out.' };
  }

  const value = truthy(answer);
  return { ok: true, value, describe: `${q} -> ${value ? 'YES' : 'NO'} (answered ${JSON.stringify(answer)})` };
}

/** The port a decided branch fires down. */
export function portForAnswer(value: boolean): 'if' | 'else' {
  return value ? 'if' : 'else';
}
