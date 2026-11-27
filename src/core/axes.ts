// Axes of a design round. A round that asks more than one question in one prototype (a design batch, agent-workflow
// aw-ui-design "Several issues on one surface") has the main variants (`a`, `b`, `c`) and further axes the developer
// combines freely with them (`slide`: `o`, `a`). A variant of a further axis is keyed `<axis>=<option>` (`slide=a`), so
// screenshots, picks and rejects stay plain string keys; a main variant keeps its bare key, as in a one-question round.
import type { DesignRound } from "./types.ts";

type Variant = DesignRound["variants"][number];

export const axisKey = (axis: string, option: string) => `${axis}=${option}`;

/** `slide=a` -> { axis: "slide", option: "a" }; a main key has no axis. */
export function splitKey(key: string): { axis: string | null; option: string } {
  const at = key.indexOf("=");
  return at > 0 ? { axis: key.slice(0, at), option: key.slice(at + 1) } : { axis: null, option: key };
}

/** How a key reads to a person: `a`, `slide a`. */
export const keyLabel = (key: string) => {
  const { axis, option } = splitKey(key);
  return axis ? `${axis} ${option}` : option;
};

export interface AxisGroup {
  /** null for the main variants */
  name: string | null;
  about: string;
  variants: Variant[];
}

/** The round's variants per axis, main first; a one-question round is one group. */
export function axesOf(round: Pick<DesignRound, "variants" | "axes">): AxisGroup[] {
  const groups: AxisGroup[] = [{ name: null, about: "", variants: round.variants.filter((v) => v.axis === null) }];
  for (const a of round.axes) groups.push({ name: a.name, about: a.about, variants: round.variants.filter((v) => v.axis === a.name) });
  return groups.filter((g) => g.name === null || g.variants.length);
}

/** Picks with `key` as the one pick of its axis (an earlier pick on that axis gives way). */
export function pickOnAxis(picks: string[], key: string): string[] {
  const axis = splitKey(key).axis;
  return [...picks.filter((k) => splitKey(k).axis !== axis), key];
}

/** Every axis of the round has exactly one pick: a combination that is an answer of its own. */
export function isComplete(round: Pick<DesignRound, "variants" | "axes">, picks: string[]): boolean {
  return axesOf(round).every((g) => g.variants.filter((v) => picks.includes(v.key)).length === 1);
}

/** Keys grouped by axis in first-seen order, main first: [axis, options]. */
export function byAxis(keys: string[]): [string | null, string[]][] {
  const out = new Map<string | null, string[]>([[null, []]]);
  for (const k of keys) {
    const { axis, option } = splitKey(k);
    out.set(axis, [...(out.get(axis) ?? []), option]);
  }
  return [...out].filter(([, options]) => options.length);
}
