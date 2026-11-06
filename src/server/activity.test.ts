import { mkdirSync, mkdtempSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { buildCard } from "../core/card.ts";
import { DEFAULT_WORKFLOW } from "../core/config.ts";
import { demoIssues } from "../core/fixtures.ts";
import { Board } from "./board.ts";
import { FixtureSource } from "./fixture.ts";
import { FakePusher } from "./push.ts";
import { Store } from "./store.ts";
import { issueLogPath, readLogActivity } from "./activity.ts";

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "tandem-logs-"));
  process.env.WF_ISSUE_LOG_DIR = dir;
});

const cards = () => demoIssues().map((i) => buildCard(i, DEFAULT_WORKFLOW, null));
const writeLog = (repo: string, n: number, text: string) => {
  const p = issueLogPath(repo, n);
  mkdirSync(join(p, ".."), { recursive: true });
  writeFileSync(p, text);
  return p;
};

describe("readLogActivity", () => {
  it("returns the last timestamped line of in-flight Cards that have a log", async () => {
    writeLog("acme/app", 107, "# Coordination log #107\n\n- 2026-11-04T10:00Z a\n- 2026-11-04T11:00Z b\n");
    const out = await readLogActivity(cards());
    expect(out).toEqual({ "acme/app#107": { at: "2026-11-04T11:00:00Z", last: "b" } });
  });

  it("skips Cards without a log, and Cards outside UX Design and Build", async () => {
    writeLog("acme/app", 103, "- 2026-11-04T10:00Z backlog Card"); // Backlog
    expect(await readLogActivity(cards())).toEqual({});
  });

  it("falls back to the file's mtime for a log without timestamped lines", async () => {
    const p = writeLog("acme/app", 107, "# Coordination log\n\nnotes\n");
    utimesSync(p, new Date("2026-11-04T09:00:00Z"), new Date("2026-11-04T09:00:00Z"));
    expect(await readLogActivity(cards())).toEqual({ "acme/app#107": { at: "2026-11-04T09:00:00.000Z", last: "notes" } });
  });
});

describe("Board activity", () => {
  it("ships the activity map in the view and emits when a last line changes", async () => {
    const source = new FixtureSource();
    const store = new Store({ repos: await source.listRepos() });
    let text = "one";
    const board = new Board(source, store, new FakePusher(new Set()), { pollMs: 60_000, persist: false, activity: async () => ({ "acme/app#107": { at: null, last: text } }) });
    await board.refreshAll(true);
    let emitted = 0;
    board.subscribe(() => emitted++);
    await board.refreshActivity();
    expect(board.view().activity).toEqual({ "acme/app#107": { at: null, last: "one" } });
    await new Promise((r) => setTimeout(r, 5));
    expect(emitted).toBe(1);
    await board.refreshActivity(); // unchanged: no emit
    await new Promise((r) => setTimeout(r, 5));
    expect(emitted).toBe(1);
    text = "two";
    await board.refreshActivity();
    await new Promise((r) => setTimeout(r, 5));
    expect(emitted).toBe(2);
  });
});

describe("issueLogPath", () => {
  it("stays inside the log folder", () => {
    expect(issueLogPath("acme/app", 7)).toBe(join(dir, "acme/app", "7.md"));
    for (const repo of ["../x", "acme/../../etc", "demo-user", "a/b/c", "acme/.."]) expect(() => issueLogPath(repo, 1), repo).toThrow();
    for (const n of [0, -1, 1.5, Number.NaN]) expect(() => issueLogPath("acme/app", n), String(n)).toThrow();
  });
});
