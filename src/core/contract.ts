// Reads and writes the agent-workflow comment contract (agent-workflow README "Comment markers",
// bin/decide.sh). Tandem acts as the user: everything it writes for the user is an
// UNMARKED comment, because "any later comment without a marker counts as the user's".
import type {
  AgentDecision,
  DecisionRequest,
  DesignRound,
  LookNote,
  Marker,
  RawComment,
  Screenshot,
} from "./types.ts";
import { axisKey, byAxis } from "./axes.ts";
import { roundQuestions } from "./questions.ts";

const MARKER = /<!--\s*decision-([a-z]+)(?:\s+([^>]*?))?\s*-->/;

export function parseMarker(body: string): Marker | null {
  const m = MARKER.exec(body);
  if (!m) return null;
  const kind = m[1] as Marker["kind"];
  if (!["request", "record", "answer", "resolved", "followup", "note"].includes(kind)) return null;
  const rest = (m[2] ?? "").trim();
  if (kind === "note") {
    const r = /^round\s+R(\d+)/.exec(rest);
    if (r) return { kind, id: null, note: "round", round: Number(r[1]) };
    if (rest.startsWith("options")) return { kind, id: null, note: "options", round: null };
    if (rest.startsWith("look")) return { kind, id: null, note: "look", round: null };
    return { kind, id: null, note: null, round: null };
  }
  const id = /^(D\d+)/.exec(rest)?.[1] ?? null;
  return { kind, id, note: null, round: null };
}

export const isMarked = (body: string) => parseMarker(body) !== null;

/** Text a reader sees: no HTML comments, no <details> blocks. */
function visibleLines(body: string): string[] {
  return body
    .replace(/<details>[\s\S]*?<\/details>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .split("\n")
    .map((l) => l.trimEnd());
}

const IMG_MD = /!\[([^\]]*)\]\(([^)\s]+)[^)]*\)/g;
const IMG_HTML = /<img\b[^>]*>/gi;

/**
 * `loose`: the older round shape (alt texts like `a desktop`, `A 1280`, `D open`) is read too.
 * `variants` are the round's declared keys; with none declared a single letter counts as the variant.
 */
export function parseScreenshots(body: string, loose?: { variants: string[] }): Screenshot[] {
  const out: Screenshot[] = [];
  for (const m of body.matchAll(IMG_MD)) out.push(screenshot(m[1] ?? "", m[2] ?? "", loose));
  for (const m of body.matchAll(IMG_HTML)) {
    const tag = m[0];
    const src = /\bsrc="([^"]+)"/i.exec(tag)?.[1];
    const alt = /\balt="([^"]*)"/i.exec(tag)?.[1] ?? "";
    if (src) out.push(screenshot(alt, src, loose));
  }
  return out;
}

function screenshot(alt: string, src: string, loose?: { variants: string[] }): Screenshot {
  // Round: `R<k> · <variant> · <desktop|mobile>`; Look: `look · <desktop|mobile> · <state>`.
  const parts = alt.split("·").map((p) => p.trim());
  const viewport = (p: string | undefined) => (p === "desktop" || p === "mobile" ? p : null);
  if (parts[0] && /^R\d+$/.test(parts[0])) {
    return { src, alt, variant: parts[1] ?? null, viewport: viewport(parts[2]), state: null };
  }
  if (parts[0] === "look") {
    return { src, alt, variant: null, viewport: viewport(parts[1]), state: parts[2] ?? null };
  }
  return loose ? { src, alt, ...looseAlt(alt, loose.variants) } : { src, alt, variant: null, viewport: null, state: null };
}

function looseAlt(alt: string, declared: string[]): Pick<Screenshot, "variant" | "viewport" | "state"> {
  const words = alt.split(/[\s·_-]+/).filter(Boolean);
  // `a`, `B2`, `a3x`: a letter, optionally followed by a step number and suffix (older rounds name shots `<variant><step> <viewport>`)
  const letter = words[0] ? /^([A-Za-z])(?:\d+[a-z]*)?$/.exec(words[0])?.[1] : undefined;
  const variant = letter ? (declared.find((k) => k.toLowerCase() === letter.toLowerCase()) ?? (declared.length === 0 ? letter : null)) : null;
  let viewport: Screenshot["viewport"] = null;
  const rest: string[] = [];
  words.forEach((w, i) => {
    const lw = w.toLowerCase();
    if (i === 0 && variant) return;
    if (!viewport && (lw === "desktop" || lw === "mobile")) viewport = lw;
    else if (!viewport && /^\d{3,4}$/.test(w)) viewport = Number(w) <= 600 ? "mobile" : "desktop";
    else rest.push(w);
  });
  return { variant, viewport, state: rest.join(" ") || null };
}

const field = (lines: string[], name: string) =>
  lines.find((l) => l.startsWith(`${name}:`))?.slice(name.length + 1).trim() || null;

function parseRequestBody(body: string) {
  const lines = visibleLines(body).filter((l) => !/^###\s/.test(l));
  // decide.sh appends "---" and an instruction line after the agent's text.
  const cut = lines.findIndex((l) => l.trim() === "---");
  const own = (cut >= 0 ? lines.slice(0, cut) : lines).filter((l) => l.trim() !== "");
  const preview = field(own, "Preview");
  const content = own.filter((l) => !l.startsWith("Preview:"));
  const question = content[0]?.replace(/^\*\*Question:\*\*\s*/, "").trim() ?? "";
  const options = content
    .slice(1)
    .filter((l) => /^\s*(?:[-*]|\d+\.)\s+/.test(l))
    .map((l) => l.replace(/^\s*(?:[-*]|\d+\.)\s+/, "").trim());
  const recommendation =
    content.find((l) => /recommend/i.test(l))?.replace(/^\**recommend(?:ation|ed)?:?\**:?\s*/i, "").trim() ?? null;
  return { question, options, recommendation, preview };
}

export interface ThreadDigest {
  requests: DecisionRequest[];
  agentDecisions: AgentDecision[];
  rounds: DesignRound[];
  look: LookNote | null;
}

/**
 * Which marked comment each unmarked comment replies to: index of the marked comment -> its replies in thread order.
 * One rule, read the same way by agent-workflow's `decide.sh` (scan/status/digest, jaylouiz/agent-workflow#16):
 * 1. an unmarked comment whose first text is `Decision D<k>:` (what Tandem writes on every answer, challenge and verdict, #1) or
 *    `D<k>:` (what it wrote before, and what a person types), with a `request`/`record` D<k> earlier in the thread, belongs to
 *    that decision (so a challenge to D2 written while D3 is open stays D2's);
 * 2. any other unmarked comment belongs to the nearest earlier marked comment (a `note` has no reply of its own).
 */
const NAMED = /^\s*(?:Decision\s+)?(D\d+):/;

function repliesByMarker(comments: RawComment[]): Map<number, string[]> {
  const replies = new Map<number, string[]>();
  const decisions = new Map<string, number>(); // id -> latest request/record so far
  let nearest = -1;
  comments.forEach((c, i) => {
    const marker = parseMarker(c.body);
    if (marker) {
      nearest = i;
      if ((marker.kind === "request" || marker.kind === "record") && marker.id) decisions.set(marker.id, i);
      return;
    }
    const named = NAMED.exec(c.body)?.[1];
    const owner = named !== undefined && decisions.has(named) ? decisions.get(named)! : nearest;
    if (owner >= 0) replies.set(owner, [...(replies.get(owner) ?? []), c.body.trim()]);
  });
  return replies;
}

/**
 * Walk an issue thread once and pull out every structured element the Board shows. A reply belongs to the decision
 * it names (`Decision D<k>:` or `D<k>:`), else to the nearest earlier marked comment: see `repliesByMarker`, the same rule as `decide.sh`.
 */
export function digestThread(comments: RawComment[]): ThreadDigest {
  const requests: DecisionRequest[] = [];
  const agentDecisions: AgentDecision[] = [];
  const rounds: DesignRound[] = [];
  let look: LookNote | null = null;
  const owned = repliesByMarker(comments);

  comments.forEach((c, i) => {
    const marker = parseMarker(c.body);
    if (!marker) return;
    const legacy = marker.kind === "note" && marker.note === null ? legacyRound(c.body) : null;
    const replies = owned.get(i);
    const reply = replies ? replies.join("\n\n") : null;

    if (marker.kind === "request" && marker.id) {
      const parsed = parseRequestBody(c.body);
      requests.push({ id: marker.id, ...parsed, body: c.body, createdAt: c.createdAt, url: c.url, answer: reply, resolved: false });
    } else if (marker.kind === "answer" || marker.kind === "resolved") {
      const req = requests.find((r) => r.id === marker.id);
      if (req) {
        if (marker.kind === "answer") {
          req.answer = c.body.split("\n").slice(1).join(" ").replace(/^Answer from the user \(via the coordinator\):\s*/, "").trim();
        } else req.resolved = true;
      }
    } else if (marker.kind === "record" && marker.id) {
      const lines = visibleLines(c.body).filter((l) => l.trim() && !/^###\s/.test(l));
      const cut = lines.findIndex((l) => l.trim() === "---");
      const own = cut >= 0 ? lines.slice(0, cut) : lines;
      agentDecisions.push({ id: marker.id, title: own[0]?.trim() ?? marker.id, body: c.body, createdAt: c.createdAt, url: c.url, challenge: reply });
    } else if (marker.kind === "note" && marker.note === "round" && marker.round) {
      rounds.push(parseRound(c, marker.round));
    } else if (marker.kind === "note" && marker.note === null && legacy) {
      // older shape (`<!-- decision-note -->` + `## Design round <k>`), read only; Tandem never writes it
      rounds.push(parseRound(c, legacy));
    } else if (marker.kind === "note" && marker.note === "look") {
      look = parseLook(c);
    }
  });
  return { requests, agentDecisions, rounds, look };
}

/** Round number of an older round comment: a plain note whose first visible heading is `## Design round <k>`. */
function legacyRound(body: string): number | null {
  const heading = visibleLines(body).find((l) => l.startsWith("## "));
  const m = heading ? /^##\s+Design round\s+(\d+)\b/.exec(heading) : null;
  return m ? Number(m[1]) : null;
}

/** `a, b, c (samples)` -> the keys; a parenthesis is a note for the reader, a part with a space is prose, not a key. */
const keyList = (text: string) =>
  text
    .replace(/\([^)]*\)/g, "")
    .split(",")
    .map((k) => k.trim())
    .filter((k) => /^[\w-]+$/.test(k));

const parenthesis = (text: string) => /\(([^)]*)\)\s*$/.exec(text)?.[1]?.trim() ?? "";

/**
 * The keys a round declares. Main: `Variants: a, b, c`. A further axis (a round that asks more than one question in one
 * prototype): `Axis slide: o, a (how the steps move)`, one line each. Also read, from rounds written before that line existed:
 * axes after a `·` on the Variants line (`Variants: a, b, c · slide: o, a`, `· m=a (menu content)`).
 */
function declaredKeys(lines: string[]) {
  const main: string[] = [];
  const axes: { name: string; about: string; options: string[] }[] = [];
  const axis = (name: string, about: string, options: string[]) => {
    const known = axes.find((a) => a.name === name);
    if (known) known.options.push(...options.filter((o) => !known.options.includes(o)));
    else axes.push({ name, about, options });
  };
  const [first = "", ...more] = (field(lines, "Variants") ?? "").split("·");
  main.push(...keyList(first));
  for (const part of more) {
    const named = /^\s*([\w-]+)\s*:\s*(.*)$/.exec(part);
    const one = /^\s*([\w-]+)=([\w-]+)/.exec(part);
    if (named) axis(named[1]!, parenthesis(named[2]!), keyList(named[2]!));
    else if (one) axis(one[1]!, parenthesis(part), [one[2]!]);
  }
  for (const l of lines) {
    const m = /^Axis\s+([\w-]+)\s*:\s*(.*)$/.exec(l);
    if (m) axis(m[1]!, parenthesis(m[2]!), keyList(m[2]!));
  }
  return { main, axes };
}

/** A heading's or an alt text's variant (`a`, `slide a`, `slide=a`, `slide-a`, or a whole axis `slide`) against the declared axes. */
function resolveKey(raw: string, axes: string[], main: string[]): { key: string; axis: string | null } | { axisOnly: string } | null {
  const t = raw.trim();
  const lower = (s: string) => s.toLowerCase();
  const axisNamed = (n: string) => axes.find((a) => lower(a) === lower(n));
  const two = /^([\w-]+?)(?:\s+|=|-)([\w-]+)$/.exec(t);
  if (two) {
    const a = axisNamed(two[1]!) ?? (t.includes("=") ? two[1]! : undefined);
    if (a) return { key: axisKey(a, two[2]!), axis: a };
  }
  if (!t.includes(" ") && axisNamed(t) && !main.some((k) => lower(k) === lower(t))) return { axisOnly: axisNamed(t)! };
  return /^[\w-]+$/.test(t) ? { key: t, axis: null } : null;
}

function parseRound(c: RawComment, round: number): DesignRound {
  const lines = visibleLines(c.body);
  const title = lines.find((l) => l.startsWith("## "))?.slice(3).trim() ?? `Design round ${round}`;
  const declared = declaredKeys(lines);
  const axisNames = declared.axes.map((a) => a.name);
  const about = new Map(declared.axes.map((a) => [a.name, a.about]));
  const found: DesignRound["variants"] = [];
  lines.forEach((l, i) => {
    const h = /^###\s+([^:]+):\s*(.*)$/.exec(l);
    if (!h) return;
    const summary = (lines[i + 1] ?? "").trim();
    const r = resolveKey(h[1]!, axisNames, declared.main);
    if (r && "axisOnly" in r) {
      // an older round describes a whole axis under one heading (`### slide: o fade (today) vs a sideways slide`)
      about.set(r.axisOnly, h[2]!.trim());
      return;
    }
    const key = r?.key ?? h[1]!.trim();
    const axis = r?.axis ?? null;
    if (axis && !axisNames.includes(axis)) axisNames.push(axis);
    if (!found.some((v) => v.key === key)) found.push({ key, name: h[2]!.trim(), summary, axis });
  });
  const screenshots0 = parseScreenshots(c.body);
  const questions = roundQuestions(c.body, screenshots0);
  if (questions.length) {
    // the question format: the `### <n>. <label>:` headings are questions, not variants; the things to pick are the declared short forms (`1A`)
    for (let i = found.length - 1; i >= 0; i--) if (/^\d+\.\s/.test(found[i]!.key)) found.splice(i, 1);
    for (const q of questions)
      for (const o of q.options) {
        const key = `${q.n}${o.letter}`;
        if (declared.main.includes(key) && !found.some((v) => v.key === key)) found.push({ key, name: o.name, summary: o.short, axis: null });
      }
  }
  for (const k of declared.main) if (!found.some((v) => v.key === k)) found.push({ key: k, name: k, summary: "", axis: null });
  for (const a of declared.axes)
    for (const o of a.options) if (!found.some((v) => v.key === axisKey(a.name, o))) found.push({ key: axisKey(a.name, o), name: o, summary: "", axis: a.name });
  // main first, then each axis in the order it was declared
  const variants = [...found.filter((v) => v.axis === null), ...axisNames.flatMap((a) => found.filter((v) => v.axis === a))];
  const keys = variants.map((v) => v.key);
  const question = lines.find((l) => l.startsWith("**Question:**"))?.replace("**Question:**", "").trim() ?? null;
  // a question round's shots keep their alt's own grouping (`1. Shell`) and their order, which `questions[].shots` indexes
  const screenshots = questions.length ? screenshots0 : parseScreenshots(c.body, { variants: keys }).map((s) => (s.variant && !keys.includes(s.variant) ? { ...s, ...shotKey(s.variant, axisNames, keys) } : s));
  return {
    round,
    title,
    preview: field(lines, "Preview"),
    variants,
    axes: axisNames.map((name) => ({ name, about: about.get(name) ?? "" })),
    question,
    questions,
    screenshots,
    createdAt: c.createdAt,
    url: c.url,
    commentId: c.id,
  };
}

/** An alt text's variant that is not a declared key as written: `slide a` / `slide-a` for `slide=a`, `a-step2` for variant a in state step2. */
function shotKey(raw: string, axes: string[], keys: string[]): Pick<Screenshot, "variant"> | Pick<Screenshot, "variant" | "state"> {
  const lower = (s: string) => s.toLowerCase();
  const r = resolveKey(raw, axes, keys);
  if (r && "key" in r && keys.some((k) => lower(k) === lower(r.key))) return { variant: r.key };
  const m = /^(\w+)[-\s](.+)$/.exec(raw.trim());
  if (m && keys.some((k) => lower(k) === lower(m[1]!))) return { variant: m[1]!, state: m[2]! };
  return { variant: raw };
}

function parseLook(c: RawComment): LookNote {
  const lines = visibleLines(c.body);
  const headline = lines.find((l) => l.startsWith("### "))?.replace(/^###\s+(Look:\s*)?/, "").trim() ?? "Look";
  const checkAt = lines.findIndex((l) => l.trim() === "Check:");
  const checks: string[] = [];
  if (checkAt >= 0) {
    for (const l of lines.slice(checkAt + 1)) {
      const m = /^\s*[-*]\s+(.*)$/.exec(l);
      if (m) checks.push(m[1]!.trim());
      else if (l.trim()) break;
    }
  }
  return {
    headline,
    preview: field(lines, "Preview"),
    path: field(lines, "Path"),
    checks,
    screenshots: parseScreenshots(c.body),
    createdAt: c.createdAt,
    url: c.url,
    commentId: c.id,
  };
}

// ---- What Tandem writes (as the user: unmarked, like a comment typed on GitHub) ----

/** What every reply to a decision starts with: the decision it belongs to, spelled out (#1). Read back by `repliesByMarker` and by `decide.sh`. */
export const decisionPrefix = (id: string) => `Decision ${id}: `;

export function answerComment(requestId: string, answer: string): string {
  return `${decisionPrefix(requestId)}${answer.trim()}`;
}

export function challengeComment(decisionId: string, text: string): string {
  return `${decisionPrefix(decisionId)}${text.trim()}`;
}

export interface RoundReaction {
  round: number;
  picks: string[];
  rejects: string[];
  comment: string;
}

/** `R1:` then the picks and the rejects, one line per axis: `- pick: b`, `- pick slide: a` (core/axes.ts). */
export function roundReactionComment(r: RoundReaction): string {
  const lines = [`R${r.round}:`];
  for (const [verb, keys] of [["pick", r.picks], ["reject", r.rejects]] as const)
    for (const [axis, options] of byAxis(keys)) lines.push(`- ${verb}${axis ? ` ${axis}` : ""}: ${options.join(", ")}`);
  if (r.comment.trim()) lines.push("", r.comment.trim());
  return lines.join("\n");
}

export type PrVerdict = "approve" | "hold" | "send-back";

export function prVerdictComment(requestId: string | null, verdict: PrVerdict, text: string): string {
  const head = { approve: "Approve: merge", hold: "Hold", "send-back": "Send back" }[verdict];
  const prefix = requestId ? decisionPrefix(requestId) : "";
  return `${prefix}${head}${text.trim() ? `. ${text.trim()}` : ""}`;
}
