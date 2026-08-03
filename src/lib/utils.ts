import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Shared sizing/styling so the header's Add league, Refresh, theme, and logout buttons stay uniform. */
export const headerButtonClass =
  "inline-flex h-9 shrink-0 items-center justify-center rounded-md border border-border px-3 text-sm font-medium hover:bg-muted disabled:opacity-60";
