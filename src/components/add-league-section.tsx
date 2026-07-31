"use client";

import { useState } from "react";
import { ConnectSleeperForm } from "./connect-sleeper-form";
import { ConnectEspnForm } from "./connect-espn-form";

type Platform = "sleeper" | "espn";

const PLATFORMS: { id: Platform; label: string; description: string }[] = [
  {
    id: "sleeper",
    label: "Sleeper",
    description: "Just your username — no credentials needed.",
  },
  {
    id: "espn",
    label: "ESPN",
    description: "League ID + optional cookies for private leagues.",
  },
];

export function AddLeagueSection() {
  const [selected, setSelected] = useState<Platform | null>(null);

  return (
    <details className="rounded-xl border border-border bg-card p-4">
      <summary className="cursor-pointer select-none text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        + Add another league
      </summary>

      <div className="mt-4">
        {selected === null ? (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-muted-foreground">
              Choose your fantasy platform:
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              {PLATFORMS.map((platform) => (
                <button
                  key={platform.id}
                  onClick={() => setSelected(platform.id)}
                  className="flex flex-col items-start gap-1 rounded-lg border border-border p-4 text-left transition-colors hover:bg-muted"
                >
                  <span className="font-semibold">{platform.label}</span>
                  <span className="text-xs text-muted-foreground">
                    {platform.description}
                  </span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div>
            <button
              onClick={() => setSelected(null)}
              className="mb-4 text-sm text-muted-foreground hover:text-foreground"
            >
              ← Back
            </button>

            {selected === "sleeper" && (
              <div>
                <h3 className="mb-1 text-sm font-semibold">Connect Sleeper</h3>
                <p className="mb-4 text-sm text-muted-foreground">
                  Just your username — Sleeper&apos;s API is public and
                  read-only.
                </p>
                <ConnectSleeperForm />
              </div>
            )}

            {selected === "espn" && (
              <div>
                <h3 className="mb-1 text-sm font-semibold">Connect ESPN</h3>
                <p className="mb-4 text-sm text-muted-foreground">
                  League ID and season are enough for public leagues; private
                  leagues also need the espn_s2 and SWID cookies.
                </p>
                <ConnectEspnForm />
              </div>
            )}
          </div>
        )}
      </div>
    </details>
  );
}
