// The URL as the page's address (#48): which view, which Card, which tab and which Repo filter. Pure: the store sync is `routing.ts`.
//   /waiting  /board  /maps  /settings                 the view
//   /<view>/<owner>/<repo>/<n>                          with the open Card (key `owner/repo#n`)
//   ?tab=decided|activity|issue                         the Card pane's tab (Now = no parameter)
//   ?repo=<owner/repo>                                  the Repo filter (All repos = no parameter)
import type { Tab, View } from "./store.ts";

export const VIEWS: readonly View[] = ["waiting", "board", "maps", "settings"];
const TAB_PARAMS: readonly Tab[] = ["decided", "activity", "issue"];

/** What a URL says. `view` is null for `/` and for a path that names no view: the caller picks the remembered one. */
export interface Route {
  view: View | null;
  selected: string | null;
  tab: Tab;
  repoFilter: string | null;
}

/** How a state change reaches the history: a new entry (Back returns here) or the current one is rewritten. */
export type Nav = "push" | "replace";

/** The one-shot history mode of the next store change; whoever opens something on purpose sets "push" right before. `routing.ts` reads and resets it. */
export const navigation: { hint: Nav } = { hint: "replace" };

const decode = (s: string): string | null => {
  try {
    return decodeURIComponent(s);
  } catch {
    return null;
  }
};

/** `o/r#12` -> `o/r/12` as path segments; null when the key is not a Card key. */
const keySegments = (key: string): string[] | null => {
  const m = /^([^/#]+)\/([^/#]+)#(\d+)$/.exec(key);
  return m ? [m[1]!, m[2]!, m[3]!] : null;
};

export function parseRoute(pathname: string, search: string): Route {
  const parts = pathname.split("/").filter(Boolean);
  const first = parts[0] as View | undefined;
  const view = first && VIEWS.includes(first) ? first : null;
  let selected: string | null = null;
  if (view && view !== "settings" && parts.length === 4) {
    const [owner, repo, n] = [decode(parts[1]!), decode(parts[2]!), parts[3]!];
    if (owner && repo && /^[1-9]\d*$/.test(n)) selected = `${owner}/${repo}#${n}`;
  }
  const q = new URLSearchParams(search);
  const tab = q.get("tab") as Tab | null;
  const repo = q.get("repo");
  return {
    view,
    selected,
    tab: selected && tab && TAB_PARAMS.includes(tab) ? tab : "now",
    repoFilter: repo && /^[^/\s]+\/[^/\s]+$/.test(repo) ? repo : null,
  };
}

/** The canonical URL (path + query) of a state; `parseRoute` of it gives the state back. */
export function formatRoute(s: { view: View; selected: string | null; tab: Tab; repoFilter: string | null }): string {
  const seg = s.view !== "settings" && s.selected ? keySegments(s.selected) : null;
  const path = `/${s.view}${seg ? `/${seg.map((p) => encodeURIComponent(p)).join("/")}` : ""}`;
  const q: string[] = [];
  if (seg && s.tab !== "now") q.push(`tab=${s.tab}`);
  if (s.repoFilter) q.push(`repo=${encodeURIComponent(s.repoFilter).replace(/%2F/gi, "/")}`);
  return q.length ? `${path}?${q.join("&")}` : path;
}
