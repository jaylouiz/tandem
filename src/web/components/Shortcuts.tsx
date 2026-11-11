// The shortcut overview (`?`): every key of the app, printed from the key tables (BINDINGS in keys.ts, GALLERY_KEYS in galleryKeys.ts), so it
// cannot drift from what the handlers do. Scrolls inside the dialog; Esc closes it (the Dialog's).
import { useRef } from "react";
import { GALLERY_KEYS } from "../galleryKeys.ts";
import { BINDINGS, KEY_GROUPS, keyCaps, type Binding } from "../keys.ts";
import { useStore } from "../store.ts";
import { Dialog } from "../ui/Dialog.tsx";

/** A row's caps: alternatives side by side (`j` `↓`), each one cap. */
function Caps({ caps }: { caps: string[] }) {
  return (
    <span className="keys-caps">
      {caps.map((c) => (
        <kbd key={c}>{c}</kbd>
      ))}
    </span>
  );
}

/** The groups whose keys act on Cards: only where Cards are listed. */
const ON_CARDS: readonly string[] = ["Cards", "Selection", "Triage", "Feedback"];

const rowsOf = (group: string): Binding[] => BINDINGS.filter((b) => b.group === group && !b.prefix);

export function Shortcuts() {
  const open = useStore((s) => s.modal === "shortcuts");
  const setOpen = useStore((s) => s.setShortcuts);
  const body = useRef<HTMLDivElement>(null);
  return (
    <Dialog open={open} onClose={() => setOpen(false)} label="Keyboard shortcuts" className="dialog shortcuts-dialog" testId="shortcuts">
      <div className="agents-head">
        <h2 className="shortcuts-title">Keyboard shortcuts</h2> <span className="faint">every action is also in the command palette</span>
        <span style={{ flex: 1 }} />
        <kbd>esc</kbd>
      </div>
      <div className="shortcuts-body" ref={body} tabIndex={0} role="region" aria-label="All shortcuts">
        <div className="shortcuts-cols">
          {KEY_GROUPS.map((g) => (
            <section key={g} data-testid={`shortcuts-${g}`}>
              <h3 className="group-head">
                {g}
                {ON_CARDS.includes(g) && <span className="faint"> · Waiting on me and Board</span>}
                {g === "Focus" && <span className="faint"> · one ask at a time; an option's digit sends it</span>}
              </h3>
              <ul className="keys-list">
                {rowsOf(g).map((b) => (
                  <li key={b.id} data-binding={b.id}>
                    <span>
                      {b.label}
                      {b.when && b.when !== g && <span className="faint"> · {b.when}</span>}
                    </span>
                    <Caps caps={keyCaps(b)} />
                  </li>
                ))}
              </ul>
            </section>
          ))}
          <section data-testid="shortcuts-Screenshots">
            <h3 className="group-head">Screenshot viewer</h3>
            <ul className="keys-list">
              {GALLERY_KEYS.map((g) => (
                <li key={g.id} data-binding={`gallery-${g.id}`}>
                  <span>
                    {g.label}
                    {g.reaction && <span className="faint"> · on a round that waits for you</span>}
                  </span>
                  <Caps caps={keyCaps(g)} />
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </Dialog>
  );
}
