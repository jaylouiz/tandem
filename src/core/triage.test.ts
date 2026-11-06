import { describe, expect, it } from "vitest";
import { buildCard } from "./card.ts";
import { DEFAULT_WORKFLOW as cfg } from "./config.ts";
import { demoIssues } from "./fixtures.ts";
import { boardOrder } from "./card.ts";
import { handNotice, handedValid, invertChange, moveNotice, planMove, pruneHanded, startNotice, planTriage, relabel, skipReason, startRequests, triageLabels } from "./triage.ts";

const now = Date.parse("2026-11-04T12:00:00Z");
const card = (n: number) => buildCard(demoIssues(now).find((i) => i.number === n && i.repo === "acme/app")!, cfg, null);

describe("next step", () => {
  it("sets the lane and drops inbox", () => {
    expect(triageLabels({ kind: "next", step: "specify" }, card(101), cfg)).toEqual({ add: ["needs-spec"], remove: ["inbox"] });
  });
  it("swaps the lane on a Backlog Card", () => {
    expect(triageLabels({ kind: "next", step: "build" }, card(103), cfg)).toEqual({ add: ["ready"], remove: ["needs-spec"] });
  });
  it("writes nothing when the lane is already set", () => {
    expect(triageLabels({ kind: "next", step: "specify" }, card(103), cfg)).toEqual({ add: [], remove: [] });
  });
  it("is label-only: the config decides the lane label", () => {
    const custom = { ...cfg, nextStep: { "step:spec": "specify" as const } };
    expect(triageLabels({ kind: "next", step: "specify" }, card(101), custom)).toEqual({ add: ["step:spec"], remove: ["inbox"] });
  });
});

describe("next step with a custom Inbox label", () => {
  const custom = { ...cfg, phaseRules: cfg.phaseRules.map((r) => (r.phase === "Inbox" && r.when.anyLabel ? { ...r, when: { anyLabel: ["triage"] } } : r)) };
  it("removes the Inbox label from the Phase rules, not a literal inbox", () => {
    const inInbox = { ...card(101), labels: ["triage"] };
    expect(triageLabels({ kind: "next", step: "specify" }, inInbox, custom)).toEqual({ add: ["needs-spec"], remove: ["triage"] });
    expect(planMove([inInbox], "Backlog", custom).steps[0]!.change).toEqual({ add: ["needs-spec"], remove: ["triage"] });
    expect(relabel(inInbox, planMove([inInbox], "Backlog", custom).steps[0]!.change, custom)).toMatchObject({ phase: "Backlog" });
  });
});

describe("hold", () => {
  it("toggles the on-hold label", () => {
    expect(triageLabels({ kind: "hold" }, card(103), cfg)).toEqual({ add: ["on-hold"], remove: [] });
    const held = { ...card(103), labels: ["needs-spec", "on-hold"] };
    expect(triageLabels({ kind: "hold" }, held, cfg)).toEqual({ add: [], remove: ["on-hold"] });
  });
  it("a set releases only when every Card is held", () => {
    const held = { ...card(103), labels: ["needs-spec", "on-hold"] };
    const mixed = planTriage({ kind: "hold" }, [held, card(101)], cfg);
    expect(mixed.steps.map((s) => [s.card.number, s.change])).toEqual([[101, { add: ["on-hold"], remove: [] }]]);
    expect(mixed.unchanged).toEqual([held]);
    const all = planTriage({ kind: "hold" }, [held], cfg);
    expect(all.steps[0]!.change).toEqual({ add: [], remove: ["on-hold"] });
  });
});

describe("applicability", () => {
  it("skips Done Cards and, for Next step, Cards past the Backlog", () => {
    expect(skipReason({ kind: "hold" }, card(108))).toBe("Done");
    expect(skipReason({ kind: "next", step: "build" }, card(106))).toBe("Build");
    expect(skipReason({ kind: "hold" }, card(106))).toBeNull();
  });
  it("hand needs a Next step and no waiting Feedback", () => {
    expect(skipReason({ kind: "hand" }, card(101))).toBe("no Next step");
    expect(skipReason({ kind: "hand" }, card(103))).toBeNull();
  });
  it("a bulk plan reports skipped Cards with the reason", () => {
    const p = planTriage({ kind: "next", step: "specify" }, [card(101), card(106), card(108)], cfg);
    expect(p.steps.map((s) => s.card.number)).toEqual([101]);
    expect(p.skipped.map((s) => [s.card.number, s.reason])).toEqual([[106, "Build"], [108, "Done"]]);
  });
});

describe("relabel (optimistic)", () => {
  it("re-derives Phase, Next step and hold from the new labels", () => {
    const c = card(101);
    const change = triageLabels({ kind: "next", step: "specify" }, c, cfg);
    expect(relabel(c, change, cfg)).toMatchObject({ phase: "Backlog", nextStep: "specify", onHold: false, labels: ["needs-spec"] });
    expect(relabel(c, { add: ["on-hold"], remove: [] }, cfg)).toMatchObject({ phase: "Inbox", onHold: true });
  });
  it("matches what buildCard derives from the same labels", () => {
    const c = card(101);
    const change = triageLabels({ kind: "next", step: "build" }, c, cfg);
    const raw = demoIssues(now).find((i) => i.number === 101 && i.repo === "acme/app")!;
    const rebuilt = buildCard({ ...raw, labels: relabel(c, change, cfg).labels! }, cfg, null);
    expect(relabel(c, change, cfg)).toMatchObject({ phase: rebuilt.phase, nextStep: rebuilt.nextStep, onHold: rebuilt.onHold });
  });
});

describe("priority", () => {
  it("sets priority:<n> and removes any other priority label", () => {
    expect(triageLabels({ kind: "priority", level: 1 }, card(101), cfg)).toEqual({ add: ["priority:1"], remove: [] });
    expect(triageLabels({ kind: "priority", level: 3 }, card(103), cfg)).toEqual({ add: ["priority:3"], remove: ["priority:2"] });
    const two = { ...card(103), labels: ["needs-spec", "priority:1", "priority:2"] };
    expect(triageLabels({ kind: "priority", level: 2 }, two, cfg)).toEqual({ add: [], remove: ["priority:1"] });
  });
  it("0 clears and writes nothing when there is none", () => {
    expect(triageLabels({ kind: "priority", level: 0 }, card(103), cfg)).toEqual({ add: [], remove: ["priority:2"] });
    expect(triageLabels({ kind: "priority", level: 0 }, card(101), cfg)).toEqual({ add: [], remove: [] });
    expect(planTriage({ kind: "priority", level: 0 }, [card(101)], cfg).unchanged).toHaveLength(1);
  });
  it("applies to any open Card, not Done", () => {
    expect(skipReason({ kind: "priority", level: 1 }, card(106))).toBeNull();
    expect(skipReason({ kind: "priority", level: 1 }, card(108))).toBe("Done");
  });
  it("the config decides the label prefix; relabel derives the chip", () => {
    const custom = { ...cfg, priorityLabelPrefix: "p/" };
    expect(triageLabels({ kind: "priority", level: 2 }, card(101), custom)).toEqual({ add: ["p/2"], remove: [] });
    expect(relabel(card(101), { add: ["priority:2"], remove: [] }, cfg).priority).toBe(2);
    expect(relabel(card(103), { add: [], remove: ["priority:2"] }, cfg).priority).toBeNull();
  });
  it("Board order: waiting, then priority ascending (none last), then last moved", () => {
    const base = card(103);
    const mk = (p: number | null, at: string, waiting = false) => ({ ...base, priority: p, updatedAt: at, waiting: waiting ? card(104).waiting : null });
    const sorted = [mk(null, "2026-11-04T10:00:00Z"), mk(2, "2026-11-01T00:00:00Z"), mk(1, "2026-10-01T00:00:00Z"), mk(3, "2026-11-04T09:00:00Z", true), mk(2, "2026-11-03T00:00:00Z")].sort(boardOrder);
    expect(sorted.map((c) => [c.priority, c.updatedAt.slice(0, 10), !!c.waiting])).toEqual([
      [3, "2026-11-04", true],
      [1, "2026-10-01", false],
      [2, "2026-11-03", false],
      [2, "2026-11-01", false],
      [null, "2026-11-04", false],
    ]);
  });
});

describe("fog (needs wayfinder)", () => {
  const fog = () => card(116);
  it("derives from the label: stays in Inbox, no Next step", () => {
    expect(fog()).toMatchObject({ fog: true, phase: "Inbox", nextStep: null });
  });
  it("toggles the fog label on an Inbox Card; a set clears only when every Card has it", () => {
    expect(triageLabels({ kind: "fog" }, card(101), cfg)).toEqual({ add: ["needs-wayfinder"], remove: [] });
    expect(triageLabels({ kind: "fog" }, fog(), cfg)).toEqual({ add: [], remove: ["needs-wayfinder"] });
    expect(planTriage({ kind: "fog" }, [fog(), card(101)], cfg).steps.map((s) => [s.card.number, s.change.add])).toEqual([[101, ["needs-wayfinder"]]]);
    expect(planTriage({ kind: "fog" }, [fog()], cfg).steps[0]!.change.remove).toEqual(["needs-wayfinder"]);
  });
  it("is not offered past the Inbox", () => {
    expect(skipReason({ kind: "fog" }, card(103))).toBe("Backlog");
    expect(skipReason({ kind: "fog" }, card(108))).toBe("Done");
  });
  it("a Next step clears the marker and the inbox label", () => {
    expect(triageLabels({ kind: "next", step: "specify" }, fog(), cfg)).toEqual({ add: ["needs-spec"], remove: ["inbox", "needs-wayfinder"] });
  });
  it("cannot be handed to an agent", () => {
    expect(skipReason({ kind: "hand" }, fog())).toBe("needs wayfinder");
  });
  it("relabel shows the chip at once", () => {
    expect(relabel(card(101), { add: ["needs-wayfinder"], remove: [] }, cfg)).toMatchObject({ fog: true, nextStep: null, phase: "Inbox" });
  });
});

describe("hand to agent: notice and coordinator start", () => {
  const a = card(103);
  const b = { ...card(103), repo: "acme/other", number: 7, key: "acme/other#7" };
  const c = { ...card(103), number: 8, key: "acme/app#8" };
  it("says what was handed over and where no coordinator runs", () => {
    expect(handNotice([a], [])).toBe("Handed to the coordinator · specify");
    expect(handNotice([a, b], [])).toBe("Handed to the coordinator · 2 Cards");
    expect(handNotice([], [a])).toBe("No coordinator running");
    expect(handNotice([a], [b])).toBe("Handed 1 Card to the coordinator; no coordinator running for other");
    expect(handNotice([], [a, b])).toBe("No coordinator running for app, other");
  });
  it("starts one coordinator per repo with every undelivered Card of that repo", () => {
    expect(startRequests([a, b, c])).toEqual([
      { repo: "acme/app", numbers: [103, 8] },
      { repo: "acme/other", numbers: [7] },
    ]);
  });
});

describe("handed to the coordinator", () => {
  const rec = { at: 1, nextStep: "specify" as const };
  it("counts only while the Card is open in Backlog, not on hold, with the same Next step", () => {
    const c = card(103);
    expect(handedValid(c, rec)).toBe(true);
    expect(handedValid(c, undefined)).toBe(false);
    expect(handedValid({ ...c, onHold: true }, rec)).toBe(false);
    expect(handedValid({ ...c, nextStep: "build" }, rec)).toBe(false);
    expect(handedValid({ ...c, phase: "Build" }, rec)).toBe(false);
    expect(handedValid({ ...c, state: "closed" }, rec)).toBe(false);
  });
  it("makes Hand to agent not applicable again, other actions unaffected", () => {
    const c = card(103);
    expect(skipReason({ kind: "hand" }, c, rec)).toBe("already handed");
    expect(skipReason({ kind: "hand" }, { ...c, onHold: true }, rec)).toBeNull();
    expect(skipReason({ kind: "hold" }, c, rec)).toBeNull();
    const plan = planTriage({ kind: "hand" }, [c, { ...c, number: 104, key: "acme/app#104" }], cfg, { [c.key]: rec });
    expect(plan.skipped.map((s) => [s.card.number, s.reason])).toEqual([[103, "already handed"]]);
    expect(plan.steps.map((s) => s.card.number)).toEqual([104]);
  });
  it("prunes records of Cards that moved on or left the Board, and keeps the object when nothing changes", () => {
    const c = card(103);
    const handed = { [c.key]: rec, "o/r#9": rec };
    expect(pruneHanded(handed, [c])).toEqual({ [c.key]: rec });
    const same = { [c.key]: rec };
    expect(pruneHanded(same, [c])).toBe(same);
    expect(pruneHanded(same, [{ ...c, onHold: true }])).toEqual({});
  });
  it("names handed, undelivered and failed Cards in one notice", () => {
    const a = card(103);
    const b = { ...card(103), repo: "acme/other", number: 7, key: "acme/other#7" };
    expect(handNotice([], [], ["boom"])).toBe("Failed: boom");
    expect(handNotice([], [], ["boom", "x"])).toBe("2 failed: boom");
    expect(handNotice([a], [], ["boom"])).toBe("Handed to the coordinator · specify; 1 failed: boom");
    expect(handNotice([a], [b], ["boom"])).toBe("Handed 1 Card to the coordinator; no coordinator running for other; 1 failed: boom");
    expect(handNotice([], [b], ["boom"])).toBe("No coordinator running for other; 1 failed: boom");
  });
  it("names an unreachable Orca instead of saying no coordinator runs, and does not count it for Start coordinator (#63)", () => {
    const a = card(103);
    const b = { ...card(103), repo: "acme/other", number: 7, key: "acme/other#7" };
    const c = { ...card(103), number: 8, key: "acme/app#8" };
    const why = "could not reach Orca: orca terminal list timed out";
    expect(handNotice([], [], [], [{ card: a, reason: why }])).toBe(`Not handed over (${why})`);
    expect(handNotice([], [], [], [{ card: a, reason: why }, { card: b, reason: why }])).toBe(`2 Cards not handed over (${why})`);
    expect(handNotice([a], [], [], [{ card: b, reason: why }])).toBe(`Handed 1 Card to the coordinator; 1 Card not handed over (${why})`);
    expect(handNotice([], [a], [], [{ card: b, reason: why }])).toBe(`No coordinator running for app; 1 Card not handed over (${why})`);
    expect(handNotice([a], [b], [], [{ card: c, reason: why }])).toBe(`Handed 1 Card to the coordinator; no coordinator running for other; 1 Card not handed over (${why})`);
    expect(handNotice([], [], ["boom"], [{ card: a, reason: why }])).toBe(`Not handed over (${why}); 1 failed: boom`);
    expect(handNotice([], [a], [], [])).toBe("No coordinator running");
  });
  it("reports which repos started and which did not", () => {
    expect(startNotice(["a", "b"], [])).toBe("Coordinator starting for a, b");
    expect(startNotice(["a"], [{ repo: "b", error: "No local checkout known for b." }])).toBe("Coordinator starting for a; Could not start coordinator for b: No local checkout known for b.");
    expect(startNotice([], [{ repo: "b", error: "x" }])).toBe("Could not start coordinator for b: x");
  });
});

describe("planMove", () => {
  const steps = (plan: ReturnType<typeof planMove>) => plan.steps.map((s) => [s.card.number, s.change]);
  it("moves Inbox Cards to Backlog with their own Next step, else specify", () => {
    const withStep = { ...card(101), labels: ["inbox", "needs-design"], nextStep: "design" as const };
    const plan = planMove([card(101), withStep], "Backlog", cfg);
    expect(plan.steps.map((s) => s.change)).toEqual([
      { add: ["needs-spec"], remove: ["inbox"] },
      { add: [], remove: ["inbox"] },
    ]);
  });
  it("the picked Next step overrides every Card", () => {
    expect(steps(planMove([card(101), card(103)], "Backlog", cfg, "build"))).toEqual([
      [101, { add: ["ready"], remove: ["inbox"] }],
      [103, { add: ["ready"], remove: ["needs-spec"] }],
    ]);
  });
  it("a Backlog Card that already has the Next step is already there", () => {
    const plan = planMove([card(103)], "Backlog", cfg);
    expect(plan.steps).toEqual([]);
    expect(plan.same.map((c) => c.number)).toEqual([103]);
  });
  it("skips fog Cards and Cards in agent-owned Phases, with the reason", () => {
    const plan = planMove([card(116), card(106), card(101)], "Backlog", cfg);
    expect(plan.skipped.map((s) => [s.card.number, s.reason])).toEqual([[116, "needs wayfinder"], [106, "Build"]]);
    expect(plan.steps.map((s) => s.card.number)).toEqual([101]);
  });
  it("skips closed and Done Cards", () => {
    const done = { ...card(101), phase: "Done" as const, state: "closed" as const };
    expect(planMove([done], "Inbox", cfg).skipped).toEqual([{ card: done, reason: "Done" }]);
  });
  it("moves Backlog Cards to Inbox: Inbox label added, lane labels removed, hold and priority kept", () => {
    const held = { ...card(103), labels: ["needs-spec", "on-hold", "priority:2"] };
    expect(planMove([held], "Inbox", cfg).steps[0]!.change).toEqual({ add: ["inbox"], remove: ["needs-spec"] });
    const relabelled = relabel(held, planMove([held], "Inbox", cfg).steps[0]!.change, cfg);
    expect(relabelled).toMatchObject({ phase: "Inbox", nextStep: null, onHold: true, priority: 2 });
  });
  it("Inbox Cards are already in Inbox", () => {
    expect(planMove([card(101)], "Inbox", cfg).same.map((c) => c.number)).toEqual([101]);
  });
  it("reads the Inbox label from the Phase rules, never a literal", () => {
    const custom = { ...cfg, phaseRules: cfg.phaseRules.map((r) => (r.phase === "Inbox" && r.when.anyLabel ? { ...r, when: { anyLabel: ["triage"] } } : r)) };
    expect(planMove([card(103)], "Inbox", custom).steps[0]!.change).toEqual({ add: ["triage"], remove: ["needs-spec"] });
    const none = { ...cfg, phaseRules: cfg.phaseRules.filter((r) => !(r.phase === "Inbox" && r.when.anyLabel)) };
    expect(planMove([card(103)], "Inbox", none).skipped).toEqual([{ card: card(103), reason: "no Inbox label in the Phase rules" }]);
  });
  it("a Next step the config has no lane label for moves nothing", () => {
    const custom = { ...cfg, nextStep: { "step:spec": "specify" as const } };
    expect(planMove([card(101)], "Backlog", custom, "build").skipped.map((s) => s.reason)).toEqual(["no lane label for build"]);
  });
  it("inverts a change for Undo", () => {
    expect(invertChange({ add: ["a"], remove: ["b", "c"] })).toEqual({ add: ["b", "c"], remove: ["a"] });
  });
});

describe("moveNotice", () => {
  it("names the count, the Phase and the resulting Next steps", () => {
    const plan = planMove([card(101), card(103)], "Backlog", cfg, "build");
    expect(moveNotice(plan, "Backlog", cfg, [])).toBe("Moved 2 Cards to Backlog (Build)");
    const mixed = planMove([card(101), { ...card(103), labels: ["inbox", "ready"], nextStep: "build" as const, phase: "Inbox" as const }], "Backlog", cfg);
    expect(moveNotice(mixed, "Backlog", cfg, [])).toBe("Moved 2 Cards to Backlog (Specify, Build)");
  });
  it("one Card is named by repo and number", () => {
    expect(moveNotice(planMove([card(101)], "Backlog", cfg), "Backlog", cfg, [])).toBe("Moved app#101 to Backlog (Specify)");
    expect(moveNotice(planMove([card(103)], "Inbox", cfg), "Inbox", cfg, [])).toBe("Moved app#103 to Inbox");
  });
  it("counts skipped, already-there and failed Cards", () => {
    const plan = planMove([card(101), card(106), card(103)], "Backlog", cfg);
    expect(moveNotice(plan, "Backlog", cfg, [])).toBe("Moved app#101 to Backlog (Specify), 1 skipped (Build), 1 already in Backlog");
    expect(moveNotice(plan, "Backlog", cfg, ["boom"])).toBe("Nothing moved, 1 skipped (Build), 1 already in Backlog, 1 failed: boom");
    expect(moveNotice(planMove([card(103)], "Backlog", cfg), "Backlog", cfg, [])).toBe("Already in Backlog");
  });
});
