"use client";

import { useRef } from "react";
import { AddLeagueSection } from "./add-league-section";
import { headerButtonClass } from "@/lib/utils";

export function AddLeagueButton({ hasStoredEspnCookies }: { hasStoredEspnCookies: boolean }) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  return (
    <>
      <button
        type="button"
        onClick={() => dialogRef.current?.showModal()}
        className={headerButtonClass}
      >
        + Add league
      </button>
      <dialog
        ref={dialogRef}
        onClick={(e) => {
          if (e.target === e.currentTarget) dialogRef.current?.close();
        }}
        className="m-auto w-full max-w-lg rounded-xl border border-border bg-card p-0 text-foreground backdrop:bg-black/50"
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Add another league
          </h2>
          <button
            type="button"
            onClick={() => dialogRef.current?.close()}
            aria-label="Close"
            className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            ✕
          </button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto p-4">
          <AddLeagueSection hasStoredEspnCookies={hasStoredEspnCookies} />
        </div>
      </dialog>
    </>
  );
}
