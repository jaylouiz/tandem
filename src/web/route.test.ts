import { describe, expect, it } from "vitest";
import { formatRoute, parseRoute } from "./route.ts";

const at = (url: string) => {
  const u = new URL(url, "http://x");
  return parseRoute(u.pathname, u.search);
};
const state = { view: "waiting" as const, selected: null, repoFilter: null };

describe("appPath (a demo mounted under a sub-path)", () => {
  it("strips the mount point and leaves other paths alone", async () => {
    const { appPath } = await import("./route.ts");
    expect(appPath("/tandem/pr-4/waiting/o/r/12", "/tandem/pr-4")).toBe("/waiting/o/r/12");
    expect(appPath("/tandem/pr-4", "/tandem/pr-4")).toBe("/");
    expect(appPath("/tandem/pr-40/board", "/tandem/pr-4")).toBe("/tandem/pr-40/board");
    expect(appPath("/board", "")).toBe("/board");
  });
});

describe("parseRoute", () => {
  it("reads the view, the Card and the Repo filter", () => {
    expect(at("/board/acme/tandem/48?repo=acme/tandem")).toEqual({ view: "board", selected: "acme/tandem#48", repoFilter: "acme/tandem" });
    expect(at("/waiting")).toEqual({ view: "waiting", selected: null, repoFilter: null });
  });
  it("names no view for / and for unknown paths, trailing slashes are fine", () => {
    expect(at("/").view).toBeNull();
    expect(at("/nope/a/b/1").view).toBeNull();
    expect(at("/waiting/").view).toBe("waiting");
    expect(at("/board/").view).toBe("board");
    expect(at("/maps").view).toBeNull(); // the Wayfinder maps view is gone (#15): an old bookmark follows the remembered view
  });
  it("drops a Card on /settings and a path that is not a Card", () => {
    expect(at("/settings/o/r/1").selected).toBeNull();
    expect(at("/board/o/r/x").selected).toBeNull();
    expect(at("/board/o/r/0").selected).toBeNull();
    expect(at("/board/o/r").selected).toBeNull();
    expect(at("/board/o/r/1/extra").selected).toBeNull();
  });
  it("still opens the Card of an older link that carries `?tab=` (the sheet has no tabs, #17)", () => {
    expect(at("/board/o/r/1?tab=activity")).toEqual({ view: "board", selected: "o/r#1", repoFilter: null });
    expect(at("/board?tab=issue&repo=o/r")).toEqual({ view: "board", selected: null, repoFilter: "o/r" });
  });
  it("ignores a repo that is not owner/name", () => {
    expect(at("/board?repo=nope").repoFilter).toBeNull();
    expect(at("/board?repo=a/b/c").repoFilter).toBeNull();
  });
  it("decodes an encoded repo and survives broken escapes", () => {
    expect(at("/board/o%2Dx/r%2Ey/3?repo=o-x%2Fr.y").selected).toBe("o-x/r.y#3");
    expect(at("/board/%E0%A4%A/r/3").selected).toBeNull();
  });
});

describe("formatRoute", () => {
  it("puts the view, the Card and the filter in the URL", () => {
    expect(formatRoute(state)).toBe("/waiting");
    expect(formatRoute({ ...state, view: "board", selected: "o/r#4" })).toBe("/board/o/r/4");
    expect(formatRoute({ ...state, view: "board", selected: "o/r#4", repoFilter: "o/r" })).toBe("/board/o/r/4?repo=o/r");
    expect(formatRoute({ ...state, view: "board", repoFilter: "o/r" })).toBe("/board?repo=o/r");
  });
  it("has no Card segment on Settings", () => {
    expect(formatRoute({ ...state, view: "settings", selected: "o/r#4" })).toBe("/settings");
  });
  it("round-trips", () => {
    for (const s of [
      { view: "waiting", selected: "acme/tandem#48", repoFilter: null },
      { view: "board", selected: null, repoFilter: "a.b/c_d" },
      { view: "board", selected: "o/r#1", repoFilter: "o/r" },
    ] as const) {
      const u = new URL(formatRoute(s), "http://x");
      const r = parseRoute(u.pathname, u.search);
      expect({ view: r.view, selected: r.selected, repoFilter: r.repoFilter }).toEqual(s);
    }
  });
});
