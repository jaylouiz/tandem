// What the keys of Focus do right now. The bindings live in the one key table (`keys.ts`, `when: "Focus"`); what each does depends on
// what is on screen (the start, a decision, a design round with its comment open …), so the frame and the cover on screen register it
// here, like a Feedback panel registers its digits (`panelKeys.ts`). The palette lists what is registered. Not in zustand: the functions
// change on every render.
import { useEffect, useRef } from "react";

/** The ids of the bindings Focus answers: its own (`focus-…`) and the two it takes over while it is on (Mark Seen, Esc). */
export type FocusKeyId = "focus-start" | "focus-note" | "focus-details" | "focus-side" | "focus-viewport" | "focus-step" | "focus-reject" | "seen" | "escape";

export interface FocusAct {
  /** what the palette calls it; `[` and `]` of one binding get one label each */
  label: string | Record<string, string>;
  /** false: not handled (the key goes on) */
  run: (e: KeyboardEvent) => void | false;
}

export type FocusActs = Partial<Record<FocusKeyId, FocusAct>>;

/** Two registrations at most: the frame's (start, details, back to the overview) and the cover's on top of it. */
const slots: { frame: { current: FocusActs } | null; cover: { current: FocusActs } | null } = { frame: null, cover: null };

/** Run what `id` does now. False when nothing is registered for it or the act passed. */
export function runFocusKey(id: FocusKeyId, e: KeyboardEvent): boolean {
  for (const acts of [slots.cover?.current, slots.frame?.current]) {
    const act = acts?.[id];
    if (act && act.run(e) !== false) return true;
  }
  return false;
}

/** The Focus keys that do something now, for the palette: one entry per key of a binding. */
export function liveFocusKeys(): { id: FocusKeyId; label: string; key?: string }[] {
  const out: { id: FocusKeyId; label: string; key?: string }[] = [];
  const seen = new Set<string>();
  for (const acts of [slots.cover?.current, slots.frame?.current])
    for (const [id, act] of Object.entries(acts ?? {}) as [FocusKeyId, FocusAct | undefined][]) {
      if (!act || seen.has(id)) continue;
      seen.add(id);
      if (typeof act.label === "string") out.push({ id, label: act.label });
      else for (const [key, label] of Object.entries(act.label)) out.push({ id, label, key });
    }
  return out;
}

/** Register `acts` for `slot` while mounted (and `on`). Only the acts that apply are passed; the latest functions are read at key time. */
export function useFocusKeys(slot: "frame" | "cover", acts: FocusActs, on = true) {
  const latest = useRef(acts);
  latest.current = acts;
  useEffect(() => {
    if (!on) return;
    slots[slot] = latest;
    return () => {
      if (slots[slot] === latest) slots[slot] = null;
    };
  }, [slot, on]);
}
