import { beforeAll, describe, expect, it, vi } from "vitest";

// The store reads localStorage when it loads: stub the browser global first, then import.
const mem = new Map<string, string>();
vi.stubGlobal("localStorage", { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k) });
let keys: typeof import("./keys.ts");
beforeAll(async () => {
  keys = await import("./keys.ts");
});

describe("the key table", () => {
  it("binds no key twice in the same place, except where a binding hands the key on (Feedback digits fall through to the priorities, a text field's Esc to the usual one, Esc to the Repo filter once nothing is left to close)", () => {
    const seen = new Map<string, string>();
    for (const b of keys.BINDINGS)
      for (const k of b.keys) {
        const slot = `${b.chord ?? ""}|${b.mod ? "mod+" : ""}${k}`;
        const was = seen.get(slot);
        if (was) expect([was, b.id].some((id) => id === "pick-choice" || id === "leave-field" || id === "clear-repo-filter"), `${was} and ${b.id} on ${slot}`).toBe(true);
        seen.set(slot, b.id);
      }
  });

  it("scopes every key that acts on Cards to the views that list Cards (not Maps, Settings)", () => {
    const cardKeys = ["j", "k", "x", "l", "o", "m", "i", "d", "s", "b", "h", "w", "a", "0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "[", "]", "J", "K", "ArrowDown", "ArrowUp"];
    for (const k of cardKeys) for (const b of keys.BINDINGS.filter((b) => !b.chord && !b.mod && b.keys.includes(k))) expect(b.scope, `${b.id} on ${k}`).toBe("cards");
    // the chords with ⌘/Ctrl that act on the open Card: ⌘A (mark the column) and ⌘↵ (send the Feedback)
    for (const id of ["select-all", "send-feedback"]) expect(keys.BINDINGS.find((b) => b.id === id)?.scope, id).toBe("cards");
  });

  it("⌘Z runs the Undo a toast offers, but ⌘⇧Z (the system's Redo) does not", async () => {
    vi.stubGlobal("HTMLElement", class {});
    const { showToast, canUndo } = await import("./ui/Toast.tsx");
    const key = (shiftKey: boolean) => ({ key: shiftKey ? "Z" : "z", metaKey: true, ctrlKey: false, altKey: false, shiftKey, target: null, preventDefault: () => {} }) as unknown as KeyboardEvent;
    const ctx = { groups: [] } as unknown as Parameters<typeof keys.handleKey>[1];
    const undo = vi.fn();
    showToast({ text: "Moved", undo });
    keys.handleKey(key(true), ctx);
    expect(undo).not.toHaveBeenCalled();
    expect(canUndo()).toBe(true);
    keys.handleKey(key(false), ctx);
    expect(undo).toHaveBeenCalledTimes(1);
  });
});
