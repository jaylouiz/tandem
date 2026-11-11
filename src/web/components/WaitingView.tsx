// Waiting on me in Process mode: the blockers on the left, the open Card on the right. The page starts with nothing
// open; the developer's own answer to a blocker opens the next one (brief jobs 1-5, `giveFeedback`). A Card that leaves
// the list any other way stays open. Opening a To look at Card marks it Seen.
import { useEffect, useRef } from "react";
import { askOf, kindOf, sinceOf, type Kind } from "../../core/ask.ts";
import type { Card } from "../../core/types.ts";
import { markSeen } from "../seen.ts";
import { keyOf } from "../keys.ts";
import { clickRow } from "../select.ts";
import { useScrollMemory } from "../scroll.ts";
import { blockerCount, groupsOf, useAllCards, useStore } from "../store.ts";
import { Focus } from "./Focus.tsx";
import { Tooltip } from "../ui/Tooltip.tsx";
import { CardPane } from "./CardPane.tsx";
import { Age, KindChip, KindGlyph, RepoTag, shortRepo } from "./bits.tsx";
import { KIND_LABEL } from "../../core/ask.ts";

/** The Cards of the list in on-screen order: blockers, To look at, Awaiting pickup. `keep`: the Seen Card that is still open in To look at. */
export function queueOf(cards: Card[], keep: string | null = null) {
  const { waiting, look } = groupsOf(cards, keep);
  const pickup = cards.filter((c) => c.awaitingPickup && !c.waiting);
  return { waiting, look, pickup, order: [...waiting, ...look, ...pickup] };
}

/** A check (the row's own glyph is already an eye): the one-click "I have seen it" of a To look at row. */
const SEEN_ICON = (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M3 8.5 6.5 12 13 4.5" />
  </svg>
);

/** `group`: the Cards of the row's group (shift-click marks a range inside it); `kind` is the group's, a Seen Card still listed in To look at keeps "look". */
function Row({ card, group, kind }: { card: Card; group: Card[]; kind: Kind }) {
  const selected = useStore((s) => s.selected === card.key);
  const marked = useStore((s) => s.marked.includes(card.key));
  const failed = useStore((s) => card.key in s.failures);
  const unseen = kind === "look" && !card.seenAt;
  return (
    <div className="qrow-wrap" data-look={kind === "look" || undefined}>
      <button
        className="qrow"
        aria-selected={selected}
        data-card={card.key}
        data-kind={kind}
        data-marked={marked || undefined}
        data-failed={failed || undefined}
        onClick={(e) => clickRow(card, group, kind === "look", e)}
      >
        <KindGlyph kind={kind} box />
        <span className="q-main">
          <span className="q-title">
            <span className="title">{card.title}</span>
            <Age iso={sinceOf(card, kind)} />
          </span>
          <span className="q-sub">
            <RepoTag repo={card.repo} number={card.number} />
            <span className="ask">{failed ? "Not sent, try again" : askOf(card, kind)}</span>
          </span>
        </span>
        {/* the glyph says the kind by shape and colour; its name is here for assistive tech, so the ask keeps the row's width */}
        <KindChip kind={kind} />
      </button>
      {unseen && (
        <Tooltip label="Mark Seen">
          <button className="qrow-seen" aria-label="Mark Seen" onClick={() => void markSeen([card])}>
            {SEEN_ICON}
          </button>
        </Tooltip>
      )}
    </div>
  );
}

/** The empty list. Under a Repo filter it says so and what the filter hides, so a 0 is never unexplained (#47). */
function Nothing() {
  const filter = useStore((s) => s.repoFilter);
  const setFilter = useStore((s) => s.setRepoFilter);
  const elsewhere = blockerCount(useAllCards()); // counted as the sidebar counts
  if (!filter) return <div className="empty tight">Nothing waits on you. Agents are on it.</div>;
  return (
    <div className="empty tight" data-testid="filtered-empty">
      Nothing waits on you in {shortRepo(filter)}.
      {elsewhere > 0 && <div className="muted">{elsewhere} in other repos are hidden by the Repo filter.</div>}
      <button className="btn" onClick={() => setFilter(null)}>
        Show all repos
      </button>
    </div>
  );
}

function GroupHead({ label, count }: { label: string; count: number }) {
  return (
    <div className="group-head">
      {label} <span className="faint">{count}</span>
    </div>
  );
}

const KIND_ORDER: Kind[] = ["pr-approval", "decision", "design-round"];
const KIND_MANY: Record<Kind, string> = { ...KIND_LABEL, decision: "Decisions", "design-round": "Design rounds", "pr-approval": "PR approvals", look: "Looks" };

/** Nothing open yet: what waits, by kind, and the one button that goes through it (Focus). */
function Start({ waiting, look }: { waiting: Card[]; look: Card[] }) {
  const setFocus = useStore((s) => s.setFocus);
  const kinds = KIND_ORDER.map((k) => [k, waiting.filter((c) => kindOf(c) === k).length] as const).filter(([, n]) => n > 0);
  const unseen = look.filter((c) => !c.seenAt).length;
  const total = waiting.length + unseen;
  return (
    <div className="empty pane-empty start" data-testid="waiting-start">
      {total > 0 ? (
        <>
          <h2 className="start-title">{waiting.length ? `${waiting.length} ${waiting.length === 1 ? "Card waits" : "Cards wait"} on you` : `${unseen} to look at`}</h2>
          <ul className="start-kinds">
            {kinds.map(([k, n]) => (
              <li key={k} data-kind={k}>
                <KindGlyph kind={k} box />
                <b>{n}</b> {n === 1 ? KIND_LABEL[k] : KIND_MANY[k]}
              </li>
            ))}
            {unseen > 0 && (
              <li data-kind="look">
                <KindGlyph kind="look" box />
                <b>{unseen}</b> to look at
              </li>
            )}
          </ul>
          <button className="btn primary big" data-testid="focus-start" onClick={() => setFocus(true)}>
            Go through them one by one <kbd>{keyOf("focus")}</kbd>
          </button>
        </>
      ) : null}
      <div className="start-alt">
        Select a Card
        <span className="faint">
          Agent activity <kbd>{keyOf("go-agents")}</kbd>
        </span>
      </div>
    </div>
  );
}

export function WaitingView({ cards }: { cards: Card[] }) {
  const focus = useStore((s) => s.focus);
  return focus ? <Focus cards={cards} /> : <WaitingList cards={cards} />;
}

function WaitingList({ cards }: { cards: Card[] }) {
  const linger = useStore((s) => s.linger);
  const { waiting, look, pickup, order } = queueOf(cards, linger);
  const selected = useStore((s) => s.selected);
  const list = useRef<HTMLDivElement>(null);
  useScrollMemory(list, "waiting");
  // a failed answer brought its Card back: the row appears again and is brought into view like a new selection
  const failed = useStore((s) => selected !== null && selected in s.failures);

  // The list follows the selection, never a snapshot: scroll when the selection changes (a click, j/k, the next blocker after
  // the developer's own answer) or when a failed answer brings its Card back. Anything else the list does stays where the developer left it.
  useEffect(() => {
    list.current?.querySelector('[aria-selected="true"]')?.scrollIntoView?.({ block: "nearest" });
  }, [selected, failed]);

  return (
    <div className="split" data-testid="waiting">
      <div className="split-list" ref={list} tabIndex={-1} data-testid="waiting-list" aria-label="Waiting on me">
        {!order.length && <Nothing />}
        {waiting.length > 0 && <GroupHead label="Waiting on me" count={waiting.length} />}
        {waiting.map((c) => (
          <Row key={c.key} card={c} group={waiting} kind={kindOf(c)!} />
        ))}
        {look.length > 0 && <GroupHead label="To look at" count={look.length} />}
        {look.map((c) => (
          <Row key={c.key} card={c} group={look} kind="look" />
        ))}
        {pickup.length > 0 && <GroupHead label="Awaiting pickup" count={pickup.length} />}
        {pickup.map((c) => (
          <Row key={c.key} card={c} group={pickup} kind="pickup" />
        ))}
      </div>
      {selected && cards.some((c) => c.key === selected) ? (
        <CardPane key={selected} cardKey={selected} mode="split" />
      ) : (
        <Start waiting={waiting} look={look} />
      )}
    </div>
  );
}
