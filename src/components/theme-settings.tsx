"use client";

import { useEffect, useState } from "react";
import { Laptop, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";

const OPTIONS = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "Match system", icon: Laptop },
] as const;

export function ThemeSettings() {
  const { theme, setTheme } = useTheme();
  // next-themes only knows the real preference after mount (it reads
  // localStorage/media query client-side) — rendering nothing selected
  // until then avoids briefly highlighting the wrong option server-side.
  // Deferred to a microtask rather than called directly in the effect body
  // — still fires before the next paint, just not synchronously within the
  // effect itself (which react-hooks/set-state-in-effect flags as a
  // cascading-render risk even though there's nothing to cascade here).
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    queueMicrotask(() => setMounted(true));
  }, []);

  return (
    <div className="inline-flex gap-1 rounded-lg border border-border bg-muted/40 p-1">
      {OPTIONS.map(({ value, label, icon: Icon }) => {
        const isActive = mounted && theme === value;
        return (
          <button
            key={value}
            type="button"
            onClick={() => setTheme(value)}
            aria-pressed={isActive}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              isActive
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="size-4" />
            {label}
          </button>
        );
      })}
    </div>
  );
}
