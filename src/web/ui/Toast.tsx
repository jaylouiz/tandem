// The one toast stack of the app (ADR 0005, #43), on Base UI Toast: timers pause while the stack is hovered or focused, a toast with `timeout: 0`
// stays until dismissed, every toast has a close button, Esc on a focused toast dismisses it, F6 jumps into the region. A failure (`failed`) is
// `priority: "high"`: Base UI then mirrors it into a visually hidden `role="alert"` and the toast itself becomes an alertdialog. Only this folder
// imports `@base-ui/react`; the look is `.toast*` in styles.css.
//
// An Undo belongs to its toast: it is offered while the toast is up, and ⌘Z (the key table calls `undoLatest`) runs the newest one that is still offered.
// `LIMIT` is far above the Undos a developer can pile up inside their 8 s: beyond the limit Base UI makes the oldest toast `inert`, and its Undo would be gone.
import { Toast as Base } from "@base-ui/react/toast";

export interface ToastAction {
  label: string;
  run: () => void;
}

export interface ToastSpec {
  /** a toast with this id is updated in place (and its timer restarts) instead of stacking a second one */
  id?: string;
  text: string;
  /** an error: stays like `timeout: 0`, is announced urgently (`role="alert"`) and looks like one */
  failed?: boolean;
  /** ms until it goes; 0 = stays until dismissed. Default 4000; a failure ignores it and stays. */
  timeout?: number;
  /** runs from the Undo button or ⌘Z; either closes the toast, so one Undo runs once */
  undo?: () => void;
  /** one more button (Start coordinator); closes the toast */
  action?: ToastAction;
}

interface Data {
  failed: boolean;
  undo?: () => void;
  action?: ToastAction;
}

const LIMIT = 12;
const DEFAULT_MS = 4000;
const manager = Base.createToastManager<Data>();

/** the toasts whose Undo is still offered, oldest first */
const undos: { id: string; run: () => void }[] = [];
const forget = (id: string) => {
  const i = undos.findIndex((u) => u.id === id);
  if (i >= 0) undos.splice(i, 1);
};

/** Keydowns that went through the toast region: Esc on a focused toast dismisses it and must not also reach the window key table ("clear marks"). */
const fromToast = new WeakSet<Event>();
export const keyFromToast = (e: Event) => fromToast.has(e);

let seq = 0;

/** Show a toast; returns its id. */
export function showToast(spec: ToastSpec): string {
  const id = spec.id ?? `t${++seq}`;
  forget(id); // an update replaces the earlier Undo of the same toast
  if (spec.undo) undos.push({ id, run: spec.undo });
  const data: Data = { failed: !!spec.failed, undo: spec.undo, action: spec.action };
  const options = {
    id,
    title: spec.text,
    timeout: spec.failed ? 0 : (spec.timeout ?? DEFAULT_MS),
    priority: spec.failed ? ("high" as const) : ("low" as const),
    data,
    onClose: () => forget(id),
  };
  manager.add(options);
  return id;
}

export const closeToast = (id: string) => manager.close(id);

/** True while some toast offers an Undo. */
export const canUndo = () => undos.length > 0;

/** ⌘Z: run the newest Undo that is still offered. False when none is (the key then goes on to the browser). */
export function undoLatest(): boolean {
  const u = undos.pop();
  if (!u) return false;
  manager.close(u.id);
  u.run();
  return true;
}

function List() {
  const { toasts } = Base.useToastManager<Data>();
  return toasts.map((t) => {
    const { failed, undo, action } = t.data ?? { failed: false };
    const act = (run: () => void) => () => {
      forget(t.id);
      manager.close(t.id);
      run();
    };
    return (
      <Base.Root key={t.id} toast={t} className="toast" data-tone={failed ? "failed" : "info"} data-testid="toast">
        <Base.Title className="toast-text" />
        {undo && (
          <button type="button" className="btn primary" onClick={act(undo)}>
            Undo
          </button>
        )}
        {action && (
          <button type="button" className="btn primary" onClick={act(action.run)}>
            {action.label}
          </button>
        )}
        {/* Base UI hides the close button from assistive tech until the stack is expanded; ours is a flat list, so it is always there */}
        <Base.Close className="toast-close" aria-label="Dismiss" aria-hidden={false}>
          <span aria-hidden="true">×</span>
        </Base.Close>
      </Base.Root>
    );
  });
}

/** Mount once, near the root of the app. */
export function ToastRegion() {
  return (
    <Base.Provider toastManager={manager} limit={LIMIT}>
      <Base.Viewport
        className="toast-viewport"
        onKeyDown={(e) => {
          if (e.key !== "Escape") return;
          // F6 puts focus on the viewport itself, where no toast is there to close: that Esc is not the toast's. It leaves the region (the timers run
          // again) and goes on to the key table ("clear marks"). Only Esc from inside a toast is owned here.
          if (e.target === e.currentTarget) e.currentTarget.blur();
          else fromToast.add(e.nativeEvent);
        }}
      >
        <List />
      </Base.Viewport>
    </Base.Provider>
  );
}
