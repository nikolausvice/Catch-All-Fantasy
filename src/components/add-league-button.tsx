"use client";

import { useRef } from "react";
import { AddLeagueSection } from "./add-league-section";
import { headerButtonClass } from "@/lib/utils";

export function AddLeagueButton({ hasStoredEspnCookies }: { hasStoredEspnCookies: boolean }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  // A `click` event's target is resolved from where the mouse is *released*,
  // not where it went down. Selecting text inside the dialog and dragging
  // past its edge before releasing lands the click on the dialog itself —
  // same as a real backdrop click — closing it unintentionally. Only close
  // when BOTH the mousedown and the click landed on the backdrop.
  const backdropMouseDownRef = useRef(false);

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
        onMouseDown={(e) => {
          backdropMouseDownRef.current = e.target === e.currentTarget;
        }}
        onClick={(e) => {
          if (backdropMouseDownRef.current && e.target === e.currentTarget) {
            dialogRef.current?.close();
          }
        }}
        className="m-auto flex max-h-[85dvh] w-[calc(100%-2rem)] max-w-lg flex-col overflow-hidden rounded-xl border border-border bg-card p-0 text-foreground backdrop:bg-black/50"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3">
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
        <div className="overflow-y-auto p-4">
          <AddLeagueSection hasStoredEspnCookies={hasStoredEspnCookies} />
        </div>
      </dialog>
    </>
  );
}
