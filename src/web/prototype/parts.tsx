// PROTOTYPE (issue #8): the pieces the three variants share. Each variant composes them differently; none of this is production code.
import { useRef } from "react";
import { create } from "zustand";
import { KIND_LABEL, kindOf, sinceOf } from "../../core/ask.ts";
import type { PrVerdict } from "../../core/contract.ts";
import type { Card, Screenshot } from "../../core/types.ts";
import { Ext, KindGlyph, RepoTag, ago, shortRepo } from "../components/bits.tsx";
import { EMPTY, FAILURE, VERDICTS, askOfCard, canSend, isDone, literal, sets, useProto, whyNot, type Ask, type Draft, type Status } from "./model.ts";
import { NATURAL, mockSrc } from "./shots.ts";

/** How the open Card's images are shown. One Card is open at a time, so one view state does. */
interface View {
  shown: number;
  viewport: "desktop" | "mobile";
  compare: boolean;
  details: boolean;
  set: (p: Partial<Omit<View, "set">>) => void;
}
export const useView = create<View>((set) => ({ shown: 0, viewport: "desktop", compare: false, details: false, set: (p) => set(p) }));

export const useDraftOf = (key: string): Draft => useProto((s) => s.drafts[key]) ?? EMPTY;

/** A digit: toggles the nth option of the open ask. Picks only, never sends. */
export function pick(card: Card, n: number): boolean {
  const ask = askOfCard(card);
  const opt = ask.options[n - 1];
  if (!opt) return false;
  const { drafts, edit } = useProto.getState();
  const d = drafts[card.key] ?? EMPTY;
  if (ask.kind === "decision") edit(card.key, { choice: d.choice === opt.raw ? null : opt.raw });
  else if (ask.kind === "pr-approval") {
    const v = opt.key as PrVerdict;
    edit(card.key, { verdict: d.verdict === v ? null : v, noteOpen: d.noteOpen || v === "send-back" });
  } else if (ask.kind === "design-round") {
    edit(card.key, { picks: d.picks.includes(opt.key) ? d.picks.filter((k) => k !== opt.key) : [...d.picks, opt.key], rejects: d.rejects.filter((k) => k !== opt.key) });
    useView.getState().set({ shown: n - 1 });
  }
  return true;
}

export function reject(card: Card, key: string) {
  const { drafts, edit } = useProto.getState();
  const d = drafts[card.key] ?? EMPTY;
  edit(card.key, { rejects: d.rejects.includes(key) ? d.rejects.filter((k) => k !== key) : [...d.rejects, key], picks: d.picks.filter((k) => k !== key) });
}

export const isPicked = (ask: Ask, d: Draft, key: string, raw: string) => (ask.kind === "decision" ? d.choice === raw : ask.kind === "pr-approval" ? d.verdict === key : d.picks.includes(key));

/** The shots of the open ask as the view state walks them: a round's variant in the chosen viewport, or a Look's states. */
export function shotsOf(ask: Ask): Screenshot[] {
  return ask.round?.screenshots ?? ask.look?.screenshots ?? [];
}
export function shotFor(ask: Ask, variant: string | null, viewport: "desktop" | "mobile", index = 0): Screenshot | null {
  const all = shotsOf(ask);
  if (ask.round) return all.find((s) => s.variant === variant && s.viewport === viewport) ?? all.find((s) => s.variant === variant) ?? null;
  const inVp = all.filter((s) => s.viewport === viewport);
  return (inVp.length ? inVp : all)[index % Math.max(1, inVp.length || all.length)] ?? null;
}

/** One screenshot at its real size: never scaled up, scaled down only to the width it has. */
export function Shot({ shot, label }: { shot: Screenshot; label?: string }) {
  const [w, h] = NATURAL[shot.viewport ?? "desktop"];
  return (
    <figure className="pv-shot" data-viewport={shot.viewport ?? "desktop"}>
      <img src={mockSrc(shot, "Today")} alt={shot.alt} width={w} height={h} />
      {label && <figcaption>{label}</figcaption>}
    </figure>
  );
}

/** The top line of an ask: what kind, which Card, how long it has waited. Replaces the Card chrome (stepper, chips, tabs). */
export function Meta({ card, link }: { card: Card; link?: boolean }) {
  const kind = kindOf(card) ?? "look";
  return (
    <div className="pv-meta" data-kind={kind}>
      <KindGlyph kind={kind} />
      <span className="pv-meta-kind">{KIND_LABEL[kind]}</span>
      <RepoTag repo={card.repo} number={card.number} />
      <span className="pv-meta-title">{card.title}</span>
      <span className="faint">{kind === "look" ? `Done ${ago(card.closedAt)} ago` : `waiting ${ago(sinceOf(card))}`}</span>
      {link && (
        <a href={card.url} target="_blank" rel="noreferrer">
          GitHub
          <Ext />
        </a>
      )}
    </div>
  );
}

/** The options of a decision or the verdicts of a PR as tiles: a choice between a few things, side by side. */
export function Tiles({ card, ask, dense, onPick, writes }: { card: Card; ask: Ask; dense?: boolean; onPick?: (n: number) => void; writes?: (n: number) => string | null }) {
  const d = useDraftOf(card.key);
  return (
    <div className="pv-tiles" data-dense={dense || undefined} role="group" aria-label={ask.kind === "pr-approval" ? "Verdict" : "Options"} style={{ "--n": ask.options.length } as React.CSSProperties}>
      {ask.options.map((o, i) => {
        const on = isPicked(ask, d, o.key, o.raw);
        return (
          <button key={o.key} className="pv-tile" aria-pressed={on} onClick={() => (onPick ? onPick(i + 1) : pick(card, i + 1))}>
            <span className="pv-tile-top">
              <kbd>{i + 1}</kbd>
              <b>{ask.kind === "pr-approval" ? o.raw : o.key}</b>
              {on && <Check />}
            </span>
            <span className="pv-tile-text">{o.text}</span>
            {writes && <code className="pv-tile-writes">{writes(i + 1) ?? "needs your note"}</code>}
            {o.recommended && (
              <span className="pv-rec">
                <i aria-hidden />
                The agent recommends this{ask.recommendation?.confidence ? `, confidence ${ask.recommendation.confidence}` : ""}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export const Check = () => (
  <svg className="pv-check" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M3 8.5 6.5 12 13 4.5" />
  </svg>
);

/** A PR's evidence as facts, read from the PR body's sections and the reason the merge was held. */
export function Facts({ card, ask }: { card: Card; ask: Ask }) {
  const body = card.pullRequest?.body ?? "";
  const section = (name: string) =>
    (new RegExp(`## ${name}\\n([\\s\\S]*?)(?=\\n## |$)`).exec(body)?.[1] ?? "")
      .split("\n")
      .map((l) => l.replace(/^[-*]\s*/, "").trim())
      .filter(Boolean);
  const verification = section("Verification");
  const review = section("Review");
  const why = /^(.*?)[.:]\s*(.*?)\.?\s*Merge\?$/.exec(ask.question);
  return (
    <div className="pv-facts">
      <div>
        <h3>Why it stopped</h3>
        <p>
          <i className="pv-dot" data-tone="waiting" aria-hidden />
          {why ? why[2] : ask.question}
        </p>
      </div>
      <div>
        <h3>Verification</h3>
        {verification.length ? (
          verification.map((v) => (
            <p key={v}>
              <i className="pv-dot" data-tone="ok" aria-hidden />
              {v}
            </p>
          ))
        ) : (
          <p className="muted">Nothing reported</p>
        )}
      </div>
      <div>
        <h3>Review</h3>
        {review.length ? (
          review.map((v) => (
            <p key={v}>
              <i className="pv-dot" data-tone="ok" aria-hidden />
              {v}
            </p>
          ))
        ) : (
          <p className="muted">Nothing reported</p>
        )}
      </div>
      <a className="pv-facts-link" href={`${card.pullRequest?.url}/files`} target="_blank" rel="noreferrer">
        PR #{card.pullRequest?.number}: diff on GitHub
        <Ext />
      </a>
    </div>
  );
}

/** A round's variants as the switch between them: the key that picks, the name, and what the developer said so far. */
export function VariantTabs({ card, ask }: { card: Card; ask: Ask }) {
  const d = useDraftOf(card.key);
  const { shown, compare, set } = useView();
  return (
    <div className="pv-vtabs" role="tablist" aria-label="Variants">
      {ask.options.map((o, i) => (
        <button key={o.key} role="tab" aria-selected={!compare && shown === i} data-state={d.picks.includes(o.key) ? "picked" : d.rejects.includes(o.key) ? "rejected" : undefined} onClick={() => set({ shown: i, compare: false })}>
          <kbd>{i + 1}</kbd>
          <b>{o.key}</b> {o.raw}
          {d.picks.includes(o.key) && <Check />}
          {d.rejects.includes(o.key) && <span className="pv-struck">rejected</span>}
          {o.recommended && <i className="pv-dot" data-tone="accent" title="The agent recommends this" />}
        </button>
      ))}
    </div>
  );
}

export function ViewTools({ ask, preview }: { ask: Ask; preview: string | null }) {
  const { viewport, compare, set } = useView();
  const hasMobile = shotsOf(ask).some((s) => s.viewport === "mobile");
  return (
    <div className="pv-tools">
      {ask.round && (
        <button className={`btn ${compare ? "selected" : ""}`} aria-pressed={compare} onClick={() => set({ compare: !compare })}>
          Side by side <kbd>c</kbd>
        </button>
      )}
      {hasMobile && (
        <button className="btn" onClick={() => set({ viewport: viewport === "desktop" ? "mobile" : "desktop" })}>
          {viewport === "desktop" ? "Desktop" : "Mobile"} <kbd>v</kbd>
        </button>
      )}
      {preview && (
        <a className="btn ghost" href={preview} target="_blank" rel="noreferrer">
          {ask.round ? "Open prototype" : "Open preview"}
          <Ext />
        </a>
      )}
    </div>
  );
}

/** The images of a round: the shown variant at real size, or all variants side by side. Picking happens on the image. */
export function RoundImages({ card, ask, onPick, onReject, sends }: { card: Card; ask: Ask; onPick?: (n: number) => void; onReject?: (key: string) => void; sends?: boolean }) {
  const d = useDraftOf(card.key);
  const { shown, viewport, compare, set } = useView();
  const list = compare ? ask.options : ask.options.slice(shown, shown + 1);
  return (
    <div className="pv-images" data-compare={compare || undefined} data-viewport={viewport} style={{ "--n": list.length } as React.CSSProperties}>
      {list.map((o) => {
        const shot = shotFor(ask, o.key, viewport);
        const i = ask.options.indexOf(o);
        const state = d.picks.includes(o.key) ? "picked" : d.rejects.includes(o.key) ? "rejected" : undefined;
        return (
          <div key={o.key} className="pv-image" data-state={state}>
            {compare && (
              <button className="pv-image-head" onClick={() => set({ shown: i, compare: false })} title="Show this variant alone">
                <kbd>{i + 1}</kbd>
                <b>{o.key}</b> {o.raw}
                <span className="faint">{o.text}</span>
              </button>
            )}
            {shot ? <Shot shot={shot} /> : <div className="muted">No screenshot of this variant.</div>}
            <div className="pv-image-acts">
              <button className={`btn ${state === "picked" ? "selected" : ""}`} aria-pressed={state === "picked"} onClick={() => (onPick ? onPick(i + 1) : pick(card, i + 1))}>
                {sends ? `Send pick ${o.key}` : `Pick ${o.key}`} <kbd>{i + 1}</kbd>
              </button>
              <button className={`btn ${state === "rejected" ? "selected" : ""}`} aria-pressed={state === "rejected"} onClick={() => (onReject ? onReject(o.key) : reject(card, o.key))}>
                Reject {compare ? o.key : <kbd>x</kbd>}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** A Look's result: the shown state at real size, the others one key away. */
export function LookImage({ ask }: { ask: Ask }) {
  const { shown, viewport, set } = useView();
  const inVp = shotsOf(ask).filter((s) => s.viewport === viewport);
  const shot = shotFor(ask, null, viewport, shown);
  return (
    <div className="pv-images" data-viewport={viewport}>
      <div className="pv-image">
        {inVp.length > 1 && (
          <div className="pv-vtabs" role="tablist" aria-label="States">
            {inVp.map((s, i) => (
              <button key={s.alt} role="tab" aria-selected={shown % inVp.length === i} onClick={() => set({ shown: i })}>
                {s.state ?? s.alt}
              </button>
            ))}
            <span className="faint">
              <kbd>[</kbd>
              <kbd>]</kbd>
            </span>
          </div>
        )}
        {shot ? <Shot shot={shot} /> : <div className="muted">No screenshots in this Look.</div>}
      </div>
    </div>
  );
}

export function Checks({ ask }: { ask: Ask }) {
  if (!ask.look?.checks.length) return null;
  return (
    <div className="pv-checks">
      <h3>What to check</h3>
      <ul>
        {ask.look.checks.map((c) => (
          <li key={c}>{c}</li>
        ))}
      </ul>
    </div>
  );
}

/** The note: closed until asked for (key n), so a pick-and-send Card shows no empty field. */
export function Note({ card, always, placeholder, addLabel }: { card: Card; always?: boolean; placeholder?: string; addLabel?: string }) {
  const d = useDraftOf(card.key);
  const edit = useProto((s) => s.edit);
  const ref = useRef<HTMLTextAreaElement>(null);
  const open = always || d.noteOpen || !!d.note;
  if (!open)
    return (
      <button className="btn ghost pv-note-add" onClick={() => {
          edit(card.key, { noteOpen: true });
          requestAnimationFrame(() => ref.current?.focus());
        }}
      >
        {addLabel ?? "Add a note"} <kbd>n</kbd>
      </button>
    );
  return (
    <textarea
      ref={ref}
      className="input pv-note"
      data-note
      placeholder={placeholder ?? (kindOf(card) === "pr-approval" ? "Note (required to send back)" : kindOf(card) === "design-round" ? 'Comment, e.g. "header from a, list from b"' : "Answer in your own words, or add a note")}
      value={d.note}
      onChange={(e) => edit(card.key, { note: e.target.value })}
    />
  );
}

/** What Send will write, word for word. The trust device of every variant: the developer reads the comment before it exists. */
export function Written({ card, label = true }: { card: Card; label?: boolean }) {
  const d = useDraftOf(card.key);
  const text = literal(card, d);
  return (
    <div className="pv-written" data-empty={!text || undefined}>
      {label && (
        <span className="pv-written-label">
          Writes on {shortRepo(card.repo)}#{card.number}
        </span>
      )}
      {text ? <code>{text}</code> : <span className="faint">{whyNot(card, d) ?? "Nothing is written to GitHub"}</span>}
    </div>
  );
}

export function PushToggle({ card }: { card: Card }) {
  const d = useDraftOf(card.key);
  const edit = useProto((s) => s.edit);
  return (
    <label className="toggle" title="Tell the running coordinator right away">
      <input type="checkbox" checked={d.push} onChange={(e) => edit(card.key, { push: e.target.checked })} /> Push
    </label>
  );
}

export function Failure() {
  return (
    <div className="pv-failure" role="alert">
      <i className="pv-dot" data-tone="danger" aria-hidden />
      <span>
        <b>Not sent.</b> {FAILURE}
      </span>
    </div>
  );
}

/** What the developer got through, Card by Card, in the words that were written. The end of every variant. */
export function Receipt({ queue, status, onOpen }: { queue: Card[]; status: Record<string, Status>; onOpen?: (key: string) => void }) {
  const drafts = useProto((s) => s.drafts);
  const rows = queue.filter((c) => isDone(status[c.key]) || status[c.key] === "failed" || status[c.key] === "sending");
  if (!rows.length) return null;
  return (
    <ol className="pv-receipt">
      {rows.map((c) => {
        const d = drafts[c.key] ?? EMPTY;
        const st = status[c.key]!;
        const kind = kindOf(c) ?? "look";
        return (
          <li key={c.key} data-status={st} data-kind={kind}>
            <KindGlyph kind={kind} />
            <button className="pv-receipt-main" onClick={() => onOpen?.(c.key)} disabled={!onOpen}>
              <span className="pv-receipt-title">
                {c.title} <RepoTag repo={c.repo} number={c.number} />
              </span>
              {st === "seen" ? <span className="muted">Marked Seen. Leaves the Board in 7 days.</span> : <code>{literal(c, d) ?? ""}</code>}
              {st === "sent" && <span className="faint">{sets(c, d)}</span>}
              {st === "failed" && <span className="pv-danger">Not sent. {FAILURE}</span>}
            </button>
            <span className="pv-receipt-state">
              <i className="pv-dot" data-tone={st === "failed" ? "danger" : st === "sending" ? "waiting" : "ok"} aria-hidden />
              {st === "failed" ? "Not sent" : st === "sending" ? "Sending" : st === "seen" ? "Seen" : "Sent"}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

export function tallyOf(queue: Card[], status: Record<string, Status>): string {
  const sent = queue.filter((c) => status[c.key] === "sent").length;
  const seen = queue.filter((c) => status[c.key] === "seen").length;
  return [sent ? `${sent} answered` : "", seen ? `${seen} marked Seen` : ""].filter(Boolean).join(" and ");
}

export const sendable = (card: Card) => canSend(card, useProto.getState().drafts[card.key] ?? EMPTY);

export { VERDICTS };
