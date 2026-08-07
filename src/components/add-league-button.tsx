"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AddLeagueSection } from "./add-league-section";
import { headerButtonClass } from "@/lib/utils";

export function AddLeagueButton({
  hasStoredEspnCookies,
  className = headerButtonClass,
  label = "+ Add league",
  ariaLabel,
}: {
  hasStoredEspnCookies: boolean;
  /** Lets the same self-contained trigger+modal be dropped into a header
   * button, a dropdown-menu row, or a big empty-state CTA, without three
   * copies of the modal/portal/escape-key logic to keep in sync. */
  className?: string;
  label?: ReactNode;
  /** Set when `label` alone (e.g. a bare "+") isn't descriptive enough for
   * a screen reader. */
  ariaLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  // Portals can't render on the server (no document there), so wait for the
  // client mount before creating one — matches server and first client
  // render, then swaps in.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    // Deferred to a microtask rather than called directly in the effect
    // body — still fires before the next paint, just not synchronously
    // within the effect itself (which react-hooks/set-state-in-effect flags
    // as a cascading-render risk even though there's nothing to cascade
    // here: the state literally can't be known any earlier than "mounted").
    queueMicrotask(() => setMounted(true));
  }, []);

  // A `click` event's target is resolved from where the mouse is *released*,
  // not where it went down. Selecting text inside the modal and dragging
  // past its edge before releasing lands the click on the backdrop — same
  // as a real backdrop click — closing it unintentionally. Only close when
  // BOTH the mousedown and the click landed on the backdrop.
  const backdropMouseDownRef = useRef(false);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  const modal = open && (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onMouseDown={(e) => {
        backdropMouseDownRef.current = e.target === e.currentTarget;
      }}
      onClick={(e) => {
        if (backdropMouseDownRef.current && e.target === e.currentTarget) {
          setOpen(false);
        }
      }}
    >
      <div className="flex max-h-[85dvh] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-border bg-card text-foreground">
        <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Add another league
          </h2>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close"
            className="rounded-md p-1 text-muted-foreground outline-none ring-ring hover:bg-muted hover:text-foreground focus-visible:ring-2"
          >
            ✕
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <AddLeagueSection hasStoredEspnCookies={hasStoredEspnCookies} />
        </div>
      </div>
    </div>
  );

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={className}
        aria-label={ariaLabel}
      >
        {label}
      </button>
      {mounted ? createPortal(modal, document.body) : null}
    </>
  );
}
