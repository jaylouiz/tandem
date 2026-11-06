// The store and the URL, kept equal both ways (#48). The store stays the source of truth: the page's initial state comes from the URL
// (`startingPlace` in store.ts), a change of view, open Card, tab or Repo filter writes the URL, and Back/Forward apply a URL to the store.
// Whether a change adds a history entry is decided where it happens (`navigation.hint`, see `Nav`): deliberate opens push, the rest replaces.
import { formatRoute, navigation, parseRoute, type Nav } from "./route.ts";
import { storeFilter, storedView, useStore, validFilter } from "./store.ts";

let started = false;
/** The Card key the URL named and nobody has opened since: checked against the Board once its repo has synced. */
let unverified: string | null = null;
/** The history mode of the write due at the end of this tick; changes made in one tick (palette: lift the filter, switch view, open the Card) share one entry. */
let due: Nav | null = null;

const here = () => location.pathname + location.search;

function flush() {
  const mode = due;
  due = null;
  if (!mode) return;
  const url = formatRoute(useStore.getState());
  if (url === here()) return;
  history[mode === "push" ? "pushState" : "replaceState"](null, "", url);
}

function schedule(mode: Nav) {
  if (!due) queueMicrotask(flush);
  due = due === "push" ? "push" : mode;
}

/** A Card the URL named that the Board does not have: closed by replace, with a notice. A repo that is still syncing is waited for. */
function verifyCard() {
  const s = useStore.getState();
  if (!unverified) return;
  if (s.selected !== unverified) {
    unverified = null; // the developer opened something else
    return;
  }
  if (!s.board) return;
  const key = unverified;
  const card = s.board.cards.find((c) => c.key === key);
  if (!card) {
    const repo = key.slice(0, key.indexOf("#"));
    const sync = s.board.sync[repo];
    if (s.board.repos.includes(repo) && (!sync?.at || sync.syncing)) return;
  }
  unverified = null;
  if (card && (!s.repoFilter || card.repo === s.repoFilter)) return;
  s.select(null);
  s.setNotice({ key: "", text: `Card ${key} is not on the Board`, canStart: false });
}

/** Back/Forward (and the first load): the URL's place becomes the store's. Opening a Card here is a restore, not a visit: nothing is marked Seen, nothing is written. */
function applyUrl() {
  const r = parseRoute(location.pathname, location.search);
  const view = r.view ?? storedView();
  const board = useStore.getState().board;
  const repoFilter = board ? validFilter(r.repoFilter, board.repos) : r.repoFilter;
  try {
    localStorage.setItem("tandem.view", view);
  } catch {}
  storeFilter(repoFilter);
  unverified = r.selected;
  // the reset #30's setView gives a page, without its "close the Card": the URL names the Card
  useStore.setState({ view, selected: r.selected, tab: r.tab, repoFilter, linger: null, marked: [] });
}

/** Call once before the first render. */
export function startRouting() {
  if (started) return;
  started = true;
  unverified = useStore.getState().selected;
  useStore.subscribe((s, prev) => {
    const hint = navigation.hint;
    navigation.hint = "replace";
    if (s.view !== prev.view || s.selected !== prev.selected || s.tab !== prev.tab || s.repoFilter !== prev.repoFilter) schedule(hint);
    if (s.board !== prev.board || s.selected !== prev.selected) verifyCard();
  });
  window.addEventListener("popstate", applyUrl);
  schedule("replace"); // `/`, `/waiting/` and unknown paths end on a valid URL
}
