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

const ISSUES_QUERY = `
query($owner: String!, $name: String!, $cursor: String, $since: DateTime, $states: [IssueState!]) {
  repository(owner: $owner, name: $name) {
    issues(first: 40, after: $cursor, states: $states, filterBy: { since: $since }, orderBy: { field: UPDATED_AT, direction: DESC }) {
      pageInfo { hasNextPage endCursor }
      nodes {
        number title body url state stateReason createdAt updatedAt closedAt
        labels(first: 30) { nodes { name } }
        parent { number repository { nameWithOwner } }
        assignees(first: 5) { nodes { login } }
        blockedBy(first: 20) { nodes { number state repository { nameWithOwner } } }
        comments(last: 80) { nodes { id body createdAt url author { login } } }
        closedByPullRequestsReferences(first: 5, includeClosedPrs: true) {
          nodes { number title url state isDraft body updatedAt labels(first: 15) { nodes { name } } }
        }
      }
    }
  }
}`;

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
  labels: { nodes: { name: string }[] };
  parent: { number: number; repository: { nameWithOwner: string } } | null;
  assignees: { nodes: { login: string }[] };
  blockedBy: { nodes: { number: number; state: "OPEN" | "CLOSED"; repository: { nameWithOwner: string } }[] };
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
    // wayfinder sub-issues and blocking: only same-repo links are kept
    parent: i.parent && i.parent.repository.nameWithOwner.toLowerCase() === repo.toLowerCase() ? i.parent.number : null,
    assignees: i.assignees.nodes.map((a) => a.login),
    blockedBy: i.blockedBy.nodes
      .filter((b) => b.repository.nameWithOwner.toLowerCase() === repo.toLowerCase())
      .map((b) => ({ number: b.number, state: b.state === "OPEN" ? "open" : "closed" })),
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
    });
    if (!res.ok && res.status !== 304) throw new Error(`GitHub ${init.method ?? "GET"} ${path}: ${res.status} ${await res.text()}`);
    return res;
  }

  private async graphql<T>(query: string, variables: Record<string, unknown>): Promise<T> {
    const res = await this.rest("/graphql", { method: "POST", body: JSON.stringify({ query, variables }) });
    const json = (await res.json()) as { data?: T; errors?: { message: string }[] };
    if (json.errors?.length) throw new Error(`GitHub GraphQL: ${json.errors.map((e) => e.message).join("; ")}`);
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
    for (const b of batches) {
      let cursor: string | null = null;
      do {
        type Page = { repository: { issues: { pageInfo: { hasNextPage: boolean; endCursor: string }; nodes: GqlIssue[] } } };
        const data: Page = await this.graphql<Page>(ISSUES_QUERY, { owner, name, cursor, since: b.since, states: b.states });
        const page = data.repository.issues;
        out.push(...page.nodes.map((i) => toRawIssue(repo, i)));
        cursor = page.pageInfo.hasNextPage ? page.pageInfo.endCursor : null;
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
      parent: null,
      assignees: [],
      blockedBy: [],
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
