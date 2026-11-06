import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("../web/styles.css", import.meta.url), "utf8");

// Reduced motion (#46): every animation and transition sits inside `@media (prefers-reduced-motion: no-preference)`.

/** The stylesheet without the bodies of the no-preference blocks and without `@keyframes` (a keyframe only runs when a rule names it). */
function withoutMotionBlocks(text: string): string {
  let out = "";
  for (let i = 0; i < text.length; ) {
    const at = text.slice(i).search(/@media \(prefers-reduced-motion: no-preference\)|@keyframes/);
    if (at < 0) return out + text.slice(i);
    out += text.slice(i, i + at);
    let j = text.indexOf("{", i + at);
    for (let depth = 1; depth > 0; ) depth += text[++j] === "{" ? 1 : text[j] === "}" ? -1 : 0;
    i = j + 1;
  }
  return out;
}

describe("styles.css motion", () => {
  it("has no animation or transition outside the no-preference block", () => {
    const outside = withoutMotionBlocks(css).replace(/\/\*[\s\S]*?\*\//g, "");
    expect(outside.match(/(^|[\s{;])(animation|transition)[a-z-]*\s*:/g) ?? []).toEqual([]);
  });

  it("the motion block exists and holds the Selection bar's rise and the chevron", () => {
    expect(css).toMatch(/@media \(prefers-reduced-motion: no-preference\)[\s\S]*\.sel-bar[\s\S]*\.chev/);
  });
});
