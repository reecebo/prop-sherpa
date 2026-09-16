import { useEffect, useState } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { Sidebar } from './components/Sidebar';
import { ICON_SIZE, ICON_STROKE, MenuIcon } from './components/icons';
import { DEFAULT_PATH } from './navigation';
import ComparePage from './pages/ComparePage';
import './App.css';

/**
 * Where the always-present sidebar gives way to an overlay drawer. Must match the `max-width` in
 * App.css: the stylesheet decides which nav is on screen, and this decides whether the trigger
 * and the Escape key have anything to act on.
 */
const DRAWER_QUERY = '(max-width: 1100px)';

/**
 * The application shell: navigation, and whichever page the route selects.
 *
 * Pages render their own header and own everything below it. This file holds only what is true on
 * every page, so adding one means adding a route here and an entry in `navigation.ts`.
 */
export default function App() {
  /*
   * Drawer state is deliberately not persisted. Restoring an open drawer on load would cover the
   * page with a menu nobody just asked for. On wide screens it is never read at all - the nav is
   * always visible there and has no open or closed state to remember.
   */
  const [drawerOpen, setDrawerOpen] = useState(false);

  /*
   * Whether the stylesheet is currently showing the drawer rather than the pinned sidebar. Read
   * from the same media query the CSS uses rather than from `window.innerWidth`, so the two can
   * never disagree about where the breakpoint is - and so zoom, which changes the effective
   * width, is handled for free.
   */
  const [isNarrow, setIsNarrow] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(DRAWER_QUERY).matches,
  );

  useEffect(() => {
    const query = window.matchMedia(DRAWER_QUERY);
    const onChange = (event: MediaQueryListEvent) => {
      setIsNarrow(event.matches);
      // Widening past the breakpoint closes the drawer, so a stale scrim never covers the page.
      if (!event.matches) setDrawerOpen(false);
    };

    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  /*
   * Escape closes the drawer. An overlay that traps you until you find the right spot to click is
   * the usual complaint about slide-out menus, and the scrim alone does not help keyboard users.
   */
  useEffect(() => {
    if (!drawerOpen) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setDrawerOpen(false);
    }

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [drawerOpen]);

  return (
    <div className="shell">
      <Sidebar open={drawerOpen} onClose={() => setDrawerOpen(false)} />

      <div className="shell-main">
        {/*
         * Exists only below the breakpoint, where the nav is off-screen and cannot offer a way
         * back to itself. Above it the nav is always visible, so a button to reveal it would do
         * nothing - and is hidden in CSS rather than unmounted, so no width check gates the
         * markup.
         */}
        <button
          type="button"
          className="nav-trigger"
          onClick={() => setDrawerOpen((value) => !value)}
          aria-label="Open navigation"
          aria-expanded={drawerOpen}
          aria-controls="main-nav"
          /* Off the tab order when the stylesheet has hidden it, so wide-screen keyboard users
             do not tab through a control they cannot see. */
          tabIndex={isNarrow ? undefined : -1}
        >
          <MenuIcon size={ICON_SIZE.nav} stroke={ICON_STROKE} aria-hidden="true" />
        </button>

        <main className="app">
          <Routes>
            {/* One line per page, written out rather than generated from NAV_ITEMS - the nav
                list says where a page appears in the menu, not what renders there, and mapping
                it to a component would silently serve the wrong page for the next entry. */}
            <Route path="/compare" element={<ComparePage />} />

            {/* `/` and anything unrecognised land on the default page rather than a blank screen.
                `replace` keeps the bad path out of history, so Back does not return to it. */}
            <Route path="*" element={<Navigate to={DEFAULT_PATH} replace />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}
