import { describe, expect, it } from "vitest";
import { buildCard } from "../core/card.ts";
import { DEFAULT_WORKFLOW as cfg } from "../core/config.ts";
import { demoIssues } from "../core/fixtures.ts";
import type { BoardView, Card } from "../core/types.ts";
import { appleScriptString, Notifier, PageClients, type Send } from "./notifier.ts";

const all = demoIssues(Date.parse("2026-11-04T12:00:00Z")).map((i) => buildCard(i, cfg, null));
const waiting = all.filter((c) => c.waiting && c.repo === "acme/app");
const repo = "acme/app";

function harness() {
  let current: BoardView = view([], { at: null, syncing: false });
  const listeners = new Set<(v: BoardView) => void>();
  const sent: { title: string; body: string }[] = [];
  const pages = new PageClients();
  const send: Send = async (n) => void sent.push(n);
  const logs: string[] = [];
  const board = { view: () => current, subscribe: (fn: (v: BoardView) => void) => (listeners.add(fn), () => listeners.delete(fn)) };
  const notifier = new Notifier(board, pages, send, "http://x/", (m) => logs.push(m));
  const set = (v: BoardView) => {
    current = v;
    listeners.forEach((l) => l(v));
  };
  return { notifier, set, sent, pages, logs, send, board };
}

function view(cards: Card[], s: { at: string | null; syncing: boolean }): BoardView {
  return { generatedAt: "", repos: [repo], cards, sync: { [repo]: { ...s, error: null } }, viewer: null, source: "github", coordinators: {} };
}
const synced = { at: "2026-11-04T12:00:00Z", syncing: false };

describe("Notifier", () => {
  it("baselines from the cache and notifies only waits that begin afterwards", () => {
    const h = harness();
    h.set(view(waiting.slice(1), synced)); // the cache
    h.notifier.start();
    h.set(view(waiting.slice(1), synced));
    expect(h.sent).toEqual([]);
    h.set(view(waiting, synced)); // one more now waits
    expect(h.sent).toHaveLength(1);
    expect(h.sent[0]).toMatchObject({ title: `Waiting on you: app#${waiting[0]!.number}`, body: waiting[0]!.title, url: `http://x/waiting/${waiting[0]!.repo}/${waiting[0]!.number}` });
    h.set(view(waiting, synced)); // same snapshot again: once only
    expect(h.sent).toHaveLength(1);
  });

  it("with an empty cache baselines after the first sync, so first run stays silent", () => {
    const h = harness();
    h.notifier.start();
    h.set(view([], { at: null, syncing: true }));
    h.set(view(waiting, { at: null, syncing: true })); // mid-sync: nothing yet
    h.set(view(waiting, synced));
    expect(h.sent).toEqual([]);
  });

  it("notifies a wait that began while the server was down", () => {
    const h = harness();
    h.set(view(waiting.slice(1), synced));
    h.notifier.start();
    h.set(view(waiting.slice(1), { ...synced, syncing: true }));
    h.set(view(waiting, synced));
    expect(h.sent).toHaveLength(1);
  });

  it("stays silent while a page that notifies is connected, and does not repeat later", () => {
    const h = harness();
    h.set(view([], synced));
    h.notifier.start();
    h.pages.notifying = 1;
    h.set(view(waiting, synced));
    expect(h.sent).toEqual([]);
    h.pages.notifying = 0;
    h.set(view(waiting, synced));
    expect(h.sent).toEqual([]);
  });

  it("a repo that is deselected and re-added with its cache kept does not flood", () => {
    const h = harness();
    h.set(view(waiting, synced));
    h.notifier.start();
    h.set({ ...view([], synced), repos: [], sync: {} }); // deselected: its Cards leave the view
    h.set(view(waiting, synced)); // re-added, cache kept
    expect(h.sent).toEqual([]);
  });

  it("logs one failure and keeps going", async () => {
    const logs: string[] = [];
    let calls = 0;
    const send: Send = async () => {
      calls++;
      throw new Error("no osascript");
    };
    const cur = { v: view([], synced) };
    const subs: ((v: BoardView) => void)[] = [];
    const n = new Notifier({ view: () => cur.v, subscribe: (f) => (subs.push(f), () => {}) }, new PageClients(), send, "http://x/", (m) => logs.push(m));
    n.start();
    subs[0]!(view(waiting, synced));
    await new Promise((r) => setTimeout(r, 0));
    expect(calls).toBe(waiting.length);
    expect(logs).toHaveLength(1);
  });

  it("escapes AppleScript strings", () => {
    expect(appleScriptString('say "hi" \\ now\nnext')).toBe('"say \\"hi\\" \\\\ now next"');
  });
});
