import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { decisionFeedback, prFeedback } from "../../core/answer.ts";
import type { Card } from "../../core/types.ts";

// The store reads localStorage when it loads: stub the browser global first, then import.
const mem = new Map<string, string>();
vi.stubGlobal("localStorage", { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k) });
let session: typeof import("./session.ts");
let useStore: typeof import("../store.ts").useStore;
beforeAll(async () => {
  session = await import("./session.ts");
  ({ useStore } = await import("../store.ts"));
});
beforeEach(() => {
  useStore.getState().setFocus(false);
  mem.clear(); // a first visit: Focus was never left before
  useStore.getState().setFocus(true);
});

const card = (n: number): Card => ({ key: `o/r#${n}`, repo: "o/r", number: n, title: `Card ${n}`, waiting: { kind: "decision", since: "2026-11-04T10:00:00Z", requestId: "D1" }, needsLook: false, seenAt: null, awaitingPickup: false }) as Card;

describe("a send from Focus", () => {
  it("holds the ask while the write runs, sends once, and puts the written comment on the receipt", async () => {
    let finish!: (sent: boolean) => void;
    const run = vi.fn(() => new Promise<boolean>((r) => (finish = r)));
    const f = decisionFeedback("D1", "B: field-level merge", "");
    const first = session.focusSend(card(1), f, run);
    expect(session.useFocus.getState().sending["o/r#1"]).toMatchObject({ key: "o/r#1", title: "Card 1" });
    // a second click or digit while the write is under way does nothing
    expect(await session.focusSend(card(1), f, run)).toBe(false);
    expect(run).toHaveBeenCalledTimes(1);
    // another Card is not held back by it
    expect(await session.focusSend(card(2), prFeedback("D1", "hold", ""), async () => true)).toBe(true);
    finish(true);
    expect(await first).toBe(true);
    expect(session.useFocus.getState().sending).toEqual({});
    expect(session.useFocus.getState().receipt).toEqual([
      { key: "o/r#2", title: "Card 2", repo: "o/r", number: 2, kind: "decision", comment: "D1: Hold", effect: "The PR stays open and is labelled do-not-merge" },
      { key: "o/r#1", title: "Card 1", repo: "o/r", number: 1, kind: "decision", comment: "D1: B", effect: "The agent goes on with your answer" },
    ]);
  });

  it("keeps a failed send off the receipt and lets it be sent again", async () => {
    const f = decisionFeedback("D1", "A: x", "");
    expect(await session.focusSend(card(1), f, async () => false)).toBe(false);
    expect(session.useFocus.getState()).toMatchObject({ sending: {}, receipt: [], failed: { "o/r#1": true } }); // the cover's own failure: its Send bar says it
    expect(await session.focusSend(card(1), f, async () => true)).toBe(true);
    expect(session.useFocus.getState().failed).toEqual({});
    expect(session.useFocus.getState().receipt.map((r) => r.comment)).toEqual(["D1: A"]);
  });

  it("gives every comment written its own line: a Card answered twice in one visit shows both", async () => {
    await session.focusSend(card(1), decisionFeedback("D1", "A: x", ""), async () => true);
    await session.focusSend(card(1), decisionFeedback("D2", "B: y", ""), async () => true);
    expect(session.useFocus.getState().receipt.map((r) => r.comment)).toEqual(["D1: A", "D2: B"]);
  });

  it("lets go of the ask when the write throws", async () => {
    await expect(session.focusSend(card(1), decisionFeedback("D1", "A: x", ""), () => Promise.reject(new Error("offline")))).rejects.toThrow("offline");
    expect(session.useFocus.getState().sending).toEqual({});
  });
});

describe("a visit to Focus", () => {
  it("is web state only: leaving starts over and keeps one thing, when Focus was left (tandem.focus.left)", async () => {
    expect(session.useFocus.getState()).toMatchObject({ stage: "start", since: null });
    await session.focusSend(card(1), decisionFeedback("D1", "A: x", ""), async () => true);
    session.useFocus.getState().setStage("ask");
    session.useFocus.getState().setNoting("o/r#1", true);
    expect(mem.get(session.LEFT_KEY)).toBeUndefined();
    useStore.getState().setFocus(false);
    const left = mem.get(session.LEFT_KEY)!;
    expect(Math.abs(Date.now() - Date.parse(left))).toBeLessThan(5_000);
    expect([...mem.keys()].filter((k) => k.startsWith("tandem.focus"))).toEqual([session.LEFT_KEY]);
    expect(session.useFocus.getState()).toMatchObject({ stage: "start", receipt: [], noting: {}, details: false });
    useStore.getState().setFocus(true);
    expect(session.useFocus.getState().since).toBe(left); // the next visit knows since when to call an ask new
  });

  it("a view change leaves Focus like Esc does", () => {
    useStore.getState().setView("board");
    expect(useStore.getState().focus).toBe(false);
    expect(mem.has(session.LEFT_KEY)).toBe(true);
    useStore.getState().setView("waiting");
  });
});
