/** Branded skeleton for the WIO → PIO Tracker while the server read runs. */
export default function WioTrackerLoading() {
  return (
    <div aria-busy="true">
      <div className="mb-1 h-10 w-80 animate-pulse rounded bg-line" />
      <div className="mb-8 h-4 w-96 animate-pulse rounded bg-line/60" />
      <div className="mb-6 h-10 w-full animate-pulse rounded bg-line/40" />
      <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
          <div key={i} className="h-24 animate-pulse rounded-lg bg-line/50" />
        ))}
      </div>
      <div className="mb-10 h-64 animate-pulse rounded-lg bg-line/40" />
      <div className="h-80 animate-pulse rounded-lg bg-line/40" />
    </div>
  );
}
