// Where Focus begins and where it ends. The start says how many Cards wait, by kind, and lists them (after an earlier visit: what is
// new since then, the older open asks under "Still waiting"). The end is a receipt: every Card answered in this Focus with the comment
// that was written, every Look marked Seen. With nothing waiting, it says so and offers the two ways on.
import { KIND_LABEL, askOf, kindOf, sinceOf, splitNew, tally, type Kind } from "../../../core/ask.ts";
import type { Card } from "../../../core/types.ts";
import type { ReceiptEntry } from "../../focus/session.ts";
import { keyOf } from "../../keys.ts";
import { blockerCount, useAllCards, useStore } from "../../store.ts";
import { KindGlyph, RepoTag, ago, clock, shortRepo } from "../bits.tsx";

const ORDER: Kind[] = ["pr-approval", "decision", "design-round", "look"];
const MANY: Partial<Record<Kind, [string, string]>> = { "pr-approval": ["PR approval", "PR approvals"], decision: ["Decision", "Decisions"], "design-round": ["Design round", "Design rounds"], look: ["to look at", "to look at"] };

const byKind = (cards: Card[]) =>
  ORDER.map((k) => [k, cards.filter((c) => (kindOf(c) ?? "look") === k).length] as const)
    .filter(([, n]) => n > 0)
    .map(([k, n]) => `${n} ${MANY[k]![n === 1 ? 0 : 1]}`)
    .join(", ");

function Rows({ cards, onOpen, label }: { cards: Card[]; onOpen: (key: string) => void; label: string }) {
  return (
    <ol className="start-list" aria-label={label}>
      {cards.map((c) => {
        const kind = kindOf(c) ?? "look";
        return (
          <li key={c.key}>
            <button data-kind={kind} data-card={c.key} onClick={() => onOpen(c.key)}>
              <KindGlyph kind={kind} box />
              <span className="start-kind">{KIND_LABEL[kind]}</span>
              <span className="start-main">
                <b>{c.title}</b>
                <span className="muted">{askOf(c)}</span>
              </span>
              <RepoTag repo={c.repo} number={c.number} />
              <span className="faint age">{ago(sinceOf(c))}</span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

export function Start({ queue, since, onStart, onOpen }: { queue: Card[]; since: string | null; onStart: () => void; onOpen: (key: string) => void }) {
  const { fresh, older } = splitNew(queue, since);
  const returning = fresh.length > 0 && !!since;
  const blockers = queue.filter((c) => c.waiting).length;
  const headline = returning ? `${fresh.length} new since ${clock(since!)}` : blockers ? `${blockers} ${blockers === 1 ? "Card waits" : "Cards wait"} on you` : `${queue.length} to look at`;
  return (
    <div className="cover-scroll">
      <div className="start-col" data-testid="focus-overview">
        <div className="start-head">
          <div>
            <h1 className="cover-q">{headline}</h1>
            <p className="muted start-sum">
              {byKind(returning ? fresh : queue)}. {returning ? (older.length ? `${older.length} from before still ${older.length === 1 ? "waits" : "wait"}.` : "Everything from before is answered.") : "Closest to Done first."}
            </p>
          </div>
          {/* above the list: it scrolls, the way in does not */}
          <button className="btn primary big" data-testid="focus-begin" onClick={onStart}>
            Start <kbd>{keyOf("focus-start")}</kbd>
          </button>
        </div>
        <Rows cards={returning ? fresh : queue} onOpen={onOpen} label={returning ? "New" : "Waiting on me"} />
        {returning && older.length > 0 && (
          <>
            <h2 className="start-h">Still waiting</h2>
            <Rows cards={older} onOpen={onOpen} label="Still waiting" />
          </>
        )}
      </div>
    </div>
  );
}

const CheckMark = () => (
  <svg className="focus-check" width="44" height="44" viewBox="0 0 44 44" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <circle cx="22" cy="22" r="19" />
    <path d="M14 22.5l5.5 5.5L30.5 16" />
  </svg>
);

function WaysOn() {
  const setView = useStore((s) => s.setView);
  const setAgentsOpen = useStore((s) => s.setAgentsOpen);
  return (
    <div className="actions">
      <button className="btn primary" onClick={() => setView("board")}>
        Open the Board <kbd>{keyOf("go-board")}</kbd>
      </button>
      <button className="btn" onClick={() => setAgentsOpen(true)}>
        Agent activity <kbd>{keyOf("go-agents")}</kbd>
      </button>
    </div>
  );
}

/** Nothing waits. Under a Repo filter it says so and what the filter hides, as the list does (#47). */
export function Empty() {
  const filter = useStore((s) => s.repoFilter);
  const setFilter = useStore((s) => s.setRepoFilter);
  const elsewhere = blockerCount(useAllCards());
  return (
    <div className="focus-done" data-testid="focus-done">
      <CheckMark />
      <h1 className="cover-q">{filter ? `Nothing waits on you in ${shortRepo(filter)}` : "Nothing waits on you"}</h1>
      <p className="muted">Agents are on it. New asks show up here and as a notification.</p>
      {filter && elsewhere > 0 && (
        <p className="muted">
          {elsewhere} in other repos {elsewhere === 1 ? "is" : "are"} hidden by the Repo filter.{" "}
          <button className="btn" onClick={() => setFilter(null)}>
            Show all repos
          </button>
        </p>
      )}
      <WaysOn />
    </div>
  );
}

export function End({ receipt, queue, onStart }: { receipt: ReceiptEntry[]; queue: Card[]; onStart: () => void }) {
  if (!receipt.length && !queue.length) return <Empty />;
  return (
    <div className="cover-scroll">
      <div className="focus-done" data-testid="focus-done">
        <CheckMark />
        <h1 className="cover-q">All clear</h1>
        <p className="muted">{receipt.length ? `${tally(receipt.map((r) => r.kind))}. The agents take it from here.` : "Nothing was sent in this Focus."}</p>
        {receipt.length > 0 && (
          <ol className="receipt" data-testid="receipt" aria-label="What was sent in this Focus">
            {receipt.map((r) => (
              <li key={r.key} data-kind={r.kind}>
                <KindGlyph kind={r.kind} />
                <div className="receipt-main">
                  <span className="receipt-title">
                    {r.title} <RepoTag repo={r.repo} number={r.number} />
                  </span>
                  {r.comment !== null && <code>{r.comment}</code>}
                  <span className="faint">{r.effect}</span>
                </div>
                <span className="receipt-state">
                  <i aria-hidden />
                  {r.comment === null ? "Marked Seen" : "Sent"}
                </span>
              </li>
            ))}
          </ol>
        )}
        {queue.length > 0 ? (
          <div className="actions">
            <button className="btn primary" data-testid="focus-begin" onClick={onStart}>
              {queue.length} more {queue.length === 1 ? "waits" : "wait"}: go on <kbd>{keyOf("focus-start")}</kbd>
            </button>
          </div>
        ) : (
          <WaysOn />
        )}
      </div>
    </div>
  );
}
