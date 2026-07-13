/** KPI card: Lato Light metric number in white, muted uppercase label above. */
export function MetricCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded-lg border border-line bg-card px-5 py-4">
      <p className="font-body text-[11px] font-light uppercase tracking-[0.16em] text-muted">
        {label}
      </p>
      <p className="mt-2 font-body text-2xl font-light leading-tight text-white">
        {value}
      </p>
      {sub ? (
        <p className="mt-0.5 font-body text-xs font-light text-muted">{sub}</p>
      ) : null}
    </div>
  );
}
