// Screenshot grouping and gallery navigation, pure so the keyboard model is unit-testable (job 4, job 10).
// A round groups by variant, a Look by state; inside a group desktop comes before mobile.
import type { Card, DesignRound, Screenshot } from "./types.ts";

export type Viewport = "desktop" | "mobile";
type Variant = DesignRound["variants"][number];

export interface ShotGroup {
  key: string | null;
  /** header text: `Variant a · Grouped list`, the Look state, or "" for shots without a group */
  title: string;
  summary: string;
  /** indices into `ShotNav.flat`, desktop first */
  indices: number[];
}

export interface ShotNav {
  /** gallery order: groups in order, desktop before mobile inside a group */
  flat: Screenshot[];
  groups: ShotGroup[];
  /** flat index -> group index */
  groupOf: number[];
}

const viewRank = (s: Screenshot) => (s.viewport === "desktop" ? 0 : s.viewport === "mobile" ? 1 : 2);

export function buildNav(shots: Screenshot[], variants: Variant[] = [], by: "variant" | "state" = "variant"): ShotNav {
  const declared = new Map(variants.map((v) => [v.key.toLowerCase(), v]));
  const keyOf = (s: Screenshot): string | null => {
    const raw = by === "variant" ? s.variant : s.state;
    if (!raw) return null;
    return (by === "variant" ? declared.get(raw.toLowerCase())?.key : null) ?? raw;
  };
  const order: (string | null)[] = by === "variant" ? variants.map((v) => v.key) : [];
  for (const s of shots) {
    const k = keyOf(s);
    if (k !== null && !order.includes(k)) order.push(k);
  }
  order.push(null);
  const groups: ShotGroup[] = [];
  const flat: Screenshot[] = [];
  const groupOf: number[] = [];
  for (const key of order) {
    const members = shots.map((s, i) => ({ s, i })).filter(({ s }) => keyOf(s) === key).sort((a, b) => viewRank(a.s) - viewRank(b.s) || a.i - b.i);
    if (!members.length) continue;
    const v = key === null ? undefined : declared.get(key.toLowerCase());
    const title = key === null ? "" : by === "state" ? key : v && v.name && v.name !== v.key ? `Variant ${key} · ${v.name}` : `Variant ${key}`;
    const indices = members.map(({ s }) => {
      flat.push(s);
      groupOf.push(groups.length);
      return flat.length - 1;
    });
    groups.push({ key, title, summary: v?.summary ?? "", indices });
  }
  return { flat, groups, groupOf };
}

export const stepIndex = (nav: ShotNav, i: number, dir: 1 | -1) => Math.max(0, Math.min(nav.flat.length - 1, i + dir));

/** In `group`, the shot in viewport `vp` (null: any), preferring the same state as `from`, else the first one. */
function pickIn(nav: ShotNav, group: ShotGroup, vp: Viewport | null, from: Screenshot | undefined): number | undefined {
  const inView = group.indices.filter((x) => vp === null || nav.flat[x]!.viewport === vp);
  const state = from?.state?.toLowerCase();
  return (state ? inView.find((x) => nav.flat[x]!.state?.toLowerCase() === state) : undefined) ?? inView[0];
}

/** First shot of group `g`, preferring the viewport the reader was looking at and the state they were looking at. Out of range: stay. */
export function jumpGroup(nav: ShotNav, i: number, g: number, pref: Viewport | null): number {
  const group = nav.groups[g];
  if (!group) return i;
  return pickIn(nav, group, pref, nav.flat[i]) ?? pickIn(nav, group, null, nav.flat[i])!;
}

export const nextGroup = (nav: ShotNav, i: number, dir: 1 | -1, pref: Viewport | null) => jumpGroup(nav, i, (nav.groupOf[i] ?? 0) + dir, pref);

/** The other viewport of the same group (same state when it has one), or stay when the group has only one. */
export function toggleViewport(nav: ShotNav, i: number): number {
  const cur = nav.flat[i]?.viewport;
  if (!cur) return i;
  const other: Viewport = cur === "desktop" ? "mobile" : "desktop";
  return pickIn(nav, nav.groups[nav.groupOf[i]!]!, other, nav.flat[i]) ?? i;
}

/** What the reader currently prefers: the shown shot's viewport, else the earlier preference. */
export const viewportPref = (nav: ShotNav, i: number, pref: Viewport | null): Viewport | null => nav.flat[i]?.viewport ?? pref;

export type ShotsTarget = "round" | "look" | "earlier";

/**
 * The panel of a Card detail that has screenshots to open from the palette, in the order the developer cares about:
 * the round that waits on them, the Look they still have to see, the rounds they can read. Null: nothing to open.
 * Mirrors what CardDetail renders, so the command is offered only when it does something.
 */
export function shotsTarget(card: Pick<Card, "waiting" | "phase" | "needsLook" | "rounds" | "look">): ShotsTarget | null {
  const last = card.rounds.at(-1);
  const roundWaits = card.waiting?.kind === "design-round" && !!last;
  if (roundWaits && last!.screenshots.length) return "round";
  if (card.phase === "Done" && card.needsLook && card.look?.screenshots.length) return "look";
  return (roundWaits ? card.rounds.slice(0, -1) : card.rounds).some((r) => r.screenshots.length) ? "earlier" : null;
}
