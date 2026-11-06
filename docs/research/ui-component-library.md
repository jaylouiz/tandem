# UI component library for Tandem: findings

Date: 2026-11-05. Issue: #52 (research). Feeds the on-hold #42, #43, #45, #46; #41 is in an open PR.

**Question.** Which library, if any, should Tandem (React 19.3, Vite 8, zustand, TypeScript, desktop only, Linear-like "Operate mode") adopt for dialogs, toasts, tooltips, menus and keyboard/focus behaviour, given that `src/web/styles.css` tokens and `DESIGN.md` stay the only visual source of truth, Tailwind is not used in components, one custom window key layer must keep working, and `cmdk` stays or gets a clear replacement?

**Method and source policy.** Primary sources only: official docs, GitHub repos (API, source, releases), the npm registry JSON API, W3C WAI-ARIA APG, and `web-features` (the data behind MDN/web.dev Baseline). Versions, dates and counts were fetched on 2026-11-05. Sizes marked **(measured)** are my own measurement: I installed the current versions of each package in a scratch directory, bundled one entry file per widget with esbuild 0.28.2 (minified, ESM, React external, `NODE_ENV=production`, `treeShaking`) and gzipped the output (default level). That is a measurement, not documentation. Behaviour claims come from docs or from reading the installed package source (named per claim). I did not run screen-reader or browser tests: every a11y statement is "per docs/source", not "tested". Anything not verified is marked **unverified**.

---

## 1. Summary

- **Recommendation: Base UI (`@base-ui/react` 1.9.0), adopted one wrapper at a time (Dialog, then Toast, then Tooltip; Menu/Popover when first needed). Confidence: medium.** Why: it is the only candidate that is at once headless (no CSS, state as data attributes), stable (v1.0.0 on 2025-12-11, 11 minor/patch releases since), team-maintained (the top human committer is about 32% of 1,873 commits in 12 months, bots included), complete for what Tandem needs (Dialog, Tooltip with shared delay, Toast with imperative manager + stack + pause on hover/focus + persistent + F6 region, Menu, Popover, Autocomplete as a later cmdk exit), and it stops Esc at the document so it does not double-fire with our window key handler.
- **Runner-up: Radix Primitives (`radix-ui` 1.8.1).** Close call. It is smaller (measured +24 KB gzip over cmdk for dialog+tooltip+toast+menu vs +75 KB for Base UI, irrelevant for a local app), `cmdk` already depends on `@radix-ui/react-dialog`, and its Toast/Tooltip/Dialog meet the same ACs. I rank it second only on maintenance shape: 237 of 287 commits in 12 months are one person (Chance Strickland) and the docs lag the npm releases. If a spike of Base UI Toast/Dialog next to cmdk shows a problem, switch to Radix; the wrapper layer makes that a small change.
- **Baseline ("stay custom + native `<dialog>` + a few small libs") verdict: credible and the right choice if the roadmap has no menus/popovers.** Native `<dialog>.showModal()` (Baseline "high" since 2024-09-14) covers #42 almost fully; a hand toast with pause/stack is about 60 lines; only tooltips and future menus carry real cost. It costs 0 bytes and has zero token/key-layer friction, but you own every a11y edge case forever. I recommend the library because menus/popovers/tooltip collision handling are coming and are the expensive part to hand-roll.
- **No library helps with #41 (roving focus/lists) or #45 (shortcut overview).** Radix's `react-roving-focus` and Base UI's `internals/composite` are explicitly not public. Only React Aria (GridList/ListBox) and Ariakit (Composite) offer list focus, and both bring their own selection model that collides with Tandem's store-owned `selected`/`marked`. Keep #41 custom.
- **Rejected:** shadcn/ui (Tailwind utilities + second token/theme system, not a library), Mantine (own theme system `MantineProvider`/`data-mantine-color-scheme`, shipped 294 KB stylesheet), Headless UI (1 release and 8 commits in 12 months; no Toast, no Tooltip), Ariakit (no Toast, pre-1.0 with an in-flight package split, single maintainer). React Aria Components stays the strongest keyboard engine but its Toast is still `UNSTABLE_` and it is the heaviest (+62 KB gzip); revisit if lists become a library concern.
- `cmdk` 1.1.1: last release 2025-03-14, 0 commits in the last 12 months, last push 2025-10-29 (README). Works with React 19 (peer range), keep it; plan B is Base UI Autocomplete or React Aria Autocomplete (rc).

---

## 2. Facts per candidate

All "last 12 months" = since 2025-11-05. Release counts are stable (non-prerelease) npm versions published in that window. Commit counts are from the GitHub commits API. Open issue counts include open PRs (GitHub `open_issues_count`).

### 2.1 Radix UI Primitives

- Version: `radix-ui` 1.8.1 (2026-10-12); `@radix-ui/react-dialog` 1.3.1, `-toast` 1.3.1, `-tooltip` 1.4.1, `-dropdown-menu` 2.2.1, `-popover` 1.3.1. https://registry.npmjs.org/radix-ui/latest
- Layout: unified `radix-ui` package (`import { Dialog } from "radix-ui"`) re-exporting the per-primitive `@radix-ui/react-*` packages as dependencies; per-primitive subpath imports (`radix-ui/dialog`) were added in the release notes of 2026-07-20 (also `/* @__PURE__ */` marking for tree-shaking). https://www.radix-ui.com/primitives/docs/overview/releases ; https://www.radix-ui.com/primitives/docs/components/toast . The Dialog docs page still shows "Version 1.2.0" while npm has 1.3.1, so docs lag the code.
- Repo/licence: https://github.com/radix-ui/primitives, MIT, 19.5k stars, 268 open issues+PRs. https://api.github.com/repos/radix-ui/primitives
- Ownership: site footer "Made by WorkOS" / "A project by WorkOS". https://www.radix-ui.com/primitives/docs/overview/releases . I found no public maintenance-status statement; the GitHub issue search for "maintained/abandoned" returned only unrelated items. https://api.github.com/search/issues?q=repo:radix-ui/primitives+maintained
- Activity: last commit 2026-10-14; 287 commits in 12 months, 237 by one author (`chaance`), 7 by bots. 12 stable releases of `radix-ui` in 12 months. https://api.github.com/repos/radix-ui/primitives/commits ; https://registry.npmjs.org/radix-ui . No GitHub Releases are published (404); the changelog lives on the docs site and lags npm (newest docs entry 2026-07-20, newest npm 2026-10-12).
- React 19: `peerDependencies.react` = `^16.8 || ^17.0 || ^18.0 || ^19.0 || ^19.0.0-rc`. https://registry.npmjs.org/@radix-ui/react-dialog/latest . The 2026-07-06 notes include "Fixed stale onEscapeKeyDown / onDismiss handlers on React 19.2" (release page, 2026-07-06 entry).
- Styling: unstyled, no CSS shipped; state via `data-state="open|closed"`, `data-side`, `data-swipe`, CSS variables like `--radix-toast-swipe-move-x`. https://www.radix-ui.com/primitives/docs/guides/styling ; Toast page above.
- Widgets: Dialog, Alert Dialog, Popover, Tooltip, Hover Card, Toast, Dropdown/Context Menu, Menubar, Select, Tabs, Toolbar, Toggle Group, Radio Group, Slider, etc. No Listbox, no List/Grid/Tree, no command palette. https://www.radix-ui.com/primitives/docs/overview/introduction
- `@radix-ui/react-roving-focus` README: "This is an internal utility, not intended for public usage." https://github.com/radix-ui/primitives/blob/main/packages/react/roving-focus/README.md
- Dialog (docs): modal and non-modal; "Focus is automatically trapped within modal"; "Esc closes the component automatically"; Esc "moves focus to Dialog.Trigger"; `onCloseAutoFocus`, `onEscapeKeyDown`. https://www.radix-ui.com/primitives/docs/components/dialog . Source (`react-dialog` 1.3.1): `hideOthers` from `aria-hidden` and `react-remove-scroll` (scroll lock, `pointer-events: none` on body while a modal layer is open: `react-dismissable-layer` dist).
- Esc in source: `react-dismissable-layer` registers `keydown` on the **document in capture phase**, calls `event.preventDefault()` then `onDismiss()` and does **not** stop propagation. Consequence for Tandem: the window bubble handler in `App.tsx` still sees that Esc, and by then the zustand flag is already false, so it would run the Esc case too (close the Card pane). A one-line `if (e.defaultPrevented) return;` guard fixes it. (installed source, `@radix-ui/react-dismissable-layer/dist/index.mjs`)
- Tooltip (docs): `Provider` `delayDuration` default 700 ms, `skipDelayDuration` default 300 ms (this is the delay group); opens on focus or hover, closes on Esc. https://www.radix-ui.com/primitives/docs/components/tooltip
- Toast (docs): "Automatically closes. Pauses closing on hover, focus and window blur. Supports hotkey to jump to toast viewport (default F8). Supports closing via swipe gesture." Declarative only (you render one `Toast.Root` per toast; "Duplicate toasts" example uses state; imperative API is "abstract it yourself"); default `duration` 5000, `Infinity` never auto-closes (source `index.mjs` line ~354); `Toast.Close`, `Toast.Action` with required `altText`. https://www.radix-ui.com/primitives/docs/components/toast . Esc: each toast is a `DismissableLayer`; a toast `onKeyDown` handles Esc, and the layer's document handler closes a toast when focus is not inside one (installed source `react-toast/dist/index.mjs` lines ~416-437). The release note 2026-07-20 says "Fixed Toast removing non-focused toasts when pressing Escape". Exact current semantics (does Esc outside the viewport close the top toast, and does that steal Esc from "clear marks"): **unverified**, needs a spike.
- Size: npm unpackedSize `radix-ui` 105 KB (re-export shell), `react-dialog` 107 KB, `react-toast` 193 KB, `react-tooltip` 143 KB. https://registry.npmjs.org/@radix-ui/react-toast/latest . **(measured, gzip)**: dialog 14.1 KB, tooltip 20.3 KB, toast 12.6 KB, dropdown-menu 30.7 KB, popover 24.4 KB; dialog+tooltip+toast+menu together 37.5 KB; the same four plus cmdk 41.8 KB vs cmdk alone 17.9 KB, i.e. **+24 KB over today** because primitives are shared.
- Downloads last month: `radix-ui` 75.4M. https://api.npmjs.org/downloads/point/last-month/radix-ui
- cmdk relation: `cmdk` depends on `@radix-ui/react-dialog`, `react-id`, `react-primitive`, `react-compose-refs`; its `Command.Dialog` is "the command menu in a Radix Dialog". https://registry.npmjs.org/cmdk/latest ; installed `cmdk/dist/index.d.ts` line 153.

### 2.2 React Aria / React Aria Components (Adobe)

- Versions: `react-aria-components` 1.22.1 (2026-10-09); `react-aria` 3.53.1; hooks live in the unified `react-aria` / `react-stately` packages (the old `@react-aria/*` packages still exist, e.g. `@react-aria/toast` 3.1.1 2026-05-28). Apache-2.0. https://registry.npmjs.org/react-aria-components/latest ; https://registry.npmjs.org/react-aria/latest
- Repo: https://github.com/adobe/react-spectrum, 16.0k stars, 668 open issues+PRs, last push 2026-11-05; 901 commits in 12 months spread over several Adobe staff (top: snowystinger 180, devongovett 158, LFDanLu 133, reidbarber 117). Nine minor releases in 12 months (1.14 2025-12-16 to 1.22 2026-10-09, roughly monthly) plus patches; 12 stable npm versions. https://api.github.com/repos/adobe/react-spectrum/releases
- React 19: peer `^16.8.0 || ^17.0.0-rc.1 || ^18.0.0 || ^19.0.0-rc.1`. https://registry.npmjs.org/react-aria-components/latest
- Styling: headless; default class `react-aria-ComponentName`, `className`/`style` accept render-prop functions, states as data attributes (`data-hovered`, `data-pressed`, `data-focus-visible`, `data-selected`, `data-focused`), no stylesheet shipped (package has no `.css`; `sideEffects` lists `*.css` only as a guard). https://react-aria.adobe.com/styling ; installed package scan.
- Widgets (exports of 1.22.1): Modal/ModalOverlay/Dialog/DialogTrigger, Popover, Tooltip/TooltipTrigger, Menu/MenuTrigger/SubmenuTrigger, ListBox, GridList, Tree, Table, Toolbar, TagGroup, Tabs, Autocomplete, Sheet, plus form fields. `Toast`, `ToastRegion`, `ToastList`, `ToastContent`, `ToastQueue` are still exported as **`UNSTABLE_*`**; the docs page is labelled "alpha". Autocomplete is labelled "rc". (installed `dist/exports/index.mjs`; https://react-aria.adobe.com/Toast ; https://react-aria.adobe.com/Autocomplete)
- Toast behaviour (docs + source): "Timers automatically pause when the user focuses or hovers over a toast"; no timeout by default (persistent); `queue.add(content, {timeout, onClose})`, `queue.close(key)`, `pauseAll/resumeAll`; recommended minimum timeout 5 s; `ToastQueue` has `maxVisibleToasts` (default Infinity in the queue class, 1 in the `useToastState` hook); region is an ARIA landmark with F6 navigation (`useLandmark`). I found no Esc-to-dismiss in the toast hook (source scan). https://react-aria.adobe.com/Toast ; installed `react-stately` `useToastState.mjs`, `react-aria` `toast/useToastRegion.mjs`.
- Tooltip (docs): shared "warmup/cooldown" so after one tooltip shows, others show instantly (that is the delay group, built in); `delay`, `closeDelay` props. https://react-aria.adobe.com/Tooltip
- Modal (docs): `isDismissable`, `isKeyboardDismissDisabled`; FocusScope with contain + restoreFocus (source). https://react-aria.adobe.com/Modal ; installed `FocusScope.mjs`
- Keys and propagation: `createEventHandler` calls `stopPropagation()` on every event a React Aria key handler processes unless the handler calls `continuePropagation()`; Esc is handled via a React `onKeyDown` shortcut on the overlay, only for the top-most overlay. Net effect with a window listener: keys handled inside a RAC dialog or list never reach `window`. (installed `interactions/createEventHandler.mjs`, `overlays/useOverlay.mjs`)
- Lists: `GridList`/`ListBox` have `selectionMode`, `escapeKeyBehavior` ('clearSelection'), `shouldFocusWrap`, `keyboardNavigationBehavior`, `autoFocus`, scroll-into-view on focus, shift-arrow range extension and ⌘A select-all in `useSelectableCollection` (source). They own `selectedKeys`/focused key. https://react-aria.adobe.com/GridList ; installed `selection/useSelectableCollection.mjs`
- Command palette: `Autocomplete` (rc) filters a `Menu`/`ListBox` with virtual focus so arrows work while the text input keeps focus; the docs demo is literally a "CommandPalette" in a `DialogTrigger`. https://react-aria.adobe.com/Autocomplete
- Size **(measured, gzip)**: tooltip 13.8 KB, dialog+modal 23.1 KB, toast 20.4 KB, menu+popover 49.6 KB, listbox 36.0 KB, gridlist 44.3 KB, autocomplete+menu+searchfield 43.5 KB; dialog+tooltip+toast+menu+popover+listbox 62.0 KB. npm unpackedSize `react-aria-components` 6.9 MB, `react-aria` 15.7 MB (types/maps). Downloads 22.9M/month.
- Needs a Provider? No for core widgets (`I18nProvider`, `RouterProvider` optional).

### 2.3 Ariakit

- Version `@ariakit/react` 0.4.42 (2026-10-14); it now depends on `@ariakit/react-components` 0.7.1 while `@ariakit/react-core` is stale at 0.4.26 (2026-04-17): a package split in flight. MIT (npm `license`; the repo root has no detected licence file, GitHub license API 404). https://registry.npmjs.org/@ariakit/react/latest ; https://registry.npmjs.org/@ariakit/react-core
- Repo: https://github.com/ariakit/ariakit, 8.6k stars, 51 open issues+PRs, last push 2026-11-05. 2,544 commits in 12 months, of which diegohaz 1,250 and renovate bot 1,204: effectively one human maintainer. 23 stable npm releases in 12 months, still 0.x. https://api.github.com/repos/ariakit/ariakit
- React 19: peer `^17 || ^18 || ^19`. 
- Styling: headless; style with className/CSS; a short list of documented safe selectors (`[aria-checked]`, etc.), and the docs warn that other generated attributes are not API. https://ariakit.org/guide/styling
- Widgets (components index): Dialog, Hovercard, Popover, Tooltip, Menu/Menubar, Select, Combobox, Command, Composite, Tab, Toolbar, Disclosure, Form, etc. **No Toast.** https://ariakit.org/components
- Dialog: `modal`, `hideOnEscape`, `hideOnInteractOutside`, `autoFocusOnShow`, `autoFocusOnHide`, `initialFocus`, `finalFocus`, `preventBodyScroll` (source of `useDialog`); nested dialogs: **unverified** here. Esc is processed via React key events on the dialog; how it interacts with a window listener: **unverified**.
- Composite: "Provide a single tab stop on the page and navigate through the focusable descendants with arrow keys", with `CompositeProvider`, `CompositeItem`, row/group, typeahead; this is the only public headless roving-focus/virtual-focus primitive besides React Aria. https://ariakit.org/components/composite
- Command menu: an example "Command Menu" combines Dialog + Combobox; the example page carries a "Plus" tag, so it may be part of the paid Ariakit Plus (**unverified**). https://ariakit.org/examples/dialog-combobox-command-menu
- Size **(measured, gzip)**: dialog 21.2 KB, tooltip 32.1 KB, menu 45.0 KB, composite 17.5 KB, combobox 26.0 KB; dialog+tooltip+menu+composite 46.5 KB. npm unpackedSize `@ariakit/react` 1.1 MB + `react-components`.

### 2.4 Base UI (MUI)

- Package: `@base-ui/react` **1.9.0 (2026-10-09)**; renamed from `@base-ui-components/react` (last 1.0.0-rc.0). **Stable: v1.0.0 on 2025-12-11**, then 1.1 (2026-01-15), 1.2 (02-12), 1.3 (03-12), 1.4 (04-13), 1.4.1 (04-20), 1.5 (05-19), 1.6 (06-18), 1.7 (08-04), 1.8 (09-04), 1.9 (10-09). MIT. https://registry.npmjs.org/@base-ui/react ; https://api.github.com/repos/mui/base-ui/releases ; https://base-ui.com/react/overview/releases
- Repo: https://github.com/mui/base-ui, 11.3k stars, 455 open issues+PRs, last push 2026-11-05. 1,873 commits in 12 months: atomiks 594, michaldudak 129, rest bots/others (renovate 325+136). Roughly 31% from the top human; multiple MUI employees. https://api.github.com/repos/mui/base-ui/commits
- React 19: peer `^17 || ^18 || ^19`; optional peers `date-fns`, `@date-fns/tz` (only for date components), `@types/react`. https://registry.npmjs.org/@base-ui/react/latest
- Styling: unstyled; docs demos in Tailwind and CSS Modules; state through data attributes (`data-open`, `data-closed`, `data-starting-style`, `data-ending-style`, `data-expanded`, `data-limited`, `data-swipe-direction`) and CSS variables (`--toast-index`, `--toast-offset-y`, `--toast-frontmost-height`). No CSS shipped (package scan). https://base-ui.com/react/handbook/styling ; https://base-ui.com/react/components/toast
- Widgets: Dialog, Alert Dialog, Drawer, Popover, Tooltip, Preview Card, Toast, Menu, Context Menu, Menubar, Select, Combobox, Autocomplete, Tabs, Toolbar, Toggle Group, Navigation Menu, etc. **No public Listbox/list/Composite**: the composite code is at `@base-ui/react/internals/composite` (package export map). https://base-ui.com/react/components/autocomplete
- Dialog: `modal` (true | false | 'trap-focus'), nested dialogs (`data-nested-dialog-open`, `--nested-dialogs`), `initialFocus`/`finalFocus` (can be `false` or a function), background inert. https://base-ui.com/react/components/dialog ; installed `dialog/root/DialogRoot.d.mts`.
- Tooltip: `Tooltip.Provider` with `delay`, `closeDelay`, `timeout` ("Provides a shared delay for multiple tooltips": the delay group). Docs warn tooltips are "visual labels only", not accessible to touch/screen-reader users, so icon buttons still need `aria-label`. https://base-ui.com/react/components/tooltip ; installed `tooltip/provider/TooltipProvider.d.mts`
- Toast: `Toast.Provider` (`timeout` default 5000, `limit` default 3), `useToastManager()` and **global `Toast.createToastManager()`** with `add/close/update/promise` usable outside React; `Toast.Viewport`, `Title`, `Description`, `Action`, `Close`; stacking via `--toast-index`; the stack expands while the viewport is hovered or focused (`data-expanded`); timers pause on hover, focus and window blur (`pauseTimers`, `hovering`, `focused`, `isWindowFocused` in `store.mjs`); `timeout: 0` means no timer; loading type never times out; `priority: 'high'` renders `role="alertdialog"` else `dialog`; "F6 lets users jump into the toast viewport landmark region"; `ToastRoot` handles Escape (source). Toasts beyond `limit` stay mounted but `inert` and `data-limited` (so raise `limit` or the oldest Undo is unreachable; whether its timer still expires: **unverified**). https://base-ui.com/react/components/toast ; installed `toast/store.mjs`, `toast/root/ToastRoot.mjs`
- Esc handling: floating-ui `useDismiss` registers `keydown` on the document (bubble phase) and, unless `escapeKeyBubbles`, calls `event.stopPropagation()`; so a window listener does not see the Esc that closed a popup. (installed `floating-ui-react/hooks/useDismiss.mjs` lines 90-112, 468)
- Size **(measured, gzip)**: dialog 23.9 KB, tooltip 34.1 KB, toast 26.3 KB, menu 61.7 KB, autocomplete 50.3 KB; dialog+tooltip+toast+menu 75.0 KB. npm unpackedSize 10.4 MB (all components + types).
- shadcn/ui's current docs build on Base UI by default (see 2.6), a sign of ecosystem direction.
- Downloads: 78.3M/month (inflated by transitive use; treat as indicative only). https://api.npmjs.org/downloads/point/last-month/@base-ui/react

### 2.5 Headless UI (Tailwind Labs)

- `@headlessui/react` 2.2.10 (2026-04-07), MIT. Repo https://github.com/tailwindlabs/headlessui: 28.8k stars, 122 open issues+PRs, last push 2026-04-13; **8 commits in 12 months** (4 RobinMalfait, 3 thecrypticace), **1 stable release in 12 months** (2.2.9 was 2025-09-25). https://api.github.com/repos/tailwindlabs/headlessui ; https://registry.npmjs.org/@headlessui/react
- React 19: peer `^18 || ^19 || ^19.0.0-rc`. Depends on `@floating-ui/react`, `@react-aria/focus`, `@react-aria/interactions`, `@tanstack/react-virtual`.
- Components: Dialog, Menu, Popover, Listbox, Combobox, Disclosure, Tabs, Switch, etc. (Dialog focus/Esc details were not verified beyond the docs page.) **No Toast; no public Tooltip** (a `tooltip.js` exists in `dist/components` but is not exported from the index; scan of installed package). https://headlessui.com/react/dialog ; https://headlessui.com/react/menu
- Size **(measured, gzip)**: dialog 16.7 KB, menu 32.7 KB, dialog+menu+popover 41.8 KB.

### 2.6 shadcn/ui

- Not a dependency: a CLI (`shadcn` 4.23.0, 2026-10-27, MIT) that copies component source into your repo; repo https://github.com/shadcn-ui/ui 127k stars, 1,771 open issues+PRs, last push 2026-11-05. https://registry.npmjs.org/shadcn/latest ; https://api.github.com/repos/shadcn-ui/ui
- Needs: Tailwind CSS (docs "Add Tailwind CSS": `tailwindcss @tailwindcss/vite`, `@import "tailwindcss"`), the `@/*` path alias, `components.json`; theming through Tailwind-mapped CSS variables (`--background`, `--primary`, `--primary-foreground`) with dark mode via a `.dark` class. https://ui.shadcn.com/docs/installation/vite.md ; https://ui.shadcn.com/docs/theming.md
- Under the hood: current docs pages declare `base: base` and link to Base UI docs (Dialog, Tooltip, Toast); the Command component still wraps `cmdk`. https://ui.shadcn.com/docs/components/dialog.md ; https://ui.shadcn.com/docs/components/command.md
- Verdict: it is a styled-primitive recipe set. It would put a second token vocabulary and `.dark` theming next to `light-dark()` / `[data-theme]`, and every wrapper is Tailwind utility classes that Tandem does not use. Its only reusable value is the pattern of thin wrappers over Base UI parts.

### 2.7 Mantine

- `@mantine/core` 9.7.5 (2026-11-04), MIT; also `@mantine/notifications`, `@mantine/spotlight` (command palette) 9.7.5. Repo https://github.com/mantinedev/mantine: 31.9k stars, 26 open issues, last push 2026-11-04, 1,880 commits in 12 months of which 1,611 by one author (rtivital); 39 stable releases in 12 months. https://api.github.com/repos/mantinedev/mantine
- React 19: peer `react ^19.2.0` (Tandem is on 19.3.1). https://registry.npmjs.org/@mantine/core/latest
- Styling: required `MantineProvider`; theme as `--mantine-*` CSS variables and a `data-mantine-color-scheme` attribute on `<html>`; whole stylesheet `@mantine/core/styles.css` is **294,869 B raw / 41,821 B gzip (measured)**, per-component sheets exist (Modal 0.5 KB gzip, Tooltip 0.4, Menu 0.8, notifications 0.6, measured); PostCSS preset recommended. https://mantine.dev/guides/vite/ ; https://mantine.dev/theming/color-schemes/
- Notifications: `limit` 5 with a queue, `autoClose: false` for persistent, `pauseResetOnHover: "all"` default (source), stacked layout. https://mantine.dev/x/notifications/ ; installed `notifications/esm/Notifications.mjs`
- Size **(measured, gzip, JS only)**: modal 27.5 KB, tooltip 34.0 KB, notifications 28.2 KB, menu 46.1 KB, all four 73.5 KB.
- Verdict: conflicts with the hard constraints (second theme system, shipped default stylesheet).

### 2.8 Baseline: custom + focused pieces

**Native platform (web-features 3.45.0, the Baseline dataset behind MDN/web.dev), https://www.npmjs.com/package/web-features :**

| Feature | Baseline | Chrome | Firefox | Safari |
|---|---|---|---|---|
| `<dialog>` (`showModal`) | high (low 2022-03-14, high 2024-09-14) | 37 | 98 | 15.4 |
| `inert` | high (2023-04-11 / 2025-10-11) | 102 | 112 | 15.5 |
| Popover API | low (2025-01-27); key sub-features high 2026-10-16 | 116 | 125 | 17 |
| Invoker commands (`command`/`commandfor`) | low (2025-12-12) | 135 | 144 | 26.2 |
| CSS anchor positioning | not Baseline overall; core API: low 2026-01-13 | 125 | 147 | 26 (some sub-keys need 27) |
| `closedby` on dialog (light dismiss) | not Baseline | 134 | 141 | no |
| Interest invokers (`interestfor`, declarative hover tooltips) | not Baseline | 142 | no | no |
| `@starting-style` | low (2024-08-06) | 117 | 129 | 17.5 |
| `light-dark()` | low (2024-05-13) | 123 | 120 | 17.5 |

What native gives for Tandem: `showModal()` makes the rest of the document inert (focus trap, no `aria-hidden` bookkeeping), top layer + `::backdrop`, Esc via the `cancel` event, focus restored to the previously focused element on close, `role=dialog`/modal semantics implied. Gaps: the cmdk palette still needs its own markup; scroll lock and enter/exit animation are CSS you write; `closedby` light-dismiss is not in Safari so keep the click-on-backdrop handler; popovers and tooltips need positioning (anchor positioning works in current Chrome/Firefox/Safari but is not fully Baseline) and hover-intent/delay-group logic you write (declarative `interestfor` is Chromium-only); no native menu, no native toast stacking, no listbox focus management. APG patterns for reference (no toast pattern exists; "alert" is the nearest): https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/ , /tooltip/ (work in progress, no consensus), /menu-button/ , /listbox/ , /grid/ , /alert/ , /toolbar/ , /combobox/ .

**Focused libraries:**
- `sonner` 2.0.8 (2026-08-09, MIT, user-owned repo `emilkowalski/sonner`, 13.1k stars, 85 open, 1 release in 12 months, 0 deps): imperative `toast()`, stack with `visibleToasts` (default 3), expands on hover, `closeButton` prop, `duration: Infinity`, hotkey Alt+T to focus. Esc only **collapses** the stack (source), it does not dismiss a toast; injects its own CSS (opt out with `unstyled`). Measured 9.8 KB gzip. https://sonner.emilkowal.ski/toaster ; https://registry.npmjs.org/sonner/latest
- `react-hot-toast` 2.6.1 (2026-09-16, MIT, 4.8 KB gzip measured): pauses on mouse enter (`startPause`), no stack expansion, no close button by default. https://react-hot-toast.com/docs/toast ; installed source.
- `@floating-ui/react` 0.27.20 (2026-07-11, MIT, 0.x, 4 releases in 12 months): hooks for tooltip/popover (`useHover`, `useFocus`, `useDismiss`, `FloatingDelayGroup`, `FloatingFocusManager`); measured 16.5 KB gzip for a tooltip set. Base UI and Mantine both build on it. https://floating-ui.com/docs/react
- `focus-trap` 8.2.4 (2026-10-26, 7.0 KB gzip measured) / `focus-trap-react` 12.0.3: only needed if `<dialog>` is not used.

### 2.9 cmdk health

- `cmdk` 1.1.1, published 2025-03-14; repo https://github.com/dip/cmdk: 13.1k stars, 80 open issues+PRs, last push 2025-10-29 (README only; last code commit 2025-08-03), **0 commits since 2025-11-05**, 0 releases in 12 months. 149.8M downloads/month. https://api.github.com/repos/dip/cmdk ; https://api.npmjs.org/downloads/point/last-month/cmdk
- React 19: peer `^18 || ^19 || ^19.0.0-rc`. Bundles `@radix-ui/react-dialog`; measured 17.9 KB gzip.
- Alternatives with their own command-menu parts: React Aria `Autocomplete` (rc) + `Menu`/`ListBox`; Base UI `Autocomplete`/`Combobox`; Ariakit `Combobox` + `Dialog`. None ships a ready command palette with groups, filtering and `Command.Empty` like cmdk; all would be a rewrite of `Palette.tsx` (147 lines).
- How each plays with cmdk: Radix (shared dialog, `Command.Dialog` works out of the box), Base UI (wrap `<Command>` in `Dialog.Popup`, Esc handled by the dialog; cmdk autofocus vs `initialFocus` needs a spike, **unverified**), React Aria (same, Esc via React key handler), Ariakit (same).

---

## 3. Comparison

Legend: **Y** = provided and meets the criterion per docs/source; **P** = partial; **N** = not provided; **C** = stays custom in Tandem; **?** = unverified. Sizes are measured gzip for the pieces named (see section 2).

| Criterion | Radix | React Aria Comp. | Ariakit | Base UI | Headless UI | shadcn/ui | Mantine | Baseline (native + small libs) |
|---|---|---|---|---|---|---|---|---|
| Dialog: trap, restore focus, Esc, nested | Y (Esc: document capture + preventDefault) | Y (React key handler, stops propagation) | Y (modal, finalFocus; nested ?) | Y (modal/trap-focus, finalFocus, nested, Esc stops propagation) | Y | Y (via Base UI/Radix) | Y (`closeOnEscape`, modal stack) | Y with `<dialog>.showModal()`; scroll lock and animation are CSS you write |
| Popover | Y | Y | Y (Popover, Hovercard) | Y | Y | Y | Y | P (Popover API + anchor positioning, not fully Baseline) |
| Tooltip + delay group | Y (`skipDelayDuration`) | Y (built-in warmup/cooldown) | Y (`TooltipProvider`) | Y (`Tooltip.Provider delay/timeout`) | N | Y (Base UI) | Y | P (floating-ui or ~60 lines custom) |
| Toast: stack, pause hover/focus, persistent, close, Esc, region | P: all but imperative API; Esc semantics ? | P: `UNSTABLE_`; no Esc; F6 region | N | Y: imperative manager, stack, pause, `timeout:0`, Close, Esc on focused toast, F6; `limit` pitfall | N | Y (Base UI) | P: queue/limit, pause on hover, no Esc ? | C (60 lines) or sonner (Esc collapses only) |
| Menu | Y | Y | Y (45 KB) | Y (61.7 KB) | Y | Y | Y | N (C) |
| Listbox / roving focus / grid / tree | N (roving focus is internal) | Y (ListBox, GridList, Tree, Table; own selection model) | Y (Composite) | N (`internals/composite`) | P (Listbox as select) | N | N | C |
| Command palette | via cmdk | P (Autocomplete rc) | P (Combobox, Plus example ?) | P (Autocomplete) | P (Combobox) | cmdk | Y (`@mantine/spotlight`) | cmdk |
| Page-level focus mgmt | Dialog only | Y (FocusScope, landmarks, F6) | Dialog only | Dialog + toast F6 | Dialog only | n/a | Dialog | Browser (inert) |
| Styling fit with our tokens | Y: unstyled, `data-state` | Y: unstyled, `data-*` states, no CSS | Y: unstyled, few stable selectors | Y: unstyled, `data-*` + CSS vars | Y (Tailwind-oriented docs) | N: Tailwind + `--background`/`.dark` tokens | N: `MantineProvider`, 294 KB sheet | Y |
| Needs a root Provider | Toast, Tooltip only | No | No (stores per widget) | Toast, Tooltip only | No | n/a | Yes (`MantineProvider`) | No |
| Gzip for dialog+tooltip+toast+menu | 37.5 KB (+24 KB over cmdk, shared deps) | ~62 KB (5 widgets + popover/listbox) | ~46 KB (no toast) | 75.0 KB | n/a (no toast/tooltip) | = Base UI + cmdk | 73.5 KB JS + CSS | 0 to ~17 KB |
| Latest version, date | 1.8.1, 2026-10-12 | 1.22.1, 2026-10-09 | 0.4.42, 2026-10-14 | 1.9.0, 2026-10-09 | 2.2.10, 2026-04-07 | CLI 4.23.0, 2026-10-27 | 9.7.5, 2026-11-04 | n/a |
| Last commit / push | 2026-10-14 | 2026-11-05 | 2026-11-05 | 2026-11-05 | 2026-04-13 | 2026-11-05 | 2026-11-04 | n/a |
| Stable releases, 12 mo | 12 | 12 | 23 (0.x) | 11 | 1 | 65 (CLI) | 39 | n/a |
| Open issues+PRs | 268 | 668 | 51 | 455 | 122 | 1,771 | 26 | n/a |
| Ownership / bus factor | WorkOS; ~83% of commits one person | Adobe; 4+ active staff | One maintainer + bots | MUI; several staff, top human ~31% | Tailwind Labs; near-dormant | Individual + Vercel? (**unverified**) | One maintainer (86%) | n/a |
| React 19 peer | Y (^19) | Y (^19.0.0-rc.1) | Y | Y | Y | n/a | Y (requires ^19.2) | n/a |
| Incremental adoption | Y, per widget | Y, per widget (subpath imports) | Y, per widget | Y, per widget | Y | Y | N: provider + theme first | Y |
| Interplay with window key layer | Needs `defaultPrevented` guard for Esc | Keys stopped at the widget: safe, but lists swallow arrows/j/k-like handling | ? | Esc stopped at document: safe | ? | as Base UI | Modal stack with own Esc | None |

**Widget coverage** (yes / partial / no / via other lib):

| Widget | Radix | React Aria | Ariakit | Base UI | Headless UI | shadcn | Mantine | Baseline |
|---|---|---|---|---|---|---|---|---|
| Dialog | yes | yes | yes | yes | yes | yes | yes | yes (native) |
| Popover | yes | yes | yes | yes | yes | yes | yes | partial (native + CSS) |
| Tooltip | yes | yes | yes | yes | no | yes | yes | partial |
| Toast | partial (declarative) | partial (UNSTABLE) | no (sonner) | yes | no (sonner) | yes (Base UI) | yes | custom / sonner |
| Menu | yes | yes | yes | yes | yes | yes | yes | no |
| Listbox / roving focus | no | yes | yes | no | partial | no | no | custom |
| Command palette | via cmdk | partial (Autocomplete rc) | partial | partial (Autocomplete) | partial | via cmdk | yes (Spotlight) | via cmdk |

---

## 4. Mapping to #41 to #46

ACs from `gh issue view 41..46` on jaylouiz/tandem.

### 4.1 Recommended: Base UI

**#41 Keyboard basics (open PR): absorbs 0 of 6 ACs.** Board roving focus + scroll-into-view (AC 1), Card keys only on Card views (2), ⌘A / Esc clears (3), arrows only when a selection moved (4), first Esc blurs a text field (5), E2E (6) all stay custom: Base UI has no public list or Composite. Note for AC 5: inside a Base UI dialog Esc closes the dialog (document handler, stops propagation), so "first Esc blurs the field" applies to non-dialog text fields only; decide whether Capture keeps blur-first.

**#42 One dialog behaviour.**
- AC 1 (shared behaviour for Palette, Capture, Agent overlay, Gallery: trap, `role=dialog` + `aria-modal`, Esc from anywhere, focus back to opener): **absorbed** by one `ui/Dialog.tsx` wrapper over `Dialog.Root/Portal/Backdrop/Popup`. Deletes: Capture's `.dialog-body` Esc handler; AgentOverlay's `opener` ref, `trap()` and focus effect (lines ~59-85); Gallery's Tab trap and focus-return (lines ~85-120) while its own h/l/1-9/p/x keys stay in a handler on the popup; Palette's overlay div, `autoFocus` and Esc `onKeyDown`.
- AC 2 (closing the Card pane returns focus to the opener): **custom** (the pane is not a modal); remember the opener key in the store.
- AC 3 (only one modal at a time): **custom** single `modal: 'palette' | 'capture' | 'agents' | 'gallery' | null` store field; the library allows nesting, it does not forbid it.
- AC 4 (E2E: Tab stays inside, focus returns): custom tests; behaviour provided.

**#43 Toast.**
- AC 1 (timers pause on hover and focus): **absorbed** (hover/focus/window blur in `store.mjs`).
- AC 2 (⌘Z undoes the last undoable action while its Undo is offered; a later toast does not remove an earlier Undo): ⌘Z and the undo stack are **custom**; "stack, Undo not overwritten" is **absorbed** if `limit` is raised above the worst-case simultaneous Undo count (default 3 makes the oldest `inert`).
- AC 3 (failures stay until dismissed; close button; Esc dismisses when focused): **absorbed** (`timeout: 0`, `Toast.Close`, Esc in `ToastRoot`).
- AC 4 (E2E move → other action → ⌘Z): custom.
- Adapter: today `notice` is a single slot written by 16 `setNotice(` call lines in 7 files (`store.ts`, `triage.ts`, `seen.ts`, `drag.ts`, `Capture.tsx`, `CardPane.tsx`, `App.tsx`) and rendered in `App.tsx` with a `setTimeout` effect (10/8/4 s). Keep `PushNotice` as the input type and turn `setNotice` into a function that calls `toastManager.add(...)`; `createToastManager()` works from non-React modules like `triage.ts`.

**#45 Shortcut overview.** Absorbs 0 of 3 ACs. The overview is a Dialog (from #42), the key table `src/web/keys.ts` (decision D1 of #41) and the palette-completeness unit test are custom. Tooltips with key hints reuse the same table.

**#46 Controls explain themselves.**
- Disabled reasons (`title` + `aria-describedby`): custom. A tooltip on a truly `disabled` button never fires; use `aria-disabled` + a described-by node.
- Pressed state: CSS only (token-based `:active`).
- Icon-only buttons with key tooltips: **absorbed** by `Tooltip.Provider` + one `<Hint keys>` wrapper (19 `title=` lines in `src/web` today: MarkBar 4, CardPane 3, Feedback 3, bits.tsx 3, App.tsx 2, others 1 each).
- Sync error detail reachable by keyboard: use `Popover` (tooltips are "visual labels only" per Base UI docs), absorbed.
- Sticky heads, reduced motion, outcome copy: CSS and copy, custom.

### 4.2 Runner-up: Radix Primitives

Same split with these differences. **#42:** also absorbed; Esc needs the `if (e.defaultPrevented) return;` guard at the top of the `App.tsx` handler; Palette can use cmdk's `Command.Dialog` directly. **#43:** pause (docs), persistent (`duration={Infinity}`), close, Esc on focused toast absorbed; stack is "render every notice from a zustand array" (your code, a few lines; there is no limit to hide the oldest Undo); no imperative API (bridge from the store); the global-Esc behaviour of toasts is **unverified** and could steal Esc from "clear marks" while any toast is visible. **#46:** Tooltip and Popover absorbed. **#41/#45:** 0 ACs.

---

## 5. Incremental migration path

Common first step (both options): add `if (e.defaultPrevented) return;` at the top of `onKey` in `App.tsx` `useKeyboard` (harmless today, required for Radix, defensive for Base UI), and create `src/web/ui/` with thin wrappers so call sites never import the library directly (a swap of runner-up for pick then touches `ui/` only). Wrappers use the existing `.overlay`/`.dialog`/`.toast` classes from `styles.css`, so no new visual language and `DESIGN.md` stays authoritative.

Order for Base UI:
1. **Dialog slice (unblocks #42, then #45's `?` sheet).** `ui/Dialog.tsx`. Migrate in this order: `AgentOverlay.tsx` (already `role=dialog`, cleanest reference, deletes `opener`/`trap`), `Capture.tsx` (deletes the `.dialog-body` Esc handler and the stacked-⌘K bug via the single `modal` store field, which replaces `paletteOpen`/`captureOpen`/`agentsOpen` booleans and the `if (s.agentsOpen || s.paletteOpen || s.captureOpen) return` line in `App.tsx`), `Palette.tsx` (wrap `<Command>` in the popup; keep cmdk), `Gallery.tsx` last (largest: remove FOCUSABLE trap and `from.focus()`; keep its window-capture key table or move it to the popup's `onKeyDown`).
2. **Toast slice (unblocks #43).** `Toast.Provider` at the root in `main.tsx`/`App.tsx` with `limit` >= 6; viewport styled with the existing toast tokens, flat list (ignore `--toast-index` scaling to stay calm); `setNotice` becomes a manager call; failures `timeout: 0`; "Start coordinator" and "Undo" become `Toast.Action`; add an undo stack in `store.ts` and the ⌘Z binding in the key table.
3. **Tooltip slice (unblocks the tooltip part of #46).** `Tooltip.Provider` once; `ui/Hint.tsx` (`label`, `keys`); apply to pane Close (`CardPane.tsx`), Gallery arrows, `MarkBar.tsx` buttons, `bits.tsx` activity dot, sync/update chips in `App.tsx` (Popover for the error detail).
4. **Menu/Popover slice.** No menu exists today; adopt `Menu` when the first one is needed (for example a "Move to" or repo filter menu). Do not pre-build.
5. **Lists.** No library. Keep #41's custom roving focus (`WaitingView.tsx` already does `scrollIntoView` on the `aria-selected` row, `BoardView.tsx` must get the same plus `focus({preventScroll:true})`).
6. **Optional, later:** if cmdk stops working with a future React, replace `Palette.tsx` with Base UI Autocomplete (50 KB gzip) or React Aria Autocomplete; until then leave it.

Runner-up (Radix) uses the same order; Palette in slice 1 can switch to `Command.Dialog`; Toast slice keeps the zustand array and renders `Toast.Root` per entry; no imperative manager.

What the order unblocks: slice 1 closes #42 and gives #45 its sheet; slice 2 closes #43; slice 3 closes the tooltip/popover part of #46 (disabled reasons, pressed, sticky heads, reduced motion, copy are independent CSS/copy work that does not need any library and can start now). Because #41 is already in a PR and library-free, nothing blocks on it, but the `keys.ts` table it introduces is the input for #45.

---

## 6. Risks and open questions

- **Base UI maturity.** Stable only since 2025-12-11; new behaviour still lands in minors (v1.9.0 "New menu filtering behavior (preview)"). 455 open issues+PRs. Mitigation: wrappers in `ui/`, pin minor, run the E2E on upgrades.
- **Toast `limit` and `inert`.** Beyond `limit` the oldest toast is inert and hidden. Whether its timer still runs: unverified. Mitigation: `limit` high, failures and Undo-bearing toasts with explicit timeouts, spike with Playwright.
- **cmdk inside a Base UI dialog.** Autofocus/`initialFocus` and Esc ordering untested. Spike in slice 1.
- **Esc semantics.** Esc in a library dialog closes it, even from a text field. #41 AC 5 ("first Esc blurs the field") and #42 ("Esc from anywhere") need one decision for dialogs: recommended, Esc closes.
- **E2E.** Portals mount in `body`; Playwright selectors and `data-testid` must sit on the Popup, not a wrapper.
- **Radix as fallback has its own risk.** Bus factor 1, docs lag npm, global toast Esc unverified.
- **No assistive-technology testing was done.** All a11y claims are from docs/source. Run VoiceOver once per migrated dialog and toast.
- **Unverified items:** Ariakit Dialog Esc vs a window listener; whether Ariakit's command-menu example is paid; shadcn ownership/backing; Radix toast global Esc; Base UI limited-toast timers; exact browser support for anchor positioning sub-keys beyond what `web-features` reports.
- **Measurement caveat.** The gzip numbers are esbuild bundles of selected named exports, not application builds; shared dependencies are counted per entry, so entry sizes do not add up. For a locally served app the size gap between Radix (+24 KB) and Base UI (+75 KB) is not decisive.

**What would change the recommendation**
- A spike where Base UI Toast + Dialog + cmdk misbehave (focus fight, `limit` loses Undo) -> Radix.
- Roadmap with tree/grid/virtualised lists or Tandem moving list selection into a library -> React Aria Components (best keyboard engine; accept its heavier size and wait for Toast to leave `UNSTABLE_`).
- Roadmap with no menus/popovers and a preference for zero dependencies -> the baseline: native `<dialog>` + a 60-line store-driven toast + a small custom tooltip.
- cmdk breaking on a future React/Vite -> Base UI Autocomplete or React Aria Autocomplete (rc becoming stable).
- Base UI regressions or slowing releases (watch the monthly cadence) -> Radix.

---

## 7. Sources

npm registry (versions, dates, peerDependencies, unpackedSize, licences): https://registry.npmjs.org/radix-ui , /@radix-ui/react-dialog , /@radix-ui/react-toast , /@radix-ui/react-tooltip , /@radix-ui/react-dropdown-menu , /@radix-ui/react-popover , /@radix-ui/react-roving-focus , /react-aria-components , /react-aria , /@react-aria/toast , /@ariakit/react , /@ariakit/react-core , /@base-ui/react , /@base-ui-components/react , /@headlessui/react , /shadcn , /@mantine/core , /@mantine/notifications , /@mantine/spotlight , /cmdk , /sonner , /react-hot-toast , /@floating-ui/react , /focus-trap , /focus-trap-react (each with `/latest` for current manifests).
npm downloads: https://api.npmjs.org/downloads/point/last-month/<pkg> for radix-ui, react-aria-components, @ariakit/react, @base-ui/react, @headlessui/react, @mantine/core, cmdk, sonner, @floating-ui/react.
GitHub API (stars, open issues, pushed_at, releases, commits since 2025-11-05): https://api.github.com/repos/radix-ui/primitives , adobe/react-spectrum , ariakit/ariakit , mui/base-ui , tailwindlabs/headlessui , shadcn-ui/ui , mantinedev/mantine , dip/cmdk , emilkowalski/sonner , timolins/react-hot-toast , floating-ui/floating-ui , focus-trap/focus-trap ; releases: https://api.github.com/repos/mui/base-ui/releases , https://api.github.com/repos/adobe/react-spectrum/releases , https://api.github.com/repos/tailwindlabs/headlessui/releases.
Radix docs: https://www.radix-ui.com/primitives/docs/overview/releases , /components/dialog , /components/toast , /components/tooltip , /guides/styling ; roving-focus README: https://github.com/radix-ui/primitives/blob/main/packages/react/roving-focus/README.md
React Aria docs: https://react-aria.adobe.com/styling , /Toast , /Autocomplete , /Tooltip , /Modal , /GridList , /ListBox , /Menu , release notes https://react-aria.adobe.com/releases/v1-22-0
Ariakit docs: https://ariakit.org/components , /components/dialog , /components/composite , /components/tooltip , /guide/styling , /examples/dialog-combobox-command-menu
Base UI docs: https://base-ui.com/react/overview/releases , /react/components/dialog , /tooltip , /toast , /autocomplete , /react/handbook/styling
Headless UI: https://headlessui.com/react/dialog , /react/menu
shadcn/ui: https://ui.shadcn.com/docs/installation/vite.md , /docs/theming.md , /docs/components/dialog.md , /docs/components/command.md , /docs/components/tooltip.md , /docs/components/sonner.md
Mantine: https://mantine.dev/x/notifications/ , https://mantine.dev/guides/vite/ , https://mantine.dev/theming/color-schemes/
Sonner / react-hot-toast / Floating UI: https://sonner.emilkowal.ski/toaster , https://react-hot-toast.com/docs/toast , https://floating-ui.com/docs/react
Platform data: https://www.npmjs.com/package/web-features (v3.45.0, `data.json`); MDN is built from the same compat data: https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/dialog
APG: https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/ , /tooltip/ , /menu-button/ , /listbox/ , /grid/ , /alert/ , /toolbar/ , /combobox/
Installed-package source reads (all from the versions in section 2, scratch install): `@radix-ui/react-dismissable-layer`, `react-use-escape-keydown`, `react-toast`, `react-dialog`, `react-focus-scope`; `react-aria` (`useOverlay`, `FocusScope`, `createEventHandler`, `useSelectableCollection`, `useToastRegion`); `react-stately` `useToastState`; `@base-ui/react` (`toast/store.mjs`, `toast/root/ToastRoot.mjs`, `floating-ui-react/hooks/useDismiss.mjs`, `tooltip/provider`, `dialog/root`); `@ariakit/react-components` (`useDialog`); `sonner`, `react-hot-toast`, `@mantine/notifications`; `cmdk` typings.
Tandem repo facts read: `src/web/App.tsx` (window `keydown` handler, toast markup and timers), `components/Palette.tsx`, `Capture.tsx`, `AgentOverlay.tsx`, `Gallery.tsx`, `WaitingView.tsx`, `MarkBar.tsx`, `src/web/panelKeys.ts`, `store.ts` (`notice`), `package.json`; issues #41, #42, #43, #45, #46.
