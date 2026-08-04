"use client";

import { useState } from "react";

const TABS = [
  { key: "overview", label: "Overview" },
  { key: "players", label: "Players" },
  { key: "outcomes", label: "Outcomes" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export function IntelTabs({
  overview,
  rootingAndOverlap,
  outcomeLandscape,
}: {
  overview: React.ReactNode;
  rootingAndOverlap: React.ReactNode;
  outcomeLandscape: React.ReactNode;
}) {
  const [active, setActive] = useState<TabKey>("overview");

  return (
    <div className="flex flex-col gap-5">
      <div className="flex justify-center">
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
            </button>
          ))}
        </div>
      </div>

      {active === "overview" && <div className="flex flex-col gap-8">{overview}</div>}
      {active === "players" && <div className="flex flex-col gap-8">{rootingAndOverlap}</div>}
      {active === "outcomes" && <div className="flex flex-col gap-8">{outcomeLandscape}</div>}
    </div>
  );
}
