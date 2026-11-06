import { existsSync, mkdtempSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { Store } from "./store.ts";

const prev = process.env.TANDEM_HOME;
afterEach(() => {
  if (prev === undefined) delete process.env.TANDEM_HOME;
  else process.env.TANDEM_HOME = prev;
});

function home() {
  const dir = mkdtempSync(join(tmpdir(), "tandem-store-"));
  process.env.TANDEM_HOME = dir;
  return dir;
}

describe("Store in memory (fixture mode)", () => {
  it("ignores an existing state.json and cache.json", () => {
    const dir = home();
    writeFileSync(join(dir, "state.json"), JSON.stringify({ repos: ["a/b"], seen: { "x/y#1": "2026-01-01T00:00:00Z" }, optedInAt: { "x/y": "2020-01-01T00:00:00Z" } }));
    writeFileSync(join(dir, "cache.json"), JSON.stringify({ "x/y": { syncedAt: "2026-01-01T00:00:00Z", issues: [] } }));
    const disk = new Store();
    expect(disk.state.seen).toEqual({ "x/y#1": "2026-01-01T00:00:00Z" }); // control: the file is read normally
    const mem = new Store({ repos: ["demo/repo"] }, { memory: true });
    expect(mem.state).toEqual({ repos: ["demo/repo"], seen: {}, repoPaths: {}, optedInAt: {} });
    expect(mem.seenAt("x/y", 1, "2019-01-01T00:00:00Z")).toBeNull();
    expect(mem.loadCache()).toEqual({});
  });

  it("reset goes back to the defaults, and refuses a store that persists", () => {
    home();
    const mem = new Store({ repos: ["demo/repo"] }, { memory: true });
    mem.setSeen("demo/repo#1", true);
    mem.setRepos(["other/repo"]);
    mem.reset({ repos: ["demo/repo"] });
    expect(mem.state).toEqual({ repos: ["demo/repo"], seen: {}, repoPaths: {}, optedInAt: {} });
    expect(() => new Store().reset()).toThrow(/in-memory/);
  });

  it("never writes state.json or cache.json, and keeps changes in memory", () => {
    const dir = home();
    const mem = new Store({}, { memory: true });
    mem.setRepos(["demo/repo"]);
    mem.setSeen("demo/repo#1", true, "2026-02-02T00:00:00Z");
    mem.setRepoPath("demo/repo", "/tmp/x");
    mem.saveCache({ "demo/repo": { syncedAt: "2026-02-02T00:00:00Z", issues: [] } });
    expect(readdirSync(dir)).toEqual([]);
    expect(mem.seenAt("demo/repo", 1, null)).toBe("2026-02-02T00:00:00Z");
    expect(existsSync(join(dir, "state.json"))).toBe(false);
  });
});
