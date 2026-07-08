import Link from "next/link";
import type { PrioritySignal } from "@/lib/services/dashboard";

/**
 * The red band above the fold — Blueprint §04: "signal first". When nothing
 * needs attention it says so quietly in forest; it never disappears, so a
 * missing band can't be mistaken for a healthy morning.
 */
export function PrioritySignalBand({
  signals,
}: {
  signals: PrioritySignal[];
}) {
  if (signals.length === 0) {
    return (
      <div className="rounded-lg border border-forest/30 bg-forest/5 px-5 py-3">
        <p className="font-body text-sm font-light text-forest">
          All clear — nothing needs your attention right now.
        </p>
      </div>
    );
  }

  const hasRed = signals.some((s) => s.severity === "red");

  return (
    <div
      className={`rounded-lg border-l-4 px-5 py-4 ${
        hasRed
          ? "border-alert bg-alert/5"
          : "border-amber-deep bg-amber/10"
      }`}
    >
      <p
        className={`mb-2 font-body text-[11px] font-bold uppercase tracking-[0.16em] ${
          hasRed ? "text-alert" : "text-amber-deep"
        }`}
      >
        Priority signals
      </p>
      <ul className="space-y-1.5">
        {signals.map((signal) => (
          <li key={signal.message}>
            <Link
              href={signal.href}
              className={`font-body text-sm hover:underline ${
                signal.severity === "red"
                  ? "font-bold text-alert"
                  : "font-light text-ink"
              }`}
            >
              {signal.message}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
