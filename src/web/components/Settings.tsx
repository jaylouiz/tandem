import { useEffect, useRef, useState } from "react";
import { api, write } from "../store.ts";

interface Repos {
  selected: string[];
  available: string[];
  paths: Record<string, string>;
}

const withRepo = (selected: string[], repo: string, on: boolean) => (on ? (selected.includes(repo) ? selected : [...selected, repo]) : selected.filter((x) => x !== repo));

/** Repo opt-in and local checkout paths (where a coordinator is started). */
export function Settings() {
  const [repos, setRepos] = useState<Repos | null>(null);
  /** the list's order, fixed when it loads: a toggled repo keeps its place */
  const [order, setOrder] = useState<string[]>([]);
  /** path text typed but not saved yet (repo -> text) */
  const [typed, setTyped] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  /** the repos the server has confirmed, and the repo writes queued behind each other: a PUT carries the whole list, so a failed toggle must not ride along with the next one */
  const confirmed = useRef<string[]>([]);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  useEffect(() => {
    api.get<Repos>("/api/repos").then(
      (r) => {
        setRepos(r);
        confirmed.current = r.selected;
        setOrder([...new Set([...r.selected, ...r.available])]);
      },
      (e: Error) => setError(e.message),
    );
  }, []);
  if (error) return <div className="empty">Could not load repos: {error}</div>;
  if (!repos) return <div className="empty">Loading repos…</div>;
  const patch = (f: (r: Repos) => Repos) => setRepos((cur) => (cur ? f(cur) : cur));
  const toggle = (r: string) => {
    const on = !repos.selected.includes(r);
    const after = queue.current;
    queue.current = write(
      async () => {
        await after;
        const next = withRepo(confirmed.current, r, on);
        await api.put("/api/repos", { repos: next });
        confirmed.current = next;
      },
      {
        what: on ? `add ${r} to the Board` : `remove ${r} from the Board`,
        apply: () => {
          patch((cur) => ({ ...cur, selected: withRepo(cur.selected, r, on) }));
          return { undo: () => patch((cur) => ({ ...cur, selected: withRepo(cur.selected, r, !on) })) };
        },
      },
    );
  };
  const savePath = (r: string) => {
    const path = typed[r];
    setTyped(({ [r]: _, ...rest }) => rest);
    const before = repos.paths[r];
    if (!path || path === before) return;
    void write(() => api.put("/api/repos/path", { repo: r, path }), {
      what: `save the local path for ${r}`,
      apply: () => {
        patch((cur) => ({ ...cur, paths: { ...cur.paths, [r]: path } }));
        return { undo: () => patch((cur) => ({ ...cur, paths: { ...cur.paths, [r]: before ?? "" } })) };
      },
    });
  };
  const all = [...order, ...repos.selected.filter((r) => !order.includes(r))];
  return (
    <div style={{ padding: 20, maxWidth: 720 }} data-testid="settings">
      <h2 style={{ fontSize: 14, margin: "0 0 4px" }}>Repos on the Board</h2>
      <p className="muted" style={{ margin: "0 0 12px" }}>
        Cards come from the repos you opt into. The local path is where Tandem starts a coordinator.
      </p>
      {all.map((r) => (
        <div key={r} className="actions" style={{ padding: "4px 0" }}>
          <label className="toggle" style={{ color: "var(--text)", minWidth: 260 }}>
            <input type="checkbox" checked={repos.selected.includes(r)} onChange={() => toggle(r)} /> {r}
          </label>
          {repos.selected.includes(r) && (
            <input
              className="input mono"
              style={{ flex: 1 }}
              placeholder="/path/to/checkout"
              value={typed[r] ?? repos.paths[r] ?? ""}
              onChange={(e) => setTyped((t) => ({ ...t, [r]: e.target.value }))}
              onBlur={() => savePath(r)}
              aria-label={`Local path for ${r}`}
            />
          )}
        </div>
      ))}
    </div>
  );
}
