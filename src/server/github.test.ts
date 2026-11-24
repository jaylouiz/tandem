import { afterEach, describe, expect, it, vi } from "vitest";
import { GitHubSource, toRawIssue } from "./github.ts";

afterEach(() => vi.unstubAllGlobals());

const stub = (json: unknown) => {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify(json), { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
};

describe("GitHubSource.signedImages", () => {
  it("asks for one comment's bodyHTML by node id and returns its images in order", async () => {
    const fetchMock = stub({ data: { node: { bodyHTML: '<p><a href="x"><img src="https://private-user-images.githubusercontent.com/1/a.png?jwt=A" alt="a desktop"></a><img alt="a mobile" src="https://private-user-images.githubusercontent.com/1/b.png?jwt=B"></p>' } } });
    const images = await new GitHubSource("t").signedImages("IC_abc");
    expect(images).toEqual([
      { alt: "a desktop", src: "https://private-user-images.githubusercontent.com/1/a.png?jwt=A" },
      { alt: "a mobile", src: "https://private-user-images.githubusercontent.com/1/b.png?jwt=B" },
    ]);
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const sent = JSON.parse(String(init.body)) as { query: string; variables: { id: string } };
    expect(sent.variables).toEqual({ id: "IC_abc" });
    expect(sent.query).toContain("bodyHTML");
  });

  it("returns null for a missing comment and throws on a GraphQL error", async () => {
    stub({ data: { node: null } });
    expect(await new GitHubSource("t").signedImages("IC_gone")).toBeNull();
    stub({ errors: [{ message: "rate limited" }] });
    await expect(new GitHubSource("t").signedImages("IC_x")).rejects.toThrow(/rate limited/);
  });
});

describe("sync query", () => {
  it("does not ask for rendered HTML: signed URLs expire and must never reach the cache", async () => {
    const fetchMock = stub({ data: { repository: { issues: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: [] } } } });
    await new GitHubSource("t").fetchIssues("o/r", null, 7);
    for (const [, init] of fetchMock.mock.calls as unknown as [string, RequestInit][]) expect(String(init.body)).not.toContain("bodyHTML");
  });
});

describe("the issue query", () => {
  it("does not ask for the sub-issue and blocker fields the removed Wayfinder maps view needed (#15)", async () => {
    const fetchMock = stub({ data: { repository: { issues: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: [] } } } });
    await new GitHubSource("t").fetchIssues("o/r", null, 7);
    const q = String((JSON.parse(String((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body)) as { query: string }).query);
    for (const f of ["parent {", "assignees(first", "blockedBy(first"]) expect(q).not.toContain(f);
  });
});
