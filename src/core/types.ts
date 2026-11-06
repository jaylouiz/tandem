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
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
  comments: RawComment[];
  pullRequests: RawPullRequest[];
  /** Sub-issue parent in the same repo (a wayfinder ticket's map). Absent in caches written before wayfinder maps. */
  parent?: number | null;
  assignees?: string[];
  /** Issues in the same repo that block this one (native issue dependencies). */
  blockedBy?: { number: number; state: "open" | "closed" }[];
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
  variant: string | null; // R<k> · <variant> · <viewport>; look · <viewport> · <state>
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

export interface DesignRound {
  round: number;
  title: string;
  preview: string | null;
  variants: { key: string; name: string; summary: string }[];
  question: string | null;
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

export type TicketKind = "research" | "prototype" | "grilling" | "task";
/** frontier: open, unblocked, unclaimed. decided: closed completed. dropped: closed not planned. */
export type TicketStatus = "frontier" | "claimed" | "blocked" | "decided" | "dropped";

/** A wayfinder decision ticket: a sub-issue of a map. Not a Card (GLOSSARY: Ticket). */
export interface WayfinderTicket {
  number: number;
  title: string;
  url: string;
  kind: TicketKind | null;
  status: TicketStatus;
  assignees: string[];
  /** open blockers (empty unless status is blocked) */
  blockedBy: { number: number; title: string }[];
  /** the map index's one-line answer, for decided tickets */
  gist: string | null;
  closedAt: string | null;
}

export interface WayfinderMap {
  key: string; // owner/repo#n
  repo: string;
  number: number;
  title: string;
  url: string;
  body: string;
  state: "open" | "closed";
  updatedAt: string;
  tickets: WayfinderTicket[];
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
  /** wayfinder maps with their tickets; maps and tickets are never Cards */
  maps: WayfinderMap[];
  /** repo -> last successful refresh, an error, and whether a refresh is running now */
  sync: Record<string, { at: string | null; error: string | null; syncing: boolean }>;
}

/** `PushResult.reason` when Orca answered and no coordinator runs for the repo (any other reason: the Push itself failed). */
export const NO_COORDINATOR = "no coordinator running";

export interface Coordinator {
  runId: string;
  repo: string;
  terminal: string;
  worktreePath: string;
}

/** What the server streams to the web app. */
export interface BoardView extends BoardSnapshot {
  /** the Phase mapping in force, so the web app can re-derive a Card from labels (optimistic triage) */
  workflow: WorkflowConfig;
  viewer: string | null;
  source: "github" | "fixture";
  /** repo -> the live /orchestrate-gh-issues coordinator Tandem Pushes to */
  coordinators: Record<string, Coordinator>;
  /** card key -> the last coordination log line, for open Cards in UX Design and Build that have a log */
  activity: Record<string, ActivityEntry>;
}
