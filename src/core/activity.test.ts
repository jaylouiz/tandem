import { describe, expect, it } from "vitest";
import { agentCounts, agentGroups, classifyActivity, entryOf, parseLog } from "./activity.ts";
import { buildCard } from "./card.ts";
import { DEFAULT_WORKFLOW as cfg } from "./config.ts";
import { demoIssues } from "./fixtures.ts";
import type { Card } from "./types.ts";

const now = Date.parse("2026-11-04T12:00:00Z");
const hoursAgo = (h: number) => new Date(now - h * 3_600_000).toISOString();
const cards = () => demoIssues(now).map((i) => buildCard(i, cfg, null));
const card = (n: number, repo = "acme/app"): Card => cards().find((c) => c.repo === repo && c.number === n)!;
const idle = (c: Card, over: Partial<Card> = {}): Card => ({ ...c, waiting: null, awaitingPickup: false, onHold: false, ...over });

describe("parseLog", () => {
  it("reads the lines decide.sh log writes and skips the title", () => {
    const text = "# Coordination log #2 (acme/tandem)\n\n- 2026-11-04T11:15Z design stage started (worker)\n- 2026-11-04T11:27Z R1 posted: 3 variants\n";
    expect(parseLog(text)).toEqual([
      { at: "2026-11-04T11:15:00Z", text: "design stage started (worker)" },
      { at: "2026-11-04T11:27:00Z", text: "R1 posted: 3 variants" },
    ]);
  });

  it("ignores lines without a timestamp", () => {
    expect(parseLog("- no time here\nfree text\n")).toEqual([]);
  });
});

describe("entryOf", () => {
  it("is the last timestamped line", () => {
    expect(entryOf("# t\n\n- 2026-11-04T10:00Z a\n- 2026-11-04T11:00Z b\n", "2026-11-04T09:00:00Z")).toEqual({ at: "2026-11-04T11:00:00Z", last: "b" });
  });
  it("falls back to the file's mtime and the last free line", () => {
    expect(entryOf("# t\n\nfree text\n", "2026-11-04T09:00:00Z")).toEqual({ at: "2026-11-04T09:00:00Z", last: "free text" });
  });
  it("is empty for an empty log", () => {
    expect(entryOf("", null)).toEqual({ at: null, last: null });
  });
});

describe("classifyActivity", () => {
  const base = idle(card(107), { updatedAt: hoursAgo(1) }); // Build, open
  it("is null outside UX Design and Build, and for closed Cards", () => {
    expect(classifyActivity(card(103), undefined, now, cfg)).toBeNull(); // Backlog
    expect(classifyActivity(card(108), undefined, now, cfg)).toBeNull(); // Done
  });
  it("working while it moved within stuckAfterHours, stuck after", () => {
    expect(classifyActivity({ ...base, updatedAt: hoursAgo(2.9) }, undefined, now, cfg)?.state).toBe("working");
    expect(classifyActivity({ ...base, updatedAt: hoursAgo(3.1) }, undefined, now, cfg)?.state).toBe("stuck");
  });
  it("a recent log line keeps an old Card working and supplies `last`", () => {
    const act = classifyActivity({ ...base, updatedAt: hoursAgo(10) }, { at: hoursAgo(0.5), last: "E2E running" }, now, cfg);
    expect(act).toMatchObject({ state: "working", last: "E2E running", at: hoursAgo(0.5) });
  });
  it("an old log line does not hide a newer GitHub update", () => {
    expect(classifyActivity({ ...base, updatedAt: hoursAgo(1) }, { at: hoursAgo(20), last: "x" }, now, cfg)?.at).toBe(hoursAgo(1));
  });
  it("parked, queued and hold win over stuck", () => {
    const old = hoursAgo(30);
    expect(classifyActivity(idle(base, { updatedAt: old, waiting: { kind: "decision", since: old, requestId: "D1" } }), undefined, now, cfg)?.state).toBe("parked");
    expect(classifyActivity(idle(base, { updatedAt: old, awaitingPickup: true }), undefined, now, cfg)?.state).toBe("queued");
    expect(classifyActivity(idle(base, { updatedAt: old, onHold: true }), undefined, now, cfg)?.state).toBe("hold");
  });
  it("honours a configured threshold", () => {
    expect(classifyActivity({ ...base, updatedAt: hoursAgo(2) }, undefined, now, { stuckAfterHours: 1 })?.state).toBe("stuck");
  });
});

describe("agentGroups", () => {
  it("orders sections Stuck, Working, Parked, Queued, On hold and omits empty ones", () => {
    const groups = agentGroups(cards(), {}, now, cfg);
    expect(groups.map((g) => g.state)).toEqual(expect.arrayContaining(["parked"]));
    const order = ["stuck", "working", "parked", "queued", "hold"];
    const idx = groups.map((g) => order.indexOf(g.state));
    expect(idx).toEqual([...idx].sort((a, b) => a - b));
    expect(groups.every((g) => g.rows.length > 0)).toBe(true);
  });
  it("counts working and stuck", () => {
    const base = idle(card(107), { updatedAt: hoursAgo(1) });
    const stale = { ...base, key: "x#1", updatedAt: hoursAgo(9) };
    expect(agentCounts(agentGroups([base, stale], {}, now, cfg))).toEqual({ working: 1, stuck: 1 });
  });
});
