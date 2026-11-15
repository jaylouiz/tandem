// A design round in Focus: led by its screenshots. The shown variant's screenshot stands on the stage at its real size (never scaled
// up, scaled down only to the width there is); `[` `]` step the variants, `t` puts them all side by side, `v` switches desktop and mobile.
// "Send pick b" on the image, or the variant's digit, sends that one pick at once. A round with further axes (`slide`, `back`: more
// questions in the same prototype) takes one pick per axis, and the pick that completes the combination sends it. Rejecting, picking
// several or commenting goes through "React with a comment": with it open, picks and rejects only mark, the Send bar shows the whole
// comment and ⌘↵ sends it.
import { Fragment, useMemo, useState } from "react";
import { feedbackComment } from "../../../core/answer.ts";
import { axesOf, isComplete, keyLabel, pickOnAxis, splitKey } from "../../../core/axes.ts";
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
  /** its axis (null: the main variants, and screenshots that belong to no declared variant) */
  axis: string | null;
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
  const groups = useMemo(() => axesOf(round), [round]);
  const multi = groups.length > 1;
  // one pick per axis is an answer of its own (the pick that completes it sends); anything more is a reaction the developer composes
  const stacked = groups.some((g) => g.variants.filter((v) => a.picks.includes(v.key)).length > 1);
  const noting = noteOpen || !!a.text || a.rejects.length > 0 || stacked;
  /** picks marked on some axes, waiting for the others (only a round with further axes gets here) */
  const partial = !noting && multi && a.picks.length > 0;
  /** a click on `key` now sends: it completes one pick per axis */
  const sends = (key: string) => !noting && isComplete(round, pickOnAxis(a.picks, key));

  const shots = useMemo(() => signed.shots(round.commentId, round.screenshots), [signed, round.commentId, round.screenshots]);
  const nav = useMemo(() => buildNav(shots, round.variants, "variant"), [shots, round.variants]);
  const tabs = useMemo<VariantTab[]>(() => {
    const declared = round.variants.map((v) => v.key);
    const loose = nav.groups.filter((g) => g.key === null || !declared.includes(g.key));
    return [
      ...round.variants.map((v, i) => ({ key: v.key, axis: v.axis, name: v.name && v.name !== splitKey(v.key).option ? v.name : "", summary: v.summary, n: i + 1 })),
      ...loose.map((g) => ({ key: g.key ?? "", axis: null, name: g.title || "More screenshots", summary: "", n: null })),
    ];
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
    if (partial && a.picks.includes(v.key)) return a.edit({ picks: without(a.picks, v.key) });
    const picks = pickOnAxis(a.picks, v.key);
    a.edit({ picks, rejects: [] }); // kept if the send fails: the picks stay and ⌘↵ sends them again
    if (isComplete(round, picks)) void a.sendWith(picks, [], "");
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
      choices: round.variants.map((v, i) => ({ n: i + 1, label: sends(v.key) ? `Send pick ${keyLabel(v.key)}` : `Pick variant ${keyLabel(v.key)}`, on: a.picks.includes(v.key) })),
      extras: round.variants.map((v) => ({ id: `reject-${v.key}`, label: `${a.rejects.includes(v.key) ? "Unreject" : "Reject"} variant ${keyLabel(v.key)}`, run: () => reject(v.key) })),
      canSend: a.canSend && !sending,
      push: a.push,
      setPush: (p) => a.edit({ push: p }),
    },
    !details,
  );
  const pickable = round.variants.some((v) => v.key === shown);
  const current = tabs.find((t) => t.key === shown);
  // side by side shows the variants of one axis: the one the shown variant is on
  const sideTabs = tabs.filter((t) => t.axis === (current?.axis ?? null));
  useFocusKeys("cover", {
    "focus-note": noting ? undefined : { label: "React with a comment", run: () => setNoting(card.key, true) },
    "focus-side": sideTabs.length > 1 ? { label: side ? "Show one variant" : "All variants side by side", run: () => setSide(!side) } : undefined,
    "focus-viewport": otherView !== index ? { label: `Show the ${shot?.viewport === "desktop" ? "mobile" : "desktop"} screenshot`, run: switchView } : undefined,
    "focus-step": tabs.length > 1 ? { label: { "]": "Next variant", "[": "Previous variant" }, run: (e) => step(e.key === "[" ? -1 : 1) } : undefined,
    "focus-reject": pickable && !side ? { label: `Reject variant ${keyLabel(shown)}`, run: () => reject(shown) } : undefined,
    escape: noting ? { label: "Cancel the comment", run: cancel } : partial ? { label: "Clear the picks", run: () => a.edit({ picks: [] }) } : undefined,
  });

  const state = (key: string) => (a.picks.includes(key) ? "picked" : a.rejects.includes(key) ? "rejected" : undefined);
  const acts = (t: VariantTab, alone: boolean) =>
    t.n !== null && (
      <div className="shot-acts">
        <Btn className={`btn ${sends(t.key) && alone ? "primary" : ""} ${state(t.key) === "picked" ? "selected" : ""}`} data-testid={`pick-${t.key}`} aria-pressed={noting || multi ? state(t.key) === "picked" : undefined} why={sending ? "Sending…" : null} onClick={() => pick(t.n!)}>
          {sends(t.key) ? `Send pick ${keyLabel(t.key)}` : `Pick ${keyLabel(t.key)}`} <kbd>{t.n}</kbd>
        </Btn>
        <Btn className={`btn ${state(t.key) === "rejected" ? "selected" : ""}`} data-testid={`reject-${t.key}`} aria-pressed={state(t.key) === "rejected"} aria-label={`Reject variant ${keyLabel(t.key)}`} why={sending ? "Sending…" : null} onClick={() => reject(t.key)}>
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
  const missing = groups.filter((g) => !g.variants.some((v) => a.picks.includes(v.key))).map((g) => g.name ?? "a variant");
  const hint = !multi
    ? "Send pick, or the variant's digit, sends that pick at once. To reject, pick several or say more: React with a comment."
    : partial
      ? `Picked ${a.picks.map(keyLabel).join(" · ")}. Pick ${missing.join(" and ")} and they are sent together.`
      : `One pick per row: ${groups.map((g) => g.name ?? "variant").join(", ")}. The pick that completes them sends them together. To reject or say more: React with a comment.`;

  return (
    <>
      <div className="cover-wide" data-testid="cover-design-round">
        <div className="cover-bar">
          <div className="cover-bar-main">
            <Meta card={card} kind="design-round" />
            <h1 className="cover-q small">{round.question || `Design round ${round.round}`}</h1>
          </div>
          <div className="cover-tools">
            {sideTabs.length > 1 && (
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
          {tabs.map((t, i) => (
            <Fragment key={t.key}>
              {t.axis !== null && tabs[i - 1]?.axis !== t.axis && (
                <span className="vtabs-axis" data-testid={`axis-${t.axis}`} title={round.axes.find((x) => x.name === t.axis)?.about || undefined}>
                  {t.axis}
                </span>
              )}
              <button role="tab" aria-selected={!side && shown === t.key} data-state={state(t.key)} data-testid={`variant-${t.key || "other"}`} onClick={() => show(t.key)}>
                {t.n !== null && <kbd>{t.n}</kbd>}
                {t.n !== null && <b>{splitKey(t.key).option}</b>}
                {t.name && <span>{t.name}</span>}
                {state(t.key) === "picked" && <Check />}
                {state(t.key) === "rejected" && <span className="vtab-note">rejected</span>}
              </button>
            </Fragment>
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
            <div className="stage-side" style={{ "--n": sideTabs.length } as React.CSSProperties}>
              {sideTabs.map((t) => (
                <div key={t.key} className="stage-variant" data-state={state(t.key)} data-testid={`stage-${t.key || "other"}`}>
                  <button className="stage-head" onClick={() => show(t.key)} title="Show this variant alone">
                    {t.n !== null && <kbd>{t.n}</kbd>}
                    {t.n !== null && <b>{keyLabel(t.key)}</b>}
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
        hint={hint}
        comment={a.canSend ? feedbackComment(a.feedback) : null}
        why={a.canSend ? null : "Pick or reject a variant, or write a comment"}
        push={a.push}
        setPush={(p) => a.edit({ push: p })}
        onSend={() => void a.send()}
        onCancel={cancel}
      />
      <KeyLine
        hints={[
          [round.variants.length > 1 ? `1–${round.variants.length}` : "1", noting ? "pick" : multi ? "pick, one per row" : "send that pick"],
          ...(noting
            ? ([[keyOf("focus-reject"), "reject"], [keyOf("send-feedback"), "send"], [keyOf("escape"), "cancel"]] as [string, string][])
            : ([[keyOf("focus-side"), "side by side"], [keyOf("focus-note"), "comment"], ...(partial ? [[keyOf("escape"), "clear the picks"]] : [])] as [string, string][])),
        ]}
      />
    </>
  );
}
