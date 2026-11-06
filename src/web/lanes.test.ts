import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Card } from "../core/types.ts";

// The store reads localStorage when it loads: stub the browser global first, then import.
const mem = new Map<string, string>();
vi.stubGlobal("localStorage", { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k) });
let store: typeof import("./store.ts");
let board: typeof import("./components/BoardView.tsx");
let sel: typeof import("./select.ts");
beforeAll(async () => {
  store = await import("./store.ts");
  board = await import("./components/BoardView.tsx");
  sel = await import("./select.ts");
});

const A = "o/alpha";
const B = "o/beta";
let n = 0;
const card = (repo: string, phase: Card["phase"], over: Partial<Card> = {}) =>
  ({ key: `${repo}#${++n}`, repo, number: n, phase, updatedAt: `2026-11-0${(n % 9) + 1}T10:00:00Z`, ...over }) as Card;
const keys = (g: Card[][]) => g.map((col) => col.map((c) => c.key));

describe("Board grouped by repo (#36)", () => {
  // Backlog: B's Card is newer than A's, so the flat Board order puts B first
  const a1 = card(A, "Backlog", { updatedAt: "2026-11-01T10:00:00Z" });
  const b1 = card(B, "Backlog", { updatedAt: "2026-11-04T10:00:00Z" });
  const a2 = card(A, "Backlog", { updatedAt: "2026-11-02T10:00:00Z" });
  const bInbox = card(B, "Inbox");
  const cards = [a1, b1, a2, bInbox];
  const lanes = { repos: [A, B], collapsed: {} as Record<string, boolean> };
  const backlog = (g: Card[][]) => (g[1] ?? []).map((c) => c.key);

  it("without lanes a column reads in Board order across repos", () => {
    expect(backlog(board.boardNavGroups(cards, {}))).toEqual([b1.key, a2.key, a1.key]);
  });

  it("with lanes a column reads lane by lane, each lane in Board order", () => {
    expect(backlog(board.boardNavGroups(cards, {}, lanes))).toEqual([a2.key, a1.key, b1.key]);
    expect(keys(board.boardNavGroups(cards, {}, lanes))[0]).toEqual([bInbox.key]);
  });

  it("a collapsed lane drops out of j/k and ⌘A", () => {
    const collapsed = { repos: [A, B], collapsed: { [A]: true } };
    expect(backlog(board.boardNavGroups(cards, {}, collapsed))).toEqual([b1.key]);
    expect(board.boardNavOrder(cards, {}, collapsed).map((c) => c.key)).toEqual([bInbox.key, b1.key]);
  });

  it("laneView: off, or fewer than two repos shown, is one list", () => {
    const s = { board: { repos: [B, A] } as never, repoFilter: null, lanes: true, collapsedLanes: {} };
    expect(store.laneView(s)?.repos).toEqual([A, B]);
    expect(store.laneView({ ...s, lanes: false })).toBeNull();
    expect(store.laneView({ ...s, repoFilter: A })).toBeNull();
    expect(store.laneView({ ...s, board: { repos: [A] } as never })).toBeNull();
    expect(store.laneView({ ...s, board: null })).toBeNull();
  });

  describe("the store", () => {
    beforeEach(() => store.useStore.setState({ lanes: false, collapsedLanes: {} }));

    it("remembers the toggle in the browser, not per session", () => {
      store.useStore.getState().setLanes(true);
      expect(store.useStore.getState().lanes).toBe(true);
      expect(mem.get("tandem.lanes")).toBe("1");
      store.useStore.getState().setLanes(false);
      expect(mem.get("tandem.lanes")).toBe("0");
    });

    it("collapses and re-opens a lane", () => {
      store.useStore.getState().toggleLane(A);
      expect(store.useStore.getState().collapsedLanes).toEqual({ [A]: true });
      store.useStore.getState().toggleLane(A);
      expect(store.useStore.getState().collapsedLanes[A]).toBe(false);
    });

    it("shift+j extends the marks to the next Card of the screen order: down a lane, then into the next one", () => {
      store.useStore.setState({ board: { cards, repos: [A, B] } as never, pending: {}, repoFilter: null, lanes: true, view: "board", selected: a2.key, marked: [] });
      sel.extendSelection(1);
      expect(store.useStore.getState().selected).toBe(a1.key);
      sel.extendSelection(1);
      expect(store.useStore.getState().selected).toBe(b1.key);
    });

    describe("a collapsed lane (three lanes, the middle one collapsed)", () => {
      const C = "o/gamma";
      const ca = card(A, "Backlog", { updatedAt: "2026-11-01T10:00:00Z" });
      const cb = card(B, "Backlog", { updatedAt: "2026-11-02T10:00:00Z" });
      const cb2 = card(B, "Backlog", { updatedAt: "2026-11-03T10:00:00Z" });
      const cc = card(C, "Backlog", { updatedAt: "2026-11-04T10:00:00Z" });
      const three = [ca, cb, cb2, cc];
      const setup = (selected: string | null) =>
        store.useStore.setState({ board: { cards: three, repos: [A, B, C] } as never, pending: {}, repoFilter: null, lanes: true, collapsedLanes: { [B]: true }, view: "board", selected, marked: [] });

      it("shift-click range skips the hidden Cards", () => {
        setup(ca.key);
        expect(sel.rangeKeys(three, ca.key, cc)).toEqual([ca.key, cc.key]);
      });

      it("shift+j steps over the collapsed lane", () => {
        setup(ca.key);
        sel.extendSelection(1);
        expect(store.useStore.getState().selected).toBe(cc.key);
        expect(store.useStore.getState().marked).toEqual([ca.key, cc.key]);
      });

      it("selecting a Card of a collapsed lane (palette, notification) opens its lane, others stay collapsed", () => {
        setup(null);
        store.useStore.setState({ collapsedLanes: { [A]: true, [B]: true } });
        store.useStore.getState().select(cb.key);
        expect(store.useStore.getState().collapsedLanes).toEqual({ [A]: true, [B]: false });
        expect(store.useStore.getState().selected).toBe(cb.key);
      });

      it("selecting nothing or a Card of an open lane leaves the lanes alone", () => {
        setup(null);
        const before = store.useStore.getState().collapsedLanes;
        store.useStore.getState().select(cc.key);
        store.useStore.getState().select(null);
        expect(store.useStore.getState().collapsedLanes).toBe(before);
      });

      describe("with the Repo filter (#47)", () => {
        it("a Card the filter hides closes instead of reopening its lane; the lanes stay as they were", () => {
          setup(cb.key);
          store.useStore.getState().setRepoFilter(A);
          expect(store.useStore.getState()).toMatchObject({ repoFilter: A, selected: null, collapsedLanes: { [B]: true } });
        });

        it("a filtered Board is one repo: no lanes, so a collapsed repo's Cards stay in the ranges", () => {
          setup(cb.key);
          store.useStore.getState().setRepoFilter(B);
          expect(store.laneView(store.useStore.getState())).toBeNull();
          expect(sel.rangeKeys(three, cb.key, cb2)).toEqual([cb2.key, cb.key]); // newest first
          expect(store.useStore.getState().selected).toBe(cb.key);
        });
      });
    });
  });
});
