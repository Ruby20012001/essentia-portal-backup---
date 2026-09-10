"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Velocity Gate 5 — the Country Head's sign-off, taken one discount at a time.
 * A refusal from the service is shown verbatim: the portal never blocks
 * silently, it says exactly what is wrong (house anti-busy rules).
 */
export function ApproveDiscountButton({ saleId, label }: { saleId: string; label: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <div>
      <button
        type="button"
        disabled={busy}
        aria-label={label}
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            const res = await fetch(`/api/eh/discounts/${saleId}/approve`, { method: "POST" });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
              setError(data.error ?? "That approval could not be recorded.");
              return;
            }
            router.refresh();
          } catch {
            setError("That approval could not be recorded — the portal is unreachable.");
          } finally {
            setBusy(false);
          }
        }}
        className="rounded border border-line-strong bg-surface px-3 py-1 font-body text-xs font-bold text-white transition-colors hover:bg-hover focus:border-white focus:outline-none disabled:opacity-50"
      >
        {busy ? "Approving…" : "Approve"}
      </button>
      {error ? (
        <p role="alert" className="mt-1 font-body text-[11px] font-bold text-error">
          {error}
        </p>
      ) : null}
    </div>
  );
}
