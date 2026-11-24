// proto #17 (never merged). The question level of a decision (agent-workflow docs/decision-format.md): what a request's hidden
// `choices` lines and a round's question sections say, and the answer forms the run already reads (`decision_format.py read`).
// In Build this belongs in `core/contract.ts` (parse) and `core/answer.ts` (the comment), each with its exact-text unit test.
import { optionKey, optionText } from "../../core/answer.ts";
import type { Card, DecisionRequest, DesignRound, Screenshot } from "../../core/types.ts";
import type { Variant } from "./variant.ts";

export interface QOption {
  letter: string;
  /** the option's name (round table) or its keywords (request); may hold inline Markdown in an older request */
  name: string;
  /** "In short" of the round's table, or the keywords when the name came from the table */
  short: string;
  today: boolean;
  rec: boolean;
}

export interface Question {
  n: number;
  label: string;
  about: string;
  options: QOption[];
  /** `★ Why B: …`, or the recommendation line of an older request */
  why: string;
  shots: Screenshot[];
}

export interface Ask {
  /** D<k> of the open request */
  id: string;
  /** R<k> when the questions come with a design round */
  round: number | null;
  title: string;
  questions: Question[];
  preview: string | null;
  overview: string | null;
  /** a request without `choices` lines: one question from its option list, answered by the option's key as today */
  legacy: boolean;
  since: string;
}

const CHOICES = /<!--\s*choices\s+(\d+)\s+([^:]+):\s*(.*?)\s*-->/g;

function fromChoices(body: string): Question[] {
  return [...body.matchAll(CHOICES)].map((m) => ({
    n: Number(m[1]),
    label: m[2]!.trim(),
    about: "",
    why: "",
    shots: [],
    options: m[3]!.split(" · ").flatMap((o) => {
      const p = /^([A-Z])\s*(★)?\s*(?:\((.*)\))?$/.exec(o.trim());
      if (!p) return [];
      const words = (p[3] ?? "").split(",").map((w) => w.trim()).filter(Boolean);
      return [{ letter: p[1]!, rec: !!p[2], today: words.includes("today"), name: words.filter((w) => w !== "today").join(", "), short: "" }];
    }),
  }));
}

/** The question sections of a round comment: `### <n>. <label>: <about>`, a table row per option, `★ Why <letter>: …`. */
function fromRound(round: DesignRound): Question[] {
  const body = (round.body ?? "").replace(/<details>[\s\S]*?<\/details>/gi, "");
  const out: Question[] = [];
  for (const section of body.split(/^(?=###\s+\d+\.\s)/m)) {
    const h = /^###\s+(\d+)\.\s+([^:\n]+):\s*(.*)$/m.exec(section);
    if (!h) continue;
    const label = h[2]!.trim();
    const options: QOption[] = [];
    for (const row of section.matchAll(/^\|\s*(\*\*)?([A-Z])\s*(★)?\s*(?:\*\*)?\s*\|\s*([^|]*)\|\s*([^|]*)\|/gm)) {
      const name = row[4]!.trim();
      options.push({ letter: row[2]!, rec: !!row[3], today: /\(today\)/.test(name), name: name.replace(/\s*\(today\)/, ""), short: row[5]!.trim() });
    }
    out.push({
      n: Number(h[1]),
      label,
      about: h[3]!.trim(),
      options,
      why: /^★\s*Why\s+[A-Z]:\s*(.*)$/m.exec(section)?.[1]?.trim() ?? "",
      shots: round.screenshots.filter((s) => s.alt.split("·")[1]?.trim() === `${h[1]}. ${label}`),
    });
  }
  return out;
}

/** An older request: its list lines are the options of one question (`B: field-level merge`, or `**H1 Sunlit Outline** (S). …`). */
function fromList(req: DecisionRequest): Question[] {
  if (!req.options.length) return [];
  const recWord = (req.recommendation ?? "").replace(/\*/g, "").trim().toLowerCase();
  const options = req.options.map((o): QOption => {
    const bold = /^\*\*([^*]+)\*\*[\s.:,-]*(.*)$/.exec(o);
    const letter = bold ? bold[1]!.trim() : optionKey(o);
    const name = bold ? bold[2]!.trim() : optionText(o);
    return { letter, name, short: "", today: /\(today\)/.test(o), rec: !!recWord && (recWord.startsWith(`${letter.toLowerCase()} `) || recWord.startsWith(`${letter.toLowerCase()},`) || recWord === letter.toLowerCase()) };
  });
  const rec = options.find((o) => o.rec);
  const why = rec && req.recommendation ? req.recommendation.replace(/\*/g, "").trim().slice(rec.letter.length).replace(/^[\s,.:(]+/, "").replace(/\)$/, "") : (req.recommendation ?? "");
  return [{ n: 1, label: "", about: "", options, why, shots: [] }];
}

/** What the Card asks, at the question level; null when there is nothing to pick from (answered in words, a PR, a round in the older shape). */
export function questionsOf(card: Card): Ask | null {
  const req = card.requests.find((r) => r.id === card.waiting?.requestId);
  if (!req || !card.waiting || card.waiting.kind === "pr-approval") return null;
  const round = card.waiting.kind === "design-round" ? card.rounds.at(-1) : undefined;
  const sections = round ? fromRound(round) : [];
  const choices = fromChoices(req.body);
  const base = { id: req.id, title: req.question, preview: req.preview ?? round?.preview ?? null, since: card.waiting.since };
  if (choices.length || sections.length) {
    // the request names what can be answered; the round says what each option is and shows it
    const questions = (choices.length ? choices : sections).map((q) => {
      const s = sections.find((x) => x.n === q.n);
      if (!s || s === q) return q;
      return { ...q, about: s.about, why: s.why, shots: s.shots, options: q.options.map((o) => ({ ...o, short: s.options.find((x) => x.letter === o.letter)?.short ?? "", name: s.options.find((x) => x.letter === o.letter)?.name ?? o.name })) };
    });
    return { ...base, round: sections.length && round ? round.round : null, questions, overview: round?.url ?? /Options with screenshots:\s*(\S+)/.exec(req.body)?.[1] ?? null, legacy: false };
  }
  if (round) return null; // a round in the older shape keeps its variants (RoundPanel, RoundCover)
  const list = fromList(req);
  return list.length ? { ...base, round: null, questions: list, overview: null, legacy: true } : null;
}

export type Picks = Record<number, string>;
export type Notes = Record<number, string>;

export const recOf = (q: Question) => q.options.find((o) => o.rec)?.letter ?? null;

/** The picks with the recommendation where nothing was picked. */
export const effective = (ask: Ask, picks: Picks): Picks => Object.fromEntries(ask.questions.flatMap((q) => ((picks[q.n] ?? recOf(q)) ? [[q.n, picks[q.n] ?? recOf(q)!]] : [])));

export const changed = (ask: Ask, picks: Picks) => ask.questions.filter((q) => picks[q.n] && picks[q.n] !== recOf(q));

const spell = (q: Question, letter: string) => {
  const o = q.options.find((x) => x.letter === letter);
  return `${q.n} ${q.label}: ${letter}${o?.name ? ` (${o.name})` : ""}`;
};

/**
 * The answer, without its prefix, in the forms `decision_format.py read` takes:
 *   `ok`                           every recommendation
 *   `ok. 1A 3B`                    the recommendations, except these
 *   `1B 2A`                        when a question has no recommendation
 *   `1 Shell: C (top stepper) but calmer` + one line per question   as soon as a question carries a note
 * An older request (`legacy`): the option's key, then the note, as today.
 */
export function answerText(ask: Ask, picks: Picks, notes: Notes): string {
  const eff = effective(ask, picks);
  const noted = ask.questions.filter((q) => notes[q.n]?.trim());
  if (ask.legacy) return [eff[1] ?? "", notes[1]?.trim() ?? ""].filter(Boolean).join(". ");
  if (ask.questions.some((q) => !eff[q.n])) return "";
  if (noted.length) return ask.questions.map((q) => `${spell(q, eff[q.n]!)}${notes[q.n]?.trim() ? ` ${notes[q.n]!.trim()}` : ""}`).join("\n");
  const short = (qs: Question[]) => qs.map((q) => `${q.n}${eff[q.n]}`).join(" ");
  if (ask.questions.some((q) => !recOf(q))) return short(ask.questions);
  const diff = changed(ask, picks);
  return diff.length ? `ok. ${short(diff)}` : "ok";
}

/** The comment as it lands on the issue, per the round's question 4 (what an answer to a design round starts with). */
export function commentOf(ask: Ask, picks: Picks, notes: Notes, prefix: Variant["prefix"]): string {
  const text = answerText(ask, picks, notes);
  if (!text) return "";
  if (ask.round !== null && prefix === "A") {
    const eff = effective(ask, picks);
    const said = ask.questions.filter((q) => notes[q.n]?.trim()).map((q) => `${q.n} ${q.label}: ${notes[q.n]!.trim()}`);
    return [`R${ask.round}:`, `- pick: ${ask.questions.map((q) => `${q.n}${eff[q.n]}`).join(", ")}`, ...(said.length ? ["", ...said] : [])].join("\n");
  }
  return `${prefix === "C" ? "Decision " : ""}${ask.id}: ${text}`;
}

/** In one line, for the Send row: what the answer says. */
export function summaryOf(ask: Ask, picks: Picks, notes: Notes): string {
  if (ask.legacy) return "";
  const diff = changed(ask, picks);
  const n = ask.questions.length;
  const noteCount = ask.questions.filter((q) => notes[q.n]?.trim()).length;
  const base = diff.length ? `${n - diff.length} of ${n} as recommended, ${diff.map((q) => `${q.n}${picks[q.n]}`).join(" ")} changed` : `All ${n} as recommended`;
  return noteCount ? `${base}, ${noteCount} note${noteCount > 1 ? "s" : ""}` : base;
}
