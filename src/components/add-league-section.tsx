"use client";

import { useRef, useState } from "react";
import { ConnectSleeperForm } from "./connect-sleeper-form";
import { ConnectEspnForm } from "./connect-espn-form";

/** Lets a single top-level "← Back" button pop exactly one step out of a
 * form's own internal navigation (e.g. ESPN's public/private choice, or a
 * found-leagues list) before falling back to whatever's above it. `back()`
 * returns true if it consumed the press by popping an internal step, or
 * false if there was nothing left to pop — signaling the caller to handle
 * going back itself. */
export type BackHandle = { back: () => boolean };

type Platform = "sleeper" | "espn";

const PLATFORMS: { id: Platform; label: string; description: string }[] = [
  {
    id: "sleeper",
    label: "Sleeper",
    description: "",
  },
  {
    id: "espn",
    label: "ESPN",
    description: "",
  },
];

export function AddLeagueSection({ hasStoredEspnCookies }: { hasStoredEspnCookies: boolean }) {
  const [selected, setSelected] = useState<Platform | null>(null);
  const platformFormRef = useRef<BackHandle>(null);

  function handleBack() {
    if (platformFormRef.current?.back()) return;
    setSelected(null);
  }

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
              onClick={handleBack}
              className="mb-4 text-sm text-muted-foreground hover:text-foreground"
            >
              ← Back
            </button>

            {selected === "sleeper" && (
              <div>
                <ConnectSleeperForm ref={platformFormRef} />
              </div>
            )}

            {selected === "espn" && (
              <div>
                <h3 className="mb-4 text-sm font-semibold">Connect ESPN</h3>
                <ConnectEspnForm ref={platformFormRef} hasStoredCookies={hasStoredEspnCookies} />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
