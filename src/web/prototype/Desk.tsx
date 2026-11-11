// PROTOTYPE (issue #8) · Variant C "Desk": no mode. Waiting on me itself is three zones that stay put: the queue as a narrow
// rail, the ask's evidence on a canvas at real size (variants side by side by default), and a fixed answer dock where the
// options, the note, the comment that will be written and Send always sit in the same place.
import { useEffect } from "react";
import { KIND_LABEL, kindOf, sinceOf } from "../../core/ask.ts";
import type { Card } from "../../core/types.ts";
import { Btn, KindGlyph, ago } from "../components/bits.tsx";
import { End } from "./Covers.tsx";
import { askKeys, variantKeys } from "./keys.ts";
import { EMPTY, SINCE, askOfCard, canSend, isDone, nextOpen, send, useProto, whyNot } from "./model.ts";
import { Check, Checks, Facts, Failure, LookImage, Meta, Note, PushToggle, RoundImages, VariantTabs, ViewTools, Written, isPicked, pick, reject, useDraftOf, useView } from "./parts.tsx";

function Rail({ queue }: { queue: Card[] }) {
  const { current, status, drafts, open, state } = useProto();
  const groups: [string, Card[]][] = [
    [state === "back" ? `New since ${SINCE}` : "Waiting on me", queue.filter((c) => kindOf(c) !== "look")],
    ["To look at", queue.filter((c) => kindOf(c) === "look")],
  ];
  return (
    <nav className="pv-rail" aria-label="Waiting on me">
      {groups.map(
        ([label, cards]) =>
          cards.length > 0 && (
            <div key={label}>
              <div className="group-head">
                {label} <span className="faint">{cards.filter((c) => !isDone(status[c.key])).length}</span>
              </div>
              {cards.map((c) => {
                const kind = kindOf(c) ?? "look";
                const st = status[c.key];
                const ready = !isDone(st) && canSend(c, drafts[c.key] ?? EMPTY);
                return (
                  <button key={c.key} className="pv-rail-row" aria-current={c.key === current || undefined} data-kind={kind} data-status={st} onClick={() => open(c.key)} title={`${KIND_LABEL[kind]}: ${c.title}`}>
                    <KindGlyph kind={kind} box />
                    <span className="title">{c.title}</span>
                    <span className="pv-rail-state">
                      {isDone(st) ? <Check /> : st === "failed" ? <i className="pv-dot" data-tone="danger" title="Not sent" /> : ready ? <i className="pv-dot" data-tone="accent" title="Answer picked, not sent" /> : <span className="faint">{ago(sinceOf(c))}</span>}
                    </span>
                  </button>
                );
              })}
            </div>
          ),
      )}
    </nav>
  );
}

function Canvas({ card }: { card: Card }) {
  const ask = askOfCard(card);
  const reasoning = /<summary>Reasoning<\/summary>([\s\S]*?)<\/details>/.exec(ask.req?.body ?? "")?.[1]?.trim();
  const answered = card.requests.filter((r) => r.answer);
  return (
    <div className="pv-canvas" data-kind={ask.kind} key={card.key}>
      {ask.kind === "design-round" && (
        <>
          <div className="pv-canvas-bar">
            <VariantTabs card={card} ask={ask} />
            <ViewTools ask={ask} preview={ask.round?.preview ?? null} />
          </div>
          <RoundImages card={card} ask={ask} />
        </>
      )}
      {ask.kind === "look" && (
        <>
          <div className="pv-canvas-bar">
            <span className="muted">The result, as the agent left it</span>
            <ViewTools ask={ask} preview={ask.look?.preview ?? null} />
          </div>
          <LookImage ask={ask} />
        </>
      )}
      {ask.kind === "pr-approval" && (
        <div className="pv-canvas-read">
          <h2>Evidence</h2>
          <Facts card={card} ask={ask} />
          <p className="muted">
            {card.pullRequest?.title} · PR #{card.pullRequest?.number} · {card.body}
          </p>
        </div>
      )}
      {ask.kind === "decision" && (
        <div className="pv-canvas-read">
          <h2>What the decision rests on</h2>
          <div className="pv-facts">
            <div>
              <h3>The Card</h3>
              <p>{card.body}</p>
            </div>
            <div>
              <h3>The agent recommends</h3>
              <p>
                <i className="pv-dot" data-tone="accent" aria-hidden />
                {ask.recommendation ? `${ask.options.find((o) => o.recommended)?.raw ?? ask.recommendation.key}` : "Nothing"}
              </p>
              {ask.recommendation?.confidence && <p className="muted">Confidence {ask.recommendation.confidence}</p>}
              {reasoning && <p className="muted">{reasoning}</p>}
            </div>
            <div>
              <h3>Decided so far</h3>
              {answered.length || card.agentDecisions.length ? (
                <>
                  {answered.map((r) => (
                    <p key={r.id}>
                      {r.id}: {r.answer}
                    </p>
                  ))}
                  {card.agentDecisions.map((d) => (
                    <p key={d.id} className="muted">
                      {d.id}: {d.title}
                    </p>
                  ))}
                </>
              ) : (
                <p className="muted">Nothing yet on this Card</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Dock({ card, onSend, onSeen }: { card: Card; onSend: () => void; onSeen: () => void }) {
  const ask = askOfCard(card);
  const d = useDraftOf(card.key);
  const st = useProto((s) => s.status[card.key]);
  return (
    <aside className="pv-dock" aria-label="Your answer" data-kind={ask.kind}>
      <Meta card={card} link />
      <h2 className="pv-dock-q">{ask.question}</h2>
      {ask.kind === "look" ? (
        <>
          <Checks ask={ask} />
          <span className="spacer" />
          <p className="faint">Nothing is written to GitHub. The Card leaves the Board 7 days after it is Seen.</p>
          {isDone(st) ? (
            <p className="muted">
              <Check /> Marked Seen
            </p>
          ) : (
            <button className="btn primary big" onClick={onSeen}>
              Mark Seen <kbd>l</kbd>
            </button>
          )}
        </>
      ) : (
        <>
          <div className="options" role="group" aria-label="Options">
            {ask.options.map((o, i) => {
              const on = isPicked(ask, d, o.key, o.raw);
              const off = d.rejects.includes(o.key);
              return (
                <div key={o.key} className="pv-dock-opt">
                  <button className={`option ${on ? "selected" : ""}`} aria-pressed={on} data-rejected={off || undefined} onClick={() => pick(card, i + 1)}>
                    <kbd>{i + 1}</kbd>
                    <span className="option-text">
                      <b>{ask.kind === "decision" ? o.key : o.raw}</b>
                      <span className="muted">{ask.kind === "design-round" ? o.raw && o.text : o.text}</span>
                    </span>
                    {o.recommended && <span className="option-rec">Recommended</span>}
                  </button>
                  {ask.kind === "design-round" && (
                    <button className={`btn ${off ? "selected" : ""}`} aria-pressed={off} aria-label={`Reject variant ${o.key}`} onClick={() => reject(card, o.key)}>
                      Reject
                    </button>
                  )}
                </div>
              );
            })}
          </div>
          <Note card={card} always />
          <span className="spacer" />
          {st === "failed" ? <Failure /> : <Written card={card} />}
          {st === "sent" ? (
            <p className="muted">
              <Check /> Sent
            </p>
          ) : (
            <div className="actions">
              <PushToggle card={card} />
              <span className="spacer" />
              <Btn className="btn primary big" why={st === "sending" ? "Sending" : whyNot(card, d)} onClick={onSend}>
                {st === "sending" ? "Sending…" : st === "failed" ? "Send again" : "Send"} <kbd>⌘↵</kbd>
              </Btn>
            </div>
          )}
        </>
      )}
    </aside>
  );
}

export function Desk({ queue }: { queue: Card[] }) {
  const { current, status, open, mark } = useProto();
  const idx = queue.findIndex((c) => c.key === current);
  const card = idx >= 0 ? queue[idx]! : null;
  const allDone = queue.length > 0 && queue.every((c) => isDone(status[c.key]));

  useEffect(() => {
    if (!current && !useProto.getState().current && queue.length && !allDone) open(queue.find((c) => !isDone(status[c.key]))?.key ?? null);
  }, [current, queue, allDone, status, open]);
  useEffect(() => {
    const c = queue.find((x) => x.key === current);
    useView.getState().set({ shown: 0, compare: !!c && kindOf(c) === "design-round" && window.innerWidth > 1100, viewport: "desktop", details: false });
  }, [current, queue]);

  const advance = (from: Card) => open(nextOpen(queue, useProto.getState().status, from.key));
  const doSend = () => card && void send(card).then((ok) => ok && advance(card));
  const doSeen = () => {
    if (!card) return;
    mark(card.key, "seen");
    advance(card);
  };
  const step = (dir: 1 | -1) => {
    const next = queue[idx + dir];
    if (next) open(next.key);
  };

  variantKeys.current = (e, typing) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      doSend();
      return true;
    }
    if (typing || e.metaKey || e.ctrlKey || e.altKey || !card) return false;
    switch (e.key) {
      case "j":
      case "ArrowDown":
        return step(1), true;
      case "k":
      case "ArrowUp":
        return step(-1), true;
      case "l":
        if (kindOf(card) !== "look") return false;
        return doSeen(), true;
    }
    return isDone(status[card.key]) ? false : askKeys(e, card);
  };

  return (
    <div className="pv-desk" data-done={allDone || !queue.length || undefined}>
      {queue.length > 0 && <Rail queue={queue} />}
      {card && !allDone ? (
        <>
          <Canvas card={card} />
          <Dock card={card} onSend={doSend} onSeen={doSeen} />
        </>
      ) : (
        <div className="pv-canvas">
          <End queue={queue} onOpen={(key) => open(key)} wide />
        </div>
      )}
    </div>
  );
}
