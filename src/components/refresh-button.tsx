"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cn, headerButtonClass } from "@/lib/utils";

/** "just now" / "5s ago" / "12m ago" / "3h ago" — coarser as it gets older,
 * since the exact second stops mattering once it's been a while. */
function relativeTime(fromMs: number, nowMs: number): string {
  const seconds = Math.max(0, Math.round((nowMs - fromMs) / 1000));
  if (seconds < 10) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  return `${hours}h ago`;
}

export function RefreshButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  // Lazy initializers, not a value set from an effect — both read Date.now()
  // at essentially the same instant, so the very first render always shows
  // "just now" regardless of whatever the server's vs. the client's actual
  // clock reads, which is the only thing that would otherwise risk a
  // hydration mismatch here.
  const [lastRefreshedAt, setLastRefreshedAt] = useState(() => Date.now());
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-muted-foreground">{relativeTime(lastRefreshedAt, now)}</span>
      <button
        type="button"
        aria-label="Refresh"
        onClick={() => {
          setLastRefreshedAt(Date.now());
          startTransition(() => router.refresh());
        }}
        disabled={pending}
        className={cn(headerButtonClass, "w-9 px-0")}
      >
        {/* Icon only — no "Refresh" word — since it sits right next to the
            equally compact "+ Add league" and hamburger buttons in the
            header. Sized up on its own (rather than via headerButtonClass,
            shared with those other buttons' text) since a bare glyph reads
            smaller than actual text at the same font size. */}
        <span className="text-2xl leading-none">↻</span>
      </button>
    </div>
  );
}
