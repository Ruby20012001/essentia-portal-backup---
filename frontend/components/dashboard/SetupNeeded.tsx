/**
 * Shown when the environment is not configured — a known state, not an
 * error. Real data appears the moment DATABASE_URL points at a Postgres
 * loaded with db/001 (+ seeds); no mock data is ever rendered instead.
 */
export function SetupNeeded({ missing }: { missing: string[] }) {
  return (
    <div className="rounded-lg border border-navy/30 bg-navy/5 px-6 py-8">
      <h2 className="font-heading text-2xl text-navy">
        Database not connected
      </h2>
      <p className="mt-2 max-w-xl font-body text-sm font-light text-ink">
        This dashboard renders live data only. Set{" "}
        {missing.map((name, i) => (
          <span key={name}>
            {i > 0 ? " and " : ""}
            <code className="rounded bg-white px-1.5 py-0.5 font-bold">
              {name}
            </code>
          </span>
        ))}{" "}
        in <code className="rounded bg-white px-1.5 py-0.5">.env.local</code>{" "}
        (template in .env.example), load{" "}
        <code className="rounded bg-white px-1.5 py-0.5">
          db/001_essentia_schema.sql
        </code>{" "}
        plus seeds into PostgreSQL 15+, then reload.
      </p>
    </div>
  );
}
