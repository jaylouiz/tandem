import { afterEach, describe, expect, it, vi } from "vitest";
import { GitHubSource, SET_STATUS_MUTATION, STATUS_TARGET_QUERY, toRawIssue } from "./github.ts";

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

describe("the native issue status (#18)", () => {
  type Sent = { query: string; variables: Record<string, unknown> };
  const node = (number: number, status: { name: string } | null | undefined) => ({
    number, title: "t", body: "", url: "u", state: "OPEN", stateReason: null, createdAt: "a", updatedAt: "b", closedAt: null,
    ...(status === undefined ? {} : { status }),
    labels: { nodes: [] }, comments: { nodes: [] }, closedByPullRequestsReferences: { nodes: [] },
  });
  const page = (nodes: unknown[]) => ({ data: { repository: { issues: { pageInfo: { hasNextPage: false, endCursor: null }, nodes } } } });
  /** answers each GraphQL call from `answer`, and keeps what was sent */
  const serve = (answer: (sent: Sent, i: number) => unknown) => {
    const sent: Sent[] = [];
    vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body)) as Sent;
      sent.push(body);
      return new Response(JSON.stringify(answer(body, sent.length - 1)), { status: 200 });
    });
    return sent;
  };
  const withStatus = (s: Sent) => s.query.includes("status { name }");

  it("reads the status by name with the issues; an issue without one reads as null", async () => {
    const sent = serve(() => page([node(1, { name: "In progress" }), node(2, null)]));
    const issues = await new GitHubSource("t").fetchIssues("o/r", "2026-11-01T00:00:00Z", 7);
    expect(issues.map((i) => [i.number, i.status])).toEqual([[1, "In progress"], [2, null]]);
    expect(sent.every(withStatus)).toBe(true);
  });

  it("a GitHub that does not know the field: the same read without it, the repo reads from labels until the next full fetch asks again", async () => {
    let known = false;
    const sent = serve((s) => (withStatus(s) && !known ? { errors: [{ message: "Field 'status' doesn't exist on type 'Issue'" }] } : page([node(1, withStatus(s) ? { name: "Todo" } : undefined)])));
    const gh = new GitHubSource("t");
    expect((await gh.fetchIssues("o/r", "2026-11-01T00:00:00Z", 7)).map((i) => i.status)).toEqual([null]);
    expect(sent.map(withStatus)).toEqual([true, false]);
    expect(sent[1]!.variables).toEqual(sent[0]!.variables); // the same page, only the field is gone
    // the next poll does not try the field again, and no status is written for this repo
    await gh.fetchIssues("o/r", "2026-11-01T00:00:00Z", 7);
    expect(sent.map(withStatus)).toEqual([true, false, false]);
    expect(await gh.setStatus("o/r", 1, "Todo")).toBe(false);
    expect(sent).toHaveLength(3);
    // another repo is not affected; a full fetch asks again and finds the field
    known = true;
    expect((await gh.fetchIssues("o/r", null, 7)).map((i) => i.status)).toEqual(["Todo", "Todo"]);
    expect(await gh.setStatus("o/other", 1, "Nope")).toBe(false);
  });

  it("an error that is not about the field stays an error (the read without it fails too), and the field is asked for again", async () => {
    const sent = serve(() => ({ errors: [{ message: "API rate limit exceeded" }] }));
    const gh = new GitHubSource("t");
    await expect(gh.fetchIssues("o/r", "2026-11-01T00:00:00Z", 7)).rejects.toThrow(/rate limit/);
    await expect(gh.fetchIssues("o/r", "2026-11-01T00:00:00Z", 7)).rejects.toThrow(/rate limit/);
    expect(sent.map(withStatus)).toEqual([true, false, true, false]);
  });

  it("sets a status with exactly this query and mutation: ids looked up by name, never remembered", async () => {
    const sent = serve((_s, i) =>
      i === 0
        ? { data: { repository: { planningStatuses: { nodes: [{ id: "IS_backlog", name: "Backlog" }, { id: "IS_todo", name: "Todo" }] }, issue: { id: "I_18" } } } }
        : { data: { setIssueStatus: { issue: { number: 18 } } } },
    );
    expect(await new GitHubSource("t").setStatus("jay/tandem", 18, "Todo")).toBe(true);
    expect(sent).toEqual([
      { query: STATUS_TARGET_QUERY, variables: { owner: "jay", name: "tandem", number: 18 } },
      { query: SET_STATUS_MUTATION, variables: { issueId: "I_18", statusId: "IS_todo" } },
    ]);
    expect(STATUS_TARGET_QUERY).toBe("query($owner: String!, $name: String!, $number: Int!) { repository(owner: $owner, name: $name) { planningStatuses(first: 50) { nodes { id name } } issue(number: $number) { id } } }");
    expect(SET_STATUS_MUTATION).toBe("mutation($issueId: ID!, $statusId: ID!) { setIssueStatus(input: { issueId: $issueId, statusId: $statusId }) { issue { number } } }");
  });

  it("writes nothing when the repo offers no status of that name, and throws when the write is refused or the issue is gone", async () => {
    let sent = serve(() => ({ data: { repository: { planningStatuses: { nodes: [{ id: "IS_backlog", name: "Backlog" }] }, issue: { id: "I_1" } } } }));
    expect(await new GitHubSource("t").setStatus("o/r", 1, "Todo")).toBe(false);
    expect(sent).toHaveLength(1);
    sent = serve(() => ({ data: { repository: { planningStatuses: null, issue: { id: "I_1" } } } }));
    expect(await new GitHubSource("t").setStatus("o/r", 1, "Todo")).toBe(false);
    serve(() => ({ data: { repository: { planningStatuses: { nodes: [{ id: "IS_todo", name: "Todo" }] }, issue: null } } }));
    await expect(new GitHubSource("t").setStatus("o/r", 9, "Todo")).rejects.toThrow("GitHub has no issue o/r#9");
    serve((_s, i) => (i === 0 ? { data: { repository: { planningStatuses: { nodes: [{ id: "IS_todo", name: "Todo" }] }, issue: { id: "I_1" } } } } : { errors: [{ message: "viewer cannot set status" }] }));
    await expect(new GitHubSource("t").setStatus("o/r", 1, "Todo")).rejects.toThrow(/viewer cannot set status/);
  });

  it("toRawIssue keeps the name only", () => {
    expect(toRawIssue("o/r", node(3, { name: "In review" }) as never).status).toBe("In review");
    expect(toRawIssue("o/r", node(3, undefined) as never).status).toBeNull();
  });
});
