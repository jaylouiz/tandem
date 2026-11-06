import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { evaluate, repoRoot, VersionCheck } from "./version.ts";

function checkout(commit: string | null) {
  const root = mkdtempSync(join(tmpdir(), "tandem-ver-"));
  mkdirSync(join(root, "dist"));
  const stamp = (c: string | null) => writeFileSync(join(root, "dist", "version.json"), JSON.stringify({ commit: c }));
  stamp(commit);
  return { root, stamp };
}

describe("version check", () => {
  it("is pending only when the stamp, the running build and HEAD disagree", () => {
    expect(evaluate("a", "a", "a")).toMatchObject({ pending: false, reason: null });
    expect(evaluate("a", "b", "b")).toMatchObject({ pending: true, reason: "restart" });
    expect(evaluate("a", "a", "c")).toMatchObject({ pending: true, reason: "build" });
    expect(evaluate("a", "a", null)).toMatchObject({ pending: false });
    expect(evaluate(null, "a", "b")).toMatchObject({ pending: false }); // no stamp at start (dev, tarball): off
  });

  it("sees a pull (HEAD moves), then a rebuild (stamp moves), and caches HEAD for a minute", async () => {
    const { root, stamp } = checkout("a");
    let head = "a";
    let gitCalls = 0;
    let t = 0;
    const v = new VersionCheck(root, async () => (gitCalls++, head), () => t);
    expect((await v.status()).pending).toBe(false);
    head = "b";
    t = 30_000;
    expect((await v.status()).pending).toBe(false); // cached
    t = 61_000;
    expect(await v.status()).toMatchObject({ pending: true, reason: "build" });
    stamp("b");
    expect(await v.status()).toMatchObject({ pending: true, reason: "restart" });
    expect(gitCalls).toBe(2);
  });

  it("finds the checkout root from source and from the build", () => {
    expect(repoRoot()).toMatch(/\S/);
  });
});
