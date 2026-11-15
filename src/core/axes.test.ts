import { describe, expect, it } from "vitest";
import { askOf } from "./ask.ts";
import { axesOf, byAxis, isComplete, keyLabel, pickOnAxis, splitKey } from "./axes.ts";
import { digestThread, parseMarker, roundReactionComment } from "./contract.ts";
import { axesRoundBody, roundBody } from "./fixtures.ts";
import { buildNav } from "./gallery.ts";
import type { Card, RawComment } from "./types.ts";

const c = (body: string, id = "IC_1"): RawComment => ({ id, author: "u", body, createdAt: "2026-11-13T09:31:53Z", url: "https://github.com/x/y/issues/1#issuecomment-1" });
const round = (body: string) => digestThread([c(body)]).rounds[0]!;

describe("a round with further axes (`Axis <name>: <keys> (<about>)`)", () => {
  const r = round(axesRoundBody(1, "Welcome samples"));

  it("keys the main variants bare and every further axis's as <axis>=<option>, main first", () => {
    expect(r.variants.map((v) => [v.key, v.axis, v.name])).toEqual([
      ["a", null, "Three equal rows"],
      ["b", null, "Explore row set apart"],
      ["slide=o", "slide", "Fade and lift"],
      ["slide=a", "slide", "Sideways slide"],
      ["back=o", "back", "Text link"],
      ["back=a", "back", "Arrow button"],
    ]);
    expect(r.axes).toEqual([
      { name: "slide", about: "how one step gives way to the next" },
      { name: "back", about: "the way back to the choice" },
    ]);
  });

  it("reads `R1 · slide a · desktop` as that axis's variant and titles its gallery group", () => {
    expect(r.screenshots.map((s) => s.variant)).toEqual(["a", "a", "b", "slide=a", "back=o", "back=a"]);
    const nav = buildNav(r.screenshots, r.variants);
    expect(nav.groups.map((g) => g.title)).toEqual(["Variant a · Three equal rows", "Variant b · Explore row set apart", "slide a · Sideways slide", "back o · Text link", "back a · Arrow button"]);
  });

  it("says the axes in the one-line ask", () => {
    const card = { waiting: { kind: "design-round", since: "", requestId: null }, rounds: [r], requests: [] } as unknown as Card;
    expect(askOf(card)).toBe("Round 1, 2 variants plus slide, back: Which layout (a or b), which slide (o or a) and which way back (o or a)?");
  });

  it("leaves a one-question round as it was: no axes, every variant on the main axis", () => {
    const one = round(roundBody(1, "T"));
    expect(one.axes).toEqual([]);
    expect(one.variants.map((v) => [v.key, v.axis])).toEqual([
      ["a", null],
      ["b", null],
      ["c", null],
    ]);
  });
});

// The shapes agents wrote before the Axis line was pinned (jaylouiz/kan-do #236 and #296, round 1), URLs replaced.
describe("older rounds with axes on the Variants line (read only)", () => {
  it("reads `Variants: a, b, c (samples) · slide: o, a · back: o, a, b (…)` and whole-axis headings", () => {
    const body = `<!-- decision-note round R1 -->
## Design round 1: Welcome flow
Preview: https://example.test/welcome?variant=a&v236slide=a&v236back=a
Variants: a, b, c (samples) · slide: o, a · back: o, a, b (three independent switcher rows, combine freely)
### a: Three equal rows
Noch nirgends · In Notion · Beispielaufgaben · tech check: S, none
### b: Explore row, set apart
Two rows · tech check: S, none
### c: Link under the rows
Two rows, samples is a ghost button · tech check: S, none
### slide: o fade + lift (today) vs a sideways slide
a: forward leaves left · tech check: S, none
### back: o text · a arrow button · b arrow link
a: ghost button · tech check: S, none
**Question:** Which samples layout (a, b, c), slide (o, a) and back control (o, a, b)?

![R1 · a · desktop](u1)
![R1 · a-step2 · desktop](u2)
![R1 · slide-a · desktop](u3)
![R1 · back-b · mobile](u4)`;
    const r = round(body);
    expect(r.variants.map((v) => v.key)).toEqual(["a", "b", "c", "slide=o", "slide=a", "back=o", "back=a", "back=b"]);
    expect(r.axes).toEqual([
      { name: "slide", about: "o fade + lift (today) vs a sideways slide" },
      { name: "back", about: "o text · a arrow button · b arrow link" },
    ]);
    expect(r.screenshots.map((s) => [s.variant, s.state])).toEqual([
      ["a", null],
      ["a", "step2"],
      ["slide=a", null],
      ["back=b", null],
    ]);
  });

  it("reads a one-option axis `· m=a (menu content)` and its `### m=a:` heading", () => {
    const body = `<!-- decision-note round R1 -->
## Design round 1: Context menu overhaul
Variants: a, b, c (phone) · m=a (menu content, independent switcher row)
### a: Card button + anchored menu
Round button · tech check: S
### m=a: Menu content (all variants and desktop)
Visible hover, icons · tech check: S
**Question:** Which phone way, and do you want the extended menu content (m=a)?

![R1 · a · mobile](u1)
![R1 · m=a · desktop](u2)`;
    const r = round(body);
    expect(r.variants.map((v) => [v.key, v.axis, v.name])).toEqual([
      ["a", null, "Card button + anchored menu"],
      ["b", null, "b"],
      ["c", null, "c"],
      ["m=a", "m", "Menu content (all variants and desktop)"],
    ]);
    expect(r.axes).toEqual([{ name: "m", about: "menu content, independent switcher row" }]);
    expect(r.screenshots.map((s) => s.variant)).toEqual(["a", "m=a"]);
  });

  it("drops a note in parentheses from the keys of a one-question round", () => {
    const r = round("<!-- decision-note round R1 -->\n## Design round 1: x\nVariants: a, b, c (plus an independent chart switch: o = none, a = time bar)\n");
    expect(r.variants.map((v) => v.key)).toEqual(["a", "b", "c"]);
  });
});

describe("picks across axes", () => {
  const r = round(axesRoundBody(1, "T"));

  it("splits and labels keys", () => {
    expect(splitKey("slide=a")).toEqual({ axis: "slide", option: "a" });
    expect(splitKey("b")).toEqual({ axis: null, option: "b" });
    expect(keyLabel("slide=a")).toBe("slide a");
    expect(axesOf(r).map((g) => [g.name, g.variants.length])).toEqual([
      [null, 2],
      ["slide", 2],
      ["back", 2],
    ]);
  });

  it("keeps one pick per axis and is complete once every axis has exactly one", () => {
    let picks = pickOnAxis([], "a");
    picks = pickOnAxis(picks, "slide=o");
    expect(isComplete(r, picks)).toBe(false);
    picks = pickOnAxis(picks, "slide=a"); // gives way on its axis
    picks = pickOnAxis(picks, "b");
    expect(picks).toEqual(["slide=a", "b"]);
    picks = pickOnAxis(picks, "back=a");
    expect(isComplete(r, picks)).toBe(true);
    expect(isComplete(r, [...picks, "a"])).toBe(false); // two on the main axis: a reaction to compose, not a combination
    expect(isComplete(round(roundBody(1, "T")), ["b"])).toBe(true);
  });

  it("writes one line per axis, main first, unmarked", () => {
    expect(byAxis(["slide=a", "b", "back=a"])).toEqual([
      [null, ["b"]],
      ["slide", ["a"]],
      ["back", ["a"]],
    ]);
    const text = roundReactionComment({ round: 1, picks: ["b", "slide=a", "back=a"], rejects: ["back=o"], comment: "arrow a bit smaller" });
    expect(text).toBe("R1:\n- pick: b\n- pick slide: a\n- pick back: a\n- reject back: o\n\narrow a bit smaller");
    expect(parseMarker(text)).toBeNull();
    expect(roundReactionComment({ round: 2, picks: ["slide=a"], rejects: [], comment: "" })).toBe("R2:\n- pick slide: a");
  });
});
