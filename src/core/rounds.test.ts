import { describe, expect, it } from "vitest";
import { digestThread, parseMarker, parseScreenshots } from "./contract.ts";
import { buildNav } from "./gallery.ts";
import { alignImages, parseHtmlImages } from "./images.ts";
import { roundBody } from "./fixtures.ts";
import type { RawComment } from "./types.ts";

const c = (body: string, id = "IC_1"): RawComment => ({ id, author: "u", body, createdAt: "2026-11-04T10:00:00Z", url: "https://github.com/x/y/issues/1#issuecomment-1" });

// Shape of acme/app #605 round 2 (older agent-workflow: plain note marker, loose alt texts), URLs replaced.
const legacy = `<!-- decision-note -->
## Design round 2 (final): A on its own green surface

**Applied your answer:** variant A.

### Screenshots (3 done yesterday, 1 today)

**Collapsed**
![a desktop](https://github.com/user-attachments/assets/00000000-0000-0000-0000-000000000001) ![a mobile](https://github.com/user-attachments/assets/00000000-0000-0000-0000-000000000002)

**Opened**
![a opened desktop](https://github.com/user-attachments/assets/00000000-0000-0000-0000-000000000003) ![a opened mobile](https://github.com/user-attachments/assets/00000000-0000-0000-0000-000000000004)

![a single](https://github.com/user-attachments/assets/00000000-0000-0000-0000-000000000005)`;

describe("older round shape (read only)", () => {
  it("reads a plain note with `## Design round <k>` as round k", () => {
    const { rounds } = digestThread([c(legacy)]);
    expect(rounds).toHaveLength(1);
    expect(rounds[0]).toMatchObject({ round: 2, title: "Design round 2 (final): A on its own green surface", commentId: "IC_1" });
    expect(rounds[0]!.screenshots).toHaveLength(5);
  });

  it("reads variant, viewport and state out of loose alt texts", () => {
    const shots = digestThread([c(legacy)]).rounds[0]!.screenshots;
    expect(shots.map((s) => [s.variant, s.viewport, s.state])).toEqual([
      ["a", "desktop", null],
      ["a", "mobile", null],
      ["a", "desktop", "opened"],
      ["a", "mobile", "opened"],
      ["a", null, "single"],
    ]);
  });

  it("treats a width as the viewport and needs a declared key once variants are declared", () => {
    const body = `<!-- decision-note -->\n## Design round 1: x\n### A: One line\nsummary\n### B: Two\nsummary\n![A 1280](u1) ![B 390](u2) ![Current 1280](u3) ![D open](u4)`;
    const shots = digestThread([c(body)]).rounds[0]!.screenshots;
    expect(shots.map((s) => [s.variant, s.viewport, s.state])).toEqual([
      ["A", "desktop", null],
      ["B", "mobile", null],
      [null, "desktop", "Current"],
      [null, null, "D open"],
    ]);
    const nav = buildNav(shots, digestThread([c(body)]).rounds[0]!.variants);
    expect(nav.groups.map((g) => g.title)).toEqual(["Variant A · One line", "Variant B · Two", ""]);
  });

  it("reads step numbers and dashes in shot names seen in real rounds (a3, B2 resting 390, c-rest-390)", () => {
    const body = `<!-- decision-note -->\n## Design round 1: x\n### A: One\ns\n### B: Two\ns\n### C: Three\ns\n![a3x desktop](u1) ![B resting 390](u2) ![c-rest-390](u3) ![o3 mobile](u4) ![current collapse](u5) ![A expand](u6)`;
    const shots = digestThread([c(body)]).rounds[0]!.screenshots;
    expect(shots.map((s) => [s.variant, s.viewport, s.state])).toEqual([
      ["A", "desktop", null],
      ["B", "mobile", "resting"],
      ["C", "mobile", "rest"],
      [null, "mobile", "o3"],
      [null, null, "current collapse"],
      ["A", null, "expand"],
    ]);
    const undeclared = digestThread([c("<!-- decision-note -->\n## Design round 2: x\n![B2 resting desktop](u1) ![B2 collapse 390](u2)")]).rounds[0]!.screenshots;
    expect(undeclared.map((s) => [s.variant, s.viewport, s.state])).toEqual([
      ["B", "desktop", "resting"],
      ["B", "mobile", "collapse"],
    ]);
  });

  it("does not turn other plain notes into rounds", () => {
    const notes = ["<!-- decision-note -->\nDesign closed (round 2, D2): UX decision is in the issue body.", "<!-- decision-note -->\n## Review of PR #3\nDesign round 4 mentioned here", "<!-- decision-note -->\nPR: https://github.com/x/y/pull/1"];
    expect(digestThread(notes.map((n) => c(n))).rounds).toEqual([]);
  });

  it("gives the strict and the older shape the same round", () => {
    const strict = digestThread([c(roundBody(2, "T"))]).rounds[0]!;
    const older = digestThread([c(roundBody(2, "T").replace("round R2 ", ""))]).rounds[0]!;
    expect(older).toEqual(strict);
  });

  it("keeps the marker strict: a plain note stays a note without subtype", () => {
    expect(parseMarker(legacy)).toMatchObject({ kind: "note", note: null });
  });

  it("does not guess alt texts outside a round (no loose option)", () => {
    expect(parseScreenshots("![a desktop](u)")).toEqual([{ src: "u", alt: "a desktop", variant: null, viewport: null, state: null }]);
  });
});

describe("alignImages", () => {
  const html = `<p dir="auto"><strong>Collapsed</strong><br>
<a target="_blank" href="https://private-user-images.githubusercontent.com/1/2-aaa.png?jwt=X"><img src="https://private-user-images.githubusercontent.com/1/2-aaa.png?jwt=X&amp;b=1" alt="a desktop" style="max-width: 100%;"></a>
<a href="u"><img alt="a mobile" src="https://private-user-images.githubusercontent.com/1/2-bbb.png?jwt=Y"></a>
<a href="u"><img src="https://private-user-images.githubusercontent.com/1/2-ccc.png?jwt=Z" alt="a mobile"></a></p>`;

  it("reads img tags in document order, in any attribute order, unescaped", () => {
    expect(parseHtmlImages(html)).toEqual([
      { alt: "a desktop", src: "https://private-user-images.githubusercontent.com/1/2-aaa.png?jwt=X&b=1" },
      { alt: "a mobile", src: "https://private-user-images.githubusercontent.com/1/2-bbb.png?jwt=Y" },
      { alt: "a mobile", src: "https://private-user-images.githubusercontent.com/1/2-ccc.png?jwt=Z" },
    ]);
  });

  it("maps by alt text, k-th duplicate to k-th, and falls back to the raw src", () => {
    const shots = parseScreenshots("![a mobile](r1) ![a desktop](r2) ![a mobile](r3) ![gone](r4)");
    expect(alignImages(shots, parseHtmlImages(html))).toEqual([
      "https://private-user-images.githubusercontent.com/1/2-bbb.png?jwt=Y",
      "https://private-user-images.githubusercontent.com/1/2-aaa.png?jwt=X&b=1",
      "https://private-user-images.githubusercontent.com/1/2-ccc.png?jwt=Z",
      "r4",
    ]);
  });

  it("keeps markdown and html images in the parse order, whatever the document order", () => {
    const shots = parseScreenshots('<img alt="first" src="h1"> ![second](m1)'); // parse order: markdown first
    const rendered = parseHtmlImages('<img src="S1" alt="first"><img src="S2" alt="second">');
    expect(alignImages(shots, rendered)).toEqual(["S2", "S1"]);
  });

  it("falls back to raw src without a lookup", () => {
    expect(alignImages(parseScreenshots("![a](r)"), null)).toEqual(["r"]);
  });
});
