/**
 * Shown when the environment is not configured — a known state, not an error.
 * Screens render live data only; no placeholder data is ever shown instead.
 * The missing setting names are listed so an administrator can act, without
 * printing local setup steps to whoever happens to be looking at the screen.
 */
export function SetupNeeded({ missing }: { missing: string[] }) {
  return (
    <div className="rounded-lg border border-navy/30 bg-navy/5 px-6 py-8">
      <h2 className="font-heading text-2xl text-navy">
        Database not connected
      </h2>
      <p className="mt-2 max-w-xl font-body text-sm font-light text-ink">
        This screen shows live data only, and the connection is not configured.
        Missing{" "}
        {missing.map((name, i) => (
          <span key={name}>
            {i > 0 ? " and " : ""}
            <code className="rounded bg-surface px-1.5 py-0.5 font-bold">
              {name}
            </code>
          </span>
        ))}
        . Please contact your system administrator.
      </p>
    </div>
  );
}
