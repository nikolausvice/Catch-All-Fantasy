"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { headerButtonClass } from "@/lib/utils";

export function RefreshButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <button
      onClick={() => startTransition(() => router.refresh())}
      disabled={pending}
      className={headerButtonClass}
    >
      {pending ? "Refreshing…" : "↻ Refresh"}
    </button>
  );
}
