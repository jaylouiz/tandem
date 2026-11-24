// What is rarely needed on a Card (#17): its Next step, hold, Needs wayfinder, the way to GitHub. Out of the way in one menu; each keeps
// its key, which works with the menu closed (`keys.ts`) and, through `onKey`, with it open.
import type { Card } from "../../../core/types.ts";
import { keyOf } from "../../keys.ts";
import { useStore } from "../../store.ts";
import { TRIAGE_ENTRIES, actionBlocked, runTriage } from "../../triage.ts";
import { Menu, MenuGroup, MenuItem, MenuLink, MenuRadio, MenuSeparator } from "../../ui/Menu.tsx";
import { Tooltip } from "../../ui/Tooltip.tsx";
import { Ext } from "../bits.tsx";

const Dots = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
    <circle cx="3.5" cy="8" r="1.3" />
    <circle cx="8" cy="8" r="1.3" />
    <circle cx="12.5" cy="8" r="1.3" />
  </svg>
);

const entry = (id: string) => TRIAGE_ENTRIES.find((e) => e.id === id)!;
const STEPS = ["design", "specify", "build"] as const;

export function MoreMenu({ card }: { card: Card }) {
  const hold = useStore((s) => s.board?.workflow.holdLabel ?? "on-hold");
  const open = card.phase !== "Done";
  const heldByWorkflow = card.onHold && !card.labels.includes(hold);
  const blocked = (id: string) => actionBlocked(entry(id).action, [card]);
  const holdWhy = heldByWorkflow ? "On hold through a workflow label. Remove that label on GitHub to release it." : blocked("hold");
  const run = (id: string) => void runTriage(entry(id), [card]);
  // a Card in UX Design or Build takes no Next step: said once under the group's heading, not under each of the three
  const reasons = STEPS.map((s) => blocked(`next-${s}`));
  const allBlocked = reasons.every((r) => r && r === reasons[0]) ? reasons[0]! : null;
  /** the items on screen and their keys, so a key pressed in the open menu does what its cap says */
  const live: Record<string, () => void> = { [keyOf("open")]: () => void window.open(card.url, "_blank") };
  if (open && !card.fog) for (const s of STEPS) if (!blocked(`next-${s}`)) live[entry(`next-${s}`).key] = () => run(`next-${s}`);
  if (open && !holdWhy) live[entry("hold").key] = () => run("hold");
  if (open && card.phase === "Inbox") live[entry("fog").key] = () => run("fog");
  return (
    <Menu
      label="More actions"
      testId="more-menu"
      onKey={(k) => {
        const act = live[k];
        act?.();
        return !!act;
      }}
      trigger={
        <button className="btn ghost icon" aria-label="More actions" data-testid="more">
          <Dots />
        </button>
      }
    >
      {open && !card.fog && (
        <>
          <MenuGroup label="Next step" value={card.nextStep} note={allBlocked}>
            {STEPS.map((s) => (
              <MenuRadio key={s} value={s} keys={entry(`next-${s}`).key} why={blocked(`next-${s}`)} quiet={!!allBlocked} onSelect={() => run(`next-${s}`)} testId={`more-next-${s}`}>
                {s}
              </MenuRadio>
            ))}
          </MenuGroup>
          <MenuSeparator />
        </>
      )}
      {open && (
        <MenuItem keys={entry("hold").key} why={holdWhy} onSelect={() => run("hold")} testId="more-hold">
          {heldByWorkflow ? "On hold" : card.labels.includes(hold) ? "Release hold" : "Hold Card"}
        </MenuItem>
      )}
      {open && card.phase === "Inbox" && (
        <MenuItem keys={entry("fog").key} onSelect={() => run("fog")} testId="more-fog">
          {card.fog ? "Clear Needs wayfinder" : "Needs wayfinder"}
        </MenuItem>
      )}
      <MenuLink href={card.url} keys={keyOf("open")}>
        Open on GitHub
        <Ext />
      </MenuLink>
    </Menu>
  );
}

/** The close key of the sheet beside the Board, and of the drawer in Focus. */
export function CloseKey({ label, onClose }: { label: string; onClose: () => void }) {
  return (
    <Tooltip label={label} keys={keyOf("escape")} side="bottom">
      <button className="btn ghost" onClick={onClose} aria-label="Close">
        <kbd>{keyOf("escape")}</kbd>
      </button>
    </Tooltip>
  );
}
