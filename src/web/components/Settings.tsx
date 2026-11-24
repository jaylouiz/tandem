import { useEffect, useRef, useState } from "react";
import { api, reconnect, write } from "../store.ts";
import { currentTheme, setTheme, type Theme } from "../theme.ts";

interface Repos {
  selected: string[];
  available: string[];
  paths: Record<string, string>;
}

const withRepo = (selected: string[], repo: string, on: boolean) => (on ? (selected.includes(repo) ? selected : [...selected, repo]) : selected.filter((x) => x !== repo));

const THEMES: { value: Theme; label: string }[] = [
  { value: null, label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

/** The theme, kept in step with `data-theme` on <html>: the palette's "Theme: …" commands change it too. */
function useTheme(): Theme {
  const [theme, set] = useState(currentTheme);
  useEffect(() => {
    const el = document.documentElement;
    const sync = () => set(currentTheme());
    sync();
    const mo = new MutationObserver(sync);
    mo.observe(el, { attributes: true, attributeFilter: ["data-theme"] });
    return () => mo.disconnect();
  }, []);
  return theme;
}

type Perm = NotificationPermission | "unsupported";
const permission = (): Perm => ("Notification" in window ? Notification.permission : "unsupported");

function Appearance() {
  const theme = useTheme();
  return (
    <section aria-labelledby="settings-theme" data-testid="settings-theme" style={{ marginBottom: 24 }}>
      <h2 id="settings-theme" style={{ fontSize: 14, margin: "0 0 4px" }}>
        Theme
      </h2>
      <p className="muted" style={{ margin: "0 0 8px" }}>
        System follows the operating system. Also in the command palette: Theme: light, dark, system.
      </p>
      <div role="radiogroup" aria-labelledby="settings-theme" className="actions">
        {THEMES.map((t) => (
          <label key={t.label} className="toggle" style={{ color: "var(--text)" }}>
            <input type="radio" name="theme" checked={theme === t.value} onChange={() => setTheme(t.value)} /> {t.label}
          </label>
        ))}
      </div>
    </section>
  );
}

function Notifications() {
  const [perm, setPerm] = useState<Perm>(permission);
  const enable = () =>
    void Notification.requestPermission().then((p) => {
      setPerm(p);
      if (p === "granted") reconnect(); // the stream then tells the server this page notifies itself
    });
  return (
    <section aria-labelledby="settings-notifications" data-testid="settings-notifications" style={{ marginBottom: 24 }}>
      <h2 id="settings-notifications" style={{ fontSize: 14, margin: "0 0 4px" }}>
        Notifications
      </h2>
      <p className="muted" style={{ margin: "0 0 8px" }}>
        A desktop notification when something new waits on you.
      </p>
      <div className="actions">
        <span data-testid="notifications-state">
          {perm === "granted" ? "On" : perm === "denied" ? "Off: blocked in the browser settings" : perm === "default" ? "Off" : "Not available in this browser"}
        </span>
        {perm === "default" && (
          <button className="btn" onClick={enable}>
            Enable notifications
          </button>
        )}
      </div>
    </section>
  );
}

/** Theme, notifications, and Repo opt-in with local checkout paths (where a coordinator is started). */
export function Settings() {
  return (
    <div style={{ padding: 20, maxWidth: 720 }} data-testid="settings">
      <Appearance />
      <Notifications />
      <Repos />
    </div>
  );
}

function Repos() {
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
    <section aria-labelledby="settings-repos">
      <h2 id="settings-repos" style={{ fontSize: 14, margin: "0 0 4px" }}>Repos on the Board</h2>
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
    </section>
  );
}
