// Reads and writes the agent-workflow comment contract (agent-workflow README "Comment markers",
// skills/orchestrate-gh-issues/decide.sh). Tandem acts as the user: everything it writes for the user is an
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
 * 1. an unmarked comment whose first text is `D<k>:` and with a `request`/`record` D<k> earlier in the thread
 *    belongs to that decision (Tandem writes that prefix on every answer, challenge and verdict, so a challenge to D2
 *    written while D3 is open stays D2's);
 * 2. any other unmarked comment belongs to the nearest earlier marked comment (a `note` has no reply of its own).
 */
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
    const named = /^\s*(D\d+):/.exec(c.body)?.[1];
    const owner = named !== undefined && decisions.has(named) ? decisions.get(named)! : nearest;
    if (owner >= 0) replies.set(owner, [...(replies.get(owner) ?? []), c.body.trim()]);
  });
  return replies;
}

/**
 * Walk an issue thread once and pull out every structured element the Board shows. A reply belongs to the decision
 * it names (`D<k>:`), else to the nearest earlier marked comment: see `repliesByMarker`, the same rule as `decide.sh`.
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

function parseRound(c: RawComment, round: number): DesignRound {
  const lines = visibleLines(c.body);
  const title = lines.find((l) => l.startsWith("## "))?.slice(3).trim() ?? `Design round ${round}`;
  const keys = (field(lines, "Variants") ?? "").split(",").map((k) => k.trim()).filter(Boolean);
  const variants: DesignRound["variants"] = [];
  lines.forEach((l, i) => {
    const h = /^###\s+([^:]+):\s*(.*)$/.exec(l);
    if (h) variants.push({ key: h[1]!.trim(), name: h[2]!.trim(), summary: (lines[i + 1] ?? "").trim() });
  });
  for (const k of keys) if (!variants.some((v) => v.key === k)) variants.push({ key: k, name: k, summary: "" });
  const question = lines.find((l) => l.startsWith("**Question:**"))?.replace("**Question:**", "").trim() ?? null;
  return {
    round,
    title,
    preview: field(lines, "Preview"),
    variants,
    question,
    screenshots: parseScreenshots(c.body, { variants: variants.map((v) => v.key) }),
    createdAt: c.createdAt,
    url: c.url,
    commentId: c.id,
  };
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

export function answerComment(requestId: string, answer: string): string {
  return `${requestId}: ${answer.trim()}`;
}

export function challengeComment(decisionId: string, text: string): string {
  return `${decisionId}: ${text.trim()}`;
}

export interface RoundReaction {
  round: number;
  picks: string[];
  rejects: string[];
  comment: string;
}

export function roundReactionComment(r: RoundReaction): string {
  const lines = [`R${r.round}:`];
  if (r.picks.length) lines.push(`- pick: ${r.picks.join(", ")}`);
  if (r.rejects.length) lines.push(`- reject: ${r.rejects.join(", ")}`);
  if (r.comment.trim()) lines.push("", r.comment.trim());
  return lines.join("\n");
}

export type PrVerdict = "approve" | "hold" | "send-back";

export function prVerdictComment(requestId: string | null, verdict: PrVerdict, text: string): string {
  const head = { approve: "Approve: merge", hold: "Hold", "send-back": "Send back" }[verdict];
  const prefix = requestId ? `${requestId}: ` : "";
  return `${prefix}${head}${text.trim() ? `. ${text.trim()}` : ""}`;
}
