import { CompareNavIcon } from './components/icons';
import type { Icon } from '@tabler/icons-react';

/**
 * Every page in the app, in the order the sidebar lists them.
 *
 * One array rather than nav markup plus a separate route list, because those two drift: a page
 * gets a route and no link, or a link outlives the page it pointed at. Both the sidebar and the
 * router read this, so adding a page is one entry here plus the component itself.
 */
export interface NavItem {
  /** Path segment. Also the React key, so it must stay unique. */
  path: string;
  /** Sidebar label. Kept short - the rail collapses to icons and this becomes the tooltip. */
  label: string;
  icon: Icon;
  /**
   * Longer description for the collapsed rail's tooltip, where the label alone is hidden. Also
   * useful later on a home page that lists the sections.
   */
  description: string;
}

export const NAV_ITEMS: NavItem[] = [
  {
    path: '/compare',
    label: 'Compare players',
    icon: CompareNavIcon,
    description: 'Compare two players across books to set your lineup.',
  },
];

/** Where `/` sends people. Its own constant so a future home page is a one-line change. */
export const DEFAULT_PATH = '/compare';
