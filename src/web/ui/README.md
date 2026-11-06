# `src/web/ui/`: wrappers around Base UI

ADR 0005. Components import from here, never from `@base-ui/react`; swapping the library touches this folder only.

- One file per widget (`Dialog.tsx`, `Toast.tsx`; Tooltip follows). Keep a wrapper small: props the app needs, our class names, Base UI behaviour.
- Base UI ships no CSS. The look is classes and tokens from `src/web/styles.css`; no raw colours here.
- The wrapper owns what the library leaves open (see the comments in `Dialog.tsx`: `aria-modal`, focus return, the key table asking `anyDialogOpen()` and `keyFromDialog(e)`: a key that went through a dialog stays dialog-owned even if the dialog closed on it).
- Test behaviour in `e2e/` (focus, Esc, Tab). Unit tests are for logic that does not need a DOM.
- Pinned exact in `package.json`; an upgrade runs the E2E suite.
- `Toast.tsx` is the one toast stack: `showToast(spec)` from anywhere (a store `setNotice` becomes one through `notices.ts`), `ToastRegion` mounted once in `App.tsx`. It owns what the library leaves open: `LIMIT` (above the Undos one can pile up, else the oldest turns `inert`), the Undo stack behind ⌘Z (`undoLatest`, called by the key table), a failure as `priority: "high"` (Base UI mirrors it into a hidden `role="alert"` and `aria-hidden`s the toast itself until the region has focus, so tests reach buttons of a failure by class) and `keyFromToast(e)` (Esc on a focused toast is the toast's).
