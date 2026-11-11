// A design round in Focus: led by its screenshots. The shown variant's screenshot stands on the stage at its real size (never scaled
// up, scaled down only to the width there is); `[` `]` step the variants, `t` puts them all side by side, `v` switches desktop and mobile.
// "Send pick b" on the image, or the variant's digit, sends that one pick at once. Rejecting, picking several or commenting goes
// through "React with a comment": with it open, picks and rejects only mark, the Send bar shows the whole comment and ⌘↵ sends it.
import { useMemo, useState } from "react";
import { feedbackComment } from "../../../core/answer.ts";
import { buildNav, jumpGroup, toggleViewport, viewportPref, type Viewport } from "../../../core/gallery.ts";
import type { Card, DesignRound } from "../../../core/types.ts";
import { useRoundReaction } from "../../feedback/answers.ts";
import { useRegisterPanel } from "../../feedback/panel.ts";
import { useFocusKeys } from "../../focus/keys.ts";
import { focusSend, useFocus } from "../../focus/session.ts";
import { keyOf } from "../../keys.ts";
import type { Signed } from "../../signed.ts";
import { Btn, Ext } from "../bits.tsx";
import { ShotImg } from "../Gallery.tsx";
import { Check, KeyLine, Meta, Note, SendBar, useCover } from "./parts.tsx";

interface VariantTab {
  key: string;
  name: string;
  summary: string;
  /** its digit; null for screenshots that belong to no declared variant (they can be looked at, not picked) */
  n: number | null;
}

export function RoundCover({ card, round, signed }: { card: Card; round: DesignRound; signed: Signed }) {
  const a = useRoundReaction(card, round, focusSend);
  const { sending, details } = useCover();
  const noteOpen = useFocus((s) => !!s.noting[card.key]);
  const setNoting = useFocus((s) => s.setNoting);
  // one pick alone is an answer of its own (it sends on a click); anything more is a reaction the developer composes
  const noting = noteOpen || !!a.text || a.rejects.length > 0 || a.picks.length > 1;

  const shots = useMemo(() => signed.shots(round.commentId, round.screenshots), [signed, round.commentId, round.screenshots]);
  const nav = useMemo(() => buildNav(shots, round.variants, "variant"), [shots, round.variants]);
  const tabs = useMemo<VariantTab[]>(() => {
    const declared = round.variants.map((v) => v.key);
    const loose = nav.groups.filter((g) => g.key === null || !declared.includes(g.key));
    return [...round.variants.map((v, i) => ({ key: v.key, name: v.name && v.name !== v.key ? v.name : "", summary: v.summary, n: i + 1 })), ...loose.map((g) => ({ key: g.key ?? "", name: g.title || "More screenshots", summary: "", n: null }))];
  }, [round.variants, nav]);
  const groupIndex = (key: string) => nav.groups.findIndex((g) => (g.key ?? "") === key);

  const [shown, setShown] = useState(() => tabs[0]?.key ?? "");
  const [index, setIndex] = useState(0);
  const [pref, setPref] = useState<Viewport | null>(() => nav.flat[0]?.viewport ?? null);
  const [side, setSide] = useState(false);

  const show = (key: string) => {
    setShown(key);
    setSide(false);
    const g = groupIndex(key);
    if (g >= 0) setIndex(jumpGroup(nav, index, g, pref));
  };
  const step = (dir: 1 | -1) => {
    const to = tabs[tabs.findIndex((t) => t.key === shown) + dir];
    if (to) show(to.key);
  };
  const hasGroup = groupIndex(shown) >= 0;
  const shot = hasGroup ? nav.flat[index] : undefined;
  const otherView = hasGroup ? toggleViewport(nav, index) : index;
  const switchView = () => {
    setIndex(otherView);
    setPref(viewportPref(nav, otherView, pref));
  };
  /** the screenshots of one variant in the viewport the developer is looking at (all its states), or whatever it has */
  const shotsOf = (key: string) => {
    const g = nav.groups[groupIndex(key)];
    if (!g) return [];
    const all = g.indices.map((i) => nav.flat[i]!);
    const vp = shot?.viewport ?? pref;
    const inView = all.filter((s) => s.viewport === vp);
    return inView.length ? inView : all;
  };

  const without = (list: string[], key: string) => list.filter((k) => k !== key);
  const pick = (n: number) => {
    const v = round.variants[n - 1];
    if (!v || sending) return;
    if (!side) show(v.key);
    if (noting) return a.edit({ picks: a.picks.includes(v.key) ? without(a.picks, v.key) : [...a.picks, v.key], rejects: without(a.rejects, v.key) });
    a.edit({ picks: [v.key], rejects: [] }); // kept if the send fails: the pick stays and ⌘↵ sends it again
    void a.sendWith([v.key], [], "");
  };
  /** a reject is never sent by itself: it opens the comment, where Send writes the whole reaction */
  const reject = (key: string) => {
    if (sending || !round.variants.some((v) => v.key === key)) return;
    setNoting(card.key, true);
    a.edit({ rejects: a.rejects.includes(key) ? without(a.rejects, key) : [...a.rejects, key], picks: without(a.picks, key) });
  };
  const cancel = () => {
    setNoting(card.key, false);
    a.clear();
  };

  useRegisterPanel(
    card.key,
    {
      pick,
      send: () => void a.send(),
      choices: round.variants.map((v, i) => ({ n: i + 1, label: noting ? `Pick variant ${v.key}` : `Send pick ${v.key}`, on: a.picks.includes(v.key) })),
      extras: round.variants.map((v) => ({ id: `reject-${v.key}`, label: `${a.rejects.includes(v.key) ? "Unreject" : "Reject"} variant ${v.key}`, run: () => reject(v.key) })),
      canSend: a.canSend && !sending,
      push: a.push,
      setPush: (p) => a.edit({ push: p }),
    },
    !details,
  );
  const pickable = round.variants.some((v) => v.key === shown);
  useFocusKeys("cover", {
    "focus-note": noting ? undefined : { label: "React with a comment", run: () => setNoting(card.key, true) },
    "focus-side": tabs.length > 1 ? { label: side ? "Show one variant" : "All variants side by side", run: () => setSide(!side) } : undefined,
    "focus-viewport": otherView !== index ? { label: `Show the ${shot?.viewport === "desktop" ? "mobile" : "desktop"} screenshot`, run: switchView } : undefined,
    "focus-step": tabs.length > 1 ? { label: { "]": "Next variant", "[": "Previous variant" }, run: (e) => step(e.key === "[" ? -1 : 1) } : undefined,
    "focus-reject": pickable && !side ? { label: `Reject variant ${shown}`, run: () => reject(shown) } : undefined,
    escape: noting ? { label: "Cancel the comment", run: cancel } : undefined,
  });

  const state = (key: string) => (a.picks.includes(key) ? "picked" : a.rejects.includes(key) ? "rejected" : undefined);
  const acts = (t: VariantTab, alone: boolean) =>
    t.n !== null && (
      <div className="shot-acts">
        <Btn className={`btn ${noting || !alone ? "" : "primary"} ${state(t.key) === "picked" ? "selected" : ""}`} data-testid={`pick-${t.key}`} aria-pressed={noting ? state(t.key) === "picked" : undefined} why={sending ? "Sending…" : null} onClick={() => pick(t.n!)}>
          {noting ? `Pick ${t.key}` : `Send pick ${t.key}`} <kbd>{t.n}</kbd>
        </Btn>
        <Btn className={`btn ${state(t.key) === "rejected" ? "selected" : ""}`} data-testid={`reject-${t.key}`} aria-pressed={state(t.key) === "rejected"} aria-label={`Reject variant ${t.key}`} why={sending ? "Sending…" : null} onClick={() => reject(t.key)}>
          Reject {alone && <kbd>{keyOf("focus-reject")}</kbd>}
        </Btn>
      </div>
    );
  /** `first`: side by side shows one screenshot per variant */
  const images = (t: VariantTab, first = false) => {
    const list = first ? shotsOf(t.key).slice(0, 1) : shotsOf(t.key);
    if (!list.length) return <div className="shot-none muted">No screenshot of this variant.</div>;
    return list.map((s, i) => (
      <figure key={s.alt + i} className="shot" data-viewport={s.viewport ?? undefined}>
        <ShotImg shot={s} commentUrl={round.url} onRetry={() => signed.retry(round.commentId)} />
        {list.length > 1 && s.state && <figcaption className="faint">{s.state}</figcaption>}
      </figure>
    ));
  };
  const current = tabs.find((t) => t.key === shown);

  return (
    <>
      <div className="cover-wide" data-testid="cover-design-round">
        <div className="cover-bar">
          <div className="cover-bar-main">
            <Meta card={card} kind="design-round" />
            <h1 className="cover-q small">{round.question || `Design round ${round.round}`}</h1>
          </div>
          <div className="cover-tools">
            {tabs.length > 1 && (
              <button className={`btn ${side ? "selected" : ""}`} aria-pressed={side} data-testid="side-by-side" onClick={() => setSide(!side)}>
                Side by side <kbd>{keyOf("focus-side")}</kbd>
              </button>
            )}
            {otherView !== index && (
              <button className="btn" data-testid="viewport" onClick={switchView}>
                {shot?.viewport === "mobile" ? "Mobile" : "Desktop"} <kbd>{keyOf("focus-viewport")}</kbd>
              </button>
            )}
            {round.preview && (
              <a className="btn ghost" href={round.preview} target="_blank" rel="noreferrer">
                Open prototype
                <Ext />
              </a>
            )}
          </div>
        </div>
        <div className="vtabs" role="tablist" aria-label="Variants">
          {tabs.map((t) => (
            <button key={t.key} role="tab" aria-selected={!side && shown === t.key} data-state={state(t.key)} data-testid={`variant-${t.key || "other"}`} onClick={() => show(t.key)}>
              {t.n !== null && <kbd>{t.n}</kbd>}
              {t.n !== null && <b>{t.key}</b>}
              {t.name && <span>{t.name}</span>}
              {state(t.key) === "picked" && <Check />}
              {state(t.key) === "rejected" && <span className="vtab-note">rejected</span>}
            </button>
          ))}
          {tabs.length > 1 && (
            <span className="vtabs-keys faint">
              <kbd>[</kbd>
              <kbd>]</kbd>
            </span>
          )}
          {!side && current?.summary && (
            <span className="vtabs-sum faint" title={current.summary}>
              {current.summary}
            </span>
          )}
        </div>
        <div className="stage" data-testid="stage" data-side={side || undefined} tabIndex={0} role="region" aria-label="Screenshots">
          {!nav.flat.length && <div className="shot-none muted">No screenshots in this round.</div>}
          {side ? (
            <div className="stage-side" style={{ "--n": tabs.length } as React.CSSProperties}>
              {tabs.map((t) => (
                <div key={t.key} className="stage-variant" data-state={state(t.key)} data-testid={`stage-${t.key || "other"}`}>
                  <button className="stage-head" onClick={() => show(t.key)} title="Show this variant alone">
                    {t.n !== null && <kbd>{t.n}</kbd>}
                    {t.n !== null && <b>{t.key}</b>}
                    <span>{t.name}</span>
                    <span className="faint">{t.summary}</span>
                  </button>
                  {images(t, true)}
                  {acts(t, false)}
                </div>
              ))}
            </div>
          ) : (
            current && (
              <div className="stage-variant" data-state={state(current.key)} data-testid={`stage-${current.key || "other"}`}>
                {acts(current, true)}
                {images(current)}
              </div>
            )
          )}
        </div>
        <div className="cover-under">
          <Note open={noting} value={a.text} onChange={(text) => a.edit({ text })} onOpen={() => setNoting(card.key, true)} onSend={() => void a.send()} addLabel="React with a comment" placeholder='Your comment, e.g. "header from a, list from b"' />
        </div>
      </div>
      <SendBar
        card={card}
        noting={noting}
        hint="Send pick, or the variant's digit, sends that pick at once. To reject, pick several or say more: React with a comment."
        comment={a.canSend ? feedbackComment(a.feedback) : null}
        why={a.canSend ? null : "Pick or reject a variant, or write a comment"}
        push={a.push}
        setPush={(p) => a.edit({ push: p })}
        onSend={() => void a.send()}
        onCancel={cancel}
      />
      <KeyLine
        hints={[
          [round.variants.length > 1 ? `1–${round.variants.length}` : "1", noting ? "pick" : "send that pick"],
          ...(noting ? ([[keyOf("focus-reject"), "reject"], [keyOf("send-feedback"), "send"], [keyOf("escape"), "cancel"]] as [string, string][]) : ([[keyOf("focus-side"), "side by side"], [keyOf("focus-note"), "comment"]] as [string, string][])),
        ]}
      />
    </>
  );
}
