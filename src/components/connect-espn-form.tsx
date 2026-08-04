"use client";

import { startTransition, useActionState, useState, useTransition } from "react";
import {
  connectEspnAccount,
  connectEspnLeagues,
  disconnectEspnAccount,
  lookupEspnLeagues,
  type EspnLookupState,
} from "@/app/dashboard/actions";

type EspnLoginResult =
  | { status: "success"; espnS2: string; swid: string }
  | { status: "error"; message: string };

/** Signs into ESPN in the background — a real Chromium process our own server launches
 * directly (no third-party browser-hosting vendor involved), submits the credentials to
 * ESPN's real login form, and returns the resulting cookies. Runs entirely within one
 * request, so if ESPN throws an MFA code or CAPTCHA there's no way to relay it — that
 * attempt just fails with a message pointing at manual cookie paste below. */
function EspnBackgroundLogin({ onCookies }: { onCookies: (espnS2: string, swid: string) => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/espn-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data: EspnLoginResult = await res.json();
      if (data.status === "success") {
        onCookies(data.espnS2, data.swid);
        return;
      }
      setError(data.message);
    } catch {
      setError("Couldn't start ESPN sign-in. Try again or paste cookies manually.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border p-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="espn-username" className="text-sm font-medium">
            ESPN username or email
          </label>
          <input
            id="espn-username"
            type="email"
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="rounded-md border border-border bg-background px-3 py-2 text-sm outline-none ring-ring focus:ring-2"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="espn-password" className="text-sm font-medium">
            Password
          </label>
          <input
            id="espn-password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="rounded-md border border-border bg-background px-3 py-2 text-sm outline-none ring-ring focus:ring-2"
          />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        We use this once to sign in to ESPN on your behalf. It&apos;s never stored.
      </p>
      <button
        type="button"
        disabled={pending || !username || !password}
        onClick={submit}
        className="inline-flex min-h-[44px] w-full items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60 sm:w-auto"
      >
        {pending ? "Signing in…" : "Sign in with ESPN"}
      </button>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}

const currentYear = new Date().getFullYear();

const cookieHelp = (
  <details className="mt-3 text-sm text-muted-foreground">
    <summary className="cursor-pointer select-none hover:text-foreground">
      Where do I find these cookies?
    </summary>
    <p className="mt-2">
      Log into{" "}
      <a
        href="https://www.espn.com/fantasy/football/"
        target="_blank"
        rel="noopener noreferrer"
        className="text-primary hover:underline"
      >
        espn.com
      </a>
      , open DevTools (F12) → Application → Cookies → espn.com, and copy the
      values of <code>espn_s2</code> and <code>SWID</code>. Cookies are
      encrypted before being stored.
    </p>
  </details>
);

/** Shared "using saved ESPN login" banner with an option to switch logins or forget the saved one entirely. */
function SavedEspnLoginBanner({
  message,
  onUseDifferent,
}: {
  message: string;
  onUseDifferent: () => void;
}) {
  const [pending, startTransition] = useTransition();

  function forget() {
    onUseDifferent();
    startTransition(async () => {
      await disconnectEspnAccount();
    });
  }

  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2.5">
      <div className="flex items-center gap-2">
        <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-[11px] font-bold text-white">
          ✓
        </span>
        <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">{message}</p>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <button
          type="button"
          onClick={onUseDifferent}
          className="text-xs font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
        >
          Use a different login
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={forget}
          className="text-xs font-medium text-destructive underline-offset-2 hover:underline disabled:opacity-60"
        >
          {pending ? "Removing…" : "Forget"}
        </button>
      </div>
    </div>
  );
}

export function ConnectEspnForm({ hasStoredCookies }: { hasStoredCookies: boolean }) {
  const [visibility, setVisibility] = useState<"private" | "public" | null>(null);
  const [manualFallback, setManualFallback] = useState(false);

  if (visibility === null) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">Is this league public or private?</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => setVisibility("private")}
            className="flex flex-col items-start gap-1 rounded-lg border border-border p-4 text-left transition-colors hover:bg-muted"
          >
            <span className="font-semibold">Private league</span>
            <span className="text-xs text-muted-foreground">
              Most leagues. Sign in with ESPN — no ID or season to look up.
            </span>
          </button>
          <button
            type="button"
            onClick={() => setVisibility("public")}
            className="flex flex-col items-start gap-1 rounded-lg border border-border p-4 text-left transition-colors hover:bg-muted"
          >
            <span className="font-semibold">Public league</span>
            <span className="text-xs text-muted-foreground">
              Anyone can view it without logging in. Just paste the league ID.
            </span>
          </button>
        </div>
      </div>
    );
  }

  if (visibility === "public") {
    return (
      <div className="flex flex-col gap-3">
        <PublicEspnLeagueForm />
        <button
          type="button"
          onClick={() => setVisibility(null)}
          className="self-start text-sm text-muted-foreground hover:text-foreground"
        >
          ← Back
        </button>
      </div>
    );
  }

  if (manualFallback) {
    return (
      <div className="flex flex-col gap-3">
        <ConnectEspnManualForm hasStoredCookies={hasStoredCookies} />
        <button
          type="button"
          onClick={() => setManualFallback(false)}
          className="self-start text-sm text-muted-foreground hover:text-foreground"
        >
          ← Back to sign-in
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <EspnLookupFlow hasStoredCookies={hasStoredCookies} onManual={() => setManualFallback(true)} />
      <button
        type="button"
        onClick={() => setVisibility(null)}
        className="self-start text-sm text-muted-foreground hover:text-foreground"
      >
        ← Back
      </button>
    </div>
  );
}

/** Public leagues need no ESPN login at all — just the league ID and season. */
function PublicEspnLeagueForm() {
  const [state, formAction, pending] = useActionState(connectEspnAccount, {
    error: null,
    success: null,
  });
  const [leagueId, setLeagueId] = useState("");
  const [season, setSeason] = useState(String(currentYear));

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="espn-public-league-id" className="text-sm font-medium">
            League ID
          </label>
          <input
            id="espn-public-league-id"
            name="leagueId"
            required
            inputMode="numeric"
            autoComplete="off"
            value={leagueId}
            onChange={(e) => setLeagueId(e.target.value)}
            placeholder="e.g. 387659"
            className="rounded-md border border-border bg-background px-3 py-2 text-sm outline-none ring-ring focus:ring-2"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="espn-public-season" className="text-sm font-medium">
            Season
          </label>
          <input
            id="espn-public-season"
            name="season"
            required
            inputMode="numeric"
            autoComplete="off"
            value={season}
            onChange={(e) => setSeason(e.target.value)}
            className="rounded-md border border-border bg-background px-3 py-2 text-sm outline-none ring-ring focus:ring-2"
          />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Find the League ID in your league&apos;s ESPN URL — the number after{" "}
        <code>leagueId=</code>.
      </p>

      <button
        type="submit"
        disabled={pending}
        className="inline-flex w-full min-w-[150px] items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60 sm:w-auto"
      >
        {pending ? "Connecting…" : "Connect league"}
      </button>

      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      {state.success && <p className="text-sm text-primary">{state.success}</p>}
    </form>
  );
}

/** Step 1+2: find every league on the account from just the cookies, then pick which to add. */
function EspnLookupFlow({
  hasStoredCookies,
  onManual,
}: {
  hasStoredCookies: boolean;
  onManual: () => void;
}) {
  const [lookupState, lookupAction, lookupPending] = useActionState(lookupEspnLeagues, {
    error: null,
    result: null,
  });
  const [connectState, connectAction, connectPending] = useActionState(connectEspnLeagues, {
    error: null,
    success: null,
  });
  const [espnS2, setEspnS2] = useState("");
  const [swid, setSwid] = useState("");
  const [showCookieFields, setShowCookieFields] = useState(!hasStoredCookies);
  const [restarted, setRestarted] = useState(false);

  const result = lookupState.result;

  // Track which lookup result the checkbox selection belongs to, so a fresh
  // lookup re-defaults to "all selected" but deselecting on the CURRENT
  // result doesn't get silently reset back to all-selected.
  const [selectedFor, setSelectedFor] = useState<EspnLookupState["result"]>(null);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());

  if (result !== selectedFor) {
    setSelectedFor(result);
    setSelectedKeys(new Set(result?.leagues.map((l) => `${l.leagueId}:${l.seasonId}`) ?? []));
  }

  function toggleLeague(key: string) {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function handleCookies(newEspnS2: string, newSwid: string) {
    const formData = new FormData();
    formData.set("espnS2", newEspnS2);
    formData.set("swid", newSwid);
    startTransition(() => {
      lookupAction(formData);
    });
  }

  if (connectState.success) {
    return <p className="text-sm text-primary">{connectState.success}</p>;
  }

  if (!result || restarted) {
    return (
      <form action={lookupAction} className="flex flex-col gap-3">
        {hasStoredCookies && !showCookieFields ? (
          <>
            <SavedEspnLoginBanner
              message="Using your saved ESPN login."
              onUseDifferent={() => setShowCookieFields(true)}
            />
            <button
              type="submit"
              disabled={lookupPending}
              onClick={() => setRestarted(false)}
              className="inline-flex min-w-[150px] items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {lookupPending ? "Looking up…" : "Find leagues"}
            </button>
          </>
        ) : (
          <div className="flex flex-col gap-3">
            <EspnBackgroundLogin onCookies={handleCookies} />

            <details className="text-sm">
              <summary className="cursor-pointer select-none text-muted-foreground hover:text-foreground">
                Or paste ESPN cookies manually
              </summary>
              <fieldset className="mt-3 rounded-lg border border-dashed border-border p-3">
                <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  ESPN login
                </legend>
                <div className="mb-3 flex items-start justify-between gap-3">
                  <p className="text-xs text-muted-foreground">
                    We use these to find every league on your account.
                  </p>
                  {hasStoredCookies && (
                    <button
                      type="button"
                      onClick={() => setShowCookieFields(false)}
                      className="shrink-0 text-xs font-medium text-primary hover:underline"
                    >
                      Use saved login
                    </button>
                  )}
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="espn-s2" className="text-sm font-medium">
                      espn_s2 cookie
                    </label>
                    <input
                      id="espn-s2"
                      name="espnS2"
                      type="text"
                      inputMode="text"
                      autoComplete="off"
                      autoCorrect="off"
                      autoCapitalize="off"
                      spellCheck={false}
                      data-1p-ignore="true"
                      data-lpignore="true"
                      value={espnS2}
                      onChange={(e) => setEspnS2(e.target.value)}
                      className="rounded-md border border-border bg-background px-3 py-2 text-sm outline-none ring-ring focus:ring-2"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="espn-swid" className="text-sm font-medium">
                      SWID cookie
                    </label>
                    <input
                      id="espn-swid"
                      name="swid"
                      type="text"
                      inputMode="text"
                      autoComplete="off"
                      autoCorrect="off"
                      autoCapitalize="off"
                      spellCheck={false}
                      data-1p-ignore="true"
                      data-lpignore="true"
                      value={swid}
                      onChange={(e) => setSwid(e.target.value)}
                      placeholder="{XXXXXXXX-XXXX-...}"
                      className="rounded-md border border-border bg-background px-3 py-2 text-sm outline-none ring-ring focus:ring-2"
                    />
                  </div>
                </div>
                {cookieHelp}

                <button
                  type="submit"
                  disabled={lookupPending}
                  onClick={() => setRestarted(false)}
                  className="mt-3 inline-flex min-w-[150px] items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
                >
                  {lookupPending ? "Looking up…" : "Find leagues"}
                </button>
              </fieldset>
            </details>
          </div>
        )}

        <button
          type="button"
          onClick={onManual}
          className="self-start text-sm text-muted-foreground hover:text-foreground"
        >
          Enter a league ID manually instead
        </button>

        {lookupState.error && (
          <p className="text-sm text-destructive">{lookupState.error}</p>
        )}
      </form>
    );
  }

  return (
    <form action={connectAction} className="flex flex-col gap-3">
      <input type="hidden" name="espnS2" value={result.espnS2} />
      <input type="hidden" name="swid" value={result.swid} />
      <input type="hidden" name="leaguesJson" value={JSON.stringify(result.leagues)} />

      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          Found {result.leagues.length} league{result.leagues.length === 1 ? "" : "s"}.
          Pick which to add:
        </p>
        <button
          type="button"
          onClick={() =>
            setSelectedKeys(
              selectedKeys.size === result.leagues.length
                ? new Set()
                : new Set(result.leagues.map((l) => `${l.leagueId}:${l.seasonId}`)),
            )
          }
          className="shrink-0 text-xs font-medium text-primary hover:underline"
        >
          {selectedKeys.size === result.leagues.length ? "Deselect all" : "Select all"}
        </button>
      </div>

      <ul className="flex flex-col gap-2">
        {result.leagues.map((league) => {
          const key = `${league.leagueId}:${league.seasonId}`;
          return (
            <li key={key}>
              <label className="flex min-h-[44px] cursor-pointer items-center gap-3 rounded-lg border border-border bg-card p-3 hover:bg-muted">
                <input
                  type="checkbox"
                  name="leagueKeys"
                  value={key}
                  checked={selectedKeys.has(key)}
                  onChange={() => toggleLeague(key)}
                  className="size-4 shrink-0 accent-primary"
                />
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{league.name}</span>
                <span className="shrink-0 text-xs text-muted-foreground">{league.seasonId}</span>
              </label>
            </li>
          );
        })}
      </ul>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={connectPending || selectedKeys.size === 0}
          className="inline-flex min-w-[150px] items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {connectPending
            ? "Adding…"
            : `Add ${selectedKeys.size || ""} league${selectedKeys.size === 1 ? "" : "s"}`}
        </button>
        <button
          type="button"
          onClick={() => setRestarted(true)}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← Back
        </button>
      </div>

      {connectState.error && (
        <p className="text-sm text-destructive">{connectState.error}</p>
      )}
    </form>
  );
}

/** Fallback for a single league by ID — useful if lookup fails or misses a league. */
function ConnectEspnManualForm({ hasStoredCookies }: { hasStoredCookies: boolean }) {
  const [state, formAction, pending] = useActionState(connectEspnAccount, {
    error: null,
    success: null,
  });
  const [leagueId, setLeagueId] = useState("");
  const [season, setSeason] = useState(String(currentYear));
  const [espnS2, setEspnS2] = useState("");
  const [swid, setSwid] = useState("");
  const [showCookieFields, setShowCookieFields] = useState(!hasStoredCookies);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="espn-league-id" className="text-sm font-medium">
            League ID
          </label>
          <input
            id="espn-league-id"
            name="leagueId"
            required
            inputMode="numeric"
            autoComplete="off"
            value={leagueId}
            onChange={(e) => setLeagueId(e.target.value)}
            placeholder="e.g. 387659"
            className="rounded-md border border-border bg-background px-3 py-2 text-sm outline-none ring-ring focus:ring-2"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="espn-season" className="text-sm font-medium">
            Season
          </label>
          <input
            id="espn-season"
            name="season"
            required
            inputMode="numeric"
            autoComplete="off"
            value={season}
            onChange={(e) => setSeason(e.target.value)}
            className="rounded-md border border-border bg-background px-3 py-2 text-sm outline-none ring-ring focus:ring-2"
          />
        </div>
      </div>

      {hasStoredCookies && !showCookieFields ? (
        <SavedEspnLoginBanner
          message="ESPN login saved — private leagues will connect automatically."
          onUseDifferent={() => setShowCookieFields(true)}
        />
      ) : (
        <fieldset className="rounded-lg border border-dashed border-border p-3">
          <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Private leagues only
          </legend>
          <div className="mb-3 flex items-start justify-between gap-3">
            <p className="text-xs text-muted-foreground">
              Skip these two fields if your league is public. Most leagues are
              private by default, so you&apos;ll usually need them.
            </p>
            {hasStoredCookies && (
              <button
                type="button"
                onClick={() => setShowCookieFields(false)}
                className="shrink-0 text-xs font-medium text-primary hover:underline"
              >
                Use saved login
              </button>
            )}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="espn-s2-manual" className="text-sm font-medium">
                espn_s2 cookie
              </label>
              <input
                id="espn-s2-manual"
                name="espnS2"
                type="text"
                inputMode="text"
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                data-1p-ignore="true"
                data-lpignore="true"
                value={espnS2}
                onChange={(e) => setEspnS2(e.target.value)}
                className="rounded-md border border-border bg-background px-3 py-2 text-sm outline-none ring-ring focus:ring-2"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="espn-swid-manual" className="text-sm font-medium">
                SWID cookie
              </label>
              <input
                id="espn-swid-manual"
                name="swid"
                type="text"
                inputMode="text"
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                data-1p-ignore="true"
                data-lpignore="true"
                value={swid}
                onChange={(e) => setSwid(e.target.value)}
                placeholder="{XXXXXXXX-XXXX-...}"
                className="rounded-md border border-border bg-background px-3 py-2 text-sm outline-none ring-ring focus:ring-2"
              />
            </div>
          </div>
          {cookieHelp}
        </fieldset>
      )}

      <button
        type="submit"
        disabled={pending}
        className="inline-flex w-full min-w-[150px] items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60 sm:w-auto"
      >
        {pending ? "Connecting…" : "Connect ESPN"}
      </button>

      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      {state.success && <p className="text-sm text-primary">{state.success}</p>}
    </form>
  );
}
