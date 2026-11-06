import { describe, expect, it } from "vitest";
import { formatRoute, parseRoute } from "./route.ts";

const at = (url: string) => {
  const u = new URL(url, "http://x");
  return parseRoute(u.pathname, u.search);
};
const state = { view: "waiting" as const, selected: null, tab: "now" as const, repoFilter: null };

describe("parseRoute", () => {
  it("reads the view, the Card, the tab and the Repo filter", () => {
    expect(at("/board/acme/tandem/48?tab=activity&repo=acme/tandem")).toEqual({ view: "board", selected: "acme/tandem#48", tab: "activity", repoFilter: "acme/tandem" });
    expect(at("/waiting")).toEqual({ view: "waiting", selected: null, tab: "now", repoFilter: null });
  });
  it("names no view for / and for unknown paths, trailing slashes are fine", () => {
    expect(at("/").view).toBeNull();
    expect(at("/nope/a/b/1").view).toBeNull();
    expect(at("/waiting/").view).toBe("waiting");
    expect(at("/maps/").view).toBe("maps");
  });
  it("drops a Card on /settings and a path that is not a Card", () => {
    expect(at("/settings/o/r/1").selected).toBeNull();
    expect(at("/board/o/r/x").selected).toBeNull();
    expect(at("/board/o/r/0").selected).toBeNull();
    expect(at("/board/o/r").selected).toBeNull();
    expect(at("/board/o/r/1/extra").selected).toBeNull();
  });
  it("ignores an invalid tab, and a tab without a Card", () => {
    expect(at("/board/o/r/1?tab=bogus").tab).toBe("now");
    expect(at("/board?tab=issue").tab).toBe("now");
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
  it("puts the view, the Card, a tab other than Now and the filter in the URL", () => {
    expect(formatRoute(state)).toBe("/waiting");
    expect(formatRoute({ ...state, view: "board", selected: "o/r#4" })).toBe("/board/o/r/4");
    expect(formatRoute({ ...state, view: "board", selected: "o/r#4", tab: "decided", repoFilter: "o/r" })).toBe("/board/o/r/4?tab=decided&repo=o/r");
    expect(formatRoute({ ...state, view: "maps", repoFilter: "o/r" })).toBe("/maps?repo=o/r");
  });
  it("has no Card segment on Settings and no tab without a Card", () => {
    expect(formatRoute({ ...state, view: "settings", selected: "o/r#4", tab: "issue" })).toBe("/settings");
    expect(formatRoute({ ...state, tab: "issue" })).toBe("/waiting");
  });
  it("round-trips", () => {
    for (const s of [
      { view: "waiting", selected: "acme/tandem#48", tab: "activity", repoFilter: null },
      { view: "board", selected: null, tab: "now", repoFilter: "a.b/c_d" },
      { view: "maps", selected: "o/r#1", tab: "issue", repoFilter: "o/r" },
    ] as const) {
      const u = new URL(formatRoute(s), "http://x");
      const r = parseRoute(u.pathname, u.search);
      expect({ view: r.view, selected: r.selected, tab: r.tab, repoFilter: r.repoFilter }).toEqual(s);
    }
  });
});
