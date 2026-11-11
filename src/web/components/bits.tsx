import DOMPurify from "dompurify";
import { marked } from "marked";
import { useId, type ComponentProps, type ReactNode } from "react";
import { KIND_LABEL, type Kind } from "../../core/ask.ts";
import { STATE_LABEL, type AgentState } from "../../core/activity.ts";
import { NO_REPOS, useStore, type View } from "../store.ts";
import { PHASES, type Card, type Phase, type WaitingKind } from "../../core/types.ts";

export const PHASE_COLOR: Record<Phase, string> = {
  Inbox: "var(--phase-inbox)",
  Backlog: "var(--phase-backlog)",
  "UX Design": "var(--phase-design)",
  Build: "var(--phase-build)",
  Done: "var(--phase-done)",
};

export const WAITING_LABEL: Record<WaitingKind, string> = {
  decision: "Decision",
  "design-round": "Design round",
  "pr-approval": "PR approval",
};

/** The "opens elsewhere" mark after a link label: drawn, one stroke weight with the other glyphs. */
export function Ext() {
  return (
    <svg className="ext" width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 7l4-4M3.5 3H7v3.5" />
    </svg>
  );
}

export function Chevron({ open }: { open: boolean }) {
  return (
    <span className="chev" data-open={open} aria-hidden>
      <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3.5 2l3 3-3 3" />
      </svg>
    </span>
  );
}

export function PhaseDot({ phase }: { phase: Phase }) {
  return <span className="phase-dot" style={{ background: PHASE_COLOR[phase] }} aria-hidden />;
}

export function ago(iso: string | null): string {
  if (!iso) return "";
  const s = (Date.now() - Date.parse(iso)) / 1000;
  if (s < 60) return "now";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

export const shortRepo = (repo: string) => repo.split("/")[1] ?? repo;

export function CardChips({ card }: { card: Card }) {
  // no "Selected" chip: marking must not add a line to a Card (#29); the mark is the outline and background (`data-marked`)
  return (
    <>
      {card.waiting && <span className="chip waiting">{WAITING_LABEL[card.waiting.kind]}</span>}
      {card.awaitingPickup && <span className="chip accent">Awaiting pickup</span>}
      {card.needsLook && !card.seenAt && <span className="chip accent">New · Look</span>}
      {card.priority && <span className="chip">P{card.priority}</span>}
      {card.fog && <span className="chip accent">Needs wayfinder</span>}
      {card.onHold && <span className="chip danger">On hold</span>}
      {card.nextStep && card.phase !== "Done" && <span className="chip">Next: {card.nextStep}</span>}
      {card.pullRequest?.state === "open" && <span className="chip ok">PR #{card.pullRequest.number}</span>}
    </>
  );
}

/** `breaks`: a single newline is a line break (agent records list their fields one per line). */
export function Markdown({ text, breaks = false }: { text: string; breaks?: boolean }) {
  const html = DOMPurify.sanitize(marked.parse(text, { async: false, gfm: true, breaks }) as string);
  return <div className="markdown" dangerouslySetInnerHTML={{ __html: html }} />;
}

const ICON: Record<Kind, ReactNode> = {
  decision: (
    <>
      <circle cx="8" cy="8" r="6" />
      <path d="M6.2 6.3a1.9 1.9 0 1 1 2.6 1.8c-.5.3-.8.6-.8 1.2M8 11.5v.1" />
    </>
  ),
  "design-round": (
    <>
      <rect x="2" y="3" width="12" height="10" rx="2" />
      <circle cx="6" cy="7" r="1" />
      <path d="M3 12l3.5-3 2.5 2 2-1.5 3 2.5" />
    </>
  ),
  "pr-approval": (
    <>
      <circle cx="4.5" cy="3.5" r="1.6" />
      <circle cx="4.5" cy="12.5" r="1.6" />
      <circle cx="11.5" cy="8" r="1.6" />
      <path d="M4.5 5.1v5.8M4.5 5.1c0 2.6 3.2 2.9 5.4 2.9" />
    </>
  ),
  look: (
    <>
      <path d="M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8z" />
      <circle cx="8" cy="8" r="2" />
    </>
  ),
  pickup: (
    <>
      <circle cx="8" cy="8" r="6" />
      <path d="M8 4.8V8l2.2 1.4" />
    </>
  ),
};

/** One glyph per kind of ask, so the four kinds of Feedback differ by shape and not only by colour. */
export function KindGlyph({ kind, box }: { kind: Kind; box?: boolean }) {
  return (
    <span className={`kind-glyph ${box ? "box" : ""}`} data-kind={kind} title={KIND_LABEL[kind]}>
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        {ICON[kind]}
      </svg>
    </span>
  );
}

const NAV_ICON: Record<View, ReactNode> = {
  waiting: (
    <>
      <path d="M2 9.5l1.7-5.8A1 1 0 014.7 3h6.6a1 1 0 011 .7L14 9.5" />
      <path d="M2 9.5V12a1 1 0 001 1h10a1 1 0 001-1V9.5h-3.2a1 1 0 00-.9.6 2.2 2.2 0 01-3.8 0 1 1 0 00-.9-.6z" />
    </>
  ),
  board: (
    <>
      <rect x="2" y="2.5" width="12" height="11" rx="1.5" />
      <path d="M6 2.5v11M10 2.5v11" />
    </>
  ),
  maps: (
    <>
      <path d="M1.8 4l4.2-1.5 4 1.5 4.2-1.5v9.5L10 13.5 6 12l-4.2 1.5z" />
      <path d="M6 2.5V12M10 4v9.5" />
    </>
  ),
  settings: (
    <>
      <path d="M2 4.5h6.2M11.8 4.5H14M2 11.5h2.2M7.8 11.5H14" />
      <circle cx="10" cy="4.5" r="1.8" />
      <circle cx="6" cy="11.5" r="1.8" />
    </>
  ),
};

/** The leading icon of a main nav entry: decorative (the label names the button), one stroke weight with the other glyphs. */
export function NavIcon({ view }: { view: View }) {
  return (
    <svg className="nav-icon" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {NAV_ICON[view]}
    </svg>
  );
}

export function KindChip({ kind }: { kind: Kind }) {
  return (
    <span className="kind-chip sr-only" data-kind={kind}>
      {KIND_LABEL[kind]}
    </span>
  );
}

const REPO_COLORS = 8;

/** Stable colour index per repo: its place in the sorted list of opted-in repos. */
export function useRepoIdx() {
  const repos = useStore((s) => s.board?.repos ?? NO_REPOS);
  return (repo: string) => Math.max(0, [...repos].sort().indexOf(repo)) % REPO_COLORS;
}

/** Colour dot, name and number: repos are told apart by the name; the colour only helps. */
export function RepoTag({ repo, number }: { repo: string; number?: number }) {
  const idx = useRepoIdx()(repo);
  return (
    <span className="rtag" title={repo}>
      <i style={{ background: `var(--repo-${idx})` }} aria-hidden />
      {shortRepo(repo)}
      {number !== undefined && <span className="faint">#{number}</span>}
    </span>
  );
}

export function ActDot({ state }: { state: AgentState }) {
  return <span className="act-dot" data-state={state} role="img" aria-label={STATE_LABEL[state]} title={STATE_LABEL[state]} />;
}

export function Age({ iso }: { iso: string | null }) {
  return <span className="faint age">{ago(iso)}</span>;
}

export function Stepper({ phase }: { phase: Phase }) {
  const at = PHASES.indexOf(phase);
  return (
    <ol className="stepper" aria-label={`Phase: ${phase}`}>
      {PHASES.map((p, i) => (
        <li key={p} data-state={i < at ? "past" : i === at ? "now" : "next"} aria-current={i === at ? "step" : undefined}>
          {p}
        </li>
      ))}
    </ol>
  );
}

/**
 * A button that can say why it does nothing (#46). With `why` it is `aria-disabled` (not `disabled`: it stays focusable and hoverable, so the reason
 * is reachable by keyboard and mouse), carries the reason as `title` and as `aria-describedby`, and ignores clicks. Without `why` it is a plain button.
 */
export function Btn({ why, onClick, title, children, ...rest }: ComponentProps<"button"> & { why?: string | null }) {
  const id = useId();
  return (
    <>
      <button {...rest} title={why ?? title} aria-disabled={why ? true : undefined} aria-describedby={why ? id : rest["aria-describedby"]} onClick={why ? undefined : onClick}>
        {children}
      </button>
      {why && (
        <span id={id} hidden>
          {why}
        </span>
      )}
    </>
  );
}
