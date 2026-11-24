import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_WORKFLOW } from "../core/config.ts";
import { NO_RUN, type BoardView, type Card } from "../core/types.ts";

// The store reads localStorage when it loads: stub the browser globals first, then import it.
const mem = new Map<string, string>();
vi.stubGlobal("localStorage", { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k) });
let store: typeof import("./store.ts");
let triage: typeof import("./triage.ts");
beforeAll(async () => {
  store = await import("./store.ts");
  triage = await import("./triage.ts");
});
afterEach(() => vi.unstubAllGlobals());

const mk = (repo: string, number: number): Card =>
  ({ key: `${repo}#${number}`, repo, number, state: "open", labels: ["ready"], status: "Backlog", handed: false, phase: "Backlog", nextStep: "build", onHold: false, waiting: null, fog: false, pullRequest: null }) as unknown as Card;
/** the Card as the page shows it: the server's Card under its optimistic patch */
const shown = (c: Card) => store.currentCards(store.useStore.getState()).find((x) => x.key === c.key)!;
const asHanded = (c: Card): Card => ({ ...c, status: "Todo", handed: true });
const hand = () => triage.TRIAGE_ENTRIES.find((e) => e.id === "hand")!;
const reply = (body: unknown, status = 200) => async () => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("Hand to agent: handed state", () => {
  const a = mk("o/with", 1);
  const b = mk("o/without", 2);
  beforeEach(() => {
    store.useStore.setState({ board: { workflow: DEFAULT_WORKFLOW, cards: [a, b], repos: [], sync: {} } as unknown as BoardView, pending: {}, notice: null, marked: [], selected: a.key });
  });

  it("a delivered Push shows the Card handed (status Todo) and a second run does nothing", async () => {
    vi.stubGlobal("fetch", reply({ push: { delivered: true, runId: "r", reason: null }, restoreError: null }));
    await triage.runTriage(hand(), [a]);
    expect(shown(a)).toMatchObject({ handed: true, status: "Todo" });
    expect(store.useStore.getState().notice?.text).toBe("Handed to the coordinator · build");
    const fetched = vi.fn(reply({ push: null }));
    vi.stubGlobal("fetch", fetched);
    await triage.runTriage(hand(), [shown(a)]);
    expect(fetched).not.toHaveBeenCalled();
    expect(store.useStore.getState().notice?.text).toBe("Not applicable: already handed");
  });

  it("shows as handed while the write and the Push are on their way", async () => {
    let release!: () => void;
    vi.stubGlobal("fetch", () => new Promise<Response>((r) => (release = () => r(new Response(JSON.stringify({ push: { delivered: true } }), { headers: { "content-type": "application/json" } })))));
    const run = triage.runTriage(hand(), [a]);
    expect(shown(a).handed).toBe(true);
    release();
    await run;
  });

  it("a failed status write or Push rolls back with the reason, and can be retried", async () => {
    vi.stubGlobal("fetch", reply({ error: "GitHub GraphQL: boom" }, 500));
    await triage.runTriage(hand(), [a]);
    expect(shown(a)).toMatchObject({ handed: false, status: "Backlog" });
    expect(store.useStore.getState().notice).toMatchObject({ text: "Failed: GitHub GraphQL: boom", canStart: false, failed: true });
    vi.stubGlobal("fetch", reply({ push: { delivered: true } }));
    await triage.runTriage(hand(), [a]);
    expect(shown(a).handed).toBe(true);
  });

  it("an undelivered Push rolls back and offers Start coordinator", async () => {
    vi.stubGlobal("fetch", reply({ push: { delivered: false, runId: null, reason: NO_RUN }, restoreError: null }));
    await triage.runTriage(hand(), [b]);
    expect(shown(b).handed).toBe(false);
    expect(store.useStore.getState().notice).toMatchObject({ text: "Not handed: no Orca Run found for without", canStart: true, start: [b] });
  });

  it("an undelivered Push whose status could not be put back says so", async () => {
    vi.stubGlobal("fetch", reply({ push: { delivered: false, runId: null, reason: NO_RUN }, restoreError: "o/without#2 keeps the status Todo: boom" }));
    await triage.runTriage(hand(), [b]);
    expect(store.useStore.getState().notice).toMatchObject({ text: "No Orca Run found for without; 1 failed: o/without#2 keeps the status Todo: boom", failed: true });
  });

  it("an unreachable Orca rolls back, names Orca and does not offer Start coordinator (#63)", async () => {
    const why = "could not reach Orca: orca terminal list timed out";
    vi.stubGlobal("fetch", reply({ push: { delivered: false, runId: null, reason: why } }));
    await triage.runTriage(hand(), [b]);
    expect(shown(b).handed).toBe(false);
    expect(store.useStore.getState().notice).toMatchObject({ text: `Not handed over (${why})`, canStart: false, failed: true });
  });

  it("a bulk run with one handed, one without coordinator and one unreachable reads each right, and starts only the one without (#63)", async () => {
    const c = mk("o/down", 3);
    const why = "could not reach Orca: boom";
    store.useStore.setState({ board: { workflow: DEFAULT_WORKFLOW, cards: [a, b, c], repos: [], sync: {} } as unknown as BoardView });
    vi.stubGlobal("fetch", async (url: string) =>
      reply({ push: url.includes("/o/with/") ? { delivered: true } : url.includes("/o/without/") ? { delivered: false, reason: NO_RUN } : { delivered: false, reason: why } })(),
    );
    await triage.runTriage(hand(), [a, b, c]);
    expect([a, b, c].map((x) => shown(x).handed)).toEqual([true, false, false]);
    expect(store.useStore.getState().notice).toMatchObject({
      text: `Handed 1 Card to the coordinator; no Orca Run found for without; 1 Card not handed over (${why})`,
      canStart: true,
      start: [b],
    });
  });

  it("a bulk run hands what reached a coordinator and names the rest in one notice", async () => {
    vi.stubGlobal("fetch", async (url: string) => (url.includes("/o/with/") ? reply({ push: { delivered: true } })() : reply({ push: { delivered: false } })()));
    await triage.runTriage(hand(), [a, b]);
    expect([a, b].map((x) => shown(x).handed)).toEqual([true, false]);
    expect(store.useStore.getState().notice?.text).toBe("Handed 1 Card to the coordinator; no Orca Run found for without");
  });
});

describe("re-steering a handed Card", () => {
  const a = asHanded(mk("o/with", 1));
  const seed = () => store.useStore.setState({ board: { workflow: DEFAULT_WORKFLOW, cards: [a], repos: [], sync: {} } as unknown as BoardView, pending: {}, notice: null, marked: [] });
  const entry = (id: string) => triage.TRIAGE_ENTRIES.find((e) => e.id === id)!;

  it("a Hold or another Next step sends the status Backlog with the labels, so release brings the button back", async () => {
    seed();
    const fetched = vi.fn(reply({ ok: true }));
    vi.stubGlobal("fetch", fetched);
    await triage.runTriage(entry("hold"), [a]);
    expect(JSON.parse(String((fetched.mock.calls[0] as unknown as [string, RequestInit])[1].body))).toEqual({ add: ["on-hold"], remove: [], status: "Backlog" });
    expect(shown(a)).toMatchObject({ handed: false, status: "Backlog", onHold: true });
    seed();
    await triage.runTriage(entry("next-specify"), [a]);
    expect(JSON.parse(String((fetched.mock.calls[1] as unknown as [string, RequestInit])[1].body))).toEqual({ add: ["needs-spec"], remove: ["ready"], status: "Backlog" });
    expect(shown(a).handed).toBe(false);
  });

  it("a hold whose write fails leaves the Card handed, so it is not offered a second Push", async () => {
    seed();
    vi.stubGlobal("fetch", reply({ error: "boom" }, 500));
    await triage.runTriage(entry("hold"), [a]);
    expect(shown(a)).toMatchObject({ handed: true, status: "Todo" });
  });

  it("a priority on a handed Card leaves its status alone", async () => {
    seed();
    const fetched = vi.fn(reply({ ok: true }));
    vi.stubGlobal("fetch", fetched);
    await triage.runTriage(entry("priority-1"), [a]);
    expect(JSON.parse(String((fetched.mock.calls[0] as unknown as [string, RequestInit])[1].body))).toEqual({ add: ["priority:1"], remove: [] });
    expect(shown(a).handed).toBe(true);
  });
});

describe("moving Cards between Inbox and Backlog", () => {
  const inbox = (n: number, over: Partial<Card> = {}) => ({ ...mk("o/r", n), labels: ["inbox"], phase: "Inbox", nextStep: null, ...over }) as Card;
  const backlog = (n: number, over: Partial<Card> = {}) => ({ ...mk("o/r", n), labels: ["needs-spec"], nextStep: "specify", ...over }) as Card;
  const phaseOf = (c: Card) => store.currentCards(store.useStore.getState()).find((x) => x.key === c.key)!.phase;
  const seed = (cards: Card[], extra: Partial<ReturnType<typeof store.useStore.getState>> = {}) =>
    store.useStore.setState({ board: { workflow: DEFAULT_WORKFLOW, cards, repos: [], sync: {} } as unknown as BoardView, pending: {}, notice: null, marked: [], moveStep: "keep", selected: null, ...extra });

  it("moves at once, writes the lane label per Card, clears the selection and offers Undo", async () => {
    const a = inbox(1);
    const b = inbox(2);
    seed([a, b], { marked: [a.key, b.key] });
    const calls: { url: string; body: unknown }[] = [];
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      calls.push({ url, body: JSON.parse(init.body as string) });
      return reply({ ok: true })();
    });
    const run = triage.runMove("Backlog");
    expect(phaseOf(a)).toBe("Backlog"); // optimistic, before the writes finish
    await run;
    expect(calls.map((c) => c.body)).toEqual([
      { add: ["needs-spec"], remove: ["inbox"] },
      { add: ["needs-spec"], remove: ["inbox"] },
    ]);
    const s = store.useStore.getState();
    expect(s.marked).toEqual([]);
    expect(s.notice).toMatchObject({ text: "Moved 2 Cards to Backlog (Specify)", failed: false });
    expect(s.notice?.undo).toBeTypeOf("function");
  });

  it("the Next step from the bar applies to every Card; a Card without a marked set moves the open Card", async () => {
    const a = inbox(1);
    seed([a], { selected: a.key, moveStep: "build" });
    vi.stubGlobal("fetch", reply({ ok: true }));
    await triage.runMove("Backlog");
    expect(store.useStore.getState().notice?.text).toBe("Moved r#1 to Backlog (Build)");
  });

  it("a failed write rolls only that Card back and says why", async () => {
    const a = inbox(1);
    const b = inbox(2);
    seed([a, b]);
    vi.stubGlobal("fetch", async (url: string) => (url.endsWith("/o/r/1/labels") ? reply({ error: "boom" }, 500)() : reply({ ok: true })()));
    await triage.runMove("Backlog", [a, b]);
    expect(phaseOf(a)).toBe("Inbox");
    expect(store.useStore.getState().notice).toMatchObject({ text: "Moved 1 Card to Backlog (Specify), 1 failed: boom", failed: true });
  });

  it("Undo writes the inverse change and reports its own failure", async () => {
    const a = backlog(1);
    seed([a]);
    const bodies: unknown[] = [];
    vi.stubGlobal("fetch", async (_u: string, init: RequestInit) => {
      bodies.push(JSON.parse(init.body as string));
      return reply({ ok: true })();
    });
    await triage.runMove("Inbox", [a]);
    expect(bodies).toEqual([{ add: ["inbox"], remove: ["needs-spec"] }]);
    store.useStore.getState().notice!.undo!();
    await vi.waitFor(() => expect(store.useStore.getState().notice?.text).toBe("Move undone"));
    expect(bodies[1]).toEqual({ add: ["needs-spec"], remove: ["inbox"] });
    vi.stubGlobal("fetch", reply({ error: "nope" }, 500));
    await triage.runMove("Inbox", [a]);
    expect(store.useStore.getState().notice?.undo).toBeUndefined(); // nothing moved, nothing to undo
  });

  it("a moved Card loses its handed status; a Card that did not change keeps it", async () => {
    const a = asHanded(backlog(1));
    const b = asHanded(backlog(2));
    seed([a, b]);
    const fetched = vi.fn(reply({ ok: true }));
    vi.stubGlobal("fetch", fetched);
    await triage.runMove("Backlog", [a, b]); // keep: both stay as they are
    expect(fetched).not.toHaveBeenCalled();
    expect([a, b].map((x) => shown(x).handed)).toEqual([true, true]);
    store.useStore.setState({ moveStep: "build" });
    await triage.runMove("Backlog", [a]);
    expect(JSON.parse(String((fetched.mock.calls[0] as unknown as [string, RequestInit])[1].body))).toEqual({ add: ["ready"], remove: ["needs-spec"], status: "Backlog" });
    expect([a, b].map((x) => shown(x).handed)).toEqual([false, true]);
    await triage.runMove("Inbox", [b]);
    expect(JSON.parse(String((fetched.mock.calls[1] as unknown as [string, RequestInit])[1].body))).toEqual({ add: ["inbox"], remove: ["needs-spec"], status: "Backlog" });
  });

  it("moveBlocked names why a button is disabled", () => {
    const cfg = DEFAULT_WORKFLOW;
    expect(triage.moveBlocked("Backlog", [backlog(1)], cfg, "keep")).toBe("Already in Backlog");
    expect(triage.moveBlocked("Backlog", [backlog(1)], cfg, "build")).toBeNull();
    expect(triage.moveBlocked("Inbox", [backlog(1, { phase: "Build" })], cfg, "keep")).toBe("Not applicable: Build");
  });
});

describe("toast copy names the outcome (#46)", () => {
  const entry = (id: string) => triage.TRIAGE_ENTRIES.find((e) => e.id === id)!;
  const c = mk("o/r", 7);
  const put = (card: Card) => store.useStore.setState({ board: { workflow: DEFAULT_WORKFLOW, cards: [card], repos: [], sync: {} } as unknown as BoardView, pending: {}, notice: null, marked: [], selected: card.key });

  it("Hold says Held, and on a held Card Released", async () => {
    put(c);
    vi.stubGlobal("fetch", reply({}));
    await triage.runTriage(entry("hold"), [c]);
    expect(store.useStore.getState().notice?.text).toBe("Held · r#7");
    const held = { ...c, labels: [...c.labels, DEFAULT_WORKFLOW.holdLabel], onHold: true };
    put(held);
    await triage.runTriage(entry("hold"), [held]);
    expect(store.useStore.getState().notice?.text).toBe("Released · r#7");
  });

  it("the palette entry reads as one action per direction, not 'Hold' twice", () => {
    expect(entry("hold").label).toBe("Hold Card / Release hold");
  });
});
