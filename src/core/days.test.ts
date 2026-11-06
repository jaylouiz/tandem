import { describe, expect, it } from "vitest";
import { groupByDay, splitDone } from "./days.ts";
import type { Card } from "./types.ts";

const done = (n: number, closedAt: string, over: Partial<Card> = {}) => ({ key: `r#${n}`, number: n, closedAt, updatedAt: closedAt, needsLook: false, seenAt: closedAt, ...over }) as Card;
const now = new Date(2026, 10, 4, 15, 0);
const at = (d: number, h: number) => new Date(2026, 10, d, h, 0).toISOString();

describe("groupByDay", () => {
  it("groups by local closing day, newest first, labelled Today and Yesterday", () => {
    const g = groupByDay([done(1, at(2, 9)), done(2, at(4, 8)), done(3, at(3, 20)), done(4, at(4, 14))], now);
    expect(g.map((x) => x.label.split(",")[0])).toEqual(["Today", "Yesterday", "Mon 2 Nov".split(",")[0]]);
    expect(g[0]!.cards.map((c) => c.number)).toEqual([4, 2]);
    expect(g.map((x) => x.day)).toEqual(["2026-11-04", "2026-11-03", "2026-11-02"]);
  });
  it("is empty without Cards", () => expect(groupByDay([], now)).toEqual([]));
});

describe("splitDone", () => {
  it("puts unseen Cards that need a Look first", () => {
    const { look, rest } = splitDone([done(1, at(4, 8)), done(2, at(4, 9), { needsLook: true, seenAt: null }), done(3, at(4, 7), { needsLook: true, seenAt: at(4, 8) })]);
    expect(look.map((c) => c.number)).toEqual([2]);
    expect(rest.map((c) => c.number)).toEqual([1, 3]);
  });
});
