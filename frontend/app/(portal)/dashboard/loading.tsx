/** Branded skeleton for the dashboard while server queries run. */
export default function DashboardLoading() {
  return (
    <div aria-busy="true">
      <div className="mb-1 h-10 w-72 animate-pulse rounded bg-line" />
      <div className="mb-8 h-4 w-96 animate-pulse rounded bg-line/60" />
      <div className="mb-6 h-16 animate-pulse rounded-lg bg-line/50" />
      <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-28 animate-pulse rounded-lg bg-line/50" />
        ))}
      </div>
      <div className="mb-8 h-64 animate-pulse rounded-lg bg-line/40" />
      <div className="h-64 animate-pulse rounded-lg bg-line/40" />
    </div>
  );
}
