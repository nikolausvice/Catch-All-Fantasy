"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";

export function ThemeToggle({ className }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme();

  return (
    <button
      type="button"
      aria-label="Toggle theme"
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
      className={cn(
        "relative inline-flex size-9 items-center justify-center rounded-md border border-border bg-card text-foreground transition-colors hover:bg-muted",
        className,
      )}
    >
      {/* Both icons render on the server; CSS (not JS state) decides which
          shows, so there's no hydration mismatch and no mount-detection effect. */}
      <Sun className="absolute size-4 opacity-100 dark:opacity-0" />
      <Moon className="absolute size-4 opacity-0 dark:opacity-100" />
    </button>
  );
}
