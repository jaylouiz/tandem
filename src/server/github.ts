// GitHub source: acts as the developer through their `gh` login (ADR 0002).
// Change detection is one ETag-conditional REST call per repo (a 304 costs no rate limit);
// only a change triggers a GraphQL fetch of the issues updated since the last sync.
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { parseHtmlImages, type HtmlImage } from "../core/images.ts";
import type { RawIssue, RawPullRequest } from "../core/types.ts";
import type { Source } from "./source.ts";

const run = promisify(execFile);
const API = "https://api.github.com";

// `status` is GitHub's native issue status (#18), a preview field: `issuesQuery(false)` is the same read without it, for a repo or a
// GitHub that does not know the field (the Phase then comes from labels alone).
const issuesQuery = (withStatus: boolean) => `
query($owner: String!, $name: String!, $cursor: String, $since: DateTime, $states: [IssueState!]) {
  repository(owner: $owner, name: $name) {
    issues(first: 40, after: $cursor, states: $states, filterBy: { since: $since }, orderBy: { field: UPDATED_AT, direction: DESC }) {
      pageInfo { hasNextPage endCursor }
      nodes {
        number title body url state stateReason createdAt updatedAt closedAt${withStatus ? " status { name }" : ""}
        labels(first: 30) { nodes { name } }
        comments(last: 80) { nodes { id body createdAt url author { login } } }
        closedByPullRequestsReferences(first: 5, includeClosedPrs: true) {
          nodes { number title url state isDraft body updatedAt labels(first: 15) { nodes { name } } }
        }
      }
    }
  }
}`;

// Writing a status takes two node ids: the issue's and the status's. Statuses are resolved by name, never by a remembered id.
export const STATUS_TARGET_QUERY = `query($owner: String!, $name: String!, $number: Int!) { repository(owner: $owner, name: $name) { planningStatuses(first: 50) { nodes { id name } } issue(number: $number) { id } } }`;
export const SET_STATUS_MUTATION = `mutation($issueId: ID!, $statusId: ID!) { setIssueStatus(input: { issueId: $issueId, statusId: $statusId }) { issue { number } } }`;

/** GitHub answered the GraphQL call with errors (an unknown field, a refused write), as opposed to not answering at all. */
export class GraphQLError extends Error {}

// Read one comment's rendered HTML on demand. Private repos get signed `private-user-images` URLs that expire
// after about 5 minutes, so they are never part of the synced issues or the cache.
const COMMENT_HTML_QUERY = `query($id: ID!) { node(id: $id) { ... on IssueComment { bodyHTML } } }`;

interface GqlIssue {
  number: number;
  title: string;
  body: string;
  url: string;
  state: "OPEN" | "CLOSED";
  stateReason: "COMPLETED" | "NOT_PLANNED" | "REOPENED" | null;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
  status?: { name: string } | null;
  labels: { nodes: { name: string }[] };
  comments: { nodes: { id: string; body: string; createdAt: string; url: string; author: { login: string } | null }[] };
  closedByPullRequestsReferences: {
    nodes: { number: number; title: string; url: string; state: "OPEN" | "CLOSED" | "MERGED"; isDraft: boolean; body: string; updatedAt: string; labels: { nodes: { name: string }[] } }[];
  };
}

export function toRawIssue(repo: string, i: GqlIssue): RawIssue {
  return {
    repo,
    number: i.number,
    title: i.title,
    body: i.body,
    url: i.url,
    state: i.state === "OPEN" ? "open" : "closed",
    stateReason: i.stateReason ? (i.stateReason.toLowerCase() as RawIssue["stateReason"]) : null,
    labels: i.labels.nodes.map((l) => l.name),
    status: i.status?.name ?? null,
    createdAt: i.createdAt,
    updatedAt: i.updatedAt,
    closedAt: i.closedAt,
    comments: i.comments.nodes.map((c) => ({ id: c.id, author: c.author?.login ?? "ghost", body: c.body, createdAt: c.createdAt, url: c.url })),
    pullRequests: i.closedByPullRequestsReferences.nodes.map(
      (p): RawPullRequest => ({
        number: p.number,
        title: p.title,
        url: p.url,
        state: p.state.toLowerCase() as RawPullRequest["state"],
        isDraft: p.isDraft,
        body: p.body,
        updatedAt: p.updatedAt,
        labels: p.labels.nodes.map((l) => l.name),
      }),
    ),
  };
}

export class GitHubSource implements Source {
  readonly kind = "github" as const;
  private token: Promise<string>;
  private etags = new Map<string, string>();
  /** repos whose issues could not be read with `status`: read without it, and no status is written, until the next full fetch asks again */
  private noStatus = new Set<string>();

  constructor(token?: string) {
    this.token = token ? Promise.resolve(token) : run("gh", ["auth", "token"]).then((r) => r.stdout.trim());
  }

  private async rest(path: string, init: RequestInit = {}): Promise<Response> {
    const res = await fetch(`${API}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${await this.token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        ...(init.headers ?? {}),
      },
    }).catch((e: unknown) => {
      // Node says only "fetch failed" (no network, DNS, a dropped connection, e.g. after sleep): name it and keep the cause. Never retried here: writes use this too
      const code = (e as { cause?: { code?: string } }).cause?.code;
      throw new Error(`GitHub could not be reached: ${e instanceof Error ? e.message : String(e)}${code ? ` (${code})` : ""}`);
    });
    if (!res.ok && res.status !== 304) throw new Error(`GitHub ${init.method ?? "GET"} ${path}: ${res.status} ${await res.text()}`);
    return res;
  }

  private async graphql<T>(query: string, variables: Record<string, unknown>): Promise<T> {
    const res = await this.rest("/graphql", { method: "POST", body: JSON.stringify({ query, variables }) });
    const json = (await res.json()) as { data?: T; errors?: { message: string }[] };
    if (json.errors?.length) throw new GraphQLError(`GitHub GraphQL: ${json.errors.map((e) => e.message).join("; ")}`);
    return json.data as T;
  }

  async changed(repo: string): Promise<boolean> {
    const etag = this.etags.get(repo);
    const res = await this.rest(`/repos/${repo}/issues?state=all&sort=updated&direction=desc&per_page=1`, {
      headers: etag ? { "If-None-Match": etag } : {},
    });
    const next = res.headers.get("etag");
    if (next) this.etags.set(repo, next);
    return res.status !== 304;
  }

  async fetchIssues(repo: string, since: string | null, closedLookbackDays: number): Promise<RawIssue[]> {
    const [owner, name] = repo.split("/");
    const batches: { states: string[]; since: string | null }[] = since
      ? [{ states: ["OPEN", "CLOSED"], since }]
      : [
          { states: ["OPEN"], since: null },
          { states: ["CLOSED"], since: new Date(Date.now() - closedLookbackDays * 86_400_000).toISOString() },
        ];
    const out: RawIssue[] = [];
    type Page = { repository: { issues: { pageInfo: { hasNextPage: boolean; endCursor: string }; nodes: GqlIssue[] } } };
    if (!since) this.noStatus.delete(repo); // a full fetch asks for the status again
    const page = async (variables: Record<string, unknown>): Promise<Page> => {
      if (this.noStatus.has(repo)) return this.graphql<Page>(issuesQuery(false), variables);
      try {
        return await this.graphql<Page>(issuesQuery(true), variables);
      } catch (e) {
        // only an answer with errors can be about the field; the same read without it decides (a rate limit fails again and stays an error)
        if (!(e instanceof GraphQLError)) throw e;
        const plain = await this.graphql<Page>(issuesQuery(false), variables);
        this.noStatus.add(repo);
        return plain;
      }
    };
    for (const b of batches) {
      let cursor: string | null = null;
      do {
        const data: Page = await page({ owner, name, cursor, since: b.since, states: b.states });
        const issues = data.repository.issues;
        out.push(...issues.nodes.map((i) => toRawIssue(repo, i)));
        cursor = issues.pageInfo.hasNextPage ? issues.pageInfo.endCursor : null;
      } while (cursor);
    }
    return out;
  }

  async comment(repo: string, number: number, body: string) {
    const res = await this.rest(`/repos/${repo}/issues/${number}/comments`, { method: "POST", body: JSON.stringify({ body }) });
    const c = (await res.json()) as { node_id: string; html_url: string; created_at: string };
    return { id: c.node_id, url: c.html_url, createdAt: c.created_at };
  }

  async addLabels(repo: string, number: number, labels: string[]) {
    await this.rest(`/repos/${repo}/issues/${number}/labels`, { method: "POST", body: JSON.stringify({ labels }) });
  }

  async removeLabel(repo: string, number: number, label: string) {
    try {
      await this.rest(`/repos/${repo}/issues/${number}/labels/${encodeURIComponent(label)}`, { method: "DELETE" });
    } catch (e) {
      if (!String(e).includes(": 404")) throw e; // already gone
    }
  }

  async setStatus(repo: string, number: number, status: string) {
    if (this.noStatus.has(repo)) return false;
    const [owner, name] = repo.split("/");
    type Target = { repository: { planningStatuses: { nodes: { id: string; name: string }[] } | null; issue: { id: string } | null } };
    const target = await this.graphql<Target>(STATUS_TARGET_QUERY, { owner, name, number });
    const statusId = target.repository.planningStatuses?.nodes.find((s) => s.name === status)?.id;
    if (!statusId) return false; // the repo offers no such status: nothing to write
    const issueId = target.repository.issue?.id;
    if (!issueId) throw new Error(`GitHub has no issue ${repo}#${number}`);
    await this.graphql(SET_STATUS_MUTATION, { issueId, statusId });
    return true;
  }

  async createIssue(repo: string, title: string, body: string, labels: string[]): Promise<RawIssue> {
    const res = await this.rest(`/repos/${repo}/issues`, { method: "POST", body: JSON.stringify({ title, body, labels }) });
    const i = (await res.json()) as { number: number; html_url: string; created_at: string; updated_at: string };
    return {
      repo,
      number: i.number,
      title,
      body,
      url: i.html_url,
      state: "open",
      stateReason: null,
      labels,
      status: null,
      createdAt: i.created_at,
      updatedAt: i.updated_at,
      closedAt: null,
      comments: [],
      pullRequests: [],
    };
  }

  async signedImages(commentId: string): Promise<HtmlImage[] | null> {
    const data = await this.graphql<{ node: { bodyHTML?: string } | null }>(COMMENT_HTML_QUERY, { id: commentId });
    const html = data.node?.bodyHTML;
    return html ? parseHtmlImages(html) : null;
  }

  async listRepos(): Promise<string[]> {
    const res = await this.rest(`/user/repos?affiliation=owner,collaborator&sort=pushed&per_page=100`);
    return ((await res.json()) as { full_name: string; archived: boolean }[]).filter((r) => !r.archived).map((r) => r.full_name);
  }

  async viewer(): Promise<string> {
    const res = await this.rest(`/user`);
    return ((await res.json()) as { login: string }).login;
  }
}
