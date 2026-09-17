import type { WelcomeLetter } from "@/lib/services/welcome-letter";
import { WelcomeLetterReader } from "@/components/communication/WelcomeLetterReader";

/**
 * Velocity Gate 8 — Welcome Letters awaiting the TL, and the ones already sent.
 * SLA breaches are named rather than averaged away (ADR-HS-01): a letter that
 * took longer than the promise says so, permanently.
 */
export function WelcomeLetterBoard({ letters, slaHours }: { letters: WelcomeLetter[]; slaHours: number }) {
  if (letters.length === 0) {
    return (
      <div className="rounded-lg border border-line bg-card px-5 py-6">
        <p className="font-body text-sm text-white">No Welcome Letters yet</p>
        <p className="mt-0.5 font-body text-xs font-light text-muted">
          One is drafted automatically within {slaHours} hours of a project&rsquo;s first instalment being confirmed.
        </p>
      </div>
    );
  }

  const breached = letters.filter((l) => l.slaBreached);

  return (
    <div>
      {breached.length > 0 ? (
        <div role="alert" className="mb-4 rounded-lg border-l-4 border-error bg-error/5 px-5 py-3">
          <p className="font-body text-sm font-bold text-error">
            {breached.length} Welcome Letter{breached.length === 1 ? "" : "s"} missed the {slaHours}-hour promise.
          </p>
          <p className="mt-0.5 font-body text-xs font-light text-secondary">
            {breached.map((b) => `${b.projectCode} (${b.hoursToDraft}h)`).join(" · ")} — the delay stays on record.
          </p>
        </div>
      ) : null}

      <div className="space-y-4">
        {letters.map((l) => (
          <div key={l.id}>
            <div className="mb-1.5 flex flex-wrap items-center gap-2">
              <Badge
                cls={
                  l.status === "sent"
                    ? "bg-success/10 text-success"
                    : l.status === "read"
                      ? "bg-warning/10 text-warning"
                      : "bg-surface text-muted"
                }
              >
                {l.status === "sent" ? "Sent" : l.status === "read" ? "Read — ready to send" : "Awaiting read"}
              </Badge>
              {l.hoursToDraft != null ? (
                <span
                  className={`font-body text-[11px] font-light tabular-nums ${l.slaBreached ? "text-error" : "text-muted"}`}
                >
                  drafted {l.hoursToDraft}h after the instalment
                  {l.slaBreached ? ` · over the ${slaHours}h promise` : ""}
                </span>
              ) : null}
            </div>
            <WelcomeLetterReader letter={l} />
          </div>
        ))}
      </div>
    </div>
  );
}

function Badge({ children, cls }: { children: React.ReactNode; cls: string }) {
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 font-body text-[10px] font-bold uppercase tracking-wide ${cls}`}>
      {children}
    </span>
  );
}
