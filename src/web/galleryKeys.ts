// The keys of the screenshot viewer (Gallery), in one table. The viewer's handler matches a keydown against it, its legend and the shortcut
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

/** A group of keys in a legend: its name, then each key with what it does. */
export interface LegendGroup {
  name: string;
  items: { caps: string[]; text: string }[];
}

/** The legend's shape (#5): three groups, the keys that answer first. Each entry names bindings of `GALLERY_KEYS` (their first caps are shown) and says what they do in a word or two. */
const LEGEND: { name: string; items: { ids: GalleryKey["id"][]; text: string; caps?: string[] }[] }[] = [
  { name: "Pick", items: [{ ids: ["pick"], text: "pick" }, { ids: ["reject"], text: "reject" }, { ids: ["send"], text: "send" }] },
  { name: "Move", items: [{ ids: ["previous", "next"], text: "screenshot" }, { ids: ["previous-variant", "next-variant"], text: "variant" }, { ids: ["variant"], text: "jump to a variant" }] },
  { name: "View", items: [{ ids: ["viewport"], text: "desktop / mobile" }, { ids: ["close"], text: "close" }] },
];

/** The viewer's legend, printed from the key table. `reaction`: the round still takes one (else the Pick group is absent and Move comes first). */
export function galleryLegend(reaction: boolean): LegendGroup[] {
  const key = (id: GalleryKey["id"]) => GALLERY_KEYS.find((g) => g.id === id)!;
  return LEGEND.map((g) => ({
    name: g.name,
    items: g.items.filter((it) => reaction || !it.ids.some((id) => key(id).reaction)).map((it) => ({ caps: it.ids.map((id) => keyCaps(key(id))[0]!), text: it.text })),
  })).filter((g) => g.items.length);
}

/** The first cap of the viewer key `id` (a tooltip's key). */
export const galleryCap = (id: GalleryKey["id"]) => keyCaps(GALLERY_KEYS.find((g) => g.id === id)!)[0]!;
