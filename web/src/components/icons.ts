/**
 * Every icon the app uses, re-exported from one place.
 *
 * Two reasons this file exists rather than importing from `@tabler/icons-react` at each call site.
 * Tabler names are literal descriptions of the drawing - `IconCaretUpFilled`, `IconTrendingUp` -
 * so a call site importing them directly says what the icon looks like and not what it means. The
 * alias is the app's vocabulary: `BetterStartIcon` survives someone later deciding the triangle
 * should be an arrow.
 *
 * It also keeps the swap cheap. Changing an icon everywhere is an edit here, not a grep.
 */

export {
  // The winning side of a market comparison. A filled caret rather than an outline: it sits at
  // 11px inside a badge, where a stroked triangle turns to mush.
  IconCaretUpFilled as BetterStartIcon,
  // Price drift on anytime-TD markets, in both directions.
  IconTrendingUp as MovementUpIcon,
  IconTrendingDown as MovementDownIcon,
  // Clearing a player slot.
  IconX as RemoveIcon,

  // Navigation.
  IconArrowsLeftRight as CompareNavIcon,
  // One icon for showing and hiding the nav, rather than a pair that swaps: the button is in a
  // fixed spot and its meaning is "navigation", so a changing glyph reads as a different control.
  IconMenu2 as MenuIcon,
} from '@tabler/icons-react';

/**
 * Stroke weight for line icons.
 *
 * Tabler defaults to 2, which reads heavy next to this app's type - the UI runs 10-13px with a
 * muted palette, and a 2px stroke makes every icon louder than the text beside it. 1.75 matches
 * the weight of the surrounding labels.
 */
export const ICON_STROKE = 1.75;

/**
 * Sizes, named for where they go rather than by number, so a call site cannot quietly drift.
 *
 * These are tied to the type scale they sit in: `inline` matches the 11px badge text, `control`
 * the 13px buttons. Anything needing a size not on this list probably wants a new name here.
 */
export const ICON_SIZE = {
  /** Inside a badge or beside 10-11px text. */
  inline: 12,
  /** In a button or control alongside 12-13px text. */
  control: 14,
  /** Navigation items, which carry more weight than an inline control. */
  nav: 18,
} as const;
