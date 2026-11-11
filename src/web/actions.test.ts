import { beforeAll, describe, expect, it, vi } from "vitest";
import type { Card } from "../core/types.ts";

// The store reads localStorage when it loads: stub the browser global first, then import.
const mem = new Map<string, string>();
vi.stubGlobal("localStorage", { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k) });
let keys: typeof import("./keys.ts");
let actions: typeof import("./actions.ts");
let triage: typeof import("./triage.ts");
let gallery: typeof import("./galleryKeys.ts");
let useStore: typeof import("./store.ts").useStore;
beforeAll(async () => {
  keys = await import("./keys.ts");
  actions = await import("./actions.ts");
  triage = await import("./triage.ts");
  gallery = await import("./galleryKeys.ts");
  ({ useStore } = await import("./store.ts"));
});

/** Every context action applies: an open Card that waits on Feedback, a selection, an Undo on offer, several repos, a Repo filter. */
const fullest = (): import("./actions.ts").ActionCtx => ({
  view: "board",
  focus: false,
  card: { key: "o/r#1", url: "https://github.com/o/r/issues/1", number: 1, fog: true } as Card,
  startable: true,
  failed: true,
  tab: "now",
  marked: 2,
  shots: "round",
  canUndo: true,
  repoCount: 2,
  lanes: false,
  repoFilter: "o/r",
  panel: {
    cardKey: "o/r#1",
    pick: () => {},
    send: () => {},
    choices: () => [
      { n: 1, label: "Approve the PR", on: false },
      { n: 2, label: "Hold the merge", on: false },
    ],
    extras: () => [{ id: "push", label: "Push this Feedback: turn off", run: () => {} }],
    canSend: () => true,
  },
  triage: { targets: 2, moves: triage.MOVE_ENTRIES, entries: triage.TRIAGE_ENTRIES, seen: true, unseen: true },
  setTheme: () => {},
});

describe("the palette lists every key binding", () => {
  it("has an entry for each binding in the key table (or a reason in NO_ENTRY), so a new key without a palette entry fails here", () => {
    const entries = actions.paletteActions(fullest());
    const bound = new Set(entries.map((a) => a.binding));
    const missing = keys.BINDINGS.filter((b) => !b.prefix && !(b.id in actions.NO_ENTRY) && !bound.has(b.id)).map((b) => b.id);
    expect(missing, `bindings without a palette entry: ${missing.join(", ")}. Add one in actions.ts (or give NO_ENTRY a reason)`).toEqual([]);
  });

  it("keeps NO_ENTRY honest: every id in it is a binding, and none of them has an entry anyway", () => {
    const bound = new Set(actions.paletteActions(fullest()).map((a) => a.binding));
    for (const id of Object.keys(actions.NO_ENTRY)) {
      expect(
        keys.BINDINGS.some((b) => b.id === id),
        id,
      ).toBe(true);
      expect(bound.has(id), `${id} has an entry: drop it from NO_ENTRY`).toBe(false);
    }
  });

  it("points every entry at a real binding and shows a key that binding has", () => {
    for (const a of actions.paletteActions(fullest())) {
      if (!a.binding) {
        expect(a.keys, `${a.id} names a key but no binding`).toBeUndefined();
        continue;
      }
      const b = keys.BINDINGS.find((x) => x.id === a.binding);
      expect(b, `${a.id} -> ${a.binding}`).toBeDefined();
      const shown = actions.keyShown(a);
      const digit = a.binding === "pick-choice" && /^[1-9]$/.test(a.keys ?? "");
      expect(digit || keys.keyCaps(b!).includes(shown!), `${a.id} shows ${shown}, the binding reads ${keys.keyCaps(b!).join(" / ")}`).toBe(true);
    }
  });

  it("gives every entry its own id and search text, and no entry a hand-typed key (a key is a binding's)", () => {
    const entries = actions.paletteActions(fullest());
    expect(new Set(entries.map((a) => a.id)).size).toBe(entries.length);
    expect(new Set(entries.map((a) => `${a.group} ${a.label} ${a.search ?? ""}`)).size).toBe(entries.length);
    for (const a of entries) if (a.keys) expect(a.binding, a.id).toBeDefined();
  });

  it("lists context actions only where they apply to the open Card", () => {
    const none = actions.paletteActions({
      ...fullest(),
      card: null,
      startable: false,
      failed: false,
      shots: null,
      marked: 0,
      panel: null,
      canUndo: false,
      repoFilter: null,
      repoCount: 1,
      triage: { targets: 0, moves: [], entries: [], seen: false, unseen: false },
    });
    const ids = none.map((a) => a.id);
    for (const id of [
      "next",
      "mark",
      "open",
      "show-log",
      "close-card",
      "shots",
      "copy-wayfinder",
      "start-coordinator",
      "dismiss-failure",
      "choice-1",
      "send-feedback",
      "panel-push",
      "undo",
      "clear-marks",
      "select-all",
      "extend-down",
      "lanes",
      "seen",
      "next-design",
    ])
      expect(ids, id).not.toContain(id);
    for (const id of ["go-board", "go-agents", "capture", "shortcuts", "refresh", "theme-dark", "clear-repo-filter"]) expect(ids, id).toContain(id);
    expect(none.find((a) => a.id === "clear-repo-filter")?.label).toBe("All repos");
    // Maps and Settings have no Cards to walk or select
    const maps = actions.paletteActions({ ...fullest(), view: "maps" }).map((a) => a.id);
    for (const id of ["next", "previous", "select-all", "extend-down"]) expect(maps, id).not.toContain(id);
    // a Card-scoped key does nothing there, so the palette neither offers Mark nor prints `o`, `[` or `]` for what it runs by hand
    expect(maps).not.toContain("mark");
    const onMaps = actions.paletteActions({ ...fullest(), view: "maps" });
    expect(onMaps.find((a) => a.id === "open")?.binding).toBeUndefined();
    const tabs = onMaps.filter((a) => a.id.startsWith("tab-"));
    expect(tabs.length).toBeGreaterThan(0);
    for (const a of tabs) expect(a.keys, a.id).toBeUndefined();
  });

  it("runBinding leaves a Card-scoped binding alone on Maps and Settings", () => {
    vi.stubGlobal("KeyboardEvent", class { constructor(public type: string, public init: { key?: string; metaKey?: boolean } = {}) {} get key() { return this.init.key; } });
    const st = useStore.getState();
    st.setView("maps");
    st.select("o/r#1"); // a Card opened from the palette or an Activity row
    keys.runBinding("mark");
    expect(useStore.getState().marked).toEqual([]);
    st.setView("board");
    st.select("o/r#1");
    keys.runBinding("mark");
    expect(useStore.getState().marked).toEqual(["o/r#1"]);
    st.clearMarks();
    st.select(null);
  });

  it("offers the open Feedback panel's choices, with their digits, and Send only when it would write", () => {
    const entries = actions.paletteActions(fullest());
    expect(entries.filter((a) => a.group === "Feedback").map((a) => [a.label, a.keys ?? null])).toEqual([
      ["Approve the PR", "1"],
      ["Hold the merge", "2"],
      ["Send the chosen Feedback", null],
      ["Push this Feedback: turn off", null],
    ]);
    expect(entries.find((a) => a.id === "send-feedback")?.binding).toBe("send-feedback");
    const cannot = { ...fullest().panel!, canSend: () => false };
    expect(actions.paletteActions({ ...fullest(), panel: cannot }).map((a) => a.id)).not.toContain("send-feedback");
  });
});

describe("showing keys", () => {
  it("reads the caps off the binding: alternatives, a ⌘ chord, a chord with a first key, a run of digits, shift", () => {
    const caps = (id: string) => keys.keyCaps(keys.BINDINGS.find((b) => b.id === id)!);
    expect(caps("next")).toEqual(["j", "↓"]);
    expect(caps("send-feedback")).toEqual(["⌘↵"]);
    expect(caps("undo")).toEqual(["⌘Z"]);
    expect(caps("go-waiting")).toEqual(["g w"]);
    expect(caps("pick-choice")).toEqual(["1–9"]);
    expect(caps("extend-down")).toEqual(["⇧J"]);
    expect(caps("shortcuts")).toEqual(["?"]);
    expect(keys.keyOf("escape")).toBe("esc");
  });

  it("puts every binding in a group of the overview, and lists the viewer's keys from its own table", () => {
    for (const b of keys.BINDINGS) expect(keys.KEY_GROUPS, b.id).toContain(b.group);
    const key = (k: string, mod = false) => ({ key: k, metaKey: mod, ctrlKey: false, altKey: false });
    expect(gallery.galleryKey(key("l"))?.id).toBe("next");
    expect(gallery.galleryKey(key("Enter", true))?.id).toBe("send");
    expect(gallery.galleryKey(key("Enter"))).toBeNull();
    expect(gallery.galleryKey(key("7"))?.id).toBe("variant");
    expect(gallery.galleryCap("previous")).toBe("←");
  });
});
