// Per-developer local state: the only state GitHub cannot rebuild (brief "Hard requirements").
// Repo opt-in list, Seen marks, local checkout paths (for starting a coordinator), workflow overrides.
// Plus a rebuildable cache of raw GitHub data for an instant cold start.
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { WorkflowConfig } from "../core/config.ts";
import type { RawIssue } from "../core/types.ts";

export const tandemHome = () => process.env.TANDEM_HOME ?? join(homedir(), ".tandem");

export interface LocalState {
  repos: string[];
  /** owner/repo#n -> ISO time it was marked Seen */
  seen: Record<string, string>;
  /** owner/repo -> local checkout path, where a coordinator is started */
  repoPaths: Record<string, string>;
  /** owner/repo -> when it was opted in: Done Cards closed before that count as Seen */
  optedInAt: Record<string, string>;
  workflow?: Partial<WorkflowConfig>;
}

/** Bump when a sync starts reading more issue fields: an older cache lacks them and is re-fetched in full once. */
export const CACHE_VERSION = 2; // 2: parent, assignees, blockedBy (wayfinder maps)

export interface RepoCache {
  /** absent in a cache written before versions existed */
  v?: number;
  syncedAt: string;
  issues: RawIssue[];
}

function readJson<T>(file: string, fallback: T): T {
  try {
    return JSON.parse(readFileSync(file, "utf8")) as T;
  } catch {
    return fallback;
  }
}

function writeJson(file: string, value: unknown) {
  mkdirSync(tandemHome(), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(value, null, 2));
  renameSync(tmp, file);
}

export class Store {
  private stateFile = join(tandemHome(), "state.json");
  private cacheFile = join(tandemHome(), "cache.json");
  state: LocalState;

  /** `memory`: demo data (TANDEM_SOURCE=fixture). Never reads or writes `tandemHome()`, whatever TANDEM_HOME is. */
  constructor(
    defaults: Partial<LocalState> = {},
    private opts: { memory?: boolean } = {},
  ) {
    const disk = opts.memory ? {} : readJson<Partial<LocalState>>(this.stateFile, {});
    this.state = { repos: [], seen: {}, repoPaths: {}, optedInAt: {}, ...defaults, ...disk };
  }

  /** Back to the boot state (demo data only): refuses a store that persists, so it can never wipe `~/.tandem`. */
  reset(defaults: Partial<LocalState> = {}) {
    if (!this.opts.memory) throw new Error("Store.reset is for in-memory (fixture) stores only");
    this.state = { repos: [], seen: {}, repoPaths: {}, optedInAt: {}, ...structuredClone(defaults) };
  }

  save() {
    if (!this.opts.memory) writeJson(this.stateFile, this.state);
  }

  setRepos(repos: string[]) {
    this.state.repos = [...new Set(repos)].sort();
    const now = new Date().toISOString();
    for (const r of this.state.repos) this.state.optedInAt[r] ??= now;
    this.save();
  }

  /** The Seen mark of a Card: explicit, or implied for a Card closed before its repo was opted in. */
  seenAt(repo: string, number: number, closedAt: string | null): string | null {
    const explicit = this.state.seen[`${repo}#${number}`];
    if (explicit) return explicit;
    const since = this.state.optedInAt[repo];
    return closedAt && since && closedAt < since ? closedAt : null;
  }

  setSeen(key: string, seen: boolean, at = new Date().toISOString()) {
    if (seen) this.state.seen[key] = at;
    else delete this.state.seen[key];
    this.save();
  }

  setRepoPath(repo: string, path: string) {
    this.state.repoPaths[repo] = path;
    this.save();
  }

  loadCache(): Record<string, RepoCache> {
    return this.opts.memory ? {} : readJson(this.cacheFile, {});
  }

  saveCache(cache: Record<string, RepoCache>) {
    if (!this.opts.memory) writeJson(this.cacheFile, cache);
  }
}
