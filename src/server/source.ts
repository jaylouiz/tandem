import type { HtmlImage } from "../core/images.ts";
import type { RawIssue } from "../core/types.ts";

/** Where issues come from and where the developer's writes go. GitHub in real use, fixtures in dev and E2E. */
export interface Source {
  readonly kind: "github" | "fixture";
  /** Cheap check whether anything in the repo changed since the last call (ETag / 304 on GitHub). */
  changed(repo: string): Promise<boolean>;
  /** Issues updated since `since` (all open + recently closed when `since` is null). */
  fetchIssues(repo: string, since: string | null, closedLookbackDays: number): Promise<RawIssue[]>;
  comment(repo: string, number: number, body: string): Promise<{ id: string; url: string; createdAt: string }>;
  addLabels(repo: string, number: number, labels: string[]): Promise<void>;
  removeLabel(repo: string, number: number, label: string): Promise<void>;
  createIssue(repo: string, title: string, body: string, labels: string[]): Promise<RawIssue>;
  /** Images of one comment as GitHub renders them (signed, short-lived URLs on private repos); null when the source has none. */
  signedImages(commentId: string): Promise<HtmlImage[] | null>;
  /** Repos the developer can opt into. */
  listRepos(): Promise<string[]>;
  viewer(): Promise<string>;
}
