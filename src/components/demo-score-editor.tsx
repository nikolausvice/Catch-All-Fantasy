"use client";

import { useState, useTransition } from "react";
import {
  clearAllPlayerScoreOverrides,
  updateDemoGameStatus,
  updateDemoScores,
} from "@/app/dashboard/leagues/[id]/actions";
import type { GameStatus } from "@/lib/leagues/nfl-schedule";
import type { LeagueMatchup, LeagueTeamPlayer } from "@/lib/leagues/types";

const GAME_STATUS_OPTIONS: { value: GameStatus | ""; label: string }[] = [
  { value: "", label: "Auto (from points)" },
  { value: "pre", label: "Not started" },
  { value: "in", label: "In progress" },
  { value: "post", label: "Final" },
];

function EditableRow({
  player,
  value,
  onChange,
  gameStatus,
  onGameStatusChange,
}: {
  player: LeagueTeamPlayer;
  value: number;
  onChange: (v: number) => void;
  gameStatus: GameStatus | null;
  onGameStatusChange: (v: GameStatus | null) => void;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-background px-3 py-2">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{player.name}</p>
          <p className="truncate text-xs text-muted-foreground">
            {[player.slot, player.position].filter(Boolean).join(" · ")}
            {player.projectedPoints != null && ` · proj ${player.projectedPoints.toFixed(1)}`}
          </p>
        </div>
        <input
          type="number"
          step="0.1"
          inputMode="decimal"
          value={value}
          onChange={(e) => {
            const v = e.target.valueAsNumber;
            onChange(Number.isFinite(v) ? v : 0);
          }}
          className="w-20 shrink-0 rounded-md border border-border bg-card px-2 py-1 text-right text-sm tabular-nums outline-none focus:ring-1 focus:ring-ring"
        />
      </div>
      {/* Independent of the score above — lets a scenario like "has points
          but still in progress" or "zero points but done playing" be built
          directly instead of only ever inferred from points === 0. */}
      <label className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
        Playing?
        <select
          value={gameStatus ?? ""}
          onChange={(e) => onGameStatusChange((e.target.value || null) as GameStatus | null)}
          className="rounded-md border border-border bg-card px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-ring"
        >
          {GAME_STATUS_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

export function DemoScoreEditor({
  leagueRowId,
  matchup,
}: {
  leagueRowId: string;
  matchup: LeagueMatchup;
}) {
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);

  const myStarters = matchup.team.players.filter((p) => p.isStarter);
  const oppStarters = matchup.opponent?.players.filter((p) => p.isStarter) ?? [];
  // Prefixed by side so the same raw player id reused on both rosters (the
  // demo JSON is hand-written, so that's not guaranteed unique) doesn't
  // collide two different players into the same input.
  const rowKey = (side: "mine" | "opp", p: LeagueTeamPlayer) => `${side}:${p.id}`;

  const allStarters = [
    ...myStarters.map((p) => ({ key: rowKey("mine", p), p })),
    ...oppStarters.map((p) => ({ key: rowKey("opp", p), p })),
  ];

  // Controlled per-player so edits survive re-renders; seeded once from the
  // current roster.
  const [values, setValues] = useState<Record<string, number>>(() => {
    const initial: Record<string, number> = {};
    for (const { key, p } of allStarters) initial[key] = p.points ?? 0;
    return initial;
  });
  const [gameStatusValues, setGameStatusValues] = useState<Record<string, GameStatus | null>>(
    () => {
      const initial: Record<string, GameStatus | null> = {};
      for (const { key, p } of allStarters) initial[key] = p.gameStatus ?? null;
      return initial;
    },
  );

  function save() {
    const updates = allStarters
      .filter(({ key }) => values[key] != null)
      .map(({ key, p }) => ({ name: p.name, position: p.position, points: values[key] }));
    setSaved(false);
    startTransition(async () => {
      await updateDemoScores(leagueRowId, updates);
      setSaved(true);
    });
  }

  // A discrete choice rather than free-typed text, so it saves immediately
  // on change instead of waiting for the batched "Save scores" button below.
  function changeGameStatus(p: LeagueTeamPlayer, key: string, gameStatus: GameStatus | null) {
    setGameStatusValues((prev) => ({ ...prev, [key]: gameStatus }));
    startTransition(async () => {
      await updateDemoGameStatus(leagueRowId, p.name, p.position, gameStatus);
    });
  }

  function clearAll() {
    setSaved(false);
    startTransition(async () => {
      await clearAllPlayerScoreOverrides();
      setSaved(true);
    });
  }

  return (
    <details className="rounded-xl border border-dashed border-border bg-card p-4">
      <summary className="cursor-pointer select-none text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        Edit demo scores
      </summary>
      <p className="mt-2 text-xs text-muted-foreground">
        Edits apply to this real-world player everywhere they&apos;re rostered — other demo
        leagues and real Sleeper/ESPN leagues too — until cleared, at which point each league goes
        back to its own live or stored data.
      </p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <p className="text-xs font-semibold uppercase text-muted-foreground">{matchup.team.name}</p>
          {myStarters.map((p) => {
            const key = rowKey("mine", p);
            return (
              <EditableRow
                key={key}
                player={p}
                value={values[key] ?? 0}
                onChange={(v) => {
                  setSaved(false);
                  setValues((prev) => ({ ...prev, [key]: v }));
                }}
                gameStatus={gameStatusValues[key] ?? null}
                onGameStatusChange={(v) => changeGameStatus(p, key, v)}
              />
            );
          })}
        </div>
        <div className="flex flex-col gap-2">
          <p className="text-xs font-semibold uppercase text-muted-foreground">
            {matchup.opponent?.name ?? "Opponent"}
          </p>
          {oppStarters.map((p) => {
            const key = rowKey("opp", p);
            return (
              <EditableRow
                key={key}
                player={p}
                value={values[key] ?? 0}
                onChange={(v) => {
                  setSaved(false);
                  setValues((prev) => ({ ...prev, [key]: v }));
                }}
                gameStatus={gameStatusValues[key] ?? null}
                onGameStatusChange={(v) => changeGameStatus(p, key, v)}
              />
            );
          })}
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={pending}
          className="inline-flex min-w-[150px] items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {pending ? "Saving…" : "Save scores"}
        </button>
        <button
          type="button"
          onClick={clearAll}
          disabled={pending}
          className="inline-flex items-center justify-center rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-muted disabled:opacity-60"
        >
          Clear all overrides
        </button>
        {saved && <span className="text-sm text-primary">Saved.</span>}
      </div>
    </details>
  );
}
