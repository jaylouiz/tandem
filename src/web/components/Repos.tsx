// Sidebar Repos: told apart by name and colour, the Waiting on me count per repo (blockers only), click filters every view. The active filter also shows as a chip in the top bar.
import { NO_REPOS, blockerCount, useAllCards, useStore } from "../store.ts";
import { keyOf } from "../keys.ts";
import { Tooltip } from "../ui/Tooltip.tsx";
import { shortRepo, useRepoIdx } from "./bits.tsx";

export function Repos() {
  const repos = useStore((s) => s.board?.repos ?? NO_REPOS);
  const filter = useStore((s) => s.repoFilter);
  const setFilter = useStore((s) => s.setRepoFilter);
  const cards = useAllCards();
  const idx = useRepoIdx();
  const count = (repo: string) => blockerCount(cards.filter((c) => c.repo === repo));
  if (!repos.length) return null;
  return (
    <div className="repo-list" role="group" aria-label="Repos">
      <div className="side-label">Repos</div>
      {[...repos].sort().map((r) => (
        <button key={r} className="nav-item" aria-pressed={filter === r} title={r} onClick={() => setFilter(filter === r ? null : r)}>
          <i className="rdot" style={{ background: `var(--repo-${idx(r)})` }} aria-hidden />
          {shortRepo(r)}
          <span className={`count ${count(r) ? "hot" : ""}`}>{count(r) || ""}</span>
        </button>
      ))}
    </div>
  );
}

/** The active Repo filter in the top bar, with × (Esc and the palette clear it too); nothing when no filter is set. */
export function RepoFilterChip() {
  const filter = useStore((s) => s.repoFilter);
  const setFilter = useStore((s) => s.setRepoFilter);
  const idx = useRepoIdx();
  if (!filter) return null;
  return (
    <span className="chip repo-filter" data-testid="repo-filter-chip" title={`Showing ${filter} only`}>
      <i className="rdot" style={{ background: `var(--repo-${idx(filter)})` }} aria-hidden />
      <span className="muted">Repo</span> {shortRepo(filter)}
      <Tooltip label="Show all repos" keys={keyOf("clear-repo-filter")} side="bottom">
        <button className="chip-x" aria-label={`Clear the Repo filter ${shortRepo(filter)}`} onClick={() => setFilter(null)}>
          ×
        </button>
      </Tooltip>
    </span>
  );
}
