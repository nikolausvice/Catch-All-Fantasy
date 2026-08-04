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

export function AddLeagueSection({ hasStoredEspnCookies }: { hasStoredEspnCookies: boolean }) {
  const [selected, setSelected] = useState<Platform | null>(null);

  return (
    <div>
      <div>
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
                  <span className="flex items-center gap-1.5 font-semibold">
                    {platform.label}
                    {platform.id === "espn" && hasStoredEspnCookies && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-400">
                        ✓ Login saved
                      </span>
                    )}
                  </span>
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
                <h3 className="mb-4 text-sm font-semibold">Connect ESPN</h3>
                <ConnectEspnForm hasStoredCookies={hasStoredEspnCookies} />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
