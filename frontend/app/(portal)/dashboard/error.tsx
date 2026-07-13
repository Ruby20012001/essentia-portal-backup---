"use client";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="rounded-lg border-l-4 border-alert bg-alert/5 px-6 py-8">
      <h2 className="font-heading text-2xl text-alert">
        The dashboard could not load
      </h2>
      <p className="mt-2 max-w-xl font-body text-sm font-light text-ink">
        {error.message}
      </p>
      <button
        onClick={reset}
        className="mt-5 rounded border border-line-strong bg-canvas px-5 py-2 font-body text-sm font-bold text-white transition-colors hover:bg-hover"
      >
        Try again
      </button>
    </div>
  );
}
