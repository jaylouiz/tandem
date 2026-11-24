import { beforeAll, describe, expect, it, vi } from "vitest";

// keys.ts pulls in the store, which reads localStorage when it loads
vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => {}, removeItem: () => {} });
let g: typeof import("./galleryKeys.ts");
beforeAll(async () => {
  g = await import("./galleryKeys.ts");
});

// #5: the Gallery's keys were one run-on line of ten shortcuts; they are three named groups, the keys that answer first.
describe("the Gallery's key legend", () => {
  const flat = (reaction: boolean) => g.galleryLegend(reaction).map((grp) => [grp.name, grp.items.map((i) => `${i.caps.join(" ")} ${i.text}`)]);

  it("is three groups, Pick first, on a round that still takes a reaction", () => {
    expect(flat(true)).toEqual([
      ["Pick", ["p pick", "x reject", "⌘↵ send"]],
      ["Move", ["← → screenshot", "[ ] variant", "1–9 jump to a variant"]],
      ["View", ["v desktop / mobile", "esc close"]],
    ]);
  });

  it("has no Pick group where nothing can be picked (an earlier round, a Look): Move comes first", () => {
    expect(flat(false).map(([name]) => name)).toEqual(["Move", "View"]);
  });

  it("prints every key of the table and nothing else (no second list of keys)", () => {
    const shown = g.galleryLegend(true).flatMap((grp) => grp.items.flatMap((i) => i.caps));
    // `h` / `l` are second keys of previous / next: the legend shows the first cap of each binding
    expect(shown).toHaveLength(g.GALLERY_KEYS.length);
    for (const k of g.GALLERY_KEYS) expect(shown, k.id).toContain(g.galleryCap(k.id));
  });
});
