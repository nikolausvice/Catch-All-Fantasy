/** Shared with intel-tabs.tsx (a "use client" component) — kept in a plain
 * module rather than exported from there so a Server Component (e.g.
 * dashboard/page.tsx reading its own `?tab=` search param) can call
 * isTabKey directly. A client-component module's exports can only be
 * rendered as JSX or passed as props from server code, never called as a
 * plain function. */
export const TABS = [
  { key: "overview", label: "Overview" },
  { key: "players", label: "Rooting" },
  { key: "outcomes", label: "Outcomes" },
] as const;

export type TabKey = (typeof TABS)[number]["key"];

/** True for any string that's actually one of TABS' own keys — the one place
 * that check lives, so a bad/missing `?tab=` query param (typed by hand, or
 * left over from an old link) has one single, obvious fallback path rather
 * than every caller re-deriving its own idea of "valid". */
export function isTabKey(value: string | undefined): value is TabKey {
  return TABS.some((t) => t.key === value);
}
