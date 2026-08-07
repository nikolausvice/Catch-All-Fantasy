"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Menu } from "lucide-react";
import { signOut } from "@/app/(auth)/actions";
import { GITHUB_URL } from "@/components/site-footer";
import { cn, headerButtonClass } from "@/lib/utils";

export function UserMenu() {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        aria-label="Menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={cn(headerButtonClass, "w-9 px-0")}
      >
        <Menu className="size-4" />
      </button>
      <div
        className={cn(
          "absolute right-0 top-full z-20 mt-2 w-44 overflow-hidden rounded-md border border-border bg-card py-1 shadow-lg",
          open ? "block" : "hidden",
        )}
      >
        <Link
          href="/dashboard/settings"
          onClick={() => setOpen(false)}
          className="block px-3 py-2 text-sm hover:bg-muted"
        >
          Settings
        </Link>
        <Link
          href="/faq"
          onClick={() => setOpen(false)}
          className="block px-3 py-2 text-sm hover:bg-muted"
        >
          FAQ
        </Link>
        <a
          href={GITHUB_URL}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => setOpen(false)}
          className="flex items-center justify-between gap-2 px-3 py-2 text-sm hover:bg-muted"
        >
          GitHub
          <ArrowUpRight className="size-3.5 text-muted-foreground" />
        </a>
        <div className="my-1 border-t border-border" />
        <form action={signOut}>
          <button
            type="submit"
            className="block w-full px-3 py-2 text-left text-sm hover:bg-muted"
          >
            Log out
          </button>
        </form>
      </div>
    </div>
  );
}
