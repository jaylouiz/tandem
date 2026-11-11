// A Look in Focus: the result itself. Its screenshot stands on the stage at real size (its states as tabs, `[` `]` step them, `v`
// switches desktop and mobile); beside it the headline, what to check and the preview. Passing a Look does not mark it: Mark Seen
// (`l`) is the developer's own reaction, and nothing is written to GitHub.
import { useMemo, useState } from "react";
import { buildNav, nextGroup, jumpGroup, toggleViewport, viewportPref, type Viewport } from "../../../core/gallery.ts";
import type { Card } from "../../../core/types.ts";
import { useFocusKeys } from "../../focus/keys.ts";
import { focusSeen } from "../../focus/session.ts";
import { keyOf } from "../../keys.ts";
import type { Signed } from "../../signed.ts";
import { useStore } from "../../store.ts";
import { Ext } from "../bits.tsx";
import { ShotImg } from "../Gallery.tsx";
import { KeyLine, Meta } from "./parts.tsx";

export function LookCover({ card, signed }: { card: Card; signed: Signed }) {
  const look = card.look;
  const days = useStore((s) => s.board?.workflow.seenRetentionDays ?? 7);
  const shots = useMemo(() => (look ? signed.shots(look.commentId, look.screenshots) : []), [signed, look]);
  const nav = useMemo(() => buildNav(shots, [], "state"), [shots]);
  const [index, setIndex] = useState(0);
  const [pref, setPref] = useState<Viewport | null>(() => nav.flat[0]?.viewport ?? null);
  const go = (i: number) => {
    setIndex(i);
    setPref(viewportPref(nav, i, pref));
  };
  const shot = nav.flat[index];
  const group = nav.groupOf[index] ?? 0;
  const otherView = toggleViewport(nav, index);
  const states = nav.groups.length > 1;
  const seen = () => void focusSeen(card);

  useFocusKeys("cover", {
    seen: { label: "Mark Seen", run: seen },
    "focus-viewport": otherView !== index ? { label: `Show the ${shot?.viewport === "desktop" ? "mobile" : "desktop"} screenshot`, run: () => go(otherView) } : undefined,
    "focus-step": states ? { label: { "]": "Next state", "[": "Previous state" }, run: (e) => go(nextGroup(nav, index, e.key === "[" ? -1 : 1, pref)) } : undefined,
  });

  return (
    <>
      <div className="cover-look" data-testid="cover-look">
        <div className="stage" data-testid="stage" tabIndex={0} role="region" aria-label="Screenshots">
          {states && (
            <div className="vtabs on-stage" role="tablist" aria-label="States">
              {nav.groups.map((g, i) => (
                <button key={g.key ?? `none${i}`} role="tab" aria-selected={group === i} onClick={() => go(jumpGroup(nav, index, i, pref))}>
                  {g.title || "Other"}
                </button>
              ))}
              <span className="vtabs-keys faint">
                <kbd>[</kbd>
                <kbd>]</kbd>
              </span>
            </div>
          )}
          {shot && look ? (
            <div className="stage-variant">
              <figure className="shot" data-viewport={shot.viewport ?? undefined}>
                <ShotImg key={shot.alt + index} shot={shot} commentUrl={look.url} onRetry={() => signed.retry(look.commentId)} />
              </figure>
            </div>
          ) : (
            <div className="shot-none muted">{look ? "No screenshots in this Look." : "No Look comment on this issue."}</div>
          )}
        </div>
        <aside className="look-side">
          <Meta card={card} kind="look" />
          <h1 className="cover-q small">{look ? look.headline : card.title}</h1>
          {look && look.checks.length > 0 && (
            <div className="fact">
              <h2>What to check</h2>
              <ul>
                {look.checks.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            </div>
          )}
          <div className="cover-tools">
            {otherView !== index && (
              <button className="btn" data-testid="viewport" onClick={() => go(otherView)}>
                {shot?.viewport === "mobile" ? "Mobile" : "Desktop"} <kbd>{keyOf("focus-viewport")}</kbd>
              </button>
            )}
            {look?.preview && (
              <a className="btn ghost" href={look.preview} target="_blank" rel="noreferrer">
                Open preview
                <Ext />
              </a>
            )}
          </div>
        </aside>
      </div>
      <div className="sendbar" data-testid="sendbar" data-state="look">
        <div className="sendbar-hint">Nothing is written to GitHub. The Card leaves the Board {days} days after it is Seen.</div>
        <span className="spacer" />
        <button className="btn primary big" data-testid="focus-seen" onClick={seen}>
          Mark Seen <kbd>{keyOf("seen")}</kbd>
        </button>
      </div>
      <KeyLine hints={[[keyOf("seen"), "Mark Seen"], ...(states ? ([["[ ]", "state"]] as [string, string][]) : [])]} />
    </>
  );
}
