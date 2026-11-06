import { describe, expect, it } from "vitest";
import { buildCard } from "./card.ts";
import { DEFAULT_WORKFLOW as cfg } from "./config.ts";
import { demoIssues } from "./fixtures.ts";
import type { RawIssue } from "./types.ts";
import { buildMaps, isWayfinderIssue, parseIndex } from "./wayfinder.ts";

const demo = () => demoIssues(Date.parse("2026-11-04T12:00:00Z"));
const map109 = (issues = demo()) => buildMaps(issues, cfg).find((m) => m.number === 109)!;
const ticket = (n: number, issues?: RawIssue[]) => map109(issues).tickets.find((t) => t.number === n)!;

describe("parseIndex", () => {
  it("reads gists from the Decisions so far section only", () => {
    const body = "## Destination\n- [x](https://github.com/o/r/issues/1): not an index\n\n## Decisions so far\n\n<!-- c -->\n\n- [A](https://github.com/o/r/issues/7): answer a, with: colon\n- [B](https://github.com/o/r/issues/8) - answer b\n- no link here\n\n## Out of scope\n- [C](https://github.com/o/r/issues/9): out";
    expect([...parseIndex(body)]).toEqual([[7, "answer a, with: colon"], [8, "answer b"]]);
  });
  it("is empty without the section", () => {
    expect(parseIndex("## Destination\nx").size).toBe(0);
  });
});

describe("ticket status", () => {
  it("sorts the demo tickets into frontier, claimed, blocked, decided, dropped", () => {
    expect(map109().tickets.map((t) => [t.number, t.status])).toEqual([
      [120, "decided"], [121, "frontier"], [122, "claimed"], [123, "blocked"], [124, "decided"], [125, "decided"], [126, "dropped"],
    ]);
  });
  it("blocked lists only open blockers, with titles", () => {
    expect(ticket(123).blockedBy).toEqual([{ number: 121, title: "Which sync library fits?" }, { number: 122, title: "Conflict rules offline" }]);
  });
  it("closing a blocker in the cache unblocks a ticket whose own data did not change", () => {
    const issues = demo();
    for (const n of [121, 122]) Object.assign(issues.find((i) => i.number === n)!, { state: "closed", stateReason: "completed" });
    expect(ticket(123, issues)).toMatchObject({ status: "frontier", blockedBy: [] });
  });
  it("uses the stored blocker state when the blocker is not cached", () => {
    const issues = demo().filter((i) => i.number !== 121);
    expect(ticket(123, issues).blockedBy.map((b) => b.number)).toEqual([121, 122]);
    expect(ticket(123, issues).blockedBy[0]!.title).toBe("#121");
  });
  it("a claim wins over blocking", () => {
    const issues = demo();
    issues.find((i) => i.number === 123)!.assignees = ["demo-user"];
    expect(ticket(123, issues).status).toBe("claimed");
  });
});

describe("gist and kind", () => {
  it("takes the gist from the map index; a decided ticket without a line has none; open tickets never", () => {
    expect(ticket(120).gist).toBe("cache the last 200 tasks and everything edited offline.");
    expect(ticket(125).gist).toBe("last write wins inside five minutes, otherwise ask.");
    expect(ticket(124).gist).toBeNull();
    expect(ticket(121).gist).toBeNull();
  });
  it("reads the kind from the wayfinder:<kind> label", () => {
    expect(ticket(121).kind).toBe("research");
    expect(ticket(123).kind).toBe("task");
  });
  it("keeps a sub-issue without a wayfinder label, kind null", () => {
    const issues = demo();
    issues.push({ ...issues.find((i) => i.number === 121)!, number: 130, labels: [] });
    expect(ticket(130, issues).kind).toBeNull();
  });
});

describe("membership", () => {
  it("ignores issues whose parent is another map", () => {
    const issues = demo();
    issues.find((i) => i.number === 121)!.parent = 999;
    expect(map109(issues).tickets.map((t) => t.number)).not.toContain(121);
  });
  it("lists open maps before closed ones", () => {
    const issues = demo();
    issues.push({ ...issues.find((i) => i.number === 109)!, number: 300, state: "closed", stateReason: "completed", updatedAt: "2099-01-01T00:00:00Z" });
    expect(buildMaps(issues, cfg).map((m) => m.number)).toEqual([109, 300]);
  });
});

describe("off the Board", () => {
  it("every map and ticket is a wayfinder issue, by config", () => {
    const wf = demo().filter((i) => isWayfinderIssue(i, cfg));
    expect(wf.map((i) => i.number)).toEqual([109, 120, 121, 122, 123, 124, 125, 126]);
    expect(isWayfinderIssue({ ...wf[0]!, labels: ["wayfinder:map"] }, { ...cfg, wayfinderMapLabel: "m" })).toBe(true);
    expect(isWayfinderIssue({ ...wf[1]!, labels: ["inbox"] }, cfg)).toBe(false);
  });
  it("a ticket would otherwise land in the Inbox Phase", () => {
    expect(buildCard(demo().find((i) => i.number === 121)!, cfg, null).phase).toBe("Inbox");
  });
});
