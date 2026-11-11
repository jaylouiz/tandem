import { describe, expect, it } from "vitest";
import { askOf, decisionState, kindOf, sinceOf } from "./ask.ts";
import { buildCard } from "./card.ts";
import { DEFAULT_WORKFLOW as cfg } from "./config.ts";
import { demoIssues } from "./fixtures.ts";

const now = Date.parse("2026-11-04T12:00:00Z");
const card = (n: number, repo = "acme/app", seen: string | null = null) => buildCard(demoIssues(now).find((i) => i.repo === repo && i.number === n)!, cfg, seen);

describe("kindOf / askOf", () => {
  it("names each kind of Feedback and what it asks in one line", () => {
    expect(kindOf(card(105))).toBe("decision");
    expect(askOf(card(105))).toBe("How should conflicting edits be resolved?");
    expect(kindOf(card(104))).toBe("design-round");
    expect(askOf(card(104))).toMatch(/^Round 2, 3 variants: /);
    expect(kindOf(card(106))).toBe("pr-approval");
    expect(askOf(card(106))).toMatch(/^PR #210: Merge held/);
  });
  it("an agent decision is no kind: the Card shows what it would without it", () => {
    expect(kindOf(card(107))).toBeNull();
    expect(askOf(card(107))).toBe("");
    expect(kindOf(card(127))).toBe("decision"); // the blocker, not the decisions beside it
  });
  it("states an agent decision as new, accepted or challenged", () => {
    const c = card(127);
    expect(c.agentDecisions.map((d) => decisionState(c, d))).toEqual(["challenged", "new", "new"]);
    const raw = demoIssues(now).find((i) => i.number === 107)!;
    const accepted = buildCard({ ...raw, labels: raw.labels.filter((l) => l !== "agent-decided") }, cfg, null);
    expect(decisionState(accepted, accepted.agentDecisions[0]!)).toBe("accepted");
  });
  it("Look for an unseen Done Card with a Look, nothing for a Seen one", () => {
    expect(kindOf(card(108))).toBe("look");
    expect(askOf(card(108))).toBe("Settings page shows the new theme switch");
    expect(sinceOf(card(108))).toBe(card(108).closedAt);
    expect(kindOf(card(108, "acme/app", "2026-11-04T11:00:00Z"))).toBeNull();
  });
  it("no ask for a Card that waits on nothing", () => {
    expect(kindOf(card(103))).toBeNull();
    expect(askOf(card(103))).toBe("");
  });
});

describe("tally (the end of Focus)", () => {
  it("counts Looks as marked Seen and every other kind as answered", async () => {
    const { tally } = await import("./ask.ts");
    expect(tally(["decision", "pr-approval", "look"])).toBe("2 answered and 1 marked Seen");
    expect(tally(["look", "look"])).toBe("2 marked Seen");
    expect(tally(["design-round"])).toBe("1 answered");
    expect(tally([])).toBe("");
  });
});
