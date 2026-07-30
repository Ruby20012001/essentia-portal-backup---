"use client";

import { useRouter } from "next/navigation";
import type { EcOption } from "@/lib/services/eh";

/** Switch which Experience Centre the screen is showing (/eh?ec=id). */
export function CentreSwitcher({ centres, currentId }: { centres: EcOption[]; currentId: string }) {
  const router = useRouter();
  return (
    <label className="flex items-center gap-2">
      <span className="sr-only">Switch Experience Centre</span>
      <select
        aria-label="Switch Experience Centre"
        value={currentId}
        onChange={(e) => router.push(`/eh?ec=${e.target.value}`)}
        className="rounded border border-line-strong bg-card px-3 py-2 font-body text-sm text-secondary focus:border-white focus:outline-none"
      >
        {centres.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
            {c.city ? ` · ${c.city}` : ""}
          </option>
        ))}
      </select>
    </label>
  );
}
