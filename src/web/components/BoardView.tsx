import { useEffect, useMemo, useRef, useSyncExternalStore, type MouseEvent } from "react";
import { boardOrder } from "../../core/card.ts";
import { groupByDay, splitDone } from "../../core/days.ts";
import { PHASES, type Card, type Phase } from "../../core/types.ts";
import { dragCards, dropBlocked, startDrag } from "../drag.ts";
import { clickCard, keyFocus } from "../select.ts";
import { useLaneView, useStore, type LaneView } from "../store.ts";
import { CardChips, Chevron, PhaseDot, RepoTag, ago } from "./bits.tsx";

/** The Done column: Look first, then one group per closing day (collapsed until opened). */
export function doneLayout(cards: Card[], openDays: Record<string, boolean>) {
  const { look, rest } = splitDone(cards.filter((c) => c.phase === "Done"));
  return { look, days: groupByDay(rest).map((d) => ({ ...d, open: !!openDays[d.day] })) };
}

/**
 * The columns' Cards in screen order, as far as they are on screen (Cards in collapsed days and collapsed lanes are not).
 * Grouped by repo (`lanes`), a column reads lane by lane, each lane with its own Look group and days.
 */
export function boardNavGroups(cards: Card[], openDays: Record<string, boolean>, lanes: LaneView | null = null): Card[][] {
  const column = (list: Card[], p: Phase) => {
    if (p !== "Done") return list.filter((c) => c.phase === p).sort(boardOrder);
    const { look, days } = doneLayout(list, openDays);
    return [...look, ...days.filter((d) => d.open).flatMap((d) => d.cards)];
  };
  return PHASES.map((p) => (lanes ? lanes.repos.filter((r) => !lanes.collapsed[r]).flatMap((r) => column(cards.filter((c) => c.repo === r), p)) : column(cards, p)));
}

/** All of them in one list (j/k skip Cards in collapsed days and lanes). */
export const boardNavOrder = (cards: Card[], openDays: Record<string, boolean>, lanes: LaneView | null = null): Card[] => boardNavGroups(cards, openDays, lanes).flat();

function BoardCard({ card }: { card: Card }) {
  const selected = useStore((s) => s.selected === card.key);
  const marked = useStore((s) => s.marked.includes(card.key));
  const dragging = useStore((s) => !!s.drag?.keys.includes(card.key));
  const el = useRef<HTMLButtonElement>(null);
  // the selected Card is always in view and holds DOM focus, so Enter and Space act on the Card the pane shows (#41)
  useEffect(() => {
    if (!selected || !el.current) return;
    el.current.scrollIntoView?.({ block: "nearest" });
    const at = document.activeElement;
    // a key move always takes focus; any other open (palette, notification) only when focus is not in a field or the pane
    const free = !at || at === document.body || !!at.closest(".board");
    if (keyFocus.key === card.key || free) el.current.focus({ preventScroll: true });
    if (keyFocus.key === card.key) keyFocus.key = null;
  }, [selected, card.key]);
  return (
    <button
      ref={el}
      className="card"
      aria-selected={selected}
      aria-pressed={marked}
      data-card={card.key}
      data-marked={marked || undefined}
      data-dragging={dragging || undefined}
      onClick={(e) => clickCard(card, e)}
      onPointerDown={(e) => startDrag(card, e)}
    >
      <span className="meta">
        <RepoTag repo={card.repo} number={card.number} />
        <span>· {ago(card.updatedAt)}</span>
      </span>
      <span className="title">{card.title}</span>
      <span className="meta">
        <CardChips card={card} />
      </span>
    </button>
  );
}

function DoneColumn({ cards }: { cards: Card[] }) {
  const openDays = useStore((s) => s.openDays);
  const toggleDay = useStore((s) => s.toggleDay);
  const selected = useStore((s) => s.selected);
  const { look, days } = useMemo(() => doneLayout(cards, openDays), [cards, openDays]);
  // a Card selected from elsewhere (palette, notification, activity) opens its day
  useEffect(() => {
    const day = days.find((d) => d.cards.some((c) => c.key === selected));
    if (day && !day.open) toggleDay(day.day, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);
  return (
    <>
      {look.length > 0 && (
        <div className="done-look" data-testid="done-look">
          <div className="done-head look">To look at {look.length}</div>
          {look.map((c) => (
            <BoardCard key={c.key} card={c} />
          ))}
        </div>
      )}
      {days.map((d) => (
        <div key={d.day} className="done-day" data-testid={`done-day-${d.day}`}>
          <button className="done-head" aria-expanded={d.open} onClick={() => toggleDay(d.day)}>
            <Chevron open={d.open} />
            {d.label}
            <span className="faint">{d.cards.length}</span>
          </button>
          {d.open && d.cards.map((c) => <BoardCard key={c.key} card={c} />)}
        </div>
      ))}
    </>
  );
}

/** What counts as "on" something in the Board: a click anywhere else is on empty space. */
const ON_SOMETHING = ".card, .column-head, .done-head, .lane-head, .drop-note, button, a, input, select, textarea";
const onEmptySpace = (e: Pick<MouseEvent, "target">) => !(e.target as Element).closest(ON_SOMETHING);

/** "Group by repo" (#36): in the Board's header line (the topbar), only with 2+ repos configured. */
export function LaneToggle() {
  const repos = useStore((s) => s.board?.repos.length ?? 0);
  const on = useStore((s) => s.lanes);
  const setLanes = useStore((s) => s.setLanes);
  if (repos < 2) return null;
  return (
    <button className="lane-toggle" aria-pressed={on} title={on ? "Board grouped by repo: show one list" : "Group the Board by repo"} data-testid="lane-toggle" onClick={() => setLanes(!on)}>
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" aria-hidden>
        <path d="M2 3.5h10M2 7h10M2 10.5h10" />
      </svg>
      Group by repo
    </button>
  );
}

/** At this width and below the Card pane is 400 px and the Board columns 208 px (styles.css, #50). */
const NARROW = "(max-width: 1100px)";
const subscribeNarrow = (f: () => void) => {
  const m = matchMedia(NARROW);
  m.addEventListener("change", f);
  return () => m.removeEventListener("change", f);
};
const useNarrow = () => useSyncExternalStore(subscribeNarrow, () => matchMedia(NARROW).matches);

/** While dragging: per Phase, why a drop there moves none of the dragged Cards (null = it moves at least one). `moveBlocked`'s rules, as the drop uses them. */
type Verdicts = Record<Phase, string | null>;
export function useVerdicts(cards: Card[]): Verdicts | null {
  const keys = useStore((s) => s.drag?.keys ?? null);
  // dropBlocked reads the store: the Next step and the Phase rules here, the Cards through `cards` (patched and filtered, from the caller)
  const step = useStore((s) => s.moveStep);
  const workflow = useStore((s) => s.board?.workflow);
  return useMemo(() => {
    if (!keys) return null;
    const dragged = dragCards(keys);
    return Object.fromEntries(PHASES.map((p) => [p, dropBlocked(p, dragged)])) as Verdicts;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keys, cards, step, workflow]);
}

/** Valid targets light up, the others dim and say why (when the pointer is over them). */
const dropState = (verdicts: Verdicts | null, phase: Phase, over: Phase | null) => (!verdicts ? undefined : verdicts[phase] ? "no" : over === phase ? "over" : "ok");

function Column({ phase, cards, head, testId, lane, verdicts }: { phase: Phase; cards: Card[]; head: boolean; testId?: string; lane?: string; verdicts: Verdicts | null }) {
  const drag = useStore((s) => s.drag);
  const col = cards.filter((c) => c.phase === phase).sort(boardOrder);
  const why = verdicts?.[phase];
  // grouped by repo the note shows in the lane under the pointer only
  const here = drag?.over === phase && (lane === undefined || drag.lane === lane);
  return (
    <section className="column" aria-label={phase} data-testid={testId} data-column={phase} data-lane={lane} data-drop={dropState(verdicts, phase, drag?.over ?? null)}>
      {head && (
        <div className="column-head">
          <PhaseDot phase={phase} />
          {phase}
          <span className="faint">{col.length}</span>
        </div>
      )}
      {drag && here && (
        <div className="drop-note" data-no={why ? "" : undefined} data-testid="drop-note">
          {why ?? `Move ${drag.keys.length} ${drag.keys.length === 1 ? "Card" : "Cards"} here`}
        </div>
      )}
      {phase === "Done" ? col.length > 0 && <DoneColumn cards={cards} /> : col.map((c) => <BoardCard key={c.key} card={c} />)}
    </section>
  );
}

export function BoardView({ cards }: { cards: Card[] }) {
  const drag = useStore((s) => s.drag);
  const select = useStore((s) => s.select);
  const selected = useStore((s) => s.selected);
  const toggleLane = useStore((s) => s.toggleLane);
  const lanes = useLaneView();
  const narrow = useNarrow();
  const board = useRef<HTMLDivElement>(null);
  const verdicts = useVerdicts(cards);
  // the Card pane is open at <= 1100 px: the open Card's column sits at the left edge of what is left of the Board, the next one
  // half in view (#50). It snaps when the pane opens and when the selection moves to another Phase, not for a move inside the column,
  // so a look at the neighbour by scrolling is not undone. Runs after BoardCard's own scrollIntoView (a parent's effect follows its children's).
  const phase = cards.find((c) => c.key === selected)?.phase ?? null;
  useEffect(() => {
    const root = board.current;
    const scroller = root?.closest<HTMLElement>(".scroll");
    const col = phase && root?.querySelector<HTMLElement>(`[data-column="${phase}"]`);
    if (!narrow || !root || !scroller || !col) return;
    const pad = parseFloat(getComputedStyle(root).paddingLeft) || 0;
    scroller.scrollLeft += col.getBoundingClientRect().left - scroller.getBoundingClientRect().left - pad;
  }, [narrow, phase]);
  // a click closes the Card pane only when press and release are the same empty spot: not a drag or text selection (a drag that ends on
  // another element makes the click land on a common ancestor); the marks stay
  const down = useRef<{ target: EventTarget; x: number; y: number } | null>(null);
  return (
    <div
      ref={board}
      className="board"
      data-testid="board"
      data-lanes={lanes ? "" : undefined}
      onPointerDown={(e) => (down.current = onEmptySpace(e) ? { target: e.target, x: e.clientX, y: e.clientY } : null)}
      onClick={(e) => {
        const d = down.current;
        down.current = null;
        if (d && d.target === e.target && Math.hypot(e.clientX - d.x, e.clientY - d.y) < 5 && onEmptySpace(e)) select(null);
      }}
    >
      {!lanes ? (
        PHASES.map((p) => <Column key={p} phase={p} cards={cards} head testId={`column-${p}`} verdicts={verdicts} />)
      ) : (
        <>
          <div className="board-heads" data-testid="board-heads">
            {PHASES.map((p) => (
              <div key={p} className="column-head" data-column={p} data-drop={dropState(verdicts, p, drag?.over ?? null)}>
                <PhaseDot phase={p} />
                {p}
                <span className="faint">{cards.filter((c) => c.phase === p).length}</span>
              </div>
            ))}
          </div>
          {lanes.repos.map((repo) => {
            const mine = cards.filter((c) => c.repo === repo);
            const open = !lanes.collapsed[repo];
            return (
              <div key={repo} className="lane" data-testid={`lane-${repo}`}>
                <button className="lane-head" aria-expanded={open} onClick={() => toggleLane(repo)}>
                  <Chevron open={open} />
                  <RepoTag repo={repo} />
                  <span className="faint">{mine.length}</span>
                </button>
                {open && (
                  <div className="lane-cols">
                    {PHASES.map((p) => (
                      <Column key={p} phase={p} cards={mine} head={false} testId={`lane-${repo}-column-${p}`} lane={repo} verdicts={verdicts} />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}
