// Phase mapping is configuration, not code (brief "Board model"). Defaults mirror the agent-workflow README
// table "Clients such as Tandem group issues by phase"; a user file (~/.tandem/config.json, key "workflow")
// overrides any field.
import type { NextStep, Phase } from "./types.ts";

export interface PhaseCondition {
  /** issue state; "closed" matches only completed issues (not "not planned") */
  state?: "open" | "closed";
  anyLabel?: string[];
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
  /** labels that put a Card on hold */
  holdLabels: string[];
  /** the hold label Tandem itself sets and clears (the others belong to the workflow) */
  holdLabel: string;
  /** a Done Card needs a Look when it carries one of these, or went through UX Design */
  lookLabels: string[];
  /** label that marks agent decisions the user has not reviewed */
  agentDecidedLabel: string;
  needsDecisionLabel: string;
  /** an Inbox Card that needs /wayfinder first: no Next step (agents never start wayfinder) */
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
}

export const DEFAULT_WORKFLOW: WorkflowConfig = {
  phaseRules: [
    { phase: "Done", when: { state: "closed" } },
    { phase: "Inbox", when: { anyLabel: ["inbox"] } },
    { phase: "UX Design", when: { anyLabel: ["phase:design"] } },
    { phase: "Build", when: { anyLabel: ["phase:build"] } },
    { phase: "Build", when: { openPr: true } },
    { phase: "Backlog", when: { anyLabel: ["needs-design", "needs-spec", "ready"] } },
    { phase: "Inbox", when: {} },
  ],
  nextStep: { "needs-design": "design", "needs-spec": "specify", ready: "build" },
  holdLabels: ["on-hold", "on-hold-after-spec", "do-not-merge"],
  holdLabel: "on-hold",
  lookLabels: ["ux-impact"],
  agentDecidedLabel: "agent-decided",
  needsDecisionLabel: "needs-decision",
  fogLabel: "needs-wayfinder",
  priorityLabelPrefix: "priority:",
  wayfinderMapLabel: "wayfinder:map",
  wayfinderTicketPrefix: "wayfinder:",
  seenRetentionDays: 7,
  stuckAfterHours: 3,
  closedLookbackDays: 60,
};

export function mergeWorkflow(override: Partial<WorkflowConfig> | undefined): WorkflowConfig {
  return { ...DEFAULT_WORKFLOW, ...(override ?? {}) };
}
