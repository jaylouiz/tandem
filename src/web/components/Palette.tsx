import { Command } from "cmdk";
import { useMemo } from "react";
import { shotsTarget } from "../../core/gallery.ts";
import { keyShown, paletteActions, type PaletteAction } from "../actions.ts";
import { keyOf } from "../keys.ts";
import { panelKeys } from "../panelKeys.ts";
import { liveFocusKeys } from "../focus/keys.ts";
import { seenLooks, unseenLooks } from "../seen.ts";
import { NO_COORDINATORS, NO_REPOS, openCard, useStore, useCard, useCards } from "../store.ts";
import { Dialog } from "../ui/Dialog.tsx";
import { canUndo } from "../ui/Toast.tsx";
import { MOVE_ENTRIES, TRIAGE_ENTRIES, applicable, moveBlocked, useTriageTargets } from "../triage.ts";
import { shortRepo } from "./bits.tsx";

export function Palette() {
  const open = useStore((s) => s.modal === "palette");
  const setOpen = useStore((s) => s.setPalette);
  return (
    <Dialog open={open} onClose={() => setOpen(false)} label="Command palette" className="dialog">
      <PaletteBody />
    </Dialog>
  );
}

const setTheme = (t: "light" | "dark" | null) => {
  if (t) document.documentElement.dataset.theme = t;
  else delete document.documentElement.dataset.theme;
  try {
    if (t) localStorage.setItem("tandem.theme", t);
    else localStorage.removeItem("tandem.theme");
  } catch {}
};

/** Mounted only while the Palette is open (inside the Dialog's popup), so its store subscriptions cost nothing otherwise. */
function PaletteBody() {
  const setOpen = useStore((s) => s.setPalette);
  const setRepoFilter = useStore((s) => s.setRepoFilter);
  const filter = useStore((s) => s.repoFilter);
  const repos = useStore((s) => s.board?.repos ?? NO_REPOS);
  const cards = useCards();
  const targets = useTriageTargets();
  const handed = useStore((s) => s.handed);
  const cfg = useStore((s) => s.board?.workflow);
  const moveStep = useStore((s) => s.moveStep);
  const view = useStore((s) => s.view);
  const tab = useStore((s) => s.tab);
  const focus = useStore((s) => s.focus);
  const marked = useStore((s) => s.marked.length);
  const lanes = useStore((s) => s.lanes);
  const repoCount = useStore((s) => s.board?.repos.length ?? 0);
  const coordinators = useStore((s) => s.board?.coordinators ?? NO_COORDINATORS);
  const selected = useCard(useStore((s) => s.selected));
  const failed = useStore((s) => (selected ? !!s.failures[selected.key] : false));
  const live = panelKeys.current && selected && panelKeys.current.cardKey === selected.key ? panelKeys.current : null;
  const actions = useMemo(
    () =>
      paletteActions({
        view,
        focus,
        card: selected,
        startable: !!selected?.awaitingPickup && !coordinators[selected.repo],
        failed,
        tab,
        marked,
        shots: selected ? shotsTarget(selected) : null,
        canUndo: canUndo(),
        repoCount,
        lanes,
        repoFilter: filter,
        panel: live,
        focusKeys: focus ? liveFocusKeys() : [],
        // Focus has no triage: its keys do not act on the Card behind the ask, so the palette does not offer them either (Mark Seen is a Focus key there)
        triage: focus
          ? { targets: 0, moves: [], entries: [], seen: false, unseen: false }
          : {
              targets: targets.length,
              moves: cfg ? MOVE_ENTRIES.filter((e) => moveBlocked(e.to, targets, cfg, moveStep) === null) : [],
              entries: TRIAGE_ENTRIES.filter((e) => applicable(e.action, targets, handed)),
              seen: unseenLooks(targets).length > 0,
              unseen: seenLooks(targets).length > 0,
            },
        setTheme,
      }),
    [view, focus, selected, coordinators, failed, tab, marked, repoCount, lanes, filter, live, targets, cfg, moveStep, handed],
  );
  const groups = [...new Set(actions.map((a) => a.group))];
  const item = (a: PaletteAction) => {
    const key = keyShown(a);
    return (
      <Command.Item
        key={a.id}
        value={`${a.group} ${a.label} ${a.search ?? ""}`}
        onSelect={() => {
          a.run();
          setOpen(false);
        }}
      >
        {a.label}
        {key && <kbd>{key}</kbd>}
      </Command.Item>
    );
  };
  return (
    <Command label="Command palette" loop>
      {/* autoFocus: focus at the commit, so what is typed right after ⌘K is not lost (the library moves focus a frame later) */}
      <Command.Input autoFocus placeholder="Type a command or search Cards…" />
      <Command.List>
        <Command.Empty>No results.</Command.Empty>
        {groups.map((g) => (
          <Command.Group key={g} heading={g}>
            {actions.filter((a) => a.group === g).map(item)}
            {g === "Filter by repo" &&
              repos.map((r) => (
                <Command.Item
                  key={r}
                  value={`repo ${r}`}
                  onSelect={() => {
                    setRepoFilter(r);
                    setOpen(false);
                  }}
                >
                  {r}
                </Command.Item>
              ))}
          </Command.Group>
        ))}
        <Command.Group heading="Cards">
          {cards.map((c) => (
            <Command.Item
              key={c.key}
              value={`${c.key} ${c.title}`}
              onSelect={() => {
                openCard(c.key);
                setOpen(false);
              }}
            >
              <span className="faint">
                {shortRepo(c.repo)}#{c.number}
              </span>
              {c.title}
            </Command.Item>
          ))}
        </Command.Group>
      </Command.List>
      <div className="palette-keys faint" data-testid="palette-keys">
        <kbd>↑</kbd> <kbd>↓</kbd> choose · <kbd>↵</kbd> run · <kbd>esc</kbd> close · every key: Keyboard shortcuts <kbd>{keyOf("shortcuts")}</kbd>
      </div>
    </Command>
  );
}
