# 0005: Base UI behind thin wrappers for dialogs, toasts and tooltips

Status: accepted, 2026-11-05. Decided by the user on #52 (D1: Base UI). It replaces the profile line "No component library" in `.claude/issue-workflow.md` (Components).

## Context

The usability audit (#34) showed what hand-built behaviour costs: dialog focus traps and focus return (#42), toasts (#43), tooltips and pressed states (#46), shortcut overview (#45), roving focus in lists (#41). `cmdk` is the only UI dependency; the profile says "No component library". `src/web/styles.css` tokens (`light-dark()`, `[data-theme]`) and `DESIGN.md` must stay the only visual source of truth. `tailwindcss` is installed, but `styles.css` only imports its base layer and no component uses utilities, so it is not a reason to pick a Tailwind-based kit.

Findings, comparison table, sources and measurements: `docs/research/ui-component-library.md` (fetched 2026-11-05). Candidates: Radix, React Aria Components, Ariakit, Base UI, Headless UI, shadcn/ui, Mantine, and "stay custom plus native `<dialog>` and a few small libraries".

## Decision

- **Adopt Base UI** (`@base-ui/react`, stable since 1.0.0 on 2025-12-11, MIT, MUI team) for **Dialog, Toast, Tooltip, and Menu/Popover when first needed**. It is unstyled, exposes state as data attributes and ships no CSS, so styling stays our classes and tokens. It stops Esc at the document, so it does not double-fire with the window key handler in `App.tsx`.
- **Wrappers only**: components import from `src/web/ui/` (`Dialog`, `Toast`, `Hint`, later `Menu`), never from `@base-ui/react` directly. Swapping the library then touches `ui/` only.
- **Adoption is incremental**, one slice at a time, in this order: Dialog (absorbs #42 AC 1), Toast (absorbs #43 pause, persistence, close, Esc, stack), Tooltip and Popover (absorbs the tooltip and keyboard-reachable detail part of #46). No big-bang rewrite.
- **Stays custom**: list selection and roving focus (#41, no library offers a public primitive that fits the store-owned `selected`/`marked`), the key tables and shortcut overview content (#45), the undo stack and ⌘Z (#43), "one modal at a time" and focus return from the Card pane (#42), disabled reasons, pressed state, sticky heads, reduced motion and copy (#46).
- **`cmdk` stays**, wrapped inside the Dialog. Plan B if it breaks on a future React: Base UI Autocomplete.
- **Runner-up**: Radix Primitives (`radix-ui`). Smaller (+24 KB gzip over cmdk against +75 KB), `cmdk` already depends on its Dialog, same wrapper approach; ranked second for its maintenance shape (one author wrote 237 of 287 commits in 12 months), no imperative toast API and an unverified global Esc in Toast. Because of the wrappers, switching is a `ui/` change.
- **Rejected**: shadcn/ui and Mantine (a second token and theme system, Tailwind utilities or a shipped stylesheet), Headless UI (near dormant, no Toast or Tooltip), Ariakit (no Toast, pre-1.0, one maintainer), React Aria Components (best keyboard engine, but Toast still `UNSTABLE_` and the heaviest; revisit if lists ever move into a library). The baseline (native `<dialog>`, hand-built toast, floating-ui tooltip) is credible but leaves us owning menus and popover collision handling.

## Conditions

- A spike before slice 1 merges: cmdk inside a Base UI Dialog (focus, Esc order), and a Playwright check that a Toast beyond `limit` does not lose an Undo (raise `limit` above the worst-case number of simultaneous Undos).
- Esc closes a library dialog even from a text field; #41's "first Esc blurs the field" applies outside dialogs.
- One VoiceOver pass per migrated dialog and toast; the research is from docs and source, not assistive-technology tests.

## Consequences

- The profile's "No component library" line changes with this ADR; the wrappers become the single place for library coupling.
- Bundle grows by about 75 KB gzip (measured, one entry per widget), acceptable for a locally served app.
- Pin the minor version; the E2E suite runs on upgrades. Base UI still lands behaviour in minors and has 455 open issues and PRs.
- #42, #43, #45 and the tooltip part of #46 get their library-dependent scope from this decision; #41 is unaffected.
- Migration slices live in the existing issues, not new ones: #42 (Dialog, first, with the spike), #43 (Toast, after #42), #46 (Tooltip part, after #42). #45 stays custom. Fall-back if the #42 spike fails: Radix Primitives behind the same wrappers.
