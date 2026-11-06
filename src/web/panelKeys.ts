// The open Feedback panel's keys and actions. The panel registers what `1`-`9` and ⌘↵ do for the Card it shows, and the other things its buttons
// do; the one window key handler (App.tsx) and the palette (actions.ts) read it. Not in zustand: the functions change on every render.

/** What a digit does in the panel right now: `n` is the key, `on` whether it is the current choice. */
export interface PanelChoice {
  n: number;
  label: string;
  on: boolean;
}

/** A panel button without a key (Reject a variant, the Push toggle). */
export interface PanelExtra {
  id: string;
  label: string;
  run: () => void;
}

export interface PanelKeys {
  cardKey: string;
  /** `1`-`9`: pick the nth choice (a no-op beyond the last one) */
  pick: (n: number) => void;
  /** ⌘↵: send the chosen action; does nothing when nothing is chosen */
  send: () => void;
  /** the digits' meaning, in order */
  choices: () => PanelChoice[];
  extras: () => PanelExtra[];
  /** whether Send would write now */
  canSend: () => boolean;
}

export const panelKeys: { current: PanelKeys | null } = { current: null };
