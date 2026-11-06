import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NO_COORDINATOR, type Card } from "../core/types.ts";

// The store reads localStorage when it loads: stub the browser globals first, then import it.
const mem = new Map<string, string>();
vi.stubGlobal("localStorage", { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k) });
let store: typeof import("./store.ts");
beforeAll(async () => {
  store = await import("./store.ts");
});
afterEach(() => vi.unstubAllGlobals());

const card = { key: "o/r#1", repo: "o/r", number: 1 } as Card;

describe("giveFeedback", () => {
  it("a failed answer brings the Card back on its Now tab, also when it was already the selected one", async () => {
    vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ error: "boom" }), { status: 500, headers: { "content-type": "application/json" } }));
    // the last blocker was answered: the pane switched to Decided and still holds the Card
    store.useStore.setState({ selected: card.key, tab: "decided" });
    await store.giveFeedback(card, "answer", {}, {});
    expect(store.useStore.getState().selected).toBe(card.key);
    expect(store.useStore.getState().tab).toBe("now");
    expect(store.useStore.getState().failures[card.key]).toContain("boom");
  });

  it("reports whether the write went through, so an answer's draft can be kept or dropped", async () => {
    vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ error: "boom" }), { status: 500, headers: { "content-type": "application/json" } }));
    expect(await store.giveFeedback(card, "answer", {}, {})).toBe(false);
    vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ push: null }), { status: 200, headers: { "content-type": "application/json" } }));
    expect(await store.giveFeedback(card, "answer", {}, {})).toBe(true);
  });
});

describe("giveFeedback: the footer after the Push", () => {
  const push = async (p: unknown) => {
    vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ push: p }), { status: 200, headers: { "content-type": "application/json" } }));
    store.useStore.setState({ notice: null });
    await store.giveFeedback(card, "answer", {}, {});
    return store.useStore.getState().notice;
  };

  it("delivered: says so, no start offered", async () => {
    expect(await push({ delivered: true, runId: "r", reason: null })).toMatchObject({ text: "Feedback given and pushed to the coordinator", canStart: false });
  });

  it("Orca answered that none runs: offers to start one", async () => {
    expect(await push({ delivered: false, runId: null, reason: NO_COORDINATOR })).toMatchObject({ text: "Feedback given, awaiting pickup: no coordinator running", canStart: true });
  });

  it("a Push that failed says why and does not claim nobody is running", async () => {
    const n = await push({ delivered: false, runId: null, reason: "could not reach Orca: orca terminal list timed out" });
    expect(n).toMatchObject({ text: "Feedback given, awaiting pickup: could not push (could not reach Orca: orca terminal list timed out)", canStart: false });
  });
});

describe("write", () => {
  const boom = async () => {
    throw new Error("boom");
  };
  it("applies the optimistic change before the write ends and keeps it on success", async () => {
    const log: string[] = [];
    const res = await store.write(async () => (log.push("run"), 7), { apply: () => (log.push("apply"), { undo: () => log.push("undo"), settle: () => log.push("settle") }) });
    expect(res).toEqual({ ok: true, value: 7 });
    expect(log).toEqual(["apply", "run", "settle"]);
  });

  it("undoes the change on failure, then settles, and names what failed in a notice", async () => {
    const log: string[] = [];
    store.useStore.setState({ notice: null });
    const res = await store.write(boom, { what: "add o/r to the Board", apply: () => ({ undo: () => log.push("undo"), settle: () => log.push("settle") }) });
    expect(res).toEqual({ ok: false, error: "boom", message: "Could not add o/r to the Board: boom" });
    expect(log).toEqual(["undo", "settle"]);
    expect(store.useStore.getState().notice).toMatchObject({ text: "Could not add o/r to the Board: boom", failed: true }); // a failure stays and is an alert
  });

  it("says nothing when the caller words the message (notify: false), and works without an optimistic change", async () => {
    store.useStore.setState({ notice: null });
    expect(await store.write(boom, { what: "capture", notify: false })).toMatchObject({ ok: false, message: "Could not capture: boom" });
    expect(store.useStore.getState().notice).toBeNull();
  });

  it("writeCard patches the Card at once, rolls the patch back on failure, and keeps it while another write is in flight", async () => {
    const patched = () => store.useStore.getState().pending[card.key];
    expect(await store.writeCard(card, { seenAt: "t" }, async () => patched())).toEqual({ ok: true, value: { seenAt: "t" } });
    expect(await store.writeCard(card, { seenAt: "t" }, boom)).toMatchObject({ ok: false, error: "boom" });
    expect(patched()).toBeUndefined();
    // two writes: the first fails while the second is still running; the patch stays until the last one ends
    let release!: () => void;
    const slow = store.writeCard(card, { seenAt: "2" }, () => new Promise<void>((r) => (release = r)));
    await store.writeCard(card, { seenAt: "1" }, boom);
    expect(patched()).toBeDefined();
    release();
    await slow;
  });
});

describe("refreshFromGitHub", () => {
  it("says it started, then that it ended; a failure names the refresh", async () => {
    const texts: string[] = [];
    const unsub = store.useStore.subscribe((s) => s.notice && texts.push(s.notice.text));
    vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "content-type": "application/json" } }));
    await store.refreshFromGitHub();
    vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ error: "o/r: rate limited" }), { status: 502, headers: { "content-type": "application/json" } }));
    await store.refreshFromGitHub();
    unsub();
    expect(texts).toEqual(["Refreshing from GitHub…", "Refreshed from GitHub", "Refreshing from GitHub…", "Could not refresh from GitHub: o/r: rate limited"]);
  });
});

describe("giveFeedback in Waiting on me: only the developer's own answer advances", () => {
  const mk = (n: number, since: string) => ({ key: `o/r#${n}`, repo: "o/r", number: n, phase: "Backlog", pullRequest: null, waiting: { kind: "decision", since, requestId: "D1" } }) as unknown as Card;
  const [a, b, c] = [mk(1, "2026-11-01"), mk(2, "2026-11-02"), mk(3, "2026-11-03")];
  const board = (cards: Card[]) => ({ cards }) as unknown as import("../core/types.ts").BoardView;
  const ok = () => vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ push: null }), { status: 200, headers: { "content-type": "application/json" } }));
  const sel = () => store.useStore.getState().selected;
  const start = (view: "waiting" | "board" = "waiting") => store.useStore.setState({ board: board([a, b, c]), pending: {}, view, repoFilter: null, selected: b.key, tab: "now", failures: {} });

  it("answering the open blocker opens the one now at its place", async () => {
    ok();
    start();
    await store.giveFeedback(b, "answer", {}, { waiting: null });
    expect(sel()).toBe(c.key);
  });

  it("the last blocker answered: the pane keeps the Card on Decided", async () => {
    ok();
    store.useStore.setState({ board: board([a]), pending: {}, view: "waiting", repoFilter: null, selected: a.key, tab: "now" });
    await store.giveFeedback(a, "answer", {}, { waiting: null });
    expect(store.useStore.getState()).toMatchObject({ selected: a.key, tab: "decided" });
  });

  it("an answer from elsewhere (a snapshot without the open blocker) opens nothing: the Card stays open", () => {
    start();
    store.useStore.setState({ board: board([a, c]) }); // what a snapshot does; no giveFeedback
    expect(sel()).toBe(b.key);
  });

  it("answering another Card than the open one leaves the open one alone", async () => {
    ok();
    start();
    await store.giveFeedback(a, "answer", {}, { waiting: null });
    expect(sel()).toBe(b.key);
  });

  it("a feedback that leaves the Card waiting (another request open) does not advance", async () => {
    ok();
    start();
    await store.giveFeedback(b, "answer", {}, {});
    expect(sel()).toBe(b.key);
  });

  it("outside Waiting on me (the Board) nothing advances", async () => {
    ok();
    start("board");
    await store.giveFeedback(b, "answer", {}, { waiting: null });
    expect(sel()).toBe(b.key);
  });

  it("a failed answer brings the Card back and selects it", async () => {
    vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ error: "boom" }), { status: 500, headers: { "content-type": "application/json" } }));
    start();
    await store.giveFeedback(b, "answer", {}, { waiting: null });
    expect(sel()).toBe(b.key);
    expect(store.useStore.getState().failures[b.key]).toContain("boom");
  });
});

describe("answer drafts", () => {
  it("merge: a panel writes the field it changed", () => {
    const { setDraft, clearDraft } = store.useStore.getState();
    const key = store.draftKey("a/b#9", "D1");
    setDraft(key, { text: "note" });
    setDraft(key, { choice: "A" });
    expect(store.useStore.getState().drafts[key]).toEqual({ text: "note", choice: "A" });
    clearDraft(key);
  });

  it("are kept until cleared, and the empty value is one shared object", () => {
    const { setDraft, clearDraft } = store.useStore.getState();
    const empty = store.useStore.getState().drafts;
    const key = store.draftKey("a/b#1", "D1");
    setDraft(key, { choice: "B: 200 MB", text: "note", push: false });
    expect(store.useStore.getState().drafts[key]).toEqual({ choice: "B: 200 MB", text: "note", push: false });
    clearDraft(key);
    expect(store.useStore.getState().drafts).toBe(empty);
  });

  it("belong to one Card: the same request id on another Card (D1 repeats everywhere) has no draft", () => {
    const { setDraft, clearDraft } = store.useStore.getState();
    setDraft(store.draftKey("acme/app#117", "D1"), { choice: "B: 200 MB", text: "note", push: true });
    expect(store.useStore.getState().drafts[store.draftKey("acme/app#105", "D1")]).toBeUndefined();
    expect(store.useStore.getState().drafts[store.draftKey("acme/app#117", "D2")]).toBeUndefined();
    clearDraft(store.draftKey("acme/app#117", "D1"));
  });
});

describe("changing the view", () => {
  beforeEach(() => vi.stubGlobal("localStorage", { setItem: (k: string, v: string) => void mem.set(k, v) }));
  it("starts the new page with nothing open, nothing marked and nothing lingering", () => {
    store.useStore.setState({ view: "board", selected: "o/r#1", tab: "decided", marked: ["o/r#1", "o/r#2"], linger: "o/r#1" });
    store.useStore.getState().setView("waiting");
    expect(store.useStore.getState()).toMatchObject({ view: "waiting", selected: null, tab: "now", marked: [], linger: null });
    expect(mem.get("tandem.view")).toBe("waiting");
  });

  it("keeps what is open when the same view is chosen again", () => {
    store.useStore.setState({ view: "waiting", selected: "o/r#1", marked: ["o/r#2"] });
    store.useStore.getState().setView("waiting");
    expect(store.useStore.getState()).toMatchObject({ selected: "o/r#1", marked: ["o/r#2"] });
  });

  it("opening another Card ends the lingering of the one opened before", () => {
    store.useStore.setState({ view: "waiting", selected: "o/r#1", linger: "o/r#1" });
    store.useStore.getState().select("o/r#1", "decided");
    expect(store.useStore.getState().linger).toBe("o/r#1");
    store.useStore.getState().select("o/r#2");
    expect(store.useStore.getState()).toMatchObject({ selected: "o/r#2", linger: null });
  });
});

describe("the Repo filter", () => {
  const mk = (repo: string, n: number) => ({ key: `${repo}#${n}`, repo, number: n, phase: "Backlog", pullRequest: null, waiting: null }) as unknown as Card;
  const [a1, a2, b1] = [mk("o/a", 1), mk("o/a", 2), mk("o/b", 1)];
  const state = () => store.useStore.getState();
  beforeEach(() => vi.stubGlobal("localStorage", { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k) })); // the file's afterEach unstubs it
  const start = (extra: object = {}) => {
    mem.clear();
    store.useStore.setState({ board: { cards: [a1, a2, b1], repos: ["o/a", "o/b"] } as never, pending: {}, view: "board", repoFilter: null, selected: null, tab: "now", linger: null, marked: [], ...extra });
  };

  it("is remembered across a reload and dropped again when cleared", () => {
    start();
    state().setRepoFilter("o/a");
    expect(mem.get("tandem.repoFilter")).toBe("o/a");
    state().setRepoFilter(null);
    expect(mem.has("tandem.repoFilter")).toBe(false);
  });

  it("closes an open Card the filter hides (no dangling selection) and keeps one it shows", () => {
    start({ selected: b1.key, tab: "activity", linger: b1.key });
    state().setRepoFilter("o/a");
    expect(state()).toMatchObject({ repoFilter: "o/a", selected: null, tab: "now", linger: null });
    start({ selected: a1.key, tab: "activity" });
    state().setRepoFilter("o/a");
    expect(state()).toMatchObject({ selected: a1.key, tab: "activity" });
  });

  it("unmarks the Cards it hides", () => {
    start({ marked: [a1.key, b1.key, a2.key] });
    state().setRepoFilter("o/a");
    expect(state().marked).toEqual([a1.key, a2.key]);
  });

  it("opening a Card it hides (a notification, say) lifts the filter instead of opening a Card nobody sees", () => {
    start({ repoFilter: "o/a" });
    store.openCard(b1.key);
    expect(state()).toMatchObject({ repoFilter: null, selected: b1.key });
    expect(mem.has("tandem.repoFilter")).toBe(false);
    start({ repoFilter: "o/a" });
    store.openCard(a2.key);
    expect(state()).toMatchObject({ repoFilter: "o/a", selected: a2.key });
  });

  it("opening a Card the Board does not know leaves the filter alone", () => {
    start({ repoFilter: "o/a" });
    store.openCard("o/zzz#9");
    expect(state()).toMatchObject({ repoFilter: "o/a", selected: "o/zzz#9" });
  });

  it("a stored repo the Board no longer lists is dropped", () => {
    start({ repoFilter: "o/gone" });
    expect(store.validFilter("o/gone", ["o/a", "o/b"])).toBeNull();
    expect(store.validFilter("o/a", ["o/a", "o/b"])).toBe("o/a");
    expect(store.validFilter(null, [])).toBeNull();
  });
});

describe("one modal at a time (#42)", () => {
  const state = () => store.useStore.getState();
  beforeEach(() => store.useStore.setState({ modal: null }));

  it("opening a modal replaces the open one", () => {
    state().setCapture(true);
    state().setPalette(true);
    expect(state().modal).toBe("palette");
    state().setAgentsOpen(true);
    expect(state().modal).toBe("agents");
  });

  it("a Palette command that opens another modal is not undone by the Palette closing after it", () => {
    state().setPalette(true);
    state().setCapture(true); // what the command does ...
    state().setPalette(false); // ... and then the Palette's own close
    expect(state().modal).toBe("capture");
  });

  it("closing the open modal leaves none", () => {
    state().setAgentsOpen(true);
    state().setAgentsOpen(false);
    expect(state().modal).toBeNull();
  });
});

describe("blockerCount (sidebar and Repo counts, #46 D1)", () => {
  const c = (repo: string, over: Partial<Card>) => ({ key: `${repo}#1`, repo, number: 1, waiting: null, needsLook: false, seenAt: null, ...over }) as unknown as Card;
  const waiting = { kind: "decision", since: "2026-01-01T00:00:00Z" } as Card["waiting"];

  it("counts Waiting on me only: an unseen Look is not a blocker", () => {
    const cards = [c("o/a", { waiting }), c("o/a", { key: "o/a#2", needsLook: true }), c("o/b", { key: "o/b#3", needsLook: true })];
    expect(store.blockerCount(cards)).toBe(1);
    expect(store.blockerCount(cards.filter((x) => x.repo === "o/b"))).toBe(0);
    // the To look at group still lists the Looks, separately
    expect(store.groupsOf(cards).look).toHaveLength(2);
  });
});
