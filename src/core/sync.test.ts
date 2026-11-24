import { describe, expect, it } from "vitest";
import { syncFailure, syncFailureStatus } from "./sync.ts";

describe("a failed sync in plain words (#2)", () => {
  it("names a network failure, a refused login, a rate limit and any other status", () => {
    expect(syncFailure("GitHub could not be reached: fetch failed (ENOTFOUND)")).toEqual({ what: "GitHub could not be reached", detail: "GitHub could not be reached: fetch failed (ENOTFOUND)" });
    expect(syncFailure('GitHub GET /repos/o/r/issues: 401 {"message":"Bad credentials"}').what).toBe("GitHub refused the login (401): run `gh auth login`");
    expect(syncFailure("GitHub POST /graphql: 403 rate limit").what).toBe("GitHub refused the request (403), possibly a rate limit");
    expect(syncFailure("GitHub POST /graphql: 502 Bad Gateway").what).toBe("GitHub answered 502");
    expect(syncFailure("GitHub GraphQL: Something went wrong").what).toBe("Sync failed");
    expect(syncFailure("x".repeat(400)).detail).toHaveLength(301);
  });
  it("says since when, when the repo last synced and that it retries", () => {
    const clock = (iso: string) => iso.slice(11, 16);
    expect(syncFailureStatus({ at: "2026-11-24T10:00:00Z", okAt: "2026-11-24T10:58:00Z", error: "x", errorAt: "2026-11-24T11:05:00Z", syncing: false }, clock)).toBe("Since 11:05 · last synced 10:58 · retrying every 15 s");
    expect(syncFailureStatus({ at: null, okAt: null, error: "x", errorAt: null, syncing: false }, clock)).toBe("never synced · retrying every 15 s");
  });
});
