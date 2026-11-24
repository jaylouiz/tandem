// The app's menu (ADR 0005, #17): a button that opens a short list of actions, used for what is rarely needed on a Card. Base UI gives the
// behaviour (roles, arrow keys, Home/End, typeahead, Esc closes and returns focus to the button, a click outside closes); the look is our
// classes (`menu`, `menu-item` in styles.css). While it is open it is a layer of its own, like a dialog: the window key table stays out.
// An item shows the single key that runs it with the menu closed (`keys`); `onKey` lets that same key run it while the menu is open.
import { Menu as Base } from "@base-ui/react/menu";
import { useEffect, useState, type ReactElement, type ReactNode } from "react";
import { layer } from "./Dialog.tsx";

const Tick = () => (
  <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M3 8.5 6.5 12 13 4.5" />
  </svg>
);

export interface MenuProps {
  /** the popup's accessible name */
  label: string;
  /** the button (one element that takes a ref and props); it keeps its own `aria-label` */
  trigger: ReactElement<Record<string, unknown>>;
  /** a plain key pressed while the menu is open: return true when it ran something (the menu then closes) */
  onKey?: (key: string) => boolean;
  testId?: string;
  children: ReactNode;
}

export function Menu({ label, trigger, onKey, testId, children }: MenuProps) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    layer.enter();
    return layer.leave;
  }, [open]);
  return (
    <Base.Root open={open} onOpenChange={setOpen}>
      <Base.Trigger render={trigger} />
      <Base.Portal>
        <Base.Positioner side="bottom" align="end" sideOffset={4} className="menu-pos">
          <Base.Popup
            className="menu"
            aria-label={label}
            data-testid={testId}
            onKeyDownCapture={(e) => {
              layer.mark(e.nativeEvent);
              if (e.metaKey || e.ctrlKey || e.altKey || e.key.length !== 1 || !onKey?.(e.key)) return;
              e.preventDefault();
              e.stopPropagation();
              setOpen(false);
            }}
          >
            {children}
          </Base.Popup>
        </Base.Positioner>
      </Base.Portal>
    </Base.Root>
  );
}

interface ItemProps {
  /** the key cap shown at the item's end */
  keys?: string;
  /** why the item does nothing right now: it is disabled and says so under its label */
  why?: string | null;
  onSelect: () => void;
  testId?: string;
  children: ReactNode;
}

const body = (children: ReactNode, why: string | null | undefined, keys: string | undefined) => (
  <>
    <span className="menu-label">
      {children}
      {why && <span className="menu-why">{why}</span>}
    </span>
    {keys && <kbd>{keys}</kbd>}
  </>
);

export function MenuItem({ keys, why, onSelect, testId, children }: ItemProps) {
  return (
    <Base.Item className="menu-item" disabled={!!why} onClick={onSelect} data-testid={testId}>
      <span className="menu-check" aria-hidden />
      {body(children, why, keys)}
    </Base.Item>
  );
}

/** A group of items under a small heading; with `value` its items are radio items and the one whose `value` matches is checked. */
export function MenuGroup({ label, value, children }: { label: string; value?: string | null; children: ReactNode }) {
  const head = <Base.GroupLabel className="menu-head">{label}</Base.GroupLabel>;
  return value === undefined ? (
    <Base.Group>
      {head}
      {children}
    </Base.Group>
  ) : (
    // the value is the caller's (the Card's own state, changed by the item's `onSelect`): the group never keeps one of its own
    <Base.Group>
      {head}
      <Base.RadioGroup value={value ?? ""}>{children}</Base.RadioGroup>
    </Base.Group>
  );
}

export function MenuRadio({ value, keys, why, onSelect, testId, children }: ItemProps & { value: string }) {
  return (
    <Base.RadioItem className="menu-item" value={value} disabled={!!why} closeOnClick onClick={onSelect} data-testid={testId}>
      <span className="menu-check" aria-hidden>
        <Base.RadioItemIndicator>
          <Tick />
        </Base.RadioItemIndicator>
      </span>
      {body(children, why, keys)}
    </Base.RadioItem>
  );
}

/** An item that is a link (opens elsewhere). */
export function MenuLink({ href, keys, children }: { href: string; keys?: string; children: ReactNode }) {
  return (
    <Base.LinkItem className="menu-item" href={href} target="_blank" rel="noreferrer" closeOnClick>
      <span className="menu-check" aria-hidden />
      {body(children, null, keys)}
    </Base.LinkItem>
  );
}

export const MenuSeparator = () => <Base.Separator className="menu-sep" />;
