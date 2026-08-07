"use client";

import { useState } from "react";
import Link from "next/link";
import { ElementHeightVar } from "@/components/element-height-var";
import { TABS, type TabKey } from "@/lib/tabs";

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
}: {
  activeKey: TabKey | null;
  onSelect?: (key: TabKey) => void;
}) {
  return (
    <div
      id="app-tabs"
      className="sticky z-10 -mx-4 -mt-4 border-b border-border bg-background px-4 py-2"
      style={{ top: "var(--site-header-height, 69px)" }}
    >
      <ElementHeightVar selector="#app-tabs" varName="--tabs-height" />
      <div className="flex justify-center">
        <div className="flex gap-1 overflow-x-auto rounded-lg border border-border bg-muted/40 p-1">
          {TABS.map((tab) => {
            const className = `flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              activeKey === tab.key
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`;
            return onSelect ? (
              <button key={tab.key} type="button" onClick={() => onSelect(tab.key)} className={className}>
                {tab.label}
              </button>
            ) : (
              <Link key={tab.key} href={`/dashboard?tab=${tab.key}`} className={className}>
                {tab.label}
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function IntelTabs({
  initialTab,
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
  overview: React.ReactNode;
  rootingAndOverlap: React.ReactNode;
  outcomeLandscape: React.ReactNode;
}) {
  const [active, setActive] = useState<TabKey>(initialTab ?? "overview");

  return (
    <div className="flex flex-col gap-5">
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
      <AppTabsBar activeKey={active} onSelect={setActive} />

      {active === "overview" && <div className="flex flex-col gap-8">{overview}</div>}
      {active === "players" && <div className="flex flex-col gap-8">{rootingAndOverlap}</div>}
      {active === "outcomes" && <div className="flex flex-col gap-8">{outcomeLandscape}</div>}
    </div>
  );
}
