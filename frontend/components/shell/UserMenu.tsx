"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { SessionUser } from "@/lib/auth/session";
import { ChangePassword } from "@/components/shell/ChangePassword";

const LEVEL_LABEL: Record<SessionUser["accessLevel"], string> = {
  L0: "Founder",
  L1: "Senior Leadership",
  L2: "HOD / Team Lead",
  L3: "Team",
};

export function UserMenu({ user }: { user: SessionUser }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  return (
    <div className="flex items-center gap-4">
      <div className="text-right">
        <p className="font-body text-xs font-bold text-cream">{user.name}</p>
        <p className="font-body text-[10px] font-light text-cream/60">
          {LEVEL_LABEL[user.accessLevel]}
        </p>
      </div>
      {/* Beside Sign out, because both are things you do to your own account
          and this is the only place in the shell that is about you. */}
      <ChangePassword />
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            await fetch("/api/auth/logout", { method: "POST" });
            router.push("/login");
            router.refresh();
          } finally {
            setBusy(false);
          }
        }}
        className="rounded border border-cream/25 px-3 py-1 font-body text-[11px] font-bold text-cream/80 transition-colors hover:border-cream/60 hover:text-cream disabled:opacity-50"
      >
        {busy ? "…" : "Sign out"}
      </button>
    </div>
  );
}
