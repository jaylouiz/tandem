import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Card } from "../core/types.ts";

const mem = new Map<string, string>();
vi.stubGlobal("localStorage", { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k) });
let store: typeof import("./store.ts");
let seen: typeof import("./seen.ts");
beforeAll(async () => {
  store = await import("./store.ts");
  seen = await import("./seen.ts");
});
afterEach(() => vi.unstubAllGlobals());

const look = (n: number, seenAt: string | null = null) => ({ key: `o/r#${n}`, repo: "o/r", number: n, needsLook: true, seenAt, phase: "Done", labels: [] }) as unknown as Card;
const A = look(1);
const B = look(2);
const plain = { key: "o/r#3", repo: "o/r", number: 3, needsLook: false, seenAt: "x" } as unknown as Card;

let calls: { url: string; body: unknown }[];
beforeEach(() => {
  calls = [];
  store.useStore.setState({ board: { cards: [A, B, plain] } as never, pending: {}, marked: [], selected: null, notice: null, view: "waiting", repoFilter: null });
});
const answer = (fail: (url: string) => boolean) =>
  vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
    calls.push({ url, body: JSON.parse(String(init.body)) });
    return fail(url) ? new Response(JSON.stringify({ error: "boom" }), { status: 500, headers: { "content-type": "application/json" } }) : new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
  });

describe("markSeen", () => {
  it("marks the unseen Looks at once and writes each to /seen; Cards without a Look are left alone", async () => {
    answer(() => false);
    const done = seen.markSeen([A, B, plain]);
    expect(store.currentCards(store.useStore.getState()).filter((c) => c.seenAt && c.needsLook)).toHaveLength(2); // before the writes return
    await done;
    expect(calls.map((c) => c.url).sort()).toEqual(["/api/cards/o/r/1/seen", "/api/cards/o/r/2/seen"]);
    expect(calls.every((c) => (c.body as { seen: boolean }).seen)).toBe(true);
    expect(store.useStore.getState().notice?.text).toBe("2 Cards marked Seen");
  });

  it("rolls a failed Card back and says so once", async () => {
    answer((url) => url.endsWith("/2/seen"));
    await seen.markSeen([A, B]);
    const now = store.currentCards(store.useStore.getState());
    expect(now.find((c) => c.number === 1)!.seenAt).not.toBeNull();
    expect(now.find((c) => c.number === 2)!.seenAt).toBeNull();
    expect(store.useStore.getState().notice?.text).toBe("1 of 2 marked Seen. Failed: boom");
  });

  it("Undo marks them unseen again, judged on the Cards as they are now", async () => {
    answer(() => false);
    await seen.markSeen([A]);
    store.useStore.getState().notice!.undo!();
    await vi.waitFor(() => expect(calls.at(-1)!.body).toEqual({ seen: false }));
    await vi.waitFor(() => expect(store.currentCards(store.useStore.getState()).find((c) => c.number === 1)!.seenAt).toBeNull());
  });

  it("a quiet mark (opening a Card) shows no notice", async () => {
    answer(() => false);
    await seen.markSeen([A], true, { quiet: true });
    expect(store.useStore.getState().notice).toBeNull();
  });
});

describe("opening from the list", () => {
  it("a To look at Card is opened, kept listed and marked Seen; another kind is only opened", async () => {
    answer(() => false);
    seen.openFromList(A, true);
    expect(store.useStore.getState()).toMatchObject({ selected: A.key, linger: A.key });
    expect(store.currentCards(store.useStore.getState()).find((c) => c.number === 1)!.seenAt).not.toBeNull();
    seen.openFromList(plain, false);
    expect(store.useStore.getState()).toMatchObject({ selected: plain.key, linger: null });
    expect(calls.map((c) => c.url)).toEqual(["/api/cards/o/r/1/seen"]);
  });

  it("a failed mark brings the Card back unseen with a message", async () => {
    answer(() => true);
    seen.openFromList(B, true);
    await vi.waitFor(() => expect(store.useStore.getState().notice?.text).toBe("Not marked Seen: boom"));
    expect(store.currentCards(store.useStore.getState()).find((c) => c.number === 2)!.seenAt).toBeNull();
  });
});

describe("markSelectionSeen", () => {
  it("takes the marked Cards, else the open one, and clears the marks", async () => {
    answer(() => false);
    store.useStore.setState({ marked: [A.key, B.key], selected: plain.key });
    await seen.markSelectionSeen();
    expect(calls).toHaveLength(2);
    expect(store.useStore.getState().marked).toEqual([]);
    calls = [];
    store.useStore.setState({ selected: A.key, pending: {} });
    await seen.markSelectionSeen(false);
    expect(calls).toEqual([]); // not Seen: nothing to undo
    expect(store.useStore.getState().notice?.text).toBe("Nothing to mark unseen");
  });
});
