// Notices become toasts: every `setNotice` in the store is shown on the one toast stack (`ui/Toast.tsx`), where it keeps its own timer and Undo.
import { useEffect } from "react";
import type { Card } from "../core/types.ts";
import { startCoordinator } from "./components/CardPane.tsx";
import { currentCards, useStore, type PushNotice } from "./store.ts";
import { showToast, type ToastSpec } from "./ui/Toast.tsx";

/** How long a toast stays, by what it offers: Start coordinator is a decision (10 s), an Undo a second chance (8 s), the rest a confirmation (4 s). Failures and work in progress stay. */
const MS = { start: 10_000, undo: 8000, plain: 4000 };

/** The toast for a notice. `cards` reads every Card of the Board when the button is pressed (a "Start coordinator" without its own list starts the notice's Card). */
export function noticeSpec(n: PushNotice, cards: () => Card[], start: (cards: Card[]) => void = (c) => void startCoordinator(c)): ToastSpec {
  return {
    id: n.id,
    text: n.text,
    failed: n.failed,
    timeout: n.busy ? 0 : n.canStart ? MS.start : n.undo ? MS.undo : MS.plain,
    undo: n.undo,
    action: n.canStart
      ? {
          label: "Start coordinator",
          run: () => {
            const c = cards().find((x) => x.key === n.key);
            const who = n.start?.length ? n.start : c ? [c] : [];
            if (who.length) start(who);
          },
        }
      : undefined,
  };
}

/** The notice already shown: a notice raised before the stack mounted (a restored link whose Card is gone, #48) is shown on mount, never twice (StrictMode mounts twice). */
let shown: PushNotice | null = null;

/** Mount once (App): each notice the store raises is shown at once, also several in one tick. */
export function useNoticeToasts() {
  useEffect(() => {
    const show = (n: PushNotice | null) => {
      if (!n || n === shown) return;
      shown = n;
      showToast(noticeSpec(n, () => currentCards({ ...useStore.getState(), repoFilter: null })));
    };
    show(useStore.getState().notice);
    return useStore.subscribe((s, prev) => {
      if (s.notice !== prev.notice) show(s.notice);
    });
  }, []);
}
