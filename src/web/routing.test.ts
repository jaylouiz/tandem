import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { BoardView, Card } from "../core/types.ts";

// A browser stand-in: localStorage, a location that history moves, popstate. The store reads them when it loads, so stub first, then import.
const mem = new Map<string, string>();
vi.stubGlobal("localStorage", { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k) });
const entries: string[] = ["/board/o/r/2?tab=decided&repo=o/r"];
let at = 0;
const loc = { get pathname() { return entries[at]!.split("?")[0]!; }, get search() { return entries[at]!.includes("?") ? "?" + entries[at]!.split("?")[1] : ""; } };
vi.stubGlobal("location", loc);
vi.stubGlobal("history", {
  pushState: (_: unknown, __: string, url: string) => {
    entries.splice(at + 1, entries.length, url);
    at = entries.length - 1;
  },
  replaceState: (_: unknown, __: string, url: string) => void (entries[at] = url),
});
let popstate: () => void = () => {};
vi.stubGlobal("window", { addEventListener: (type: string, fn: () => void) => type === "popstate" && (popstate = fn) });
const back = () => {
  at--;
  popstate();
};

let store: typeof import("./store.ts");
beforeAll(async () => {
  store = await import("./store.ts");
  (await import("./routing.ts")).startRouting();
});
const tick = () => new Promise<void>((r) => queueMicrotask(r));
const get = () => store.useStore.getState();
const card = (n: number, repo = "o/r") => ({ key: `${repo}#${n}`, repo, number: n }) as Card;
const board = (cards: Card[], sync: Record<string, { at: string | null; syncing: boolean }> = { "o/r": { at: "t", syncing: false } }, repos = ["o/r"]) => ({ cards, repos, sync, maps: [], activity: {} }) as unknown as BoardView;

describe("the first page", () => {
  it("takes view, Card, tab and filter from the URL, and keeps them while the board loads", async () => {
    expect({ view: get().view, selected: get().selected, tab: get().tab, repoFilter: get().repoFilter }).toEqual({ view: "board", selected: "o/r#2", tab: "decided", repoFilter: "o/r" });
    await tick();
    expect(entries).toEqual(["/board/o/r/2?tab=decided&repo=o/r"]);
  });
  it("a Card that is on the Board stays; a restore never touches Seen", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    store.useStore.setState({ board: board([card(1), card(2)]) });
    await tick();
    expect(get().selected).toBe("o/r#2");
    expect(get().notice).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("history entries", () => {
  beforeEach(async () => {
    store.useStore.setState({ board: board([card(1), card(2), card(3)]), view: "waiting", selected: null, tab: "now", repoFilter: null, marked: [], linger: null });
    await tick();
    entries.splice(0, entries.length, "/waiting");
    at = 0;
  });

  it("a view change and a deliberate open push; j/k, tabs, the filter and closing replace", async () => {
    get().setView("board");
    await tick();
    expect(entries).toEqual(["/waiting", "/board"]);
    get().select("o/r#1", undefined, { nav: "push" });
    await tick();
    expect(entries).toEqual(["/waiting", "/board", "/board/o/r/1"]);
    get().select("o/r#2"); // j
    get().setTab("activity");
    await tick();
    expect(entries).toEqual(["/waiting", "/board", "/board/o/r/2?tab=activity"]);
    get().setRepoFilter("o/r");
    await tick();
    expect(entries.at(-1)).toBe("/board/o/r/2?tab=activity&repo=o/r");
    get().select(null); // Esc
    await tick();
    expect(entries).toEqual(["/waiting", "/board", "/board?repo=o/r"]);
  });

  it("openCard from Settings, with a filter that hides the Card, is one entry", async () => {
    store.useStore.setState({ board: board([card(1), card(5, "p/q")], { "o/r": { at: "t", syncing: false }, "p/q": { at: "t", syncing: false } }, ["o/r", "p/q"]), view: "settings", repoFilter: "o/r" });
    await tick();
    entries.splice(0, entries.length, "/settings?repo=o/r");
    store.openCard("p/q#5");
    await tick();
    expect(entries).toEqual(["/settings?repo=o/r", "/board/p/q/5"]);
  });

  it("the overlay opens the Card in the current view on Activity", async () => {
    get().setView("board");
    store.openCard("o/r#3", { tab: "activity" });
    await tick();
    expect(entries.at(-1)).toBe("/board/o/r/3?tab=activity");
    expect(get().view).toBe("board");
  });

  it("Back applies the entry before: view, Card, tab and filter; linger and marks reset; nothing is written", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    get().setView("board");
    await tick();
    get().select("o/r#1", "issue", { nav: "push" });
    await tick();
    store.useStore.setState({ marked: ["o/r#1", "o/r#3"], linger: "o/r#1" });
    back();
    expect(get().view).toBe("board");
    expect(get().selected).toBeNull();
    expect(get().tab).toBe("now");
    expect(get().marked).toEqual([]);
    expect(get().linger).toBeNull();
    back();
    expect(get().view).toBe("waiting");
    expect(fetch).not.toHaveBeenCalled();
    await tick();
    expect(entries).toEqual(["/waiting", "/board", "/board/o/r/1?tab=issue"]); // Back moves along; it writes no entry
  });

  it("a URL the app would not write ends on a valid one by replace", async () => {
    entries.splice(0, entries.length, "/waiting", "/nonsense/");
    mem.set("tandem.view", "maps");
    at = 1;
    popstate();
    await tick();
    expect(entries).toEqual(["/waiting", "/maps"]); // `/` and unknown paths follow the remembered view
    expect(at).toBe(1);
  });
});

describe("a Card the URL names that is not on the Board", () => {
  const arrive = async (url: string, b: BoardView | null) => {
    store.useStore.setState({ board: null, notice: null });
    entries.splice(0, entries.length, "/waiting", url);
    at = 1;
    popstate();
    if (b) store.useStore.setState({ board: b });
    await tick();
  };

  it("closes by replace with a notice once its repo has synced", async () => {
    await arrive("/board/o/r/99", board([card(1)]));
    expect(get().selected).toBeNull();
    expect(get().notice?.text).toBe("Card o/r#99 is not on the Board");
    expect(entries).toEqual(["/waiting", "/board"]);
  });

  it("waits while its repo is still syncing, then decides", async () => {
    await arrive("/board/o/r/99", board([], { "o/r": { at: null, syncing: true } }));
    expect(get().selected).toBe("o/r#99");
    expect(get().notice).toBeNull();
    store.useStore.setState({ board: board([card(99)]) });
    expect(get().selected).toBe("o/r#99");
    expect(get().notice).toBeNull();
  });

  it("closes at once when the repo is not selected", async () => {
    await arrive("/board/x/y/1", board([card(1)]));
    expect(get().selected).toBeNull();
    expect(get().notice?.text).toBe("Card x/y#1 is not on the Board");
  });

  it("a Card that disappears later in the session keeps today's behaviour", async () => {
    await arrive("/board/o/r/1", board([card(1)]));
    store.useStore.setState({ board: board([]) });
    expect(get().selected).toBe("o/r#1");
    expect(get().notice).toBeNull();
  });

  it("opening something else while it waits drops the check", async () => {
    await arrive("/board/o/r/99", board([], { "o/r": { at: null, syncing: true } }));
    get().select("o/r#1");
    store.useStore.setState({ board: board([card(1)]) });
    expect(get().selected).toBe("o/r#1");
    expect(get().notice).toBeNull();
  });
});
