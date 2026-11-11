// What a PR approval rests on, read from what the agent wrote: the PR body's `## Verification` and `## Review` sections (the build
// and review skills write them) and the reason the merge stopped (the request's question). Pure; shown as fact columns in Focus.

export interface EvidenceLine {
  text: string;
  /** an unchecked task-list item (`- [ ] e2e`): reported as not done, so it must not read like passed evidence */
  open: boolean;
}

export interface PrEvidence {
  /** the lines of `## Verification`, or null when the body has no such section (or an empty one): "Nothing reported" */
  verification: EvidenceLine[] | null;
  review: EvidenceLine[] | null;
}

const heading = (line: string) => /^(#{1,6})\s+(.*?)\s*$/.exec(line.trim());

/**
 * The lines of the section headed `name` (any heading level, any case): list items without their bullet, plain lines as they are, a
 * sub-heading as a line of its own. The section ends at the next heading of its own level or above; a `#` line inside a fenced code
 * block is code, not a heading.
 */
function section(body: string, name: string): EvidenceLine[] | null {
  const lines = body.split(/\r?\n/);
  const start = lines.findIndex((l) => {
    const h = heading(l);
    return !!h && h[2]!.replace(/:$/, "").trim().toLowerCase() === name.toLowerCase();
  });
  if (start < 0) return null;
  const level = heading(lines[start]!)![1]!.length;
  const out: EvidenceLine[] = [];
  let fenced = false;
  for (const raw of lines.slice(start + 1)) {
    const line = raw.trim();
    if (/^(```|~~~)/.test(line)) {
      fenced = !fenced;
      continue;
    }
    const h = fenced ? null : heading(line);
    if (h && h[1]!.length <= level) break;
    const item = (h ? h[2]! : line).replace(/^(?:[-*+]|\d+[.)])\s+/, "");
    const box = /^\[([ xX])\]\s+/.exec(item);
    const text = (box ? item.slice(box[0].length) : item).trim();
    if (text) out.push({ text, open: box?.[1] === " " });
  }
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
