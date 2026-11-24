import { describe, expect, it } from "vitest";
import { buildNav, jumpGroup, nextGroup, shotGroups, shotsTarget, stepIndex, toggleViewport, viewportPref } from "./gallery.ts";
import type { Card, Screenshot } from "./types.ts";

const shot = (variant: string | null, viewport: Screenshot["viewport"], state: string | null = null): Screenshot => ({ src: `${variant}-${viewport}-${state}`, alt: `${variant} ${viewport}`, variant, viewport, state });
const variants = [
  { key: "a", name: "Grouped list", summary: "One list" },
  { key: "b", name: "Split pane", summary: "Master-detail" },
];

describe("buildNav", () => {
  it("orders by declared variant, desktop before mobile, ungrouped last", () => {
    const nav = buildNav([shot("b", "mobile"), shot(null, null), shot("a", "mobile"), shot("b", "desktop"), shot("a", "desktop"), shot("z", "desktop")], variants);
    expect(nav.flat.map((s) => s.src)).toEqual(["a-desktop-null", "a-mobile-null", "b-desktop-null", "b-mobile-null", "z-desktop-null", "null-null-null"]);
    expect(nav.groups.map((g) => g.title)).toEqual(["Variant a · Grouped list", "Variant b · Split pane", "Variant z", ""]);
    expect(nav.groups[0]!.summary).toBe("One list");
    expect(nav.groupOf).toEqual([0, 0, 1, 1, 2, 3]);
  });

  it("matches variant keys case-insensitively and keeps the declared spelling", () => {
    const nav = buildNav([shot("A", "desktop")], variants);
    expect(nav.groups.map((g) => g.key)).toEqual(["a"]);
  });

  it("groups a Look by state", () => {
    const nav = buildNav([shot(null, "mobile", "empty"), shot(null, "desktop", "default"), shot(null, "desktop", "empty")], [], "state");
    expect(nav.groups.map((g) => g.title)).toEqual(["empty", "default"]);
    expect(nav.flat.map((s) => s.src)).toEqual(["null-desktop-empty", "null-mobile-empty", "null-desktop-default"]);
  });

  it("copes with no screenshots", () => {
    expect(buildNav([], variants)).toEqual({ flat: [], groups: [], groupOf: [] });
  });
});

describe("a round in the question format groups its screenshots by question", () => {
  it("one group per question, titled as the alt names it", () => {
    const round = {
      variants: [{ key: "1A", name: "Rail", summary: "", axis: null }],
      questions: [
        { n: 1, label: "Shell", about: "where back and next sit", options: [], why: "", shots: [0, 1] },
        { n: 2, label: "Heading", about: "the step heading", options: [], why: "", shots: [2] },
      ],
    };
    const groups = shotGroups(round);
    expect(groups.map((g) => g.key)).toEqual(["1. Shell", "2. Heading"]);
    const nav = buildNav([shot("1. Shell", null), shot("2. Heading", null), shot("1. Shell", null)], groups);
    expect(nav.groups.map((g) => [g.title, g.indices.length])).toEqual([["1. Shell · where back and next sit", 2], ["2. Heading · the step heading", 1]]);
  });
  it("a round in the older shape keeps its variants", () => {
    const older = { variants: [{ key: "a", name: "Grouped list", summary: "", axis: null }], questions: [] };
    expect(shotGroups(older)).toBe(older.variants);
  });
});

describe("navigation", () => {
  const nav = buildNav([shot("a", "desktop"), shot("a", "mobile"), shot("b", "desktop"), shot("b", "mobile"), shot("c", "desktop")], variants);
  it("steps and clamps", () => {
    expect(stepIndex(nav, 0, -1)).toBe(0);
    expect(stepIndex(nav, 4, 1)).toBe(4);
    expect(stepIndex(nav, 1, 1)).toBe(2);
  });
  it("jumps to the nth variant keeping the viewport when it exists", () => {
    expect(jumpGroup(nav, 0, 1, "mobile")).toBe(3);
    expect(jumpGroup(nav, 0, 2, "mobile")).toBe(4); // c has desktop only
    expect(jumpGroup(nav, 0, 1, null)).toBe(2);
    expect(jumpGroup(nav, 1, 9, "desktop")).toBe(1); // out of range: stay
  });
  it("moves to the previous and next variant, stopping at the ends", () => {
    expect(nextGroup(nav, 1, 1, "mobile")).toBe(3);
    expect(nextGroup(nav, 3, -1, "desktop")).toBe(0);
    expect(nextGroup(nav, 0, -1, "desktop")).toBe(0);
    expect(nextGroup(nav, 4, 1, "desktop")).toBe(4);
  });
  it("toggles the viewport inside a variant, no-op without the other one", () => {
    expect(toggleViewport(nav, 0)).toBe(1);
    expect(toggleViewport(nav, 1)).toBe(0);
    expect(toggleViewport(nav, 4)).toBe(4);
  });
  it("remembers the viewport across variants (v then ])", () => {
    let i = toggleViewport(nav, 0); // a desktop -> a mobile
    let pref = viewportPref(nav, i, null);
    i = nextGroup(nav, i, 1, pref); // -> b mobile
    pref = viewportPref(nav, i, pref);
    expect(nav.flat[i]!.src).toBe("b-mobile-null");
    i = nextGroup(nav, i, 1, pref); // c has desktop only
    pref = viewportPref(nav, i, pref);
    expect(nav.flat[i]!.src).toBe("c-desktop-null");
    expect(pref).toBe("desktop");
  });
});

describe("states inside a variant (older rounds: a / a opened, desktop and mobile)", () => {
  const nav = buildNav([shot("a", "desktop", "rest"), shot("a", "desktop", "opened"), shot("a", "mobile", "rest"), shot("a", "mobile", "opened"), shot("b", "desktop", "opened"), shot("b", "mobile", "rest")], variants);
  const at = (src: string) => nav.flat.findIndex((s) => s.src === src);
  it("v keeps the state", () => {
    expect(nav.flat[toggleViewport(nav, at("a-desktop-opened"))]!.src).toBe("a-mobile-opened");
    expect(nav.flat[toggleViewport(nav, at("a-mobile-rest"))]!.src).toBe("a-desktop-rest");
  });
  it("v falls back to the first shot of the other viewport without that state", () => {
    expect(nav.flat[toggleViewport(nav, at("b-desktop-opened"))]!.src).toBe("b-mobile-rest");
  });
  it("jumping to another variant keeps viewport and state", () => {
    expect(nav.flat[jumpGroup(nav, at("a-mobile-opened"), 1, "mobile")]!.src).toBe("b-mobile-rest"); // b has no opened mobile
    expect(nav.flat[jumpGroup(nav, at("a-desktop-opened"), 1, "desktop")]!.src).toBe("b-desktop-opened");
    expect(nav.flat[nextGroup(nav, at("b-desktop-opened"), -1, "mobile")]!.src).toBe("a-mobile-opened");
  });
});

describe("shotsTarget: which panel the palette's \"Open screenshots\" opens", () => {
  const withShots = [shot("a", "desktop")];
  const round = (n: number, screenshots: Screenshot[]) => ({ round: n, screenshots });
  const card = (c: { waiting?: boolean; phase?: string; needsLook?: boolean; rounds?: ReturnType<typeof round>[]; look?: Screenshot[] | null }) =>
    ({ waiting: c.waiting ? { kind: "design-round" } : null, phase: c.phase ?? "Design", needsLook: !!c.needsLook, rounds: c.rounds ?? [], look: c.look ? { screenshots: c.look } : null }) as unknown as Card;
  it("the waiting round when it has shots", () => {
    expect(shotsTarget(card({ waiting: true, rounds: [round(1, withShots), round(2, withShots)] }))).toBe("round");
  });
  it("earlier rounds when the waiting round has none", () => {
    expect(shotsTarget(card({ waiting: true, rounds: [round(1, withShots), round(2, [])] }))).toBe("earlier");
  });
  it("earlier rounds of a Card that waits for nothing", () => {
    expect(shotsTarget(card({ rounds: [round(1, withShots)] }))).toBe("earlier");
  });
  it("the Look for a Done Card that needs one", () => {
    expect(shotsTarget(card({ phase: "Done", needsLook: true, look: withShots, rounds: [round(1, withShots)] }))).toBe("look");
  });
  it("a Done Card whose Look is missing or empty falls back to its rounds, then to nothing", () => {
    expect(shotsTarget(card({ phase: "Done", needsLook: true, look: null, rounds: [round(1, withShots)] }))).toBe("earlier");
    expect(shotsTarget(card({ phase: "Done", needsLook: true, look: null, rounds: [round(1, [])] }))).toBeNull();
  });
  it("nothing for a Card whose only screenshots sit in a Look that is not shown", () => {
    expect(shotsTarget(card({ phase: "Review", needsLook: false, look: withShots }))).toBeNull();
    expect(shotsTarget(card({ waiting: true, rounds: [round(1, [])] }))).toBeNull();
  });
});
