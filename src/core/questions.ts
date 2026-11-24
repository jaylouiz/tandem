// The question level of a decision (agent-workflow docs/decision-format.md): what a request's hidden `choices` lines and a round's
// question sections say, and from them the one thing a Card asks (`askOf`). Pure and read-only: what is written lives in `answer.ts`.
import type { Card, DecisionRequest, DesignRound, Question, QuestionOption, Screenshot } from "./types.ts";

/** `**H1 Sunlit Outline** (S). Yellow desk` -> [`H1 Sunlit Outline`, `(S). Yellow desk`]: an older request may name its options in bold. */
const bold = (option: string) => /^\*\*([^*]+)\*\*[\s.:,-]*(.*)$/.exec(option.trim());

/** An option as the agent wrote it (`B: field-level merge`, `**H1** (S). …`): its key, the part an answer names. */
export const optionKey = (option: string) => bold(option)?.[1]!.trim() ?? option.split(":")[0]!.trim();

/** The rest of an option after its key, or "" when the option is its key alone. */
export const optionText = (option: string) => bold(option)?.[2]!.trim() ?? (option.includes(":") ? option.slice(option.indexOf(":") + 1).trim() : "");

const CHOICES = /<!--\s*choices\s+(\d+)\s+([^:]+):\s*(.*?)\s*-->/g;

/** The `<!-- choices 1 Shell: A (back on top, today) · B ★ (footer bar) -->` lines of a request, one question each. */
export function choicesOf(body: string): Question[] {
  return [...body.matchAll(CHOICES)].map((m) => ({
    n: Number(m[1]),
    label: m[2]!.trim(),
    about: "",
    why: "",
    shots: [],
    options: m[3]!.split(" · ").flatMap((o): QuestionOption[] => {
      const p = /^([A-Z])\s*(★)?\s*(?:\((.*)\))?$/.exec(o.trim());
      if (!p) return [];
      const words = (p[3] ?? "").split(",").map((w) => w.trim()).filter(Boolean);
      return [{ letter: p[1]!, recommended: !!p[2], today: words.includes("today"), name: words.filter((w) => w !== "today").join(", "), short: "" }];
    }),
  }));
}

/** The question a screenshot belongs to, from its alt `R<k> · <n>. <label> · <what it shows>`; null for any other alt. */
export const shotQuestion = (s: Pick<Screenshot, "alt">): number | null => {
  const m = /^\s*R\d+\s*·\s*(\d+)\.\s/.exec(s.alt);
  return m ? Number(m[1]) : null;
};

/** The question sections of a round comment: `### <n>. <label>: <about>`, a table row per option, `★ Why <letter>: …`. Empty for the older shape. */
export function roundQuestions(body: string, screenshots: Screenshot[]): Question[] {
  const visible = body.replace(/<details>[\s\S]*?<\/details>/gi, "");
  const out: Question[] = [];
  for (const section of visible.split(/^(?=###\s+\d+\.\s)/m)) {
    const h = /^###\s+(\d+)\.\s+([^:\n]+):\s*(.*)$/m.exec(section);
    if (!h) continue;
    const n = Number(h[1]);
    const options: QuestionOption[] = [];
    for (const row of section.matchAll(/^\|\s*(?:\*\*)?([A-Z])\s*(★)?\s*(?:\*\*)?\s*\|\s*([^|]*)\|\s*([^|]*)\|/gm)) {
      const name = row[3]!.trim();
      options.push({ letter: row[1]!, recommended: !!row[2], today: /\(today\)/.test(name), name: name.replace(/\s*\(today\)/, ""), short: row[4]!.trim() });
    }
    if (!options.length) continue;
    out.push({
      n,
      label: h[2]!.trim(),
      about: h[3]!.trim(),
      options,
      why: /^★\s*Why\s+[A-Z]:\s*(.*)$/m.exec(section)?.[1]?.trim() ?? "",
      shots: screenshots.flatMap((s, i) => (shotQuestion(s) === n ? [i] : [])),
    });
  }
  return out;
}

/** An older request: its list lines are the options of one question (`B: field-level merge`, or `**H1 Sunlit Outline** (S). …`). */
function listQuestion(req: DecisionRequest): Question[] {
  if (!req.options.length) return [];
  const rec = (req.recommendation ?? "").replace(/\*/g, "").trim();
  const starts = (letter: string) => rec.toLowerCase() === letter.toLowerCase() || new RegExp(`^${letter.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\w-])`, "i").test(rec);
  const options = req.options.map((o): QuestionOption => {
    const letter = optionKey(o);
    return { letter, name: optionText(o).replace(/\s*★\s*$/, "").replace(/\s*\(today\)/, ""), short: "", today: /\(today\)/.test(o), recommended: !!rec && starts(letter) };
  });
  // the longest key wins when one key starts another (`A` and `A3`)
  const marked = options.filter((o) => o.recommended).sort((a, b) => b.letter.length - a.letter.length)[0];
  for (const o of options) o.recommended = o === marked;
  const why = marked ? rec.slice(marked.letter.length).replace(/^[\s,.:(]+/, "").replace(/\)$/, "") : rec;
  return [{ n: 1, label: "", about: "", options, why, shots: [] }];
}

/** What a Card asks at the question level. */
export interface Ask {
  /** D<k> of the open request: the answer names it */
  id: string;
  /** R<k> when the questions come with a design round */
  round: number | null;
  title: string;
  questions: Question[];
  preview: string | null;
  /** the comment that describes the options (the round, or the request's "Options with screenshots" link) */
  overview: string | null;
  /** a request without `choices` lines: one question from its option list */
  legacy: boolean;
  since: string;
}

/**
 * What the Card asks, as questions with options; null when there is nothing to pick from (answered in words, a PR approval, a round in the
 * older shape). The request names what can be answered; the round says what each option is and shows it.
 */
export function askQuestions(card: Pick<Card, "waiting" | "requests" | "rounds">): Ask | null {
  const req = card.requests.find((r) => r.id === card.waiting?.requestId);
  if (!req || !card.waiting || card.waiting.kind === "pr-approval") return null;
  const round = card.waiting.kind === "design-round" ? card.rounds.at(-1) : undefined;
  const sections = round?.questions ?? [];
  const choices = choicesOf(req.body);
  const base = { id: req.id, title: req.question, preview: req.preview ?? round?.preview ?? null, since: card.waiting.since };
  if (choices.length || sections.length) {
    const questions = (choices.length ? choices : sections).map((q): Question => {
      const s = sections.find((x) => x.n === q.n);
      if (!s || s === q) return q;
      const described = (letter: string) => s.options.find((x) => x.letter === letter);
      return { ...q, about: s.about, why: s.why, shots: s.shots, options: q.options.map((o) => ({ ...o, short: described(o.letter)?.short ?? "", name: described(o.letter)?.name ?? o.name })) };
    });
    if (questions.every((q) => q.options.length >= 2))
      return { ...base, round: sections.length && round ? round.round : null, questions, overview: (sections.length ? round?.url : null) ?? /Options with screenshots:\s*(\S+)/.exec(req.body)?.[1] ?? null, legacy: false };
  }
  if (round) return null;
  const list = listQuestion(req);
  return list.length ? { ...base, round: null, questions: list, overview: null, legacy: true } : null;
}

/** A round in the question format (its sections are the things to pick from, not its `Variants:` keys). */
export const inQuestionFormat = (round: Pick<DesignRound, "questions">) => round.questions.length > 0;

export type Picks = Record<number, string>;
export type Notes = Record<number, string>;

export const recommendedOf = (q: Question) => q.options.find((o) => o.recommended)?.letter ?? null;

/**
 * The picks that count: the developer's own where it names an option of its question, else the recommendation. "" is a pick taken back
 * (a one-question ask answered in words). A stale pick (the ask changed under the draft) is dropped.
 */
export function effectivePicks(ask: Ask, picks: Picks): Picks {
  const out: Picks = {};
  for (const q of ask.questions) {
    const own = picks[q.n];
    const letter = own === "" ? "" : own !== undefined && q.options.some((o) => o.letter === own) ? own : recommendedOf(q);
    if (letter) out[q.n] = letter;
  }
  return out;
}

/** The questions answered other than recommended. */
export const changedFrom = (ask: Ask, picks: Picks) => {
  const eff = effectivePicks(ask, picks);
  return ask.questions.filter((q) => eff[q.n] && recommendedOf(q) && eff[q.n] !== recommendedOf(q));
};

/** The questions that still need a pick (no recommendation, nothing picked). */
export const unanswered = (ask: Ask, picks: Picks) => {
  const eff = effectivePicks(ask, picks);
  return ask.questions.filter((q) => !eff[q.n]);
};

/** In one line, for the Send row: "All 3 as recommended", "2 of 3 as recommended, 1A changed", "…, 1 note". */
export function answerSummary(ask: Ask, picks: Picks, notes: Notes): string {
  const n = ask.questions.length;
  if (n < 2) return "";
  const eff = effectivePicks(ask, picks);
  const diff = changedFrom(ask, picks);
  const open = unanswered(ask, picks).length;
  const withRec = ask.questions.filter((q) => recommendedOf(q)).length;
  const noteCount = ask.questions.filter((q) => notes[q.n]?.trim()).length;
  const base = open
    ? `${n - open} of ${n} picked`
    : withRec < n
      ? `${n} of ${n} picked`
      : diff.length
        ? `${n - diff.length} of ${n} as recommended, ${diff.map((q) => `${q.n}${eff[q.n]}`).join(" ")} changed`
        : `All ${n} as recommended`;
  return noteCount ? `${base}, ${noteCount} note${noteCount > 1 ? "s" : ""}` : base;
}
