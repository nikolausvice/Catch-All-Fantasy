import { NextResponse } from "next/server";
import { requireSessionUserId } from "@/lib/auth/require-user";
import { submitEspnOtp } from "@/lib/espn-login/client";

// Same rationale as the parent route — a real Chromium round trip can outrun
// the default function timeout.
export const maxDuration = 60;

export async function POST(req: Request) {
  const userId = await requireSessionUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const sessionId = typeof body?.sessionId === "string" ? body.sessionId : "";
  const code = typeof body?.code === "string" ? body.code : "";
  if (!sessionId || !code) {
    return NextResponse.json({ error: "sessionId and code are required" }, { status: 400 });
  }

  try {
    const result = await submitEspnOtp(sessionId, code);
    return NextResponse.json(result);
  } catch (err) {
    console.error("Failed to submit ESPN verification code", err);
    return NextResponse.json(
      { status: "error", message: "Couldn't submit the verification code. Try again or paste cookies manually." },
      { status: 502 },
    );
  }
}
