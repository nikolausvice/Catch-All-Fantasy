/**
 * Accent used on the logged-out surfaces (landing page, login/signup) and a
 * few onboarding-flavored spots in the dashboard (pick-your-team) — kept
 * separate from the `--primary` theme token, which drives the rest of the
 * signed-in app and shouldn't shift when this one does.
 *
 * These reference CSS custom properties (defined in globals.css) rather
 * than a fixed hex — the tan that reads well on a dark card doesn't have
 * enough contrast as text/link/border color on a light background, so
 * light mode swaps in a deeper bronze. Letting CSS resolve it means every
 * usage adapts automatically with the theme, no client-side theme check
 * required.
 */
export const ACCENT = "var(--brand-accent)";
export const ACCENT_FOREGROUND = "var(--brand-accent-foreground)";
/** Soft translucent tint for icon-badge backgrounds — not just `${ACCENT}` + alpha, since ACCENT is now a var() reference that can't have a hex alpha suffix appended. */
export const ACCENT_SOFT = "var(--brand-accent-soft)";
/** Subtle border tint, e.g. around a notice banner. */
export const ACCENT_BORDER = "var(--brand-accent-border)";
