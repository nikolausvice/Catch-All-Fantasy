"use client";

import { useState, useTransition } from "react";
import { deleteAccount } from "@/app/dashboard/actions";
import { ConfirmDialog } from "@/components/confirm-dialog";

export function DeleteAccountButton() {
  const [pending, startTransition] = useTransition();
  const [confirmOpen, setConfirmOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        disabled={pending}
        onClick={() => setConfirmOpen(true)}
        className="rounded-md border border-destructive/30 px-3 py-1.5 text-sm font-medium text-destructive hover:bg-destructive/10 disabled:opacity-60"
      >
        {pending ? "Deleting…" : "Delete account"}
      </button>
      <ConfirmDialog
        open={confirmOpen}
        title="Delete your account?"
        description="This permanently deletes your account and every league, saved login, and score override connected to it. This can't be undone."
        confirmLabel="Delete account"
        danger
        pending={pending}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => {
          setConfirmOpen(false);
          // deleteAccount signs out and redirects itself — nothing left to
          // do here once it resolves.
          startTransition(async () => {
            await deleteAccount();
          });
        }}
      />
    </>
  );
}
