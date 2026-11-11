// PROTOTYPE (issue #8, never merged): three variants of the Feedback path on the Waiting on me route, chosen by ?variant=a|b|c.
// It reads the demo Cards from the real store and writes nothing: see model.ts.
import { useEffect, useMemo } from "react";
import { kindOf } from "../../core/ask.ts";
import type { Card } from "../../core/types.ts";
import { Covers } from "./Covers.tsx";
import { Desk } from "./Desk.tsx";
import { Run } from "./Run.tsx";
import { variantKeys } from "./keys.ts";
import { STATES, VARIANTS, fillDone, protoQueue, useProto } from "./model.ts";
import "./proto.css";

let lastKey = "";

function onKey(e: KeyboardEvent) {
  if (document.querySelector('[role="dialog"]')) return; // the palette, the shortcut overview: theirs
  const el = e.target as HTMLElement | null;
  const typing = !!el && (el.tagName === "TEXTAREA" || el.tagName === "INPUT" || el.isContentEditable) && (el as HTMLInputElement).type !== "checkbox";
  const chord = lastKey === "g";
  lastKey = e.key;
  if (typing) {
    if (e.key === "Escape") {
      el.blur();
      e.stopPropagation();
    } else if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && variantKeys.current?.(e, true)) {
      e.preventDefault();
      e.stopPropagation();
    }
    return;
  }
  if (variantKeys.current?.(e, false)) {
    e.preventDefault();
    e.stopPropagation();
    return;
  }
  // the app's own single keys act on the real Board (mark Seen, move a Card): the prototype keeps them out, except "go to" chords, ? and the palette
  if (!e.metaKey && !e.ctrlKey && !e.altKey && e.key.length === 1 && e.key !== "g" && e.key !== "?" && !chord) e.stopPropagation();
  if (e.key === "Escape") e.stopPropagation();
}

export function Prototype({ cards }: { cards: Card[] }) {
  const variant = useProto((s) => s.variant);
  const state = useProto((s) => s.state);
  const queue = useMemo(() => protoQueue(cards, state === "done" ? "session" : state), [cards, state]);
  const ready = queue.length > 0 || state === "empty";

  useEffect(() => {
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  // "Finished" fills the session; ?at=<kind> opens the first ask of that kind (the screenshots use it)
  useEffect(() => {
    if (!queue.length) return;
    const s = useProto.getState();
    if (state === "done" && !Object.keys(s.status).length) fillDone(queue);
    else if (s.at) {
      const first = queue.find((c) => kindOf(c) === s.at);
      if (first) useProto.setState({ current: first.key, started: true, at: null }); // the Board may still be syncing: keep asking until the Card is there
    }
  }, [queue, state, variant]);

  if (!ready) return <div className="empty">Loading…</div>;
  return variant === "a" ? <Covers queue={queue} /> : variant === "b" ? <Run queue={queue} /> : <Desk queue={queue} />;
}

/** The prototype's own bar, under the app: which variant, which situation, and the two switches the round asks for (a failed send, the theme). */
export function Switcher() {
  const { variant, state, fail, set } = useProto();
  const dark = () => getComputedStyle(document.documentElement).colorScheme === "dark";
  return (
    <div className="pv-switch" role="toolbar" aria-label="Prototype">
      <span className="pv-switch-tag">Prototype #8</span>
      <span className="pv-switch-group" role="group" aria-label="Variant">
        {VARIANTS.map((v) => (
          <button key={v.key} aria-pressed={variant === v.key} title={v.line} onClick={() => set({ variant: v.key })}>
            <b>{v.key.toUpperCase()}</b> {v.name}
          </button>
        ))}
      </span>
      <span className="pv-switch-group" role="group" aria-label="Situation">
        {STATES.map((s) => (
          <button key={s.key} aria-pressed={state === s.key} onClick={() => set({ state: s.key })}>
            {s.name}
          </button>
        ))}
      </span>
      <label>
        <input type="checkbox" checked={fail} onChange={(e) => set({ fail: e.target.checked })} /> Fail the next send
      </label>
      <button
        onClick={() => {
          document.documentElement.dataset.theme = dark() ? "light" : "dark";
        }}
      >
        Light / dark
      </button>
      <span className="pv-switch-note">{VARIANTS.find((v) => v.key === variant)?.line}. Demo data, nothing is written.</span>
    </div>
  );
}
