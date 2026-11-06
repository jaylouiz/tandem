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

describe("wayfinder fields", () => {
  const gql = (over: Record<string, unknown> = {}) =>
    ({
      number: 7, title: "t", body: "", url: "u", state: "OPEN", stateReason: null, createdAt: "a", updatedAt: "b", closedAt: null,
      labels: { nodes: [{ name: "wayfinder:research" }] },
      parent: { number: 3, repository: { nameWithOwner: "O/R" } },
      assignees: { nodes: [{ login: "demo-user" }] },
      blockedBy: { nodes: [{ number: 5, state: "OPEN", repository: { nameWithOwner: "o/r" } }, { number: 6, state: "CLOSED", repository: { nameWithOwner: "o/r" } }, { number: 1, state: "OPEN", repository: { nameWithOwner: "x/y" } }] },
      comments: { nodes: [] }, closedByPullRequestsReferences: { nodes: [] },
      ...over,
    }) as unknown as Parameters<typeof toRawIssue>[1];

  it("maps parent, assignees and same-repo blockers", () => {
    expect(toRawIssue("o/r", gql())).toMatchObject({ parent: 3, assignees: ["demo-user"], blockedBy: [{ number: 5, state: "open" }, { number: 6, state: "closed" }] });
  });
  it("drops a parent in another repo and keeps null parents null", () => {
    expect(toRawIssue("o/r", gql({ parent: { number: 3, repository: { nameWithOwner: "x/y" } } })).parent).toBeNull();
    expect(toRawIssue("o/r", gql({ parent: null })).parent).toBeNull();
  });
  it("asks for the fields in the delta query", async () => {
    const fetchMock = stub({ data: { repository: { issues: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: [] } } } });
    await new GitHubSource("t").fetchIssues("o/r", null, 7);
    const q = String((JSON.parse(String((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body)) as { query: string }).query);
    for (const f of ["parent {", "assignees(first", "blockedBy(first"]) expect(q).toContain(f);
  });
});
