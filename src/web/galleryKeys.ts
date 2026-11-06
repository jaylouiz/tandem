// The keys of the screenshot viewer (Gallery), in one table. The viewer's handler matches a keydown against it, its hint line and the shortcut
// overview (`?`) print from it. Dialog-owned: `handleKey` in keys.ts never sees them (the dialog is open).
import { keyCaps } from "./keys.ts";

export interface GalleryKey {
  id: "next" | "previous" | "variant" | "next-variant" | "previous-variant" | "viewport" | "pick" | "reject" | "send" | "close";
  keys: string[];
  mod?: boolean;
  label: string;
  /** only on the round the developer can still react to */
  reaction?: boolean;
}

export const GALLERY_KEYS: GalleryKey[] = [
  { id: "next", keys: ["ArrowRight", "l"], label: "Next screenshot" },
  { id: "previous", keys: ["ArrowLeft", "h"], label: "Previous screenshot" },
  { id: "variant", keys: ["1", "2", "3", "4", "5", "6", "7", "8", "9"], label: "Jump to a variant" },
  { id: "next-variant", keys: ["]"], label: "Next variant" },
  { id: "previous-variant", keys: ["["], label: "Previous variant" },
  { id: "viewport", keys: ["v"], label: "Switch desktop / mobile" },
  { id: "pick", keys: ["p"], label: "Pick the shown variant", reaction: true },
  { id: "reject", keys: ["x"], label: "Reject the shown variant", reaction: true },
  { id: "send", keys: ["Enter"], mod: true, label: "Send the reaction", reaction: true },
  { id: "close", keys: ["Escape"], label: "Close" },
];

/** The binding of a keydown in the viewer, or null. */
export function galleryKey(e: { key: string; metaKey: boolean; ctrlKey: boolean; altKey: boolean }): GalleryKey | null {
  const mod = e.metaKey || e.ctrlKey;
  if (e.altKey) return null;
  return GALLERY_KEYS.find((g) => !!g.mod === mod && g.keys.includes(e.key)) ?? null;
}

/** The first cap of the viewer key `id` (a tooltip's key). */
export const galleryCap = (id: GalleryKey["id"]) => keyCaps(GALLERY_KEYS.find((g) => g.id === id)!)[0]!;
