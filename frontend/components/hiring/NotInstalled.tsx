/**
 * The hiring tables are not in this database yet (db/049 has not been run).
 * A known state, not an error — the code can reach a deployment before its
 * migration does — so it is said in words, without printing setup steps to
 * whoever happens to be looking.
 */
export function NotInstalled() {
  return (
    <div className="rounded-lg border border-navy/30 bg-navy/5 px-6 py-8">
      <h2 className="font-heading text-2xl text-navy">Hiring is not switched on yet</h2>
      <p className="mt-2 max-w-xl font-body text-sm font-light text-ink">
        This screen is ready, but its database tables have not been created on this
        portal. Please contact your system administrator.
      </p>
    </div>
  );
}
