import { useEffect, useMemo, useRef, useState } from "react";
import { waitingId } from "../core/card.ts";
import type { Card } from "../core/types.ts";
import { AgentOverlay, AgentsLine } from "./components/AgentOverlay.tsx";
import { BoardView, LaneToggle, boardNavGroups } from "./components/BoardView.tsx";
import { DragGhost } from "./components/DragGhost.tsx";
import { Capture } from "./components/Capture.tsx";
import { CardPane } from "./components/CardPane.tsx";
import { MapsView } from "./components/MapsView.tsx";
import { MarkBar } from "./components/MarkBar.tsx";
import { Palette } from "./components/Palette.tsx";
import { Shortcuts } from "./components/Shortcuts.tsx";
import { Settings } from "./components/Settings.tsx";
import { RepoFilterChip, Repos } from "./components/Repos.tsx";
import { WaitingView, queueOf } from "./components/WaitingView.tsx";
import { NavIcon, shortRepo } from "./components/bits.tsx";
import { InfoPopover } from "./ui/Tooltip.tsx";
import { handleKey, keyCtxRef, keyOf, type KeyCtx } from "./keys.ts";
import { useNoticeToasts } from "./notices.ts";
import { useScrollMemory } from "./scroll.ts";
import { blockerCount, groupsOf, openCard, reconnect, syncProgress, useAllCards, useCards, useLaneView, useStore, type LaneView, type View } from "./store.ts";
import { ToastRegion } from "./ui/Toast.tsx";

const TITLES: Record<View, string> = { waiting: "Waiting on me", board: "Board", maps: "Wayfinder maps", settings: "Settings" };

/** The Cards of the view in on-screen order, split into the lists a ⌘A marks (Board columns, Waiting on me groups). */
function navGroups(view: View, cards: Card[], openDays: Record<string, boolean>, linger: string | null, lanes: LaneView | null, focus: boolean): Card[][] {
  if (view === "waiting" && focus) {
    const g = groupsOf(cards); // Focus walks the blockers and the unseen Looks only
    return [g.waiting, g.look];
  }
  if (view === "waiting") {
    const q = queueOf(cards, linger);
    return [q.waiting, q.look, q.pickup];
  }
  if (view === "board") return boardNavGroups(cards, openDays, lanes);
  return [];
}

function useKeyboard(ctx: KeyCtx) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => handleKey(e, ctx);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [ctx]);
}

/** Desktop notification when something new waits on the developer (brief job 12). */
function useNotifications(cards: Card[]) {
  const known = useRef<Set<string> | null>(null);
  useEffect(() => {
    const now = new Set(cards.map(waitingId).filter((id): id is string => id !== null));
    if (known.current && "Notification" in window && Notification.permission === "granted") {
      for (const id of now) {
        if (known.current.has(id)) continue;
        const card = cards.find((c) => id.startsWith(`${c.key}:`));
        if (card) {
          const n = new Notification(`Waiting on you: ${shortRepo(card.repo)}#${card.number}`, { body: card.title, tag: id });
          n.onclick = () => {
            window.focus();
            openCard(card.key, { view: "waiting" });
          };
        }
      }
    }
    if (cards.length) known.current = now;
  }, [cards]);
}

interface VersionInfo {
  pending: boolean;
  reason: "restart" | "build" | null;
}

const UPDATE_TEXT = {
  restart: "A newer build is on disk. Restart Tandem (tandem update restarts the launch agent) to run it.",
  build: "This checkout has new commits that are not built yet. Run tandem update (git pull, npm run build, restart).",
};

/** Polls the server's build stamp against the checkout; the chip shows only while an update is pending. */
function useVersion() {
  const [v, setV] = useState<VersionInfo | null>(null);
  useEffect(() => {
    const load = () =>
      fetch("/api/version")
        .then((r) => r.json() as Promise<VersionInfo>)
        .then(setV)
        .catch(() => {});
    void load();
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, []);
  return v;
}

/** At 2+ marked Cards the Card pane steps aside but keeps its width, so no Card on the Board changes size (#29). */
function MarkedPaneNote({ count }: { count: number }) {
  return (
    <aside className="pane aside" data-testid="pane-marked" aria-label="Selection">
      <div className="pane-empty muted">
        <strong>{count} Cards selected</strong>
        <span>Esc clears the selection</span>
      </div>
    </aside>
  );
}

export function App() {
  const board = useStore((s) => s.board);
  const connected = useStore((s) => s.connected);
  const view = useStore((s) => s.view);
  const setView = useStore((s) => s.setView);
  const selected = useStore((s) => s.selected);
  const marked = useStore((s) => s.marked);
  const setNotice = useStore((s) => s.setNotice);
  const setPalette = useStore((s) => s.setPalette);
  const cards = useCards();
  const openDays = useStore((s) => s.openDays);
  const lanes = useLaneView();
  const linger = useStore((s) => s.linger);
  const focus = useStore((s) => s.focus);
  const setFocus = useStore((s) => s.setFocus);
  const keyCtx = useMemo<KeyCtx>(() => {
    const groups = navGroups(view, cards, openDays, linger, lanes, focus);
    return { groups, order: groups.flat() };
  }, [view, cards, openDays, linger, lanes, focus]);
  const filter = useStore((s) => s.repoFilter);
  const everyCard = useAllCards();
  /** the Waiting on me count, and the same over every repo: a filtered count reads "3 of 7", so it is clear it is filtered and what the filter hides */
  const waitingCount = useMemo(() => blockerCount(cards), [cards]);
  const allWaiting = useMemo(() => (filter ? blockerCount(everyCard) : waitingCount), [filter, everyCard, waitingCount]);
  useEffect(() => {
    keyCtxRef.current = keyCtx;
  }, [keyCtx]);
  useKeyboard(keyCtx);
  useNoticeToasts();
  useNotifications(everyCard); // the page tells the server it notifies, so it must cover every repo, not the filtered view
  const version = useVersion();
  const progress = board ? syncProgress(board) : null;
  /** the Waiting split brings its own Card pane; every other view gets it as an aside */
  const split = !!board && view === "waiting" && !progress?.empty && board.repos.length > 0;
  const scroller = useRef<HTMLDivElement>(null);
  useScrollMemory(scroller, view, !split);

  const errors = board ? Object.entries(board.sync).filter(([, s]) => s.error) : [];
  const nav: [View, string, number | null, number | null][] = [
    ["waiting", "Waiting on me", waitingCount, allWaiting],
    ["board", "Board", null, null],
    ["maps", "Wayfinder maps", null, null],
    ["settings", "Settings", null, null],
  ];

  return (
    // Focus takes the window: the sidebar and the top bar step aside (styles.css), Esc and its own top strip lead back
    <div className="shell" data-focus={(focus && split) || undefined}>
      <nav className="sidebar" aria-label="Views">
        <div className="brand">
          <svg width="18" height="18" viewBox="0 0 32 32" aria-hidden>
            <rect width="32" height="32" rx="8" fill="var(--accent)" />
            <circle cx="12" cy="16" r="5" fill="white" />
            <circle cx="20" cy="16" r="5" fill="none" stroke="white" strokeWidth="2.5" />
          </svg>
          Tandem
        </div>
        {nav.map(([v, label, count, all]) => (
          <button key={v} className="nav-item" aria-current={view === v ? "page" : undefined} onClick={() => setView(v)}>
            <NavIcon view={v} />
            {label}
            {count !== null && (
              <span className={`count ${count ? "hot" : ""}`} data-testid={`count-${v}`} title={filter ? `${count} in ${filter}, ${all} in all repos` : undefined}>
                {count}
                {filter && <span className="faint"> of {all}</span>}
              </span>
            )}
          </button>
        ))}
        <AgentsLine cards={cards} scope={filter} />
        <Repos />
        <button className="nav-item" onClick={() => setPalette(true)} style={{ marginTop: 8 }}>
          Command <kbd>{keyOf("palette")}</kbd>
        </button>
        <button className="nav-item" onClick={() => useStore.getState().setCapture(true)}>
          Capture idea <kbd>{keyOf("capture")}</kbd>
        </button>
        <div className="sidebar-foot">
          {connected ? (board?.source === "fixture" ? "Demo data" : `Live · ${board?.viewer ?? "GitHub"}`) : "Reconnecting…"}
          {progress?.active && (
            <div className="muted" data-testid="sync-progress" aria-live="polite">
              Syncing · {progress.done} of {progress.total} repos
            </div>
          )}
          {"Notification" in window && Notification.permission === "default" && (
            <div>
              <button
                className="btn ghost"
                style={{ padding: 0 }}
                onClick={() =>
                  void Notification.requestPermission().then((p) => {
                    if (p === "granted") reconnect();
                  })
                }
              >
                Enable notifications
              </button>
            </div>
          )}
        </div>
      </nav>
      <main className="main">
        <header className="topbar">
          <h1>{TITLES[view]}</h1>
          <RepoFilterChip />
          {view === "board" && <LaneToggle />}
          {split && (
            <button className="lane-toggle" data-testid="focus-toggle" aria-pressed={focus} onClick={() => setFocus(!focus)}>
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <rect x="4.5" y="3" width="7" height="10" rx="1.5" />
                <path d="M2 5v6M14 5v6" />
              </svg>
              {focus ? "Back to the list" : "Focus"} <kbd>{focus ? keyOf("escape") : keyOf("focus")}</kbd>
            </button>
          )}
          <span style={{ flex: 1 }} />
          {version?.pending && version.reason && (
            <button className="chip accent" data-testid="update-pending" title={UPDATE_TEXT[version.reason]} onClick={() => setNotice({ key: "", text: UPDATE_TEXT[version.reason!], canStart: false })}>
              Update pending
            </button>
          )}
          {errors.length > 0 && (
            <InfoPopover
              label="Sync errors"
              className="chip danger"
              testId="sync-error"
              detail={errors.map(([r, s]) => (
                <div key={r} className="sync-err">
                  <strong>{r}</strong>
                  <span className="muted">{s.error}</span>
                </div>
              ))}
            >
              Sync error · {errors.length}
            </InfoPopover>
          )}
        </header>
        <div className="content">
          {split ? (
            <WaitingView cards={cards} />
          ) : (
          <div className="scroll" ref={scroller}>
            {!board ? (
              <div className="empty">Loading…</div>
            ) : board.repos.length === 0 && view !== "settings" ? (
              <div className="empty">
                No repos on the Board yet.{" "}
                <button className="btn" onClick={() => setView("settings")}>
                  Choose repos
                </button>
              </div>
            ) : progress?.empty && (view === "waiting" || view === "board") ? (
              <div className="empty" data-testid="first-sync">
                Syncing {progress.syncing.join(", ")}…
                <div className="muted">
                  {progress.done} of {progress.total} repos synced
                </div>
              </div>
            ) : view === "board" ? (
              <BoardView cards={cards} />
            ) : view === "maps" ? (
              <MapsView />
            ) : (
              <Settings />
            )}
          </div>
          )}
          {selected && view !== "settings" && !split && (marked.length < 2 ? <CardPane key={selected} cardKey={selected} mode="aside" /> : <MarkedPaneNote count={marked.length} />)}
          <MarkBar />
        </div>
      </main>
      <Palette />
      <AgentOverlay cards={cards} />
      <Capture />
      <Shortcuts />
      <DragGhost />
      <ToastRegion />
    </div>
  );
}
