// In-memory source over realistic demo threads (src/core/fixtures.ts), for dev, screenshots,
// prototypes and E2E (TANDEM_SOURCE=fixture). Writes mutate memory the way GitHub would.
import { demoIssues } from "../core/fixtures.ts";
import type { ActivityEntry, RawIssue } from "../core/types.ts";
import type { Board } from "./board.ts";
import type { FakePusher } from "./push.ts";
import type { Source } from "./source.ts";
import type { LocalState, Store } from "./store.ts";

export class FixtureSource implements Source {
  readonly kind = "fixture" as const;
  private issues: RawIssue[];
  private dirty = new Set<string>();
  private seq = 1000;

  constructor(issues = demoIssues()) {
    this.issues = issues;
  }

  /** Back to the boot state: fresh demo issues, as if the server had just started (E2E resets between tests). */
  reset() {
    this.issues = demoIssues();
    this.dirty.clear();
    this.seq = 1000;
  }

  private find(repo: string, number: number) {
    const i = this.issues.find((x) => x.repo === repo && x.number === number);
    if (!i) throw new Error(`no fixture issue ${repo}#${number}`);
    return i;
  }

  private touch(i: RawIssue) {
    i.updatedAt = new Date().toISOString();
    this.dirty.add(i.repo);
  }

  async changed(repo: string) {
    return this.dirty.delete(repo);
  }

  async fetchIssues(repo: string, since: string | null) {
    return structuredClone(this.issues.filter((i) => i.repo === repo && (!since || i.updatedAt >= since)));
  }

  async comment(repo: string, number: number, body: string) {
    const i = this.find(repo, number);
    const c = { id: `fx${++this.seq}`, author: "demo-user", body, createdAt: new Date().toISOString(), url: `${i.url}#issuecomment-${this.seq}` };
    i.comments.push(c);
    this.touch(i);
    return c;
  }

  async addLabels(repo: string, number: number, labels: string[]) {
    const i = this.find(repo, number);
    i.labels = [...new Set([...i.labels, ...labels])];
    this.touch(i);
  }

  async removeLabel(repo: string, number: number, label: string) {
    const i = this.find(repo, number);
    i.labels = i.labels.filter((l) => l !== label);
    this.touch(i);
  }

  async createIssue(repo: string, title: string, body: string, labels: string[]) {
    const number = Math.max(0, ...this.issues.filter((i) => i.repo === repo).map((i) => i.number)) + 1;
    const now = new Date().toISOString();
    const issue: RawIssue = {
      repo, number, title, body, labels, parent: null, assignees: [], blockedBy: [],
      url: `https://github.com/${repo}/issues/${number}`,
      state: "open", stateReason: null, createdAt: now, updatedAt: now, closedAt: null, comments: [], pullRequests: [],
    };
    this.issues.push(issue);
    this.dirty.add(repo);
    return structuredClone(issue);
  }

  async signedImages() {
    return null; // demo data carries data URIs; the raw src loads as is
  }

  async listRepos() {
    return [...new Set(this.issues.map((i) => i.repo))].sort();
  }

  async viewer() {
    return "demo-user";
  }
}

/** The reset behind POST /api/fixture/reset: demo data, local state, fake Push and the Board's cache back to boot state. */
export function fixtureReset(parts: { source: FixtureSource; store: Store; pusher: FakePusher; board: Board; defaults: Partial<LocalState> }) {
  return async () => {
    parts.source.reset();
    parts.store.reset(parts.defaults);
    parts.pusher.reset();
    await parts.board.reset();
  };
}

/** Demo coordination log lines, so every activity state shows in fixture mode. Times are relative to now. */
export function fixtureActivity(now = Date.now()): Record<string, ActivityEntry> {
  const at = (min: number) => new Date(now - min * 60_000).toISOString();
  return {
    "acme/app#112": { at: at(6), last: "E2E running on the built app" },
    "acme/app#105": { at: at(70), last: "parked on D1, waiting for you" },
    "acme/app#107": { at: at(280), last: "Tag colors: D1 recorded, continuing" },
    "acme/app#113": { at: at(55), last: "D1 answered, run has not resumed" },
    "acme/agent-workflow#22": { at: at(9 * 60), last: "worker session ended without worker_done" },
  };
}
