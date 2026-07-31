import { NextResponse } from "next/server";
import { ipAddress } from "@vercel/functions";
import { auth } from "@/auth";

/**
 * Temporary access gate for while the app is still being built out. Set
 * ALLOWED_IPS (comma-separated) in the Vercel project's env vars to restrict
 * the whole site to those IPs; leave it unset to allow everyone. Remove this
 * block (and the ALLOWED_IPS env var) once the app is ready to go public.
 */
function isAllowedIp(ip: string | undefined): boolean {
  const allowlist = process.env.ALLOWED_IPS;
  if (!allowlist) return true;
  if (!ip) return false;
  const allowed = allowlist
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return allowed.includes(ip);
}

export const proxy = auth((req) => {
  if (!isAllowedIp(ipAddress(req))) {
    return new NextResponse("Not available yet.", { status: 403 });
  }

  const isLoggedIn = !!req.auth;
  const { pathname } = req.nextUrl;
  const isAuthRoute = pathname.startsWith("/login") || pathname.startsWith("/signup");
  const isDashboard = pathname.startsWith("/dashboard");

  if (isDashboard && !isLoggedIn) {
    return NextResponse.redirect(new URL("/login", req.nextUrl));
  }
  if (isAuthRoute && isLoggedIn) {
    return NextResponse.redirect(new URL("/dashboard", req.nextUrl));
  }
});

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
