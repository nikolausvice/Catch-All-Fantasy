"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { AddLeagueButton } from "@/components/add-league-button";
import { ElementHeightVar } from "@/components/element-height-var";
import { TABS, type TabKey } from "@/lib/tabs";

/** Grows each tab in proportion to its own label's length below the `sm`
 * breakpoint (so the longest label doesn't wrap onto a second line and end
 * up visibly taller/thicker than its neighbors the way forced-equal thirds
 * did on a narrow phone), then snaps back to equal thirds at `sm` and up,
 * where there's room to spare and uniform tabs look more intentional.
 * Literal Tailwind arbitrary-value classes (not a computed/inline
 * flex-grow) specifically so the sm: responsive variant — a plain class,
 * evaluated by a real media query — can actually win at that breakpoint;
 * an inline style's specificity would beat any class unconditionally,
 * breakpoint or not. */
const TAB_FLEX_CLASS: Record<TabKey, string> = {
  overview: "flex-[8] sm:flex-1",
  players: "flex-[7] sm:flex-1",
  outcomes: "flex-[8] sm:flex-1",
};

/** The sticky tab bar's own look, shared between the real (stateful) tabs on
 * the dashboard and the plain navigation version shown elsewhere (e.g. a
 * single matchup's page) — same visual chrome either way, so leaving the
 * dashboard's three sections doesn't also mean losing the tabs themselves.
 * `activeKey` is the currently-selected tab when interactive (button-based,
 * calls onSelect), or null to render every tab as a plain link back to
 * `/dashboard?tab=<key>` with none of them highlighted — there's no "current
 * tab" once you're no longer actually on the dashboard. */
export function AppTabsBar({
  activeKey,
  onSelect,
  hasStoredEspnCookies,
}: {
  activeKey: TabKey | null;
  onSelect?: (key: TabKey) => void;
  /** Renders "+ Add league" to the right of Outcomes — moved here from the
   * site header specifically so it mirrors the Outcomes filter row's own
   * trailing "?" button; same row shape (N equal boxes + one fixed square
   * at the end) in both places. */
  hasStoredEspnCookies: boolean;
}) {
  return (
    <div
      id="app-tabs"
      className="sticky z-10 -mx-4 -mt-4 border-b border-border bg-background px-4 py-2"
      style={{ top: "var(--site-header-height, 69px)" }}
    >
      <ElementHeightVar selector="#app-tabs" varName="--tabs-height" />
      {/* Same equal-width-rectangles, border-2-when-selected language as the
          Outcomes tab's Yet to Play/Live/Final filter row — one visual
          vocabulary for "these are the mutually exclusive views/filters you
          can pick between" everywhere it shows up, rather than this being a
          rounded pill selector while that one is square boxes. */}
      <div className="mx-auto flex max-w-5xl gap-2">
        {TABS.map((tab) => {
          const className = `whitespace-nowrap rounded-md border-2 px-2 py-1 text-center text-sm font-medium transition-colors sm:px-3 sm:py-1.5 ${TAB_FLEX_CLASS[tab.key]} ${
            activeKey === tab.key
              ? "border-foreground text-foreground"
              : "border-border text-muted-foreground hover:text-foreground"
          }`;
          return onSelect ? (
            <button
              key={tab.key}
              type="button"
              aria-pressed={activeKey === tab.key}
              onClick={() => onSelect(tab.key)}
              className={className}
            >
              {tab.label}
            </button>
          ) : (
            <Link key={tab.key} href={`/dashboard?tab=${tab.key}`} className={className}>
              {tab.label}
            </Link>
          );
        })}
        <AddLeagueButton
          hasStoredEspnCookies={hasStoredEspnCookies}
          label={<span className="text-lg font-semibold leading-none">+</span>}
          ariaLabel="Add league"
          className="flex size-9 shrink-0 items-center justify-center rounded-md border-2 border-border text-muted-foreground transition-colors hover:border-foreground hover:text-foreground"
        />
      </div>
    </div>
  );
}

export function IntelTabs({
  initialTab,
  hasStoredEspnCookies,
  overview,
  rootingAndOverlap,
  outcomeLandscape,
}: {
  /** Seeds the initially-active tab from `?tab=` (see AppTabsBar) so a link
   * from elsewhere — e.g. a matchup's own page — can land directly on the
   * tab it named instead of always resetting to Overview. Purely an initial
   * value: switching tabs afterward stays a local, client-only toggle (no
   * URL updates, no server re-fetch) same as before. */
  initialTab?: TabKey;
  hasStoredEspnCookies: boolean;
  overview: React.ReactNode;
  rootingAndOverlap: React.ReactNode;
  outcomeLandscape: React.ReactNode;
}) {
  const [active, setActive] = useState<TabKey>(initialTab ?? "overview");
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  // Swipe threshold in px, and how much more horizontal than vertical travel
  // a touch needs before it counts as a tab swipe rather than a vertical
  // scroll — without the ratio check, a mostly-vertical scroll with a tiny
  // horizontal wobble would otherwise flip tabs by accident.
  const SWIPE_THRESHOLD = 60;

  function handleTouchStart(e: React.TouchEvent) {
    const touch = e.touches[0];
    touchStartRef.current = { x: touch.clientX, y: touch.clientY };
  }

  function handleTouchEnd(e: React.TouchEvent) {
    const start = touchStartRef.current;
    touchStartRef.current = null;
    if (!start) return;

    const touch = e.changedTouches[0];
    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;
    if (Math.abs(dx) < SWIPE_THRESHOLD || Math.abs(dx) < Math.abs(dy) * 1.5) return;

    const currentIndex = TABS.findIndex((t) => t.key === active);
    const nextIndex = currentIndex + (dx < 0 ? 1 : -1);
    if (nextIndex >= 0 && nextIndex < TABS.length) {
      setActive(TABS[nextIndex].key);
    }
  }

  return (
    <div className="flex flex-col">
      {/* Sticky, stacked right below the site header (--site-header-height
          is measured live, not guessed — see ElementHeightVar) — losing the
          tabs the moment you scroll meant scrolling back to the top just to
          switch views. -mx-4/px-4 cancels out <main>'s own horizontal
          padding so the solid background spans edge to edge instead of
          leaving the page's side margins see-through. -mt-4 cancels out
          <main>'s own top padding (pt-4 at every breakpoint) the same
          way — otherwise that gap sits
          above the tabs bar at scroll position 0 but disappears the instant
          the bar reaches its sticky offset and catches the header, reading
          as the gap visibly getting squeezed out while scrolling. Flush
          against the header from the very first frame avoids that. */}
      <AppTabsBar activeKey={active} onSelect={setActive} hasStoredEspnCookies={hasStoredEspnCookies} />

      {/* No gap between this and the tabs bar above by default — Outcomes'
          own sticky filter bar needs to sit flush against it for the exact
          same reason the tabs bar sits flush against the header (see the
          comment above): any nonzero gap here is fine while scrolled to the
          top, but reads as space visibly "squeezing" shut the moment the
          filter bar's own sticky offset engages and catches the tabs bar.
          Overview/Rooting have no sticky element of their own
          immediately inside them, so they add their own pt-5 back instead
          of relying on a gap up here that Outcomes can't also use safely.
          Touch handlers here (not on the outer div) let left/right swipes
          switch tabs the same way tapping AppTabsBar does, while vertical
          scrolling within the content is untouched. */}
      <div onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
        {active === "overview" && <div className="flex flex-col gap-8 pt-5">{overview}</div>}
        {active === "players" && <div className="flex flex-col gap-8 pt-5">{rootingAndOverlap}</div>}
        {active === "outcomes" && <div className="flex flex-col gap-8">{outcomeLandscape}</div>}
      </div>
    </div>
  );
}
