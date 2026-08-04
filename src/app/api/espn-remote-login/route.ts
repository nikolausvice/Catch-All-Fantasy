import { NextResponse } from "next/server";
import { requireSessionUserId } from "@/lib/auth/require-user";

// Just proxies a REST call to the remote-login service to mint a session — no browser
// work happens in this Vercel function, so the default timeout is plenty.
export const maxDuration = 30;

export async function POST() {
  const userId = await requireSessionUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const serviceUrl = process.env.ESPN_REMOTE_LOGIN_SERVICE_URL;
  const sharedSecret = process.env.ESPN_REMOTE_LOGIN_SHARED_SECRET;
  if (!serviceUrl || !sharedSecret) {
    return NextResponse.json(
      { status: "error", message: "Live ESPN sign-in isn't configured." },
      { status: 500 },
    );
  }

  let res: Response;
  try {
    res = await fetch(`${serviceUrl}/sessions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${sharedSecret}` },
    });
  } catch {
    return NextResponse.json(
      { status: "error", message: "Couldn't reach the live sign-in service." },
      { status: 502 },
    );
  }

  if (res.status === 409) {
    return NextResponse.json({ status: "busy" }, { status: 409 });
  }
  if (!res.ok) {
    return NextResponse.json(
      { status: "error", message: "Couldn't start a live sign-in session." },
      { status: 502 },
    );
  }

  const { sessionId, viewerToken, wsUrl } = await res.json();
  return NextResponse.json({ status: "ready", sessionId, viewerToken, wsUrl });
}
