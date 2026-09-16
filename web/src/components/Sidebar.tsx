import { NavLink } from 'react-router-dom';
import { DEFAULT_PATH, NAV_ITEMS } from '../navigation';
import { ICON_SIZE, ICON_STROKE } from './icons';
import logo from '../assets/propsherpa-logo.png';

interface Props {
  /** Narrow screens: the drawer is open over the content. */
  open: boolean;
  onClose: () => void;
}

/**
 * Primary navigation.
 *
 * On wide screens this is furniture: always present, never collapsed, and carrying no controls of
 * its own. It sits in the margin the centred page already leaves empty, so it costs no content
 * width and nothing reflows when it appears - the reason there is no collapse toggle is that
 * there is nothing to reclaim by collapsing it.
 *
 * Below the breakpoint that margin does not exist, so the same markup becomes a drawer over the
 * page. Which one applies is a CSS media query rather than a prop: a JS width check disagrees
 * with the stylesheet during resize and on first paint.
 */
export function Sidebar({ open, onClose }: Readonly<Props>) {
  return (
    <>
      {/*
       * Scrim sits under the drawer and over the page. Only ever visible on narrow screens - on
       * wide ones the nav covers nothing, so there is nothing to dim.
       */}
      {open && <div className="nav-scrim" onClick={onClose} aria-hidden="true" />}

      <nav
        /* Target of the trigger's `aria-controls`, so assistive tech can follow the button to the
           nav it opens. */
        id="main-nav"
        className="nav"
        data-open={open || undefined}
        aria-label="Main"
      >
        {/*
         * The logo is the wordmark - it already contains the name, so there is no text beside it
         * to repeat. It links home rather than being inert: a brand mark in the top corner is
         * somewhere people click to get back, and an image that ignores the click is a dead spot.
         *
         * `alt` carries the name for anyone who cannot see the image, which is why the visible
         * text could be dropped without losing it.
         */}
        <div className="nav-head">
          <NavLink to={DEFAULT_PATH} className="nav-brand" aria-label="PropSherpa - home">
            <img src={logo} alt="PropSherpa" className="nav-logo" />
          </NavLink>
        </div>

        <ul className="nav-list">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;

            return (
              <li key={item.path}>
                <NavLink
                  to={item.path}
                  className={({ isActive }) => (isActive ? 'nav-item active' : 'nav-item')}
                  /*
                   * Selecting a page closes the drawer. On wide screens the drawer is never open,
                   * so this is a no-op there rather than a branch.
                   */
                  onClick={onClose}
                >
                  <Icon size={ICON_SIZE.nav} stroke={ICON_STROKE} aria-hidden="true" />
                  <span className="nav-label">{item.label}</span>
                </NavLink>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}
