import type { NextStep } from "../../core/types.ts";
import { showsCards, useCards, useStore } from "../store.ts";
import { markSelectionSeen, unseenLooks } from "../seen.ts";
import { keyOf } from "../keys.ts";
import { Btn } from "./bits.tsx";
import { MOVE_ENTRIES, TRIAGE_ENTRIES, actionBlocked, moveBlocked, runMove, runTriage } from "../triage.ts";

const entry = (id: string) => TRIAGE_ENTRIES.find((e) => e.id === id)!;
const STEPS: NextStep[] = ["design", "specify", "build"];

/** The Selection bar: the selected Cards and what to do with them (move between Inbox and Backlog, hold, hand to an agent). */
export function MarkBar() {
  const cards = useCards();
  const marked = useStore((s) => s.marked);
  const clear = useStore((s) => s.clearMarks);
  const handed = useStore((s) => s.handed);
  const cfg = useStore((s) => s.board?.workflow);
  const step = useStore((s) => s.moveStep);
  const setStep = useStore((s) => s.setMoveStep);
  const waiting = useStore((s) => s.view === "waiting");
  const onCards = useStore((s) => showsCards(s.view));
  const targets = cards.filter((c) => marked.includes(c.key));
  if (!onCards || !targets.length || !cfg) return null; // Maps and Settings list no Cards: no bar
  const [toBacklog, toInbox] = MOVE_ENTRIES;
  const backlogWhy = moveBlocked("Backlog", targets, cfg, step);
  const inboxWhy = moveBlocked("Inbox", targets, cfg, step);
  // on Waiting on me (narrow list, few applicable actions) an action that cannot apply is left out; on the Board it stays, disabled with its reason
  const show = (why: string | null) => !waiting || !why;
  // new action: shown only when it applies (a Board bar without Look Cards keeps its width)
  const seenWhy = unseenLooks(targets).length ? null : "Not applicable: no unseen Look";
  return (
    <div className="sel-bar" data-testid="markbar" role="group" aria-label="Selected Cards">
      <strong>{targets.length} selected</strong>
      {show(backlogWhy) && (
        <Btn className="btn primary" why={backlogWhy} title={toBacklog!.label} onClick={() => void runMove("Backlog")}>
          {toBacklog!.label} <kbd>{toBacklog!.key}</kbd>
        </Btn>
      )}
      {show(backlogWhy) && (
        <label className="sel-step">
          <span className="faint">Next step</span>
          <select className="btn" value={step} onChange={(e) => setStep(e.target.value as NextStep | "keep")} aria-label="Next step for moved Cards">
            <option value="keep">keep, else specify</option>
            {STEPS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
      )}
      {show(inboxWhy) && (
        <Btn className="btn" why={inboxWhy} title={toInbox!.label} onClick={() => void runMove("Inbox")}>
          {toInbox!.label} <kbd>{toInbox!.key}</kbd>
        </Btn>
      )}
      {(show(backlogWhy) || show(inboxWhy)) && <span className="sel-sep" aria-hidden />}
      {(["hold", "hand"] as const).map((id) => {
        const why = actionBlocked(entry(id).action, targets, handed);
        if (!show(why)) return null;
        return (
          <Btn key={id} className="btn ghost" why={why} title={entry(id).label} onClick={() => void runTriage(entry(id))}>
            {id === "hold" ? "Hold" : "Hand to agent"} <kbd>{entry(id).key}</kbd>
          </Btn>
        );
      })}
      {!seenWhy && (
        <button className="btn ghost" title="Mark Seen" onClick={() => void markSelectionSeen()}>
          Mark Seen <kbd>{keyOf("seen")}</kbd>
        </button>
      )}
      <span className="sel-sep" aria-hidden />
      <button className="btn ghost" onClick={clear}>
        Clear <kbd>{keyOf("escape")}</kbd>
      </button>
    </div>
  );
}
