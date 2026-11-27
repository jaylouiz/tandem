import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NO_RUN } from "../core/types.ts";
import { DEFAULT_WORKFLOW, mergeWorkflow } from "../core/config.ts";
import { coordinatorPrompt, OrcaPusher, pushBody, pushSubject, type Exec } from "./push.ts";

/** A stubbed `orca` + `git`: the Orca CLI is never called for real. */
function orcaStub() {
  const calls: string[][] = [];
  const s = {
    calls,
    /** terminal handle -> its worktree; `connected` false = the terminal is gone */
    terminals: [{ handle: "term_kan", connected: true, worktreePath: "/w/app" }] as { handle: string; connected: boolean; worktreePath: string }[],
    /** newest first */
    runs: [{ id: "run_a", handle: "term_kan" }] as { id: string; handle: string | null }[],
    failing: new Set<string>(),
    remotes: { "/w/app": "git@github.com:acme/app.git", "/w/tandem": "https://github.com/acme/tandem" } as Record<string, string>,
    sends: () => calls.filter((c) => c[1] === "orchestration" && c[2] === "send"),
    runShows: () => calls.filter((c) => c[2] === "run-show").length,
    run: (async (cmd, args) => {
      calls.push([cmd, ...args]);
      if (cmd === "git") return { stdout: s.remotes[args[1]!] ?? "" };
      const key = args.slice(0, 2).join(" ");
      if (s.failing.has(key) || (key === "orchestration run-show" && s.failing.has(`run-show ${args[3]}`))) throw new Error(`orca ${key} timed out`);
      const ok = (result: unknown) => ({ stdout: JSON.stringify({ ok: true, result }) });
      if (key === "terminal list") return ok({ terminals: s.terminals });
      if (key === "orchestration run-list") return ok({ runs: s.runs.map((r) => ({ id: r.id })) });
      if (key === "orchestration run-show") return ok({ run: { id: args[3], coordinator_handle: s.runs.find((r) => r.id === args[3])?.handle } });
      if (key === "orchestration send") return ok({ id: "msg" });
      return ok({});
    }) as Exec,
  };
  return s;
}

const repo = "acme/app";
const send = (p: OrcaPusher) => p.push(repo, 7, "feedback", "D1 answered");

beforeEach(() => vi.useFakeTimers({ now: Date.parse("2026-11-05T12:00:00Z") }));
afterEach(() => vi.useRealTimers());

describe("finding the Run to send to (only for a Push: the Board never shows it, #14)", () => {
  it("finds the live Run of a repo: the Push goes to it", async () => {
    const o = orcaStub();
    const p = new OrcaPusher(o.run);
    expect(await send(p)).toEqual({ delivered: true, runId: "run_a", reason: null });
    expect(o.sends()).toEqual([["orca", "orchestration", "send", "--to", "run:run_a", "--type", "status", "--subject", pushSubject(repo, 7, "feedback"), "--body", pushBody(repo, 7, "feedback", "D1 answered"), "--json"]]);
  });

  it("says no Run was found only when Orca answered and none is live for the repo", async () => {
    const o = orcaStub();
    o.runs = [{ id: "run_a", handle: "term_gone" }]; // its terminal closed
    const p = new OrcaPusher(o.run);
    expect(await send(p)).toEqual({ delivered: false, runId: null, reason: NO_RUN });
    expect(o.sends()).toEqual([]);
  });

  it("asks Orca again before saying none: a coordinator started since the last look is found", async () => {
    const o = orcaStub();
    o.runs = [];
    const p = new OrcaPusher(o.run);
    await p.knownPaths(); // a first look: none
    o.runs = [{ id: "run_b", handle: "term_kan" }]; // started a moment ago, inside the cache window
    expect(await send(p)).toMatchObject({ delivered: true, runId: "run_b" });
  });

  it("asks one Run's coordinator once; a later look costs terminal list + run-list, not one run-show per Run", async () => {
    const o = orcaStub();
    o.runs = [
      { id: "run_a", handle: "term_kan" },
      { id: "run_old", handle: "term_gone" },
    ];
    const p = new OrcaPusher(o.run);
    await p.knownPaths();
    expect(o.runShows()).toBe(2);
    vi.advanceTimersByTime(20_000);
    await p.knownPaths();
    expect(o.runShows()).toBe(2);
  });

  it("a Run that cannot be read keeps its last answer: the Push does not flip to none", async () => {
    const o = orcaStub();
    const p = new OrcaPusher(o.run);
    expect(await send(p)).toMatchObject({ delivered: true, runId: "run_a" });
    o.runs = [{ id: "run_b", handle: "term_kan" }, ...o.runs]; // a newer Run the lookup cannot read yet
    o.failing.add("run-show run_b");
    vi.advanceTimersByTime(20_000);
    expect(await send(p)).toMatchObject({ delivered: true, runId: "run_a" });
    // and the unreadable Run is asked again soon, not after the 15 s cache
    o.failing.clear();
    vi.advanceTimersByTime(2_500);
    expect(await send(p)).toMatchObject({ delivered: true, runId: "run_b" });
  });

  it("an Orca that cannot be asked keeps the last answer for a while, then says it cannot reach Orca", async () => {
    const o = orcaStub();
    const p = new OrcaPusher(o.run);
    await p.knownPaths();
    o.failing.add("terminal list");
    vi.advanceTimersByTime(20_000);
    expect(await send(p)).toMatchObject({ delivered: true });
    vi.advanceTimersByTime(130_000);
    expect((await send(p)).reason).toMatch(/^could not reach Orca: /);
    expect(await p.knownPaths()).toEqual({});
  });

  it("a Push that cannot reach Orca says so instead of claiming no Run was found", async () => {
    const o = orcaStub();
    o.failing.add("terminal list");
    const p = new OrcaPusher(o.run);
    const res = await send(p);
    expect(res).toMatchObject({ delivered: false, runId: null });
    expect(res.reason).toMatch(/^could not reach Orca: /);
    expect(res.reason).not.toBe(NO_RUN);
  });

  it("a Push never says none from an answer that is not complete: unreachable Orca with the repo missing from the stale answer", async () => {
    const o = orcaStub();
    o.runs = [];
    const p = new OrcaPusher(o.run);
    await p.knownPaths(); // a complete answer: none
    o.failing.add("terminal list"); // Orca goes away; the stale answer stands but is not an answer about now
    vi.advanceTimersByTime(20_000);
    const res = await send(p);
    expect(res).toMatchObject({ delivered: false, runId: null });
    expect(res.reason).toMatch(/^could not reach Orca: /);
    expect(res.reason).not.toBe(NO_RUN);
  });

  it("a Push never says none when a Run could not be read: a coordinator that is not readable yet is not none", async () => {
    const o = orcaStub();
    o.runs = [{ id: "run_new", handle: "term_kan" }]; // just started; its run-show times out under load
    o.failing.add("run-show run_new");
    const p = new OrcaPusher(o.run);
    const res = await send(p);
    expect(res).toMatchObject({ delivered: false, runId: null });
    expect(res.reason).toMatch(/^could not read /);
    expect(res.reason).not.toBe(NO_RUN);
    expect(o.sends()).toEqual([]);
    // once the Run can be read the same Push goes through
    o.failing.clear();
    expect(await send(p)).toMatchObject({ delivered: true, runId: "run_new" });
  });

  it("concurrent lookups share one", async () => {
    const o = orcaStub();
    const p = new OrcaPusher(o.run);
    await Promise.all([p.knownPaths(), p.knownPaths(), send(p)]);
    expect(o.calls.filter((c) => c[1] === "terminal")).toHaveLength(1);
  });

  it("knows the main checkout of each repo", async () => {
    const o = orcaStub();
    o.terminals.push({ handle: "term_w", connected: true, worktreePath: "/w/app/wt" }, { handle: "term_t", connected: true, worktreePath: "/w/tandem" });
    o.remotes["/w/app/wt"] = o.remotes["/w/app"]!;
    expect(await new OrcaPusher(o.run).knownPaths()).toEqual({ [repo]: "/w/app", "acme/tandem": "/w/tandem" });
  });
});

describe("Start coordinator: the launched prompt comes from the workflow config (#33)", () => {
  const launches = (o: ReturnType<typeof orcaStub>) => o.calls.filter((c) => c[1] === "agent" && c[2] === "launch");

  it("launches the default coordinator skill with the Card numbers in the repo's checkout", async () => {
    expect(DEFAULT_WORKFLOW.coordinatorCommand).toBe("/aw-coordinate");
    const o = orcaStub();
    await new OrcaPusher(o.run).startCoordinator(repo, "/w/app", [7], DEFAULT_WORKFLOW.coordinatorCommand);
    expect(launches(o)).toEqual([["orca", "agent", "launch", "--agent", "claude", "--worktree", "path:/w/app", "--prompt", "/aw-coordinate #7", "--json"]]);
  });

  it("several Cards go into one prompt", () => {
    expect(coordinatorPrompt("/aw-coordinate", [105, 106])).toBe("/aw-coordinate #105 #106");
  });

  it("a renamed skill is a config change: the user's override is what gets launched", async () => {
    const o = orcaStub();
    await new OrcaPusher(o.run).startCoordinator(repo, "/w/app", [7, 9], mergeWorkflow({ coordinatorCommand: "/my-coordinator" }).coordinatorCommand);
    const args = launches(o)[0]!;
    expect(args[args.indexOf("--prompt") + 1]).toBe("/my-coordinator #7 #9");
  });

  it("an override that is blank or not text launches the default, never a prompt of bare numbers", () => {
    expect(coordinatorPrompt("  ", [7])).toBe("/aw-coordinate #7");
    expect(coordinatorPrompt(" /x ", [7])).toBe("/x #7");
    expect(coordinatorPrompt(42 as unknown as string, [7])).toBe("/aw-coordinate #7");
  });

  it("the Push subject and body do not carry the skill name: a rename leaves a running coordinator's contract alone", () => {
    expect(pushSubject("acme/app", 7, "feedback")).toBe("tandem push: acme/app#7 feedback");
    expect(pushSubject("acme/app", 7, "start")).toBe("tandem push: acme/app#7 start");
    expect(pushBody("acme/app", 7, "start", "build")).not.toMatch(/coordinate/);
    expect(pushBody("acme/app", 7, "feedback", "D1 answered")).not.toMatch(/coordinate/);
  });
});
