// Phase mapping is configuration, not code (brief "Board model"). Defaults mirror agent-workflow docs/contract.md, "Labels" and
// "Phases and statuses" (status first, labels as the fallback); the developer's `~/.tandem/state.json` (key "workflow")
// overrides any field.
import type { NextStep, Phase } from "./types.ts";

export interface PhaseCondition {
  /** issue state; "closed" matches only completed issues (not "not planned") */
  state?: "open" | "closed";
  anyLabel?: string[];
  /** GitHub's native issue status, by name; an issue without a status never matches */
  anyStatus?: string[];
  /** an open pull request that closes the issue */
  openPr?: boolean;
}

export interface PhaseRule {
  phase: Phase;
  when: PhaseCondition;
}

export interface WorkflowConfig {
  /** first match wins; a rule with an empty `when` is the fallback */
  phaseRules: PhaseRule[];
  /** lane label -> Next step */
  nextStep: Record<string, NextStep>;
  /** the Next step a Phase is itself doing: a Card there shows its Next step only when it differs (a Build Card still to specify) */
  phaseStep: Partial<Record<Phase, NextStep>>;
  /** the native issue status that means "handed to an agent, not started yet"; Tandem sets it on "Hand to agent" */
  handedStatus: string;
  /** the statuses that mean work has started: a hand-over that cannot be taken back (Start coordinator) leaves them alone */
  startedStatuses: string[];
  /** the status a handed Card goes back to when it is re-steered or its Push did not arrive (a status cannot be cleared) */
  unhandedStatus: string;
  /** labels that put a Card on hold: `on-hold` (no stage starts, no merge) and the workflow's merge holds (docs/contract.md "Labels") */
  holdLabels: string[];
  /** the hold label Tandem itself sets and clears (the others belong to the workflow) */
  holdLabel: string;
  /** a Done Card needs a Look when it carries one of these, or went through UX Design */
  lookLabels: string[];
  /** label that marks agent decisions the user has not reviewed */
  agentDecidedLabel: string;
  needsDecisionLabel: string;
  /** fog (docs/contract.md "Labels"): the direction is open and the developer sets it, so the Card has no Next step and agents never start it */
  fogLabel: string;
  /** priority labels are `<prefix><n>` (1 highest), at most one per Card */
  priorityLabelPrefix: string;
  wayfinderMapLabel: string;
  /** an issue with a label starting with this is a wayfinder ticket: never a Card */
  wayfinderTicketPrefix: string;
  /** days a Seen Card stays on the Board */
  seenRetentionDays: number;
  /** an in-flight Card with no movement (GitHub update or log line) for this long counts as stuck */
  stuckAfterHours: number;
  /** how far back closed issues are fetched */
  closedLookbackDays: number;
  /** hours between two full fetches of a repo: the pass that drops issues GitHub no longer has (deleted, transferred, the repo recreated) */
  fullSyncHours: number;
  /** the slash command "Start coordinator" launches, followed by the Card numbers (`<command> #<n> …`); a renamed coordinator skill is this one field */
  coordinatorCommand: string;
}

export const DEFAULT_WORKFLOW: WorkflowConfig = {
  phaseRules: [
    { phase: "Done", when: { state: "closed" } },
    { phase: "Inbox", when: { anyLabel: ["inbox"] } },
    // the native issue status first (#18): "In progress" is UX Design in the design lane, else Build. Backlog, Todo or no status say
    // nothing about the Phase, so the label rules below decide (every issue from before statuses keeps its Phase)
    { phase: "UX Design", when: { anyStatus: ["In progress"], anyLabel: ["needs-design"] } },
    { phase: "Build", when: { anyStatus: ["In progress", "In review"] } },
    { phase: "UX Design", when: { anyLabel: ["phase:design"] } },
    { phase: "Build", when: { anyLabel: ["phase:build"] } },
    { phase: "Build", when: { openPr: true } },
    { phase: "Backlog", when: { anyLabel: ["needs-design", "needs-spec", "ready"] } },
    { phase: "Inbox", when: {} },
  ],
  nextStep: { "needs-design": "design", "needs-spec": "specify", ready: "build" },
  phaseStep: { "UX Design": "design", Build: "build" },
  handedStatus: "Todo",
  startedStatuses: ["In progress", "In review"],
  unhandedStatus: "Backlog",
  holdLabels: ["on-hold", "on-hold-after-spec", "do-not-merge"],
  holdLabel: "on-hold",
  lookLabels: ["ux-impact"],
  agentDecidedLabel: "agent-decided",
  needsDecisionLabel: "needs-decision",
  fogLabel: "needs-direction",
  priorityLabelPrefix: "priority:",
  wayfinderMapLabel: "wayfinder:map",
  wayfinderTicketPrefix: "wayfinder:",
  seenRetentionDays: 7,
  stuckAfterHours: 3,
  closedLookbackDays: 60,
  fullSyncHours: 6,
  coordinatorCommand: "/aw-coordinate",
};

export function mergeWorkflow(override: Partial<WorkflowConfig> | undefined): WorkflowConfig {
  return { ...DEFAULT_WORKFLOW, ...(override ?? {}) };
}
