import Link from "next/link";
import { GATES, progressByGroup, progressTotals } from "@/lib/build-progress";

/**
 * Build Progress — every screen in the menu, built or still a placeholder,
 * and the eight Velocity Gates. Static: the screen list is checked against
 * the page files by a unit test, so what this says is what the code is.
 */
export default function BuildProgressPage() {
  const groups = progressByGroup();
  const t = progressTotals(groups);

  return (
    <div>
      <div className="mb-6">
        <h1 className="mb-1 font-heading text-4xl text-white">Build Progress</h1>
        <p className="font-body text-sm font-light text-muted">
          How far the portal has come: every screen in the menu, and the eight gates that must be live before
          the first client goes on the portal.
        </p>
      </div>

      <div className="mb-10 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Meter label="Screens built" done={t.built} total={t.total} />
        <Meter label="Velocity Gates passed" done={t.gatesPassed} total={t.gatesTotal} />
      </div>

      <section className="mb-10">
        <h2 className="mb-1 font-heading text-2xl text-white">Velocity Gates</h2>
        <p className="mb-3 font-body text-xs font-light text-muted">
          Brief §35. A gate is a business fact, not something the code can prove, so these are as recorded in the
          project notes.
        </p>
        <ol className="overflow-hidden rounded-lg border border-line">
          {GATES.map((g, i) => (
            <li key={g.n} className={`flex items-start gap-4 bg-card px-5 py-3 ${i > 0 ? "border-t border-line" : ""}`}>
              <span className="w-6 shrink-0 text-center font-body text-xl font-light text-muted">{g.n}</span>
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-body text-[13px] font-bold text-white">{g.name}</span>
                  <Chip on={g.status === "passed"} on-label="Passed" />
                </span>
                <span className="mt-0.5 block font-body text-sm font-light text-secondary">{g.rule}</span>
                {g.note ? <span className="mt-0.5 block font-body text-xs font-light text-warning">{g.note}</span> : null}
              </span>
            </li>
          ))}
        </ol>
      </section>

      <section>
        <h2 className="mb-3 font-heading text-2xl text-white">Screens</h2>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {groups.map((g) => {
            const built = g.screens.filter((s) => s.status === "built").length;
            return (
              <div key={g.label} className="overflow-hidden rounded-lg border border-line">
                <div className="flex items-baseline justify-between bg-surface px-5 py-2.5">
                  <span className="font-body text-[11px] font-bold uppercase tracking-[0.12em] text-secondary">{g.label}</span>
                  <span className="font-body text-xs tabular-nums text-muted">
                    {built} of {g.screens.length} built
                  </span>
                </div>
                {g.screens.map((s) => (
                  <div key={s.href} className="flex items-start gap-3 border-t border-line bg-card px-5 py-2.5">
                    <span
                      aria-hidden="true"
                      className={`mt-1.5 inline-block h-2 w-2 shrink-0 rounded-full ${s.status === "built" ? "bg-success" : "bg-white/20"}`}
                    />
                    <span className="min-w-0 flex-1">
                      <Link href={s.href} className="font-body text-sm text-white hover:underline">
                        {s.label}
                      </Link>
                      {s.note ? <span className="block font-body text-xs font-light text-muted">{s.note}</span> : null}
                    </span>
                    <span className={`shrink-0 font-body text-[10px] font-bold uppercase tracking-wide ${s.status === "built" ? "text-success" : "text-muted"}`}>
                      {s.status === "built" ? "Built" : "Placeholder"}
                    </span>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function Meter({ label, done, total }: { label: string; done: number; total: number }) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  return (
    <div className="rounded-lg border border-line bg-card px-5 py-4">
      <p className="font-body text-[11px] font-light uppercase tracking-[0.16em] text-muted">{label}</p>
      <p className="mt-2 font-body text-2xl font-light leading-tight text-white">
        {done} <span className="text-muted">of {total}</span>
      </p>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface" role="img" aria-label={`${pct}%`}>
        <div className="h-full rounded-full bg-success" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function Chip({ on, "on-label": onLabel }: { on: boolean; "on-label": string }) {
  return (
    <span
      className={`rounded-full px-2 py-0.5 font-body text-[10px] font-bold uppercase tracking-wide ${
        on ? "bg-success/10 text-success" : "bg-warning/10 text-warning"
      }`}
    >
      {on ? onLabel : "Open"}
    </span>
  );
}
