import { NextResponse } from "next/server";
import { requireSessionUserId } from "@/lib/auth/require-user";
import { attemptEspnLogin } from "@/lib/espn-login/client";

// A real Chromium launch + navigate + login round trip can take longer than
// the default function timeout — extend it (only takes effect on Vercel;
// harmless locally).
export const maxDuration = 60;

export async function POST(req: Request) {
  const userId = await requireSessionUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const username = typeof body?.username === "string" ? body.username : "";
  const password = typeof body?.password === "string" ? body.password : "";
  if (!username || !password) {
    return NextResponse.json({ error: "Username and password are required" }, { status: 400 });
  }

  try {
    const result = await attemptEspnLogin({ username, password });
    return NextResponse.json(result);
  } catch (err) {
    console.error("Failed to run ESPN login", err);
    return NextResponse.json(
      { status: "error", message: "Couldn't sign in to ESPN. Try again or paste cookies manually." },
      { status: 502 },
    );
  }
}
