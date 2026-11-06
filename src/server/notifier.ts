// Desktop notifications without an open page (brief job 12). The page notifies itself through the Web
// Notifications API while it is open and allowed to; this notifier covers every other moment and stays
// silent when such a page is connected, so each event notifies once. Events are identified by `waitingId`.
import { execFile } from "node:child_process";
import { waitingId } from "../core/card.ts";
import type { BoardView } from "../core/types.ts";

const shortRepo = (repo: string) => repo.split("/")[1] ?? repo;

export type Send = (note: { title: string; body: string; url: string; group: string }) => Promise<void>;

/** SSE clients that announced (`/api/events?notify=1`) that they raise notifications themselves. */
export class PageClients {
  notifying = 0;
}

interface Watched {
  view(): BoardView;
  subscribe(fn: (v: BoardView) => void): () => void;
}

/** AppleScript string literal: backslash and quote escaped, newlines flattened. */
export const appleScriptString = (s: string) => `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/[\r\n]+/g, " ")}"`;

function run(cmd: string, args: string[]) {
  return new Promise<void>((resolve, reject) => execFile(cmd, args, { timeout: 5000 }, (e) => (e ? reject(e) : resolve())));
}

/** `terminal-notifier` when installed (clickable: opens the Card's page), else `osascript`. */
export function macSend(): Send {
  let terminalNotifier: boolean | null = null;
  return async ({ title, body, url, group }) => {
    if (terminalNotifier !== false) {
      try {
        await run("terminal-notifier", ["-title", title, "-message", body, "-open", url, "-group", group]);
        terminalNotifier = true;
        return;
      } catch (e) {
        if (terminalNotifier === true || (e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
        terminalNotifier = false;
      }
    }
    await run("osascript", ["-e", `display notification ${appleScriptString(body)} with title ${appleScriptString(title)}`]);
  };
}

export class Notifier {
  private known = new Set<string>();
  private baselined = new Set<string>();
  private failed = false;
  private off: (() => void) | null = null;

  constructor(
    private board: Watched,
    private pages: PageClients,
    private send: Send,
    private url: string,
    private log: (msg: string) => void = console.warn,
  ) {}

  /** Call before the first sync: the cache is the baseline, so waits that began while the server was down notify once. */
  start() {
    this.consume(this.board.view());
    this.off = this.board.subscribe((v) => this.consume(v));
  }

  stop() {
    this.off?.();
  }

  private consume(view: BoardView) {
    // a repo baselines once it has data and is not mid-refresh; a newly added repo never floods
    const fresh: string[] = [];
    // a repo that left the view (deselected) baselines again when it returns, so re-adding it never floods
    for (const repo of this.baselined) if (!view.repos.includes(repo)) this.baselined.delete(repo);
    for (const repo of view.repos) {
      const s = view.sync[repo];
      if (!this.baselined.has(repo) && s?.at && !s.syncing) {
        this.baselined.add(repo);
        for (const c of view.cards) {
          const id = waitingId(c);
          if (c.repo === repo && id) this.known.add(id);
        }
      }
    }
    const now = new Set<string>();
    for (const c of view.cards) {
      const id = waitingId(c);
      if (!id || !this.baselined.has(c.repo)) continue;
      now.add(id);
      if (this.known.has(id)) continue;
      fresh.push(id);
      if (this.pages.notifying > 0) continue;
      void this.send({ title: `Waiting on you: ${shortRepo(c.repo)}#${c.number}`, body: c.title, url: `${this.url}waiting/${c.repo}/${c.number}`, group: id }).catch((e) => {
        if (!this.failed) this.log(`Tandem: desktop notification failed (${e instanceof Error ? e.message : e}); further failures are not logged`);
        this.failed = true;
      });
    }
    this.known = now;
  }
}
