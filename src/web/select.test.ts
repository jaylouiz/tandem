import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Card } from "../core/types.ts";

// The store reads localStorage when it loads: stub the browser global first, then import.
const mem = new Map<string, string>();
vi.stubGlobal("localStorage", { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k) });
let sel: typeof import("./select.ts");
let store: typeof import("./store.ts");
beforeAll(async () => {
  store = await import("./store.ts");
  sel = await import("./select.ts");
});

const card = (n: number) => ({ key: `r/x#${n}` }) as Card;

describe("⌘A (selectGroup)", () => {
  beforeEach(() => store.useStore.setState({ selected: null, marked: [] }));

  it("marks every Card of the group the open Card is in, and no other group", () => {
    store.useStore.setState({ selected: "r/x#5" });
    sel.selectGroup([[card(1), card(2), card(3)], [card(4), card(5)]]);
    expect(store.useStore.getState().marked).toEqual(["r/x#4", "r/x#5"]);
  });

  it("marks nothing when no Card is open or the open Card is in no group", () => {
    sel.selectGroup([[card(1), card(2)]]);
    expect(store.useStore.getState().marked).toEqual([]);
    store.useStore.setState({ selected: "r/x#9" });
    sel.selectGroup([[card(1), card(2)]]);
    expect(store.useStore.getState().marked).toEqual([]);
  });
});
