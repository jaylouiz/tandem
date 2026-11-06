// The one modal dialog of the app (ADR 0005, #42). Palette, Capture, Agent activity and the Gallery render inside it and get the same
// behaviour from Base UI: focus trap, `role="dialog"` + `aria-modal`, the page behind inert, Esc closes from anywhere inside (also from a
// text field), focus back to the opener. Only this folder imports `@base-ui/react`; styling is our classes (styles.css tokens), Base UI ships no CSS.
import { Dialog as Base } from "@base-ui/react/dialog";
import { useEffect, useLayoutEffect, useRef, type KeyboardEventHandler, type ReactNode, type Ref, type RefObject } from "react";

let openCount = 0;
/** Where focus goes back to when a dialog that was just replaced by another one closes (Palette command -> Agent activity). */
let handoff: { el: HTMLElement | null; at: number } | null = null;
const HANDOFF_MS = 300;

/** True while any Dialog is open. The window key table (`keys.ts`) reads it: dialogs own their keys. */
export const anyDialogOpen = () => openCount > 0;

/** Keydowns that passed through a dialog. A dialog can close while its key is still on its way up (the Gallery's ⌘↵ closes it in React's flush, before the
 *  bubbling window listener runs): `anyDialogOpen()` is false by then, so the window key table asks this instead and still treats the key as dialog-owned. */
const fromDialog = new WeakSet<Event>();
export const keyFromDialog = (e: Event) => fromDialog.has(e);

export interface DialogProps {
  open: boolean;
  /** Esc, a click on the backdrop, or the library closing it. The caller owns `open` (a store field or local state). */
  onClose: () => void;
  /** the accessible name */
  label: string;
  /** classes of the popup; its look is ours (`dialog`, `gallery` in styles.css) */
  className?: string;
  /** false for a popup that is its own full-screen stage (Gallery) */
  backdrop?: boolean;
  /** what gets focus on open: a ref, or false to leave focus alone. Default: the first tabbable element in the popup. */
  initialFocus?: RefObject<HTMLElement | null> | false;
  /** the popup itself, for a caller that focuses it (it has `tabIndex={-1}`) */
  popupRef?: Ref<HTMLDivElement>;
  /** keys of this dialog only (⌘↵, h/l, j/k): they bubble from whatever has focus inside; Esc and Tab are the library's */
  onKeyDown?: KeyboardEventHandler<HTMLDivElement>;
  testId?: string;
  children: ReactNode;
}

export function Dialog({ open, onClose, label, className, backdrop = true, initialFocus, popupRef, onKeyDown, testId, children }: DialogProps) {
  const returnTo = useRef<HTMLElement | null>(null);
  const alive = useRef(true);
  const openNow = useRef(open);
  openNow.current = open;
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  // Focus returns to what had it when the dialog opened. A dialog opened by the closing one (a Palette command: same tick, focus still in the old
  // dialog or on `body`) inherits that dialog's opener instead; layout effects run cleanups before setups, so `handoff` is set by then.
  useLayoutEffect(() => {
    if (!open) return;
    const active = document.activeElement;
    const own = active instanceof HTMLElement && active !== document.body && !active.closest('[role="dialog"]') ? active : null;
    returnTo.current = own ?? (handoff && Date.now() - handoff.at < HANDOFF_MS ? handoff.el : null);
    handoff = null;
    openCount++;
    return () => {
      openCount--;
      handoff = { el: returnTo.current, at: Date.now() };
      // Closed or unmounted (also by a caller that renders `{index !== null && <Gallery/>}`): once the popup is out of the DOM, focus goes back to the opener.
      // Strict Mode's fake cleanup is told apart by the microtask: the effect has set up again by then.
      queueMicrotask(() => {
        const el = returnTo.current;
        if (alive.current && openNow.current) return;
        if (el?.isConnected && (!document.activeElement || document.activeElement === document.body)) el.focus();
      });
    };
  }, [open]);
  // Mounted only while open: a closed dialog is gone at once, with no half-closed popup in the DOM that still holds focus or swallows a key. The
  // library's own close sequence (it waits for animations) is skipped; focus return is ours (above).
  if (!open) return null;
  return (
    <Base.Root open onOpenChange={(o) => !o && onClose()}>
      <Base.Portal>
        {backdrop && <Base.Backdrop className="dialog-backdrop" />}
        <Base.Popup
          ref={popupRef}
          className={className}
          aria-label={label}
          aria-modal="true" // Base UI sets role="dialog" but not aria-modal; the page behind is inert while the dialog is open
          data-testid={testId}
          tabIndex={-1}
          initialFocus={initialFocus}
          finalFocus={() => (returnTo.current?.isConnected ? returnTo.current : null)}
          onKeyDownCapture={(e) => fromDialog.add(e.nativeEvent)}
          onKeyDown={onKeyDown}
        >
          {children}
        </Base.Popup>
      </Base.Portal>
    </Base.Root>
  );
}
