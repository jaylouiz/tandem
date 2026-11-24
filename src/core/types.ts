// Domain model shared by server and web. Vocabulary: GLOSSARY.md.
import type { WorkflowConfig } from "./config.ts";

export type Phase = "Inbox" | "Backlog" | "UX Design" | "Build" | "Done";
export const PHASES: Phase[] = ["Inbox", "Backlog", "UX Design", "Build", "Done"];

export type NextStep = "design" | "specify" | "build";

/** Raw GitHub data for one issue, as a source delivers it. */
export interface RawIssue {
  repo: string; // owner/name
  number: number;
  title: string;
  body: string;
  url: string;
  state: "open" | "closed";
  stateReason: "completed" | "not_planned" | "reopened" | null;
  labels: string[];
  /** GitHub's native issue status by name ("In progress"); null or absent when the issue has none, the repo offers none or it could not be read (#18) */
  status?: string | null;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
  comments: RawComment[];
  pullRequests: RawPullRequest[];
}

export interface RawComment {
  id: string;
  author: string;
  body: string;
  createdAt: string;
  url: string;
}

export interface RawPullRequest {
  number: number;
  title: string;
  url: string;
  state: "open" | "closed" | "merged";
  isDraft: boolean;
  labels: string[];
  body: string;
  updatedAt: string;
}

/** A marked agent comment (`<!-- decision-<kind> … -->`), see agent-workflow README "Comment markers". */
export type MarkerKind = "request" | "record" | "answer" | "resolved" | "followup" | "note";

export interface Marker {
  kind: MarkerKind;
  /** D<k> for decision kinds. */
  id: string | null;
  /** note subtype: round, options, look, or null for a plain note. */
  note: "round" | "options" | "look" | null;
  /** R<k> for a round note. */
  round: number | null;
}

export interface Screenshot {
  src: string;
  alt: string;
  variant: string | null; // R<k> · <variant> · <viewport> (`slide a` for a further axis); look · <viewport> · <state>
  viewport: "desktop" | "mobile" | null;
  state: string | null;
}

export interface DecisionRequest {
  id: string; // D<k>
  question: string;
  options: string[];
  recommendation: string | null;
  preview: string | null;
  body: string;
  createdAt: string;
  url: string;
  /** unmarked comments that reply to the request (`D<k>:` prefix, else the nearest earlier marked comment), if any */
  answer: string | null;
  resolved: boolean;
}

export interface AgentDecision {
  id: string;
  title: string;
  body: string;
  createdAt: string;
  url: string;
  /** comments after the record that ask for a change */
  challenge: string | null;
}

/** One option of a question (agent-workflow docs/decision-format.md): lettered `A`, `B`, …; one of them may carry ★. */
export interface QuestionOption {
  /** what an answer names: the letter, or an older request's key (`B`, `H1 Sunlit Outline`) */
  letter: string;
  /** the option's name (a round's table) or its keywords (a request's `choices` line); an older request's may hold inline Markdown */
  name: string;
  /** "In short" of the round's table */
  short: string;
  today: boolean;
  recommended: boolean;
}

/** One question of a decision: `### <n>. <label>: <about>` in a round, `<!-- choices <n> <label>: … -->` in a request. */
export interface Question {
  n: number;
  label: string;
  about: string;
  options: QuestionOption[];
  /** `★ Why B: …` without its head, or an older request's recommendation text */
  why: string;
  /** indices into the round's `screenshots` (alt `R<k> · <n>. <label> · …`) */
  shots: number[];
}

export interface DesignRound {
  round: number;
  title: string;
  preview: string | null;
  /** main variants first, then each further axis's (`axis`: its name, `key`: `<axis>=<option>`; core/axes.ts) */
  variants: { key: string; name: string; summary: string; axis: string | null }[];
  /** further questions shown in the same prototype, combined freely with the main variants (`Axis <name>: <keys> (<about>)`) */
  axes: { name: string; about: string }[];
  question: string | null;
  /** the question sections of a round in the question format; empty for the older shape (variants and axes) */
  questions: Question[];
  screenshots: Screenshot[];
  createdAt: string;
  url: string;
  commentId: string;
}

export interface LookNote {
  headline: string;
  preview: string | null;
  path: string | null;
  checks: string[];
  screenshots: Screenshot[];
  createdAt: string;
  url: string;
  commentId: string;
}

/** What blocks the agent. Agent decisions never do (`agent-decided` holds nothing), so they are not a kind. */
export type WaitingKind = "decision" | "design-round" | "pr-approval";

export interface Waiting {
  kind: WaitingKind;
  since: string;
  /** D<k> of the open request, for decision / design-round / pr-approval */
  requestId: string | null;
}

export type DecisionState = "new" | "accepted" | "challenged";

export interface Card {
  key: string; // owner/repo#n
  repo: string;
  number: number;
  title: string;
  body: string;
  url: string;
  state: "open" | "closed";
  labels: string[];
  /** GitHub's native issue status by name, or null (#18) */
  status: string | null;
  /** handed to an agent and not started yet: the status is the workflow's `handedStatus`, the Card open, in Backlog and not on hold */
  handed: boolean;
  phase: Phase;
  nextStep: NextStep | null;
  onHold: boolean;
  /** 1 (highest) to 3 from a `priority:<n>` label, or null */
  priority: number | null;
  /** carries the fog label: needs /wayfinder before it has a Next step */
  fog: boolean;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
  waiting: Waiting | null;
  /** Feedback was given on GitHub but the agent has not resumed yet (no `resolved` marker). */
  awaitingPickup: boolean;
  requests: DecisionRequest[];
  agentDecisions: AgentDecision[];
  /** D<k> of the agent decisions not yet accepted or challenged (the Card carries `agent-decided`); never blocks */
  decisionsToAccept: string[];
  rounds: DesignRound[];
  look: LookNote | null;
  pullRequest: RawPullRequest | null;
  needsLook: boolean;
  seenAt: string | null;
}

/** The last line of an issue's coordination log (`decide.sh log`): what the agent last reported and when. */
export interface ActivityEntry {
  /** ISO time of that line (the file's mtime when the line has none), or null */
  at: string | null;
  last: string | null;
}

export interface BoardSnapshot {
  generatedAt: string;
  repos: string[];
  cards: Card[];
  /**
   * repo -> `at`: the last sync that brought issues in; `okAt`: the last pass that reached GitHub (also one that found nothing new);
   * `error`: what failed, from the second failed pass in a row, with `errorAt` the first of them; `syncing`: a refresh the developer waits for runs now
   */
  sync: Record<string, { at: string | null; okAt: string | null; error: string | null; errorAt: string | null; syncing: boolean }>;
}

/**
 * `PushResult.reason` when Orca answered and Tandem found no Run to send to for the repo (any other reason: the Push itself failed).
 * A fact about this one Push, never a claim that no coordinator runs: Tandem does not know that (#14).
 */
export const NO_RUN = "no Orca Run found";

/** What the server streams to the web app. */
export interface BoardView extends BoardSnapshot {
  /** the Phase mapping in force, so the web app can re-derive a Card from labels (optimistic triage) */
  workflow: WorkflowConfig;
  viewer: string | null;
  source: "github" | "fixture";
  /** card key -> the last coordination log line, for open Cards in UX Design and Build that have a log */
  activity: Record<string, ActivityEntry>;
}
