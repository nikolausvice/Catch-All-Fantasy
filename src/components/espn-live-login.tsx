"use client";

import { useEffect, useRef, useState } from "react";

// Must match espn-remote-login-service/src/types.ts's VIEWPORT.
const VIEWPORT = { width: 1280, height: 800 };
const MOUSE_MOVE_THROTTLE_MS = 33; // ~30/s

// Frames arrive as raw binary WS messages (see server's screencast.ts) — only these
// control messages are JSON text.
type ServerMessage =
  | { type: "status"; detail: "loading" | "form-ready" | "otp-requested" | "captcha-shown" | "submitting" }
  | { type: "success"; espnS2: string; swid: string }
  | { type: "error"; message: string }
  | { type: "timeout" };

const STATUS_LABEL: Record<string, string> = {
  loading: "Loading espn.com…",
  "form-ready": "Ready to sign in",
  "otp-requested": "ESPN is asking for a verification code",
  "captcha-shown": "ESPN is showing a CAPTCHA",
  submitting: "Signing in…",
};

/** Streams ESPN's real login page live and forwards the user's own mouse/keyboard input
 * into it — the user is genuinely, live driving the real espn.com page (including typing
 * their own verification code, if ESPN asks for one), not us capturing and replaying a value. */
export function EspnLiveLogin({
  onCookies,
  onCancel,
}: {
  onCookies: (espnS2: string, swid: string) => void;
  onCancel: () => void;
}) {
  const [phase, setPhase] = useState<"idle" | "waking" | "streaming" | "error">("idle");
  const [statusLabel, setStatusLabel] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const viewerTokenRef = useRef<string | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const serviceOriginRef = useRef<string | null>(null);
  const lastMouseMoveAtRef = useRef(0);

  useEffect(() => {
    return () => {
      wsRef.current?.close();
      cancelSession();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function cancelSession() {
    const sessionId = sessionIdRef.current;
    const origin = serviceOriginRef.current;
    const token = viewerTokenRef.current;
    if (!sessionId || !origin || !token) return;
    fetch(`${origin}/sessions/${sessionId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    }).catch(() => {});
  }

  async function start() {
    setPhase("waking");
    setError(null);
    try {
      const res = await fetch("/api/espn-remote-login", { method: "POST" });
      const data = await res.json();
      if (res.status === 409) {
        setError("A live sign-in is already in progress — try again shortly.");
        setPhase("error");
        return;
      }
      if (!res.ok || data.status !== "ready") {
        setError(data.message ?? "Couldn't start a live sign-in session.");
        setPhase("error");
        return;
      }

      sessionIdRef.current = data.sessionId;
      viewerTokenRef.current = data.viewerToken;
      serviceOriginRef.current = new URL(
        data.wsUrl.replace("wss://", "https://").replace("ws://", "http://"),
      ).origin;

      const ws = new WebSocket(`${data.wsUrl}?token=${data.viewerToken}`);
      wsRef.current = ws;
      ws.onopen = () => setPhase("streaming");
      ws.onmessage = (evt) => {
        if (typeof evt.data === "string") {
          handleServerMessage(JSON.parse(evt.data));
        } else {
          drawFrame(canvasRef.current, evt.data as Blob);
        }
      };
      ws.onerror = () => {
        setError("Lost the connection to the live sign-in service.");
        setPhase("error");
      };
      ws.onclose = () => {
        wsRef.current = null;
      };
    } catch {
      setError("Couldn't start ESPN sign-in. Try again or paste cookies manually.");
      setPhase("error");
    }
  }

  function handleServerMessage(msg: ServerMessage) {
    if (msg.type === "status") {
      setStatusLabel(STATUS_LABEL[msg.detail] ?? null);
    } else if (msg.type === "success") {
      onCookies(msg.espnS2, msg.swid);
      wsRef.current?.close();
    } else if (msg.type === "error") {
      setError(msg.message);
      setPhase("error");
    } else if (msg.type === "timeout") {
      setError("This live sign-in session timed out. Try again.");
      setPhase("error");
    }
  }

  function sendInput(msg: Record<string, unknown>) {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    }
  }

  function toLogicalCoords(e: { clientX: number; clientY: number }) {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: Math.round(((e.clientX - rect.left) / rect.width) * VIEWPORT.width),
      y: Math.round(((e.clientY - rect.top) / rect.height) * VIEWPORT.height),
    };
  }

  function handlePointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    const now = Date.now();
    if (now - lastMouseMoveAtRef.current < MOUSE_MOVE_THROTTLE_MS) return;
    lastMouseMoveAtRef.current = now;
    sendInput({ type: "mouseMove", ...toLogicalCoords(e) });
  }

  function handlePointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    sendInput({ type: "mouseDown", ...toLogicalCoords(e), button: e.button === 2 ? "right" : "left" });
  }

  function handlePointerUp(e: React.PointerEvent<HTMLCanvasElement>) {
    sendInput({ type: "mouseUp", ...toLogicalCoords(e), button: e.button === 2 ? "right" : "left" });
  }

  function handleWheel(e: React.WheelEvent<HTMLCanvasElement>) {
    sendInput({ type: "wheel", ...toLogicalCoords(e), deltaX: e.deltaX, deltaY: e.deltaY });
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLCanvasElement>) {
    e.preventDefault();
    sendInput({ type: "keyDown", key: e.key, code: e.code, text: e.key.length === 1 ? e.key : undefined });
  }

  function handleKeyUp(e: React.KeyboardEvent<HTMLCanvasElement>) {
    e.preventDefault();
    sendInput({ type: "keyUp", key: e.key, code: e.code });
  }

  return (
    <fieldset className="rounded-lg border border-dashed border-border p-3">
      <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Live ESPN sign-in
      </legend>

      {phase === "idle" && (
        <div className="flex flex-col gap-3">
          <p className="text-xs text-muted-foreground">
            You&apos;ll sign in on ESPN&apos;s real page below, live — including entering any
            verification code ESPN asks for.
          </p>
          <button
            type="button"
            onClick={start}
            className="inline-flex w-full items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 sm:w-auto"
          >
            Start live sign-in
          </button>
        </div>
      )}

      {phase === "waking" && (
        <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
          <span className="size-3.5 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent" />
          Connecting to the live sign-in service…
        </div>
      )}

      {phase === "streaming" && (
        // Fixed overlay, not confined to this form's narrow card — a cramped inline
        // box made the stream look tiny and "zoomed out" even when frames were fine.
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-background/80 p-4">
          <div className="flex w-full items-center justify-between" style={{ maxWidth: "min(94vw, 1400px)" }}>
            <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <span
                className="size-1.5 rounded-full bg-emerald-500"
                style={{ animation: "pulse 2s ease-in-out infinite" }}
              />
              Live — signing in on espn.com{statusLabel ? ` · ${statusLabel}` : ""}
            </p>
            <button
              type="button"
              onClick={onCancel}
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              Cancel
            </button>
          </div>
          <canvas
            ref={canvasRef}
            width={VIEWPORT.width}
            height={VIEWPORT.height}
            tabIndex={0}
            className="cursor-default rounded-md border border-border"
            style={{
              width: "min(94vw, 1400px)",
              aspectRatio: `${VIEWPORT.width} / ${VIEWPORT.height}`,
            }}
            onPointerMove={handlePointerMove}
            onPointerDown={handlePointerDown}
            onPointerUp={handlePointerUp}
            onWheel={handleWheel}
            onKeyDown={handleKeyDown}
            onKeyUp={handleKeyUp}
            onContextMenu={(e) => e.preventDefault()}
          />
        </div>
      )}

      {phase === "error" && (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-destructive">{error}</p>
          <button
            type="button"
            onClick={() => setPhase("idle")}
            className="self-start text-sm text-muted-foreground hover:text-foreground"
          >
            Try again
          </button>
        </div>
      )}

      {phase !== "streaming" && (
        <button
          type="button"
          onClick={onCancel}
          className="mt-3 self-start text-sm text-muted-foreground hover:text-foreground"
        >
          ← Use manual cookie paste instead
        </button>
      )}
    </fieldset>
  );
}

function drawFrame(canvas: HTMLCanvasElement | null, jpegBlob: Blob) {
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  // createImageBitmap decodes off the main thread and skips the data-URI round trip
  // an <img> would need.
  createImageBitmap(jpegBlob)
    .then((bitmap) => {
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      bitmap.close();
    })
    .catch(() => {});
}
