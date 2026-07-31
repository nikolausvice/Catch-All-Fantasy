"use client";

import { useState } from "react";

const TABS = [
  { key: "overview", label: "Overview" },
  { key: "playing", label: "Still Playing" },
  { key: "rooting", label: "Rooting Guide" },
  { key: "overlap", label: "League Overlap" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export function IntelTabs({
  overview,
  stillPlaying,
  rootingGuide,
  leagueOverlap,
  stillPlayingCount,
}: {
  overview: React.ReactNode;
  stillPlaying: React.ReactNode;
  rootingGuide: React.ReactNode;
  leagueOverlap: React.ReactNode;
  stillPlayingCount: number;
}) {
  const [active, setActive] = useState<TabKey>("overview");

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
            {tab.key === "playing" && stillPlayingCount > 0 && (
              <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-bold">
                {stillPlayingCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {active === "overview" && <div className="flex flex-col gap-8">{overview}</div>}
      {active === "playing" && stillPlaying}
      {active === "rooting" && rootingGuide}
      {active === "overlap" && leagueOverlap}
    </div>
  );
}
