// "Is the running Tandem current?" Tandem is used from a git checkout and rebuilt on pull, so the check
// compares three commits: the build `dist/` was stamped with when this process started (running), the
// stamp on disk now (built) and the checkout's HEAD (head). Any difference means an update is pending.
import { execFile } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export interface VersionStatus {
  running: string | null;
  built: string | null;
  head: string | null;
  pending: boolean;
  /** which difference made it pending */
  reason: "restart" | "build" | null;
}

/** The checkout root: nearest ancestor with a package.json (works from src/ and from dist/server/server/). */
export function repoRoot(from = dirname(fileURLToPath(import.meta.url))): string {
  let dir = from;
  while (!existsSync(join(dir, "package.json")) && dirname(dir) !== dir) dir = dirname(dir);
  return dir;
}

export function readStamp(root: string): string | null {
  try {
    return (JSON.parse(readFileSync(join(root, "dist", "version.json"), "utf8")) as { commit?: string | null }).commit ?? null;
  } catch {
    return null;
  }
}

export function gitHead(root: string): Promise<string | null> {
  return new Promise((resolve) => execFile("git", ["-C", root, "rev-parse", "HEAD"], { timeout: 3000 }, (e, out) => resolve(e ? null : out.trim() || null)));
}

export function evaluate(running: string | null, built: string | null, head: string | null): VersionStatus {
  const reason = !running || !built ? null : built !== running ? "restart" : head && head !== built ? "build" : null;
  return { running, built, head, pending: reason !== null, reason };
}

export class VersionCheck {
  private running: string | null;
  private headAt = Number.NEGATIVE_INFINITY;
  private head: string | null = null;

  constructor(
    private root = repoRoot(),
    private git: (root: string) => Promise<string | null> = gitHead,
    private now: () => number = Date.now,
  ) {
    this.running = readStamp(root);
  }

  async status(): Promise<VersionStatus> {
    if (this.now() - this.headAt > 60_000) {
      this.head = await this.git(this.root);
      this.headAt = this.now();
    }
    return evaluate(this.running, readStamp(this.root), this.head);
  }
}
