"use client";

import { useActionState, useState } from "react";
import { connectSleeperAccount } from "@/app/dashboard/actions";

export function ConnectSleeperForm() {
  const [state, formAction, pending] = useActionState(connectSleeperAccount, {
    error: null,
    success: null,
  });
  // Controlled so React's automatic post-action form reset (it resets
  // uncontrolled fields) can't wipe out what the user typed.
  const [username, setUsername] = useState("");

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex flex-1 flex-col gap-1.5">
          <label htmlFor="sleeper-username" className="text-sm font-medium">
            Sleeper username
          </label>
          <input
            id="sleeper-username"
            name="username"
            required
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="e.g. jane_doe"
            className="rounded-md border border-border bg-background px-3 py-2 text-sm outline-none ring-ring focus:ring-2"
          />
        </div>
        <button
          type="submit"
          disabled={pending}
          className="inline-flex min-w-[150px] items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {pending ? "Connecting…" : "Connect Sleeper"}
        </button>
      </div>

      {state.error && (
        <p className="text-sm text-destructive">{state.error}</p>
      )}
      {state.success && (
        <p className="text-sm text-primary">{state.success}</p>
      )}
    </form>
  );
}
