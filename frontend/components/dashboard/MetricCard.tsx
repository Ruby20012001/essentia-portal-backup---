/** Blueprint KPI card: serif metric number in amber, Lato label above. */
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
    <div className="rounded-lg border border-line bg-paper px-5 py-4">
      <p className="font-body text-[11px] font-bold uppercase tracking-[0.16em] text-label">
        {label}
      </p>
      <p className="mt-1 font-heading text-[34px] leading-tight text-amber">
        {value}
      </p>
      {sub ? (
        <p className="font-body text-xs font-light text-label">{sub}</p>
      ) : null}
    </div>
  );
}
