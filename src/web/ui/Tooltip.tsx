// Tooltips and the small popover of the app (ADR 0005, #46). The only code besides Dialog that imports `@base-ui/react`; the look is our classes (`tooltip`, `popover`).
// Base UI gives: opens on hover and on keyboard focus, closes on Esc and on blur, one shared delay (the first tooltip waits, its neighbours open at once).
// A tooltip is a visual label only (screen readers get the button's own name): an icon-only button keeps its `aria-label`.
import { Popover as BasePopover } from "@base-ui/react/popover";
import { Tooltip as Base } from "@base-ui/react/tooltip";
import { cloneElement, type ReactElement, type ReactNode } from "react";

/** One provider at the root: the delay is shared by every tooltip below it. */
export function TooltipProvider({ children }: { children: ReactNode }) {
  return (
    <Base.Provider delay={450} closeDelay={0} timeout={500}>
      {children}
    </Base.Provider>
  );
}

/** `aria-keyshortcuts` names keys the DOM way; the key cap shows the short form. */
const ARIA_KEY: Record<string, string> = { esc: "Escape", "←": "ArrowLeft", "→": "ArrowRight" };

/**
 * A tooltip on `children` (one element that takes a ref and props: a `<button>`). `keys` is the shortcut, shown as key caps and announced as
 * `aria-keyshortcuts`. For a control that is `disabled` the tooltip never fires: such a control says why through `Btn` instead (bits.tsx).
 */
export function Tooltip({ label, keys, side = "top", children }: { label: string; keys?: string; side?: "top" | "bottom" | "left" | "right"; children: ReactElement<Record<string, unknown>> }) {
  return (
    <Base.Root>
      <Base.Trigger render={keys ? cloneElement(children, { "aria-keyshortcuts": ARIA_KEY[keys] ?? keys }) : children} />
      <Base.Portal>
        <Base.Positioner side={side} sideOffset={6} className="tooltip-pos">
          <Base.Popup className="tooltip" data-testid="tooltip">
            {label}
            {keys && <kbd>{keys}</kbd>}
          </Base.Popup>
        </Base.Positioner>
      </Base.Portal>
    </Base.Root>
  );
}

/**
 * A button that opens a small popover with details (a keyboard user reaches what a `title` only gives a mouse). Enter or Space on the button opens it,
 * Esc closes it and returns focus to the button. `className` styles the button, `children` is its content, `detail` the popover's content.
 */
export function InfoPopover({ label, className, testId, detail, children }: { label: string; className?: string; testId?: string; detail: ReactNode; children: ReactNode }) {
  return (
    <BasePopover.Root>
      <BasePopover.Trigger className={className} data-testid={testId}>
        {children}
      </BasePopover.Trigger>
      <BasePopover.Portal>
        <BasePopover.Positioner side="bottom" align="end" sideOffset={6} className="popover-pos">
          <BasePopover.Popup className="popover" aria-label={label} data-testid={testId ? `${testId}-detail` : undefined}>
            {detail}
          </BasePopover.Popup>
        </BasePopover.Positioner>
      </BasePopover.Portal>
    </BasePopover.Root>
  );
}
