import { useCallback, useId, useLayoutEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';

/**
 * A tooltip that explains a number without moving it.
 *
 * The native `title` attribute was doing this job badly: it waits about a second before showing,
 * renders in the OS style rather than the app's, cannot be reached from the keyboard, and inside
 * the props table it appeared at the cursor rather than beside the thing it described.
 *
 * This renders into the top layer via the popover API, so it escapes the table's `overflow: auto`
 * without any portal wiring - a positioned tooltip inside the scroll container would otherwise be
 * clipped at the frozen columns' seam.
 */

/** Space between the trigger and the bubble, and the margin kept from the viewport edge. */
const OFFSET = 8;
const EDGE_PADDING = 8;

/**
 * Pointer tooltips wait, focus tooltips do not. The delay stops bubbles flickering up as the
 * cursor crosses a dense row of numbers, but a keyboard user has already committed by arriving.
 */
const SHOW_DELAY = 350;

interface Props {
  /** The explanation. Kept short - this is a hint, not documentation. */
  content: ReactNode;
  /** The element the tooltip describes. */
  children: ReactNode;
  /**
   * Marks the trigger as explanatory: a dotted underline and a help cursor. Off for controls that
   * already read as interactive, like the remove button.
   */
  underline?: boolean;
  className?: string;
}

export function Tooltip({ content, children, underline = false, className }: Props) {
  const id = useId();
  const triggerRef = useRef<HTMLSpanElement>(null);
  const bubbleRef = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [open, setOpen] = useState(false);
  const [placement, setPlacement] = useState({ left: 0, top: 0, above: true });

  const cancel = useCallback(() => {
    clearTimeout(timer.current);
    timer.current = undefined;
  }, []);

  const show = useCallback(
    (delay: number) => {
      cancel();
      if (delay === 0) {
        setOpen(true);
        return;
      }
      timer.current = setTimeout(() => setOpen(true), delay);
    },
    [cancel],
  );

  const hide = useCallback(() => {
    cancel();
    setOpen(false);
  }, [cancel]);

  // Position is measured after paint, once the bubble has a size to centre and flip against.
  useLayoutEffect(() => {
    if (!open) return;

    const trigger = triggerRef.current;
    const bubble = bubbleRef.current;
    if (!trigger || !bubble) return;

    // showPopover puts the bubble in the top layer; until then it has no measurable box.
    if (!bubble.matches(':popover-open')) bubble.showPopover();

    const anchor = trigger.getBoundingClientRect();
    const box = bubble.getBoundingClientRect();

    // Prefer above, but flip below when the trigger sits too near the top of the viewport.
    const above = anchor.top >= box.height + OFFSET + EDGE_PADDING;
    const top = above ? anchor.top - box.height - OFFSET : anchor.bottom + OFFSET;

    // Centre on the trigger, then pull back inside the viewport rather than overflowing it.
    const centred = anchor.left + anchor.width / 2 - box.width / 2;
    const left = Math.min(
      Math.max(EDGE_PADDING, centred),
      window.innerWidth - box.width - EDGE_PADDING,
    );

    setPlacement({ left, top, above });
  }, [open, content]);

  // Closing has to go through the popover API too, or the element stays in the top layer.
  useLayoutEffect(() => {
    const bubble = bubbleRef.current;
    if (!open && bubble?.matches(':popover-open')) bubble.hidePopover();
  }, [open]);

  // A scroll or resize invalidates the measured position, and the props table scrolls sideways
  // under the tooltip. Closing is honest; a stale bubble pointing at nothing is not.
  useLayoutEffect(() => {
    if (!open) return;

    window.addEventListener('scroll', hide, true);
    window.addEventListener('resize', hide);

    return () => {
      window.removeEventListener('scroll', hide, true);
      window.removeEventListener('resize', hide);
    };
  }, [open, hide]);

  useLayoutEffect(() => cancel, [cancel]);

  return (
    <>
      <span
        ref={triggerRef}
        className={['tip-trigger', underline ? 'tip-underline' : '', className]
          .filter(Boolean)
          .join(' ')}
        // Describes rather than labels: the trigger keeps its own text as the accessible name,
        // and the hint is read after it instead of replacing it.
        aria-describedby={open ? id : undefined}
        tabIndex={0}
        onPointerEnter={(event) => show(event.pointerType === 'touch' ? 0 : SHOW_DELAY)}
        onPointerLeave={hide}
        onFocus={() => show(0)}
        onBlur={hide}
        onKeyDown={(event) => event.key === 'Escape' && hide()}
      >
        {children}
      </span>

      <div
        ref={bubbleRef}
        id={id}
        role="tooltip"
        // `manual` keeps the browser from light-dismissing on any outside click, which would
        // fight the pointer and focus handlers above.
        popover="manual"
        className="tip-bubble"
        data-placement={placement.above ? 'above' : 'below'}
        style={{ left: placement.left, top: placement.top }}
      >
        {content}
      </div>
    </>
  );
}
