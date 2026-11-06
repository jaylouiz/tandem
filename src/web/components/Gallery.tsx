import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { buildNav, jumpGroup, nextGroup, stepIndex, toggleViewport, viewportPref, type Viewport } from "../../core/gallery.ts";
import type { DesignRound, Screenshot } from "../../core/types.ts";
import { Dialog } from "../ui/Dialog.tsx";
import { GALLERY_KEYS, galleryCap, galleryKey } from "../galleryKeys.ts";
import { keyCaps } from "../keys.ts";
import { Tooltip } from "../ui/Tooltip.tsx";
import { Btn, Ext } from "./bits.tsx";

/** A screenshot that retries once with fresh signed URLs and then shows where to find it on GitHub. */
export function ShotImg({ shot, commentUrl, onRetry, loading }: { shot: Screenshot; commentUrl: string; onRetry: () => Promise<boolean>; loading?: "lazy" }) {
  const [retried, setRetried] = useState(false);
  const [failed, setFailed] = useState(false);
  const latest = useRef(shot.src);
  latest.current = shot.src;
  useEffect(() => setFailed(false), [shot.src]);
  if (failed)
    return (
      <span className="shot-missing" role="img" aria-label={shot.alt} data-testid="shot-missing">
        Screenshot did not load
        <a href={commentUrl} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>
          Open comment on GitHub
          <Ext />
        </a>
      </span>
    );
  return (
    <img
      src={shot.src}
      alt={shot.alt}
      loading={loading}
      onError={() => {
        if (retried) return setFailed(true);
        setRetried(true);
        // fresh sources reload the image by themselves; when the source is still the same, there is nothing left to try
        const tried = shot.src;
        void onRetry().then(() => setTimeout(() => latest.current === tried && setFailed(true), 50));
      }}
    />
  );
}

export interface Reaction {
  picks: string[];
  rejects: string[];
  toggle: (list: "pick" | "reject", key: string) => void;
  canSend: boolean;
  send: () => void;
}

export interface GalleryProps {
  /** `R2`, `Look`: where these screenshots come from */
  context: string;
  shots: Screenshot[];
  variants: DesignRound["variants"];
  by: "variant" | "state";
  index: number;
  onIndex: (i: number) => void;
  onClose: () => void;
  commentUrl: string;
  onRetry: () => Promise<boolean>;
  /** present only for the round the developer can still react to; absent: read-only */
  reaction?: Reaction;
}

/**
 * Full-screen screenshot viewer. ←/→ (h/l) step, 1-9 or [ ] jump between variants, v switches desktop/mobile,
 * esc closes (the Dialog's); on the current round p/x pick/reject the shown variant and ⌘↵ sends the reaction.
 */
export function Gallery({ context, shots, variants, by, index, onIndex, onClose, commentUrl, onRetry, reaction }: GalleryProps) {
  const nav = useMemo(() => buildNav(shots, variants, by), [shots, variants, by]);
  const [pref, setPref] = useState<Viewport | null>(() => nav.flat[index]?.viewport ?? null);
  const root = useRef<HTMLDivElement>(null);
  const shot = nav.flat[index];
  const group = nav.groups[nav.groupOf[index] ?? -1];
  const declared = group?.key && by === "variant" ? variants.find((v) => v.key === group.key) : undefined;
  const hasViewport = (v: Viewport) => !!group?.indices.some((i) => nav.flat[i]!.viewport === v);

  const go = (i: number) => {
    onIndex(i);
    setPref(viewportPref(nav, i, pref));
  };
  const onKey = (e: KeyboardEvent) => {
    const key = galleryKey(e);
    if (!key || (key.reaction && !reaction)) return;
    switch (key.id) {
      case "send":
        if (!reaction?.canSend) return;
        reaction.send();
        onClose();
        break;
      case "next":
        go(stepIndex(nav, index, 1));
        break;
      case "previous":
        go(stepIndex(nav, index, -1));
        break;
      case "variant":
        go(jumpGroup(nav, index, Number(e.key) - 1, pref));
        break;
      case "next-variant":
        go(nextGroup(nav, index, 1, pref));
        break;
      case "previous-variant":
        go(nextGroup(nav, index, -1, pref));
        break;
      case "viewport":
        go(toggleViewport(nav, index));
        break;
      case "pick":
      case "reject":
        if (!declared) return;
        reaction!.toggle(key.id, declared.key);
        break;
      default:
        return; // Esc is the dialog's
    }
    e.preventDefault();
  };

  if (!shot) return null;
  const picked = !!declared && !!reaction?.picks.includes(declared.key);
  const rejected = !!declared && !!reaction?.rejects.includes(declared.key);
  const viewButton = (v: Viewport) => (
    <Btn
      key={v}
      className={`btn ${shot.viewport === v ? "selected" : ""}`}
      aria-pressed={shot.viewport === v}
      why={hasViewport(v) ? null : `No ${v} screenshot of this ${by === "variant" ? "variant" : "state"}`}
      onClick={() => go(shot.viewport === v ? index : toggleViewport(nav, index))}
    >
      {v}
    </Btn>
  );
  return (
    <Dialog open onClose={onClose} label={`Screenshots ${context}`} className="gallery" backdrop={false} testId="gallery" popupRef={root} initialFocus={root} onKeyDown={onKey}>
      <div className="gallery-bar">
        <span className="gallery-context">{reaction ? context : `${context} · read-only`}</span>
        <strong data-testid="gallery-title">{group?.title || shot.alt}</strong>
        {shot.state && <span className="gallery-chip">{shot.state}</span>}
        {picked && <span className="gallery-chip">picked</span>}
        {rejected && <span className="gallery-chip">rejected</span>}
        <span style={{ opacity: 0.6 }} data-testid="gallery-count">
          {index + 1} / {nav.flat.length}
        </span>
        <span style={{ flex: 1 }} />
        <span className="gallery-viewport" role="group" aria-label="Viewport">
          {viewButton("desktop")}
          {viewButton("mobile")}
        </span>
        <Tooltip label="Previous screenshot" keys={galleryCap("previous")} side="bottom">
          <Btn className="btn" onClick={() => go(stepIndex(nav, index, -1))} why={index === 0 ? "This is the first screenshot" : null} aria-label="Previous screenshot">
            ←
          </Btn>
        </Tooltip>
        <Tooltip label="Next screenshot" keys={galleryCap("next")} side="bottom">
          <Btn className="btn" onClick={() => go(stepIndex(nav, index, 1))} why={index === nav.flat.length - 1 ? "This is the last screenshot" : null} aria-label="Next screenshot">
            →
          </Btn>
        </Tooltip>
        <a className="btn" href={shot.src} target="_blank" rel="noreferrer">
          Open
          <Ext />
        </a>
        <button className="btn" onClick={onClose}>
          Close
        </button>
      </div>
      {declared?.summary && (
        <div className="gallery-sub" title={declared.summary}>
          {declared.summary}
        </div>
      )}
      <div className="gallery-stage" onClick={onClose}>
        <span onClick={(e) => e.stopPropagation()} style={{ display: "contents" }}>
          <ShotImg key={shot.alt + index} shot={shot} commentUrl={commentUrl} onRetry={onRetry} />
        </span>
      </div>
      <div className="gallery-hint" data-testid="gallery-hint">
        {GALLERY_KEYS.filter((g) => !g.reaction || reaction).map((g, i) => (
          <span key={g.id}>
            {i > 0 && " · "}
            {keyCaps(g).map((c) => (
              <kbd key={c}>{c}</kbd>
            ))}{" "}
            {g.label.toLowerCase()}
          </span>
        ))}
      </div>
    </Dialog>
  );
}
