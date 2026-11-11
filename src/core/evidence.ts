// What a PR approval rests on, read from what the agent wrote: the PR body's `## Verification` and `## Review` sections (the build
// and review skills write them) and the reason the merge stopped (the request's question). Pure; shown as fact columns in Focus.

export interface PrEvidence {
  /** the lines of `## Verification`, or null when the body has no such section (or an empty one): "Nothing reported" */
  verification: string[] | null;
  review: string[] | null;
}

/** The lines of the section headed `name` (any heading level, any case): list items without their bullet or checkbox, plain lines as they are. */
function section(body: string, name: string): string[] | null {
  const lines = body.split(/\r?\n/);
  const start = lines.findIndex((l) => new RegExp(`^#{1,6}\\s+${name}\\s*:?\\s*$`, "i").test(l.trim()));
  if (start < 0) return null;
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((l) => /^#{1,6}\s/.test(l.trim()));
  const out = (end < 0 ? rest : rest.slice(0, end))
    .map((l) =>
      l
        .trim()
        .replace(/^(?:[-*+]|\d+[.)])\s+/, "")
        .replace(/^\[[ xX]\]\s+/, "")
        .trim(),
    )
    .filter(Boolean);
  return out.length ? out : null;
}

export function prEvidence(body: string): PrEvidence {
  return { verification: section(body, "Verification"), review: section(body, "Review") };
}

/**
 * Why the agent stopped before merging: the request's question without its closing question sentence
 * ("Merge held: the PR touches the sync store (risk area). Merge?" gives the first sentence). Null when the question is one
 * sentence, or does not end in a question: it is the heading already and would only be said twice.
 */
export function whyStopped(question: string): string | null {
  const m = /^([\s\S]*[.!?:])\s+[^.!?]*\?\s*$/.exec(question.trim());
  return m ? m[1]!.trim() : null;
}
