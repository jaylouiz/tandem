---
name: Tandem
description: A calm, dense, keyboard-first workbench for one developer; quiet neutrals, one accent, meaning carried by small marks.
colors:
  canvas: "oklch(0.983 0.003 270)"
  sidebar: "oklch(0.962 0.004 270)"
  panel: "oklch(1 0 0)"
  raised: "oklch(1 0 0)"
  hover: "oklch(0.955 0.005 270)"
  active: "oklch(0.93 0.007 270)"
  hairline: "oklch(0.915 0.005 270)"
  edge: "oklch(0.64 0.012 270)"
  ink: "oklch(0.21 0.012 270)"
  ink-muted: "oklch(0.44 0.014 270)"
  ink-faint: "oklch(0.5 0.014 270)"
  accent: "oklch(0.48 0.15 264)"
  accent-fill: "oklch(0.5 0.15 264)"
  waiting: "oklch(0.5 0.13 50)"
  ok: "oklch(0.47 0.12 155)"
  danger: "oklch(0.5 0.17 25)"
typography:
  title:
    fontFamily: "Inter Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "18px"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "-0.02em"
  heading:
    fontFamily: "Inter Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 600
    letterSpacing: "-0.012em"
  body:
    fontFamily: "Inter Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "-0.006em"
  label:
    fontFamily: "Inter Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 500
  micro:
    fontFamily: "Inter Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "11px"
    fontWeight: 500
  cover:
    fontFamily: "Inter Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "32px"
    fontWeight: 600
    lineHeight: 1.15
    letterSpacing: "-0.03em"
rounded:
  xs: "2px"
  sm: "4px"
  md: "6px"
  card: "8px"
  glyph: "7px"
  lg: "10px"
  dialog: "12px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
components:
  button:
    backgroundColor: "{colors.raised}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    height: "28px"
    padding: "0 10px"
  button-primary:
    backgroundColor: "{colors.accent-fill}"
    textColor: "{colors.panel}"
    rounded: "{rounded.md}"
    height: "28px"
  chip:
    textColor: "{colors.ink-muted}"
    rounded: "{rounded.sm}"
    height: "19px"
    padding: "0 6px"
  card:
    backgroundColor: "{colors.panel}"
    rounded: "{rounded.card}"
    padding: "9px 10px"
---

# Design System: Tandem

## Overview

**Creative North Star: "The Quiet Workbench."** Tandem is a tool one expert uses all day, steering agents from a Board without leaving it. The interface recedes: surfaces are nearly neutral, text is the loudest thing on screen, and colour is a small mark (a dot, a glyph) that says what something *is*, never a wash that says "look at me". The reference is Linear's discipline, not its pixels.

What it is not: a dashboard of tinted pills, boxes inside boxes, or a purple gradient product page. Every status that used to be a coloured pill is now a neutral label with a 6px dot.

Mode: **Operate**. Familiar patterns (sidebar, tabs, command palette, list rows) earn their place; density and consistency outrank expression.

## Colors

One cool, nearly neutral ramp (hue 270, chroma under 0.015) does all the structural work. One accent carries primary action, current selection, focus and links. Three semantic hues carry meaning only: waiting (amber-orange), ok (green), danger (red). Phase and repo colours are identifiers, shown as dots and squares.

- **Surfaces, light to dark in elevation order:** `sidebar` (recessed) < `canvas` < `panel` (the open Card, list rows) < `raised` (what sits on a panel: the open question, dialogs). In dark theme the order inverts to lighter-is-higher.
- **Text:** `ink`, `ink-muted`, `ink-faint`. All three are at least 4.5:1 on every surface and on hover/active fills in both themes; verified by script, not by eye.
- **Accent split:** `accent` is ink (text, focus ring, underline, links); `accent-fill` is the one filled thing (primary button, white text 6.1:1 light, 4.8:1 dark).
- **Form edges:** controls whose boundary is the only affordance (inputs, textareas) use `edge`, 3:1 against their surface (WCAG 1.4.11). Hairlines (`hairline`, `border-strong`) are for decoration and grouping only.
- **Named rule, Meaning Is A Dot.** A status colours a 6px dot or a glyph, never the background or border of a block. The label next to it stays neutral.
- **Named rule, Accent Is Scarce.** Accent appears on the primary action, the selected Card ring, the active tab underline, focus and links. Not on chips, not on washes, not on idle states.

Dark theme is the same token names re-valued through `light-dark()`: one definition per token, in `:root`, switched by `color-scheme` (system, or `data-theme`).

## Typography

Inter Variable, self-hosted via `@fontsource-variable/inter` (Latin and Latin-ext subsets, no runtime CDN). One family does everything; mono (`ui-monospace`) is only for code, ids in the Decided list and logs.

- **Scale (tight, ~1.125):** 11 micro (kbd, chips) / 12 label (meta, group heads) / 13 body / 15 heading (open-question title, command input) / 18 Card title / 24 display (in Focus: the question of a design round or a Look, beside its screenshot) / 32 cover (the question of the one ask on screen in Focus, its start and its end, nowhere else; 28 at 1100px and below, `--fs-cover`). Fixed px, never fluid.
- **Weights:** 400 body, 500 for interactive labels and titles in rows, 600 for headings and group heads.
- **Tracking:** body `-0.006em`, headings `-0.012em` to `-0.02em`; Card title uses `text-wrap: balance`.
- **Numerals:** `tabular-nums` on counts, ages, ids and key caps so columns align.
- **Named rule, One Step Per Role.** A new text size needs a role first. If it is not title, heading, body, label or micro, it does not ship.

## Layout

4px base (`--s-1`..`--s-5`: 4, 8, 12, 16, 24). Shell is a 224px sidebar plus main; the Waiting split is a 320-380px list plus the Card pane; elsewhere the Card pane is a 560px aside, 400px at 1100px and below (Board columns 208px minimum, 232px otherwise; the open Card's column sits at the left edge of what is left of the Board, the next one partly in view). Group by repo: one lane per repo (a collapsible head: mark, name, count) under one shared sticky column-head row. Desktop only (1024 and up). Rows are 52px (Waiting), 28px (nav, buttons), 32px (palette items). Group by whitespace and a single hairline, not by boxes.

## Elevation & Depth

Layered, not flat. Shadows always carry an offset and a soft blur, tinted by `--ink` (blue-black in light, black in dark), with a 1px ring so edges stay crisp on every surface.

- **elev-1:** at rest on a surface (Cards, buttons, thumbnails).
- **elev-2:** floats above it (hovered Card, the open question in the Card pane).
- **elev-3:** over the app (dialogs, palette, toast).
- The aside Card pane casts a soft shadow onto the board; the Board columns are wells one step below the canvas.
- **Named rule, One Raised Thing.** In a Card pane exactly one block is raised: the question waiting for the developer. Everything else is a quiet group separated by a hairline. It does not apply in Focus: there the ask is the whole screen and its options are tiles, each raised like a Card on the Board (elev-1).

## Shapes

4px for chips and key caps, 6px for controls, 7px for kind-glyph boxes, 8px for Cards, 10px for the raised question and Board columns, 12px for dialogs. Repo marks are 8px squares (2px radius), state marks are 8px circles: a square is a *place*, a circle is a *state*. Never mix them.

## Components

- **Button:** raised surface with elev-1, no border; hover darkens the surface and strengthens the ring. Primary is the single accent-filled button per view. Key hints (`kbd`) sit inside the button as a quiet tinted cap.
- **Chip:** 19px, neutral outline, 4px radius. Semantic chips add the dot (`waiting`, `ok`, `danger`, `accent`); the kind chip (Decision, Design round, ...) does the same with its kind colour.
- **Card (Board):** panel surface, elev-1; the open Card has a 1.5px accent ring. Cards in the Selection have the same ring, and an `accent-soft` fill: no chip, no layout change, a Card never changes size when marked (`aria-pressed` carries it for assistive tech). While 2+ Cards are marked the aside keeps its 560px with a quiet "N Cards selected" note, so the Board does not reflow.
- **Buttons that do nothing:** `aria-disabled` (never `disabled`: the reason must stay reachable by keyboard), the reason as `title` and `aria-describedby` (`Btn` in `bits.tsx`). Pressed is one step below hover (`--bg-active`, inset shadow), no travel. Icon-only buttons carry a tooltip with their key (`ui/Tooltip.tsx`: key caps, opens on hover and keyboard focus, Esc closes it). A chip whose detail was `title`-only (Sync error) is a button that opens a popover. All motion sits inside `prefers-reduced-motion: no-preference`.
- **Sticky heads:** Board column heads, Waiting on me group heads and Done's To look at and day heads stay while their Cards scroll; day heads stick under the column head (`--stick`). The sidebar and Repo counts are Waiting on me only (blockers), To look at is not counted.
- **Selection bar:** one raised (elev-3) bar floating centred above the bottom edge of the content, never inside a column; the single primary button is Move to Backlog. At 1100px and below it drops the picker label and key caps to stay one row. While dragging, only the columns where the dragged Cards would move are drop targets (`accent-soft` when under the pointer); every other column dims and says why on hover (the reason `moveBlocked` gives: an agent-owned Phase, "Not applicable: Build", "Already in Inbox"). Held within 56px of the Board's edge (below the sticky head row grouped by repo) the drag scrolls it, faster the closer to the edge.
- **Row (Waiting):** 26px kind glyph box, title with the age at its right, then repo and the one-line ask across the full width. The glyph carries the kind by shape and colour; its name is in the row for assistive tech only (no chip: it cost the ask half its width). Selected is `active` fill only.
- **Start (Waiting, nothing open):** the right pane says how much waits, by kind, and holds the view's one primary button: Go through them one by one (Focus). Focus has a start of its own: the count as a cover-size headline ("16 Cards wait on you", or "3 new since 14:20" after an earlier visit), the kinds in one line, the primary Start beside it, then every ask as a row (kind glyph, kind, title, the one-line ask, repo, age); older open asks follow under "Still waiting".
- **Feedback panel (Card pane: the list and the Board):** every kind reads the same way: the question as the heading, one quiet line of facts and links (id, "waiting 3h", Open prototype), numbered options (`1`-`9` pick, never send), the note, then Push and the single primary Send with its `⌘↵` cap. A PR's verdicts are options like a decision's, each with what it sets off. A design round is one block per variant (name, summary, Pick, Reject, its screenshots), hairlines between; a rejected variant dims.
- **Focus ("Covers"):** Focus takes the window: the sidebar and the top bar step aside, the `sidebar` surface is the ground. One ask per screen, composed for its kind (a cover), not the Card pane. Top strip: "Focus", one pip per Card with a gap where the kind changes (done: `ink-faint`, current: accent, not sent: `danger`, ahead: hairline; a pip jumps to its Card), "2 of 9", Card `e`, Overview `esc`. The Card's chrome is one line (kind, repo and number, title, how long it waits); Phase, issue text, agent decisions and earlier answers are in a drawer (a dialog on the right edge, elev-3, the Card pane without its Now tab).
  - *Decision:* the question in the cover size, the options as tiles side by side (panel surface, elev-1, 10px; an accent ring and `accent-soft` when picked): key cap, option key, its text, the comment it writes as a mono chip, the agent's recommendation as a quiet line with an accent dot.
  - *PR approval:* the question, then up to three fact columns (Why it stopped, Verification, Review; a 6px tone dot per line, "Nothing reported" when the PR body has no such section) and the link to the diff, then three verdict tiles.
  - *Design round:* the question at the display size with the tools at its right (Side by side `t`, viewport `v`, Open prototype), variant tabs, then the stage (`active` surface, 10px): the shown variant's screenshot at its real size, never scaled up, scaled down only to the width there is. The two reactions float over the image (the one primary: Send pick); side by side shows every variant with its own.
  - *Look:* the stage (its states as tabs) and a 320px side column (256px at 1100px and below): headline, What to check, viewport and Open preview.
  - *Send bar and key line* (panel surface, a hairline above): what a click does here, or with a note open "Writes on app#127" and the comment as a mono chip, Push, Cancel and the primary Send with note; a failed send shows "Not sent." and the reason in `danger-soft` and offers Send again. Under it one line of the keys that apply now, and Up next.
  - *Rules:* in Focus an option sends on a click or its digit (`1`-`9` send, they do not pick), and every option shows beforehand the comment it will write; with the note open options only pick and ⌘↵ sends. The ask stays, saying "Sending…", until the write is through. A held key acts once. An ask that leaves the queue any other way than by the developer's own answer (answered elsewhere, withdrawn) is never replaced under their hands: the screen says "This ask is no longer open" and waits for Go on. An unchecked item of a PR's Verification or Review list reads "Not done:" with a hollow `danger` mark, never like the filled `ok` dot beside it. A success toast per answer is not shown: the next ask and the pips say it; a failure is said in the Send bar, not in a toast. Motion: one 220ms entrance per ask, and the end draws its check once.
  - *End:* "All clear", the tally, and the receipt: one row per Card with the comment that was written (mono chip) and what it set off, or "Marked Seen". Nothing waiting: the same check, "Nothing waits on you", Open the Board and Agent activity.
- **Inputs:** `edge` ring, accent ring plus 4px soft halo on focus.
- **Icons:** drawn SVG, 1.4-1.5px stroke, one family (`bits.tsx`). No unicode arrows or glyphs as icons.
- **Browser surfaces:** selection, caret, checkbox (`accent-color`), scrollbars and placeholders are themed from the tokens.
- **Toast:** one flat stack, newest at the bottom; a confirmation goes after 4 s (an Undo after 8 s), hovering or focusing the stack pauses every timer. A failure wears `danger-soft` with a `danger` edge, stays until dismissed and is announced as an alert; every toast has a close button.
- **Motion:** 120-180ms on state change, exponential ease-out; dialogs and toast rise 6px once. `prefers-reduced-motion` keeps every state change and drops the travel.

## Do's and Don'ts

- Do add a token before adding a value. Components use `var(--…)` only; no hex, rgb or oklch literals in `.tsx`.
- Do verify new text/surface pairs with the contrast script approach (all text 4.5:1, control edges 3:1) in both themes.
- Do keep focus visible: 2px accent outline, 1px offset (inset in lists and tickets).
- Don't tint a block with a semantic colour. Don't add a bordered box inside a bordered box.
- Don't use accent for anything idle or decorative.
- Don't use a colored border-left/right stripe on rows or callouts, gradient text, or glow shadows.
- Don't add a third weight pair or a new font size outside the scale.
