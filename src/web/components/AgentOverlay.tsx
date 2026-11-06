// Agent activity (brief job 6): every Card in UX Design and Build by state, opened with `g a` or from the sidebar.
import { useRef } from "react";
import { STATE_DEFAULT_TEXT, STATE_LABEL, agentCounts, agentGroups, type AgentRow } from "../../core/activity.ts";
import type { Card } from "../../core/types.ts";
import { openCard, useActivity, useNow, useStore } from "../store.ts";
import { Dialog } from "../ui/Dialog.tsx";
import { keyOf } from "../keys.ts";
import { ActDot, Age, RepoTag } from "./bits.tsx";

/** The state groups for a set of Cards, re-derived every minute. */
export function useAgentGroups(cards: Card[]) {
  const activity = useActivity();
  const cfg = useStore((s) => s.board?.workflow);
  const now = useNow();
  return cfg ? agentGroups(cards, activity, now, cfg) : [];
}

/** Sidebar status line: "N working, M stuck" (stuck in the danger colour). */
export function AgentsLine({ cards, scope }: { cards: Card[]; scope?: string | null }) {
  const { working, stuck } = agentCounts(useAgentGroups(cards));
  return (
    <button className="nav-item agents-line" onClick={() => useStore.getState().setAgentsOpen(true)} data-testid="agents-line" title={scope ? `Agent activity · ${scope} only` : "Agent activity"}>
      <span>
        {working} working,{" "}
        <span className={stuck ? "bad" : undefined} data-testid="stuck-count">
          {stuck} stuck
        </span>
      </span>
      <kbd>{keyOf("go-agents")}</kbd>
    </button>
  );
}

function Row({ row, onOpen }: { row: AgentRow; onOpen: (c: Card) => void }) {
  const { card, act } = row;
  return (
    <button className="qrow arow" data-state={act.state} data-card={card.key} onClick={() => onOpen(card)}>
      <span className="act-box">
        <ActDot state={act.state} />
      </span>
      <span className="q-main">
        <span className="q-title">
          <span className="title">{card.title}</span>
        </span>
        <span className="q-sub">
          <RepoTag repo={card.repo} number={card.number} />
          <span className="ask">{act.last ?? STATE_DEFAULT_TEXT[act.state]}</span>
        </span>
      </span>
      <Age iso={act.at} />
    </button>
  );
}

export function AgentOverlay({ cards }: { cards: Card[] }) {
  const open = useStore((s) => s.modal === "agents");
  const setOpen = useStore((s) => s.setAgentsOpen);
  const groups = useAgentGroups(cards);
  const root = useRef<HTMLDivElement>(null);
  const total = groups.reduce((n, g) => n + g.rows.length, 0);
  const open_ = (c: Card) => {
    // the Card opens in the view the developer is in; Settings has no Card pane, so it goes to Waiting on me (#48)
    openCard(c.key, { tab: "activity", view: useStore.getState().view === "settings" ? "waiting" : undefined });
    setOpen(false);
  };
  const move = (d: number) => {
    const rows = [...(root.current?.querySelectorAll<HTMLElement>(".arow") ?? [])];
    const at = rows.indexOf(document.activeElement as HTMLElement);
    rows[Math.max(0, Math.min(rows.length - 1, at + d))]?.focus();
  };
  return (
    <Dialog
      open={open}
      onClose={() => setOpen(false)}
      label="Agent activity"
      className="dialog agents-dialog"
      testId="agents"
      popupRef={root}
      initialFocus={root}
      onKeyDown={(e) => {
        if (e.key === "j" || e.key === "ArrowDown") move(1);
        else if (e.key === "k" || e.key === "ArrowUp") move(-1);
        else return;
        e.preventDefault();
      }}
    >
      <div className="agents-head">
        Agent activity <span className="faint">{total} Cards in UX Design and Build</span>
        <span style={{ flex: 1 }} />
        <kbd>esc</kbd>
      </div>
      <div className="agents-body">
        {!groups.length && <div className="empty tight">No agents at work. Cards in UX Design and Build show up here.</div>}
        {groups.map((g) => (
          <div key={g.state} data-testid={`agents-${g.state}`}>
            <div className="group-head">
              <ActDot state={g.state} /> {STATE_LABEL[g.state]} <span className="faint">{g.rows.length}</span>
            </div>
            {g.rows.map((r) => (
              <Row key={r.card.key} row={r} onOpen={open_} />
            ))}
          </div>
        ))}
      </div>
    </Dialog>
  );
}
