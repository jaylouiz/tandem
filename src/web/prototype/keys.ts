// PROTOTYPE (issue #8): the keys of the open ask, shared by the three variants.
import type { Card } from "../../core/types.ts";
import { askOfCard, useProto } from "./model.ts";
import { pick, reject, shotsOf, useView } from "./parts.tsx";

/** The open variant's own keys (navigation, send). Returns true when it took the key. */
export const variantKeys: { current: ((e: KeyboardEvent, typing: boolean) => boolean) | null } = { current: null };

/** Keys every variant shares for the open ask: digits pick, x rejects the shown variant, [ ] step the images, v the viewport, c side by side, n the note. */
export function askKeys(e: KeyboardEvent, card: Card | null): boolean {
  if (!card || e.metaKey || e.ctrlKey || e.altKey) return false;
  const ask = askOfCard(card);
  const view = useView.getState();
  if (/^[1-9]$/.test(e.key)) return pick(card, Number(e.key));
  const count = ask.round ? ask.options.length : shotsOf(ask).filter((s) => s.viewport === view.viewport).length;
  switch (e.key) {
    case "x":
      if (!ask.round) return false;
      reject(card, ask.options[view.shown]?.key ?? "");
      return true;
    case "[":
    case "]":
      if (count < 2) return false;
      view.set({ shown: (view.shown + (e.key === "]" ? 1 : count - 1)) % count, compare: false });
      return true;
    case "v":
      if (!shotsOf(ask).some((s) => s.viewport === "mobile")) return false;
      view.set({ viewport: view.viewport === "desktop" ? "mobile" : "desktop", shown: ask.round ? view.shown : 0 });
      return true;
    case "c":
      if (!ask.round) return false;
      view.set({ compare: !view.compare });
      return true;
    case "n":
      if (ask.kind === "look") return false;
      useProto.getState().edit(card.key, { noteOpen: true });
      requestAnimationFrame(() => document.querySelector<HTMLTextAreaElement>("[data-note]")?.focus());
      return true;
  }
  return false;
}

