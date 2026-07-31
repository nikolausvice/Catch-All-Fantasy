import { signOut } from "@/auth";

/**
 * A session's JWT can outlive the user row it points to (e.g. the database
 * was reset). Redirecting straight to /login isn't enough in that case: the
 * cookie is still cryptographically valid, so the proxy/middleware's
 * JWT-only "is logged in" check immediately bounces the request back to
 * /dashboard, which sends it right back here — an infinite redirect loop.
 * Cookie mutation is only allowed from Server Actions/Route Handlers (not a
 * plain Server Component render), so the stale-session check in
 * dashboard/layout.tsx redirects here instead of to /login directly; this
 * route actually clears the cookie before redirecting.
 */
export async function GET() {
  await signOut({ redirectTo: "/login" });
}
