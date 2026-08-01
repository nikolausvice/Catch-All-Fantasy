"use client";

import { useState } from "react";

const TABS = [
  { key: "overview", label: "Overview" },
  { key: "live", label: "Live & Rooting" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

const LIVE_SUB_TABS = [
  { key: "playing", label: "Still Playing" },
  { key: "rooting", label: "Rooting & Overlap" },
] as const;

type LiveSubTabKey = (typeof LIVE_SUB_TABS)[number]["key"];

export function IntelTabs({
  overview,
  stillPlaying,
  rootingAndOverlap,
  stillPlayingCount,
}: {
  overview: React.ReactNode;
  stillPlaying: React.ReactNode;
  rootingAndOverlap: React.ReactNode;
  stillPlayingCount: number;
}) {
  const [active, setActive] = useState<TabKey>("overview");
  // Nothing chosen yet → lead with whichever half of "Live & Rooting" is
  // actually actionable right now: live conflicts if any exist, otherwise
  // the always-available overlap explorer.
  const [liveSubTab, setLiveSubTab] = useState<LiveSubTabKey | null>(null);
  const resolvedSubTab: LiveSubTabKey =
    liveSubTab ?? (stillPlayingCount > 0 ? "playing" : "rooting");

  return (
    <div className="flex flex-col gap-5">
      <div className="flex gap-1 overflow-x-auto rounded-lg border border-border bg-muted/40 p-1">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActive(tab.key)}
            className={`flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              active === tab.key
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.label}
            {tab.key === "live" && stillPlayingCount > 0 && (
              <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-bold">
                {stillPlayingCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {active === "overview" && <div className="flex flex-col gap-8">{overview}</div>}

      {active === "live" && (
        <div className="flex flex-col gap-4">
          <div className="flex w-full gap-1 overflow-x-auto rounded-lg bg-muted/60 p-1 text-sm">
            {LIVE_SUB_TABS.map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setLiveSubTab(tab.key)}
                className={`flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 font-medium transition-colors ${
                  resolvedSubTab === tab.key
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {tab.label}
                {tab.key === "playing" && stillPlayingCount > 0 && (
                  <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-bold">
                    {stillPlayingCount}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Both stay mounted (toggled via CSS) so switching back and
              forth doesn't reset each panel's own filters/selection. */}
          <div className={resolvedSubTab === "playing" ? "flex flex-col gap-8" : "hidden"}>
            {stillPlaying}
          </div>
          <div className={resolvedSubTab === "rooting" ? "flex flex-col gap-8" : "hidden"}>
            {rootingAndOverlap}
          </div>
        </div>
      )}
    </div>
  );
}
