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
        // a Focus key hands the key on outside Focus (`x`, `[` and `]` are the Card's there), like the Feedback digits hand on to the priorities
        if (was) expect([was, b.id].some((id) => id === "pick-choice" || id === "leave-field" || id === "clear-repo-filter" || id.startsWith("focus-")), `${was} and ${b.id} on ${slot}`).toBe(true);
        seen.set(slot, b.id);
      }
  });

  it("lists every key of Focus as a binding with when: Focus, scoped to Card views, before the Card binding it takes the key from", () => {
    const focus = keys.BINDINGS.filter((b) => b.id.startsWith("focus-"));
    expect(focus.map((b) => b.id).sort()).toEqual(["focus-details", "focus-next", "focus-note", "focus-previous", "focus-reject", "focus-side", "focus-start", "focus-step", "focus-viewport"]);
    for (const b of focus) expect([b.when, b.scope, b.group], b.id).toEqual(["Focus", "cards", "Focus"]);
    const at = (id: string) => keys.BINDINGS.findIndex((b) => b.id === id);
    expect(at("focus-reject")).toBeLessThan(at("mark"));
    expect(at("focus-step")).toBeLessThan(at("tab"));
    // the keys the design round asked for are taken (Move to Inbox, Capture an idea): details and side by side moved (D1)
    expect(keys.keyOf("focus-details")).toBe("e");
    expect(keys.keyOf("focus-side")).toBe("t");
    expect(keys.keyOf("move-inbox")).toBe("i");
    expect(keys.keyOf("capture")).toBe("c");
  });

  it("in Focus the Selection, tab and triage keys do not act on the Card behind the ask; outside Focus they do", async () => {
    vi.stubGlobal("HTMLElement", class {});
    const { useStore } = await import("./store.ts");
    const { useFocus } = await import("./focus/session.ts");
    const press = (key: string, mod = false) => {
      let prevented = false;
      keys.handleKey({ key, metaKey: mod, ctrlKey: false, altKey: false, shiftKey: false, target: null, preventDefault: () => (prevented = true) } as unknown as KeyboardEvent, { order: [], groups: [] });
      return prevented;
    };
    const st = () => useStore.getState();
    st().setView("waiting");
    st().select("o/r#1");
    press("x");
    expect(st().marked).toEqual(["o/r#1"]);
    st().clearMarks();
    press("]");
    expect(st().tab).toBe("decided");

    st().setFocus(true);
    expect(st()).toMatchObject({ focus: true, selected: null }); // Focus starts on its start screen, nothing open
    expect(useFocus.getState().stage).toBe("start");
    st().select("o/r#1");
    useFocus.getState().setStage("ask");
    for (const k of ["x", "[", "]"]) expect(press(k), k).toBe(true); // spent in Focus, whatever is on screen
    expect(st().marked).toEqual([]);
    expect(st().tab).toBe("now");
    expect(press("a", true)).toBe(true); // ⌘A marks nothing
    expect(st().marked).toEqual([]);
    for (const k of ["d", "s", "b", "h", "a", "w", "m", "i", "0", "1", "2", "3"]) expect(press(k), k).toBe(false); // triage: nothing runs, the key is nobody's
    expect(st().notice).toBeNull();
    // Esc: back to the overview is the frame's (not mounted here), so the key leaves Focus
    press("Escape");
    expect(st().focus).toBe(false);
    expect(useFocus.getState().stage).toBe("start");
    st().select(null);
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
