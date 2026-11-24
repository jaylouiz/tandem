// A fold of the Card sheet (#17): a hairline group with its name and a one-line summary of what is in it; a click or Enter on the head
// opens it in place. Which folds are open is the sheet's state, per opened Card.
import { useEffect, useId, useRef, type ReactNode } from "react";
import type { FoldId } from "../../../core/ask.ts";
import { Chevron } from "../bits.tsx";

export function Fold({ id, title, summary, open, onToggle, reveal, children }: { id: FoldId; title: string; summary: ReactNode; open: boolean; onToggle: () => void; /** changes when the fold was asked for from outside: it scrolls into view */ reveal?: number; children: ReactNode }) {
  const body = useId();
  const root = useRef<HTMLElement>(null);
  useEffect(() => {
    if (reveal !== undefined) root.current?.scrollIntoView({ block: "nearest" });
  }, [reveal]);
  return (
    <section className="fold" data-open={open || undefined} data-testid={`fold-${id}`} ref={root}>
      <h3 className="fold-h">
        <button className="fold-head" aria-expanded={open} aria-controls={open ? body : undefined} onClick={onToggle}>
          <Chevron open={open} />
          <b>{title}</b>
          {/* the summary stands in for the content: once the fold is open the content says it */}
          {!open && <span className="fold-sum">{summary}</span>}
        </button>
      </h3>
      {open && (
        <div className="fold-body" id={body}>
          {children}
        </div>
      )}
    </section>
  );
}
