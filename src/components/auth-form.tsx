"use client";

import Link from "next/link";
import { useActionState } from "react";
import type { AuthActionState } from "@/app/(auth)/actions";
import { ACCENT, ACCENT_BORDER, ACCENT_FOREGROUND } from "@/lib/brand";

export function AuthForm({
  action,
  mode,
  notice,
}: {
  action: (
    state: AuthActionState,
    formData: FormData,
  ) => Promise<AuthActionState>;
  mode: "login" | "signup";
  notice?: string;
}) {
  const [state, formAction, pending] = useActionState(action, {
    error: null,
  });

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {notice && (
        <p
          className="rounded-md border bg-accent px-3 py-2 text-sm text-accent-foreground"
          style={{ borderColor: ACCENT_BORDER }}
        >
          {notice}
        </p>
      )}

      <div className="flex flex-col gap-1.5">
        <label htmlFor="email" className="text-sm font-medium">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          className="rounded-md border border-border bg-background px-3 py-2 text-sm outline-none ring-ring focus:ring-2"
          placeholder="you@example.com"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="password" className="text-sm font-medium">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          minLength={6}
          autoComplete={
            mode === "login" ? "current-password" : "new-password"
          }
          className="rounded-md border border-border bg-background px-3 py-2 text-sm outline-none ring-ring focus:ring-2"
          placeholder="••••••••"
        />
      </div>

      {mode === "signup" && (
        <label className="flex items-start gap-2 text-sm text-muted-foreground">
          <input
            type="checkbox"
            name="acceptedTerms"
            required
            className="mt-0.5 size-4 shrink-0 rounded border-border"
          />
          <span>
            I agree to the{" "}
            <Link
              href="/terms"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:underline"
              style={{ color: ACCENT }}
            >
              Terms of Service
            </Link>{" "}
            and{" "}
            <Link
              href="/privacy"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:underline"
              style={{ color: ACCENT }}
            >
              Privacy Policy
            </Link>
            .
          </span>
        </label>
      )}

      {state.error && (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="mt-2 inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-medium transition-opacity hover:opacity-90 disabled:opacity-60"
        style={{ backgroundColor: ACCENT, color: ACCENT_FOREGROUND }}
      >
        {pending
          ? "Please wait…"
          : mode === "login"
            ? "Log in"
            : "Create account"}
      </button>

      <p className="text-center text-sm text-muted-foreground">
        {mode === "login" ? (
          <>
            Don&apos;t have an account?{" "}
            <Link href="/signup" className="hover:underline" style={{ color: ACCENT }}>
              Sign up
            </Link>
          </>
        ) : (
          <>
            Already have an account?{" "}
            <Link href="/login" className="hover:underline" style={{ color: ACCENT }}>
              Log in
            </Link>
          </>
        )}
      </p>
    </form>
  );
}
