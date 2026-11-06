import type { Card } from "../../core/types.ts";
import { useStore } from "../store.ts";
import { dragCards, dropBlocked } from "../drag.ts";
import { CardChips, RepoTag, ago } from "./bits.tsx";

/** The Cards under the pointer while dragging: the top Card's face as a stack with a count. */
export function DragGhost() {
  const drag = useStore((s) => s.drag);
  const all = useStore((s) => s.board?.cards);
  if (!drag || !all) return null;
  const cards = drag.keys.map((k) => all.find((c) => c.key === k)).filter((c): c is Card => !!c);
  const top = cards[0];
  if (!top) return null;
  const refused = drag.over !== null && dropBlocked(drag.over, dragCards(drag.keys)) !== null; // the same Cards as the columns see (patched); one planMove for the Phase under the pointer, fresh on every render
  return (
    <div className="drag-ghost" style={{ left: drag.x + 10, top: drag.y + 10 }} data-refused={refused || undefined} data-testid="drag-ghost">
      {cards.length > 2 && <div className="ghost-layer" style={{ translate: "6px 6px" }} />}
      {cards.length > 1 && <div className="ghost-layer" style={{ translate: "3px 3px" }} />}
      <div className="card ghost-face">
        <span className="meta">
          <RepoTag repo={top.repo} number={top.number} />
          <span>· {ago(top.updatedAt)}</span>
        </span>
        <span className="title">{top.title}</span>
        <span className="meta">
          <CardChips card={top} />
        </span>
      </div>
      {cards.length > 1 && <span className="ghost-count">{cards.length}</span>}
    </div>
  );
}
