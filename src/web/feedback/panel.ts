// Registers what a Feedback panel (or a cover of Focus) does on `1`-`9` and ⌘↵, and its other actions, for the one window key handler
// and the palette (`panelKeys.ts`). Exactly one registration is live at a time: the one of the panel the developer is looking at.
import { useEffect, useRef } from "react";
import { panelKeys, type PanelChoice, type PanelExtra, type PanelKeys } from "../panelKeys.ts";

/** What a panel tells the keys and the palette about itself. */
export interface PanelSpec {
  pick: (n: number) => void;
  send: () => void;
  choices: PanelChoice[];
  canSend: boolean;
  /** buttons without a key besides Push (Reject a variant) */
  extras?: PanelExtra[];
  push: boolean;
  setPush: (p: boolean) => void;
}

/** Live while mounted and `on`. The functions may change on every render: the registration reads the latest ones. */
export function useRegisterPanel(cardKey: string, spec: PanelSpec, on: boolean) {
  const latest = useRef(spec);
  latest.current = spec;
  useEffect(() => {
    if (!on) return;
    const keys: PanelKeys = {
      cardKey,
      pick: (n) => latest.current.pick(n),
      send: () => latest.current.send(),
      choices: () => latest.current.choices,
      extras: () => [
        ...(latest.current.extras ?? []),
        { id: "push", label: latest.current.push ? "Push this Feedback: turn off" : "Push this Feedback: turn on", run: () => latest.current.setPush(!latest.current.push) },
      ],
      canSend: () => latest.current.canSend,
    };
    panelKeys.current = keys;
    return () => {
      if (panelKeys.current === keys) panelKeys.current = null;
    };
  }, [cardKey, on]);
}
