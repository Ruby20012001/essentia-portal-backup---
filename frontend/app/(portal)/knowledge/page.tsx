import Link from "next/link";
import { AddSession } from "@/components/knowledge/AddSession";
import { getCurrentUser } from "@/lib/auth/session";
import { searchKnowledge } from "@/lib/services/knowledge";
import { contentTypeLabel, excerpt, TRACKS, visibleTracks } from "@/lib/services/knowledge-logic";
import { can } from "@/lib/services/permissions";

export const dynamic = "force-dynamic";

/**
 * S16 · Knowledge Library (Brief §32) — Wednesday Year, every track, in one
 * place. Search, browse by track, and add a session. Search matches words;
 * the page says so rather than promising the semantic search the brief
 * describes, which waits on an embedding provider.
 */
export default async function KnowledgeLibraryPage({
  searchParams,
}: {
  searchParams: { q?: string; track?: string; year?: string };
}) {
  const user = await getCurrentUser();
  const [read, create] = await Promise.all([
    can(user, "read", "knowledge_library"),
    can(user, "create", "knowledge_library"),
  ]);

  if (!read.allowed) {
    return (
      <div className="rounded-lg border border-line bg-card px-6 py-16 text-center">
        <p className="font-heading text-2xl text-white">Knowledge Library</p>
        <p className="mt-1 font-body text-sm font-light text-muted">
          Your account does not have access to the Knowledge Library. Contact your HOD to request it.
        </p>
      </div>
    );
  }

  const q = searchParams.q?.trim() ?? "";
  const track = searchParams.track ?? "";
  const year = Number(searchParams.year) || undefined;
  const { entries, tracks, years } = await searchKnowledge(user, { q, track, year });
  const allowed = visibleTracks(user.accessLevel);
  const filtered = Boolean(q || track || year);

  const href = (next: { q?: string; track?: string; year?: number }) => {
    const p = new URLSearchParams();
    if (next.q) p.set("q", next.q);
    if (next.track) p.set("track", next.track);
    if (next.year) p.set("year", String(next.year));
    const s = p.toString();
    return s ? `/knowledge?${s}` : "/knowledge";
  };

  return (
    <div>
      <div className="mb-6">
        <h1 className="mb-1 font-heading text-4xl text-white">Knowledge Library</h1>
        <p className="font-body text-sm font-light text-muted">
          Wednesday Year session notes across all six tracks, searchable by the whole team.
        </p>
      </div>

      <form action="/knowledge" method="get" className="mb-2 flex flex-wrap gap-3">
        {track ? <input type="hidden" name="track" value={track} /> : null}
        {year ? <input type="hidden" name="year" value={year} /> : null}
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="Search sessions by topic, material or role"
          aria-label="Search the library"
          className="min-w-0 flex-1 rounded-md border border-line bg-surface px-4 py-2.5 font-body text-sm text-white placeholder:text-muted focus:border-brand focus:outline-none"
        />
        <button type="submit" className="rounded-md bg-brand px-5 py-2.5 font-body text-sm font-bold text-brand-ink">
          Search
        </button>
      </form>
      <p className="mb-8 font-body text-xs font-light text-muted">
        Keyword search across titles, session notes and tags. Search by meaning will follow once an embedding
        service is selected.
      </p>

      <section className="mb-10">
        <h2 className="mb-3 font-heading text-2xl text-white">Browse by track</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {TRACKS.filter((t) => allowed.includes(t.name)).map((t) => {
            const c = tracks.find((x) => x.track === t.name);
            const on = track === t.name;
            return (
              <Link
                key={t.name}
                href={href({ q, track: on ? undefined : t.name, year })}
                aria-current={on ? "page" : undefined}
                aria-label={`${t.name} track, ${c ? `${c.sessions} session${c.sessions === 1 ? "" : "s"}` : "no sessions yet"}`}
                className={`rounded-lg border px-5 py-4 transition-colors hover:bg-hover ${
                  on ? "border-brand bg-brand/10" : "border-line bg-card"
                }`}
              >
                <span className="block font-body text-[11px] uppercase tracking-[0.16em] text-muted">
                  Track{t.leadershipOnly ? " · L1 only" : ""}
                </span>
                <span className="mt-1 block font-body text-base font-bold text-white">{t.name}</span>
                <span className="mt-0.5 block font-body text-xs font-light text-secondary">
                  {c ? `${c.sessions} session${c.sessions === 1 ? "" : "s"}` : "No sessions yet"}
                  {c?.leads.length ? ` · ${c.leads.slice(0, 2).join(", ")}` : ""}
                </span>
              </Link>
            );
          })}
        </div>
        {years.length > 1 ? (
          <nav aria-label="Year" className="mt-4 flex flex-wrap gap-2">
            {years.map((y) => (
              <Link
                key={y}
                href={href({ q, track, year: year === y ? undefined : y })}
                className={`rounded-full border px-3 py-1 font-body text-xs ${
                  year === y ? "border-brand bg-brand/10 text-white" : "border-line text-secondary hover:bg-hover"
                }`}
              >
                {y}
              </Link>
            ))}
          </nav>
        ) : null}
      </section>

      <section className="mb-10">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-heading text-2xl text-white">
            {filtered ? `${entries.length} result${entries.length === 1 ? "" : "s"}` : "Latest sessions"}
          </h2>
          {filtered ? (
            <Link href="/knowledge" className="font-body text-sm text-secondary hover:underline">
              Clear filters
            </Link>
          ) : null}
        </div>

        {entries.length === 0 ? (
          <div className="rounded-lg border border-dashed border-line-strong bg-card px-8 py-10 text-center">
            <p className="font-heading text-2xl text-white">{filtered ? "No matching sessions" : "No sessions yet"}</p>
            <p className="mt-1 font-body text-sm font-light text-muted">
              {filtered
                ? "Try broader keywords, or remove the track or year filter."
                : "Sessions you add below appear here for the whole team."}
            </p>
          </div>
        ) : (
          <ul className="overflow-hidden rounded-lg border border-line">
            {entries.map((e, i) => (
              <li key={e.id} className={`bg-card px-5 py-4 ${i > 0 ? "border-t border-line" : ""}`}>
                <p className="font-body text-[15px] font-bold text-white">{e.title}</p>
                <p className="mt-1 font-body text-sm font-light leading-relaxed text-secondary">{excerpt(e.content, q)}</p>
                <p className="mt-2 flex flex-wrap gap-1.5">
                  {[e.track, contentTypeLabel(e.contentType), ...e.topicTags, ...e.roleTags, e.year ? String(e.year) : null]
                    .filter((x): x is string => Boolean(x))
                    .map((tag, j) => (
                      <span key={`${tag}-${j}`} className="rounded-full bg-white/5 px-2 py-0.5 font-body text-[11px] text-muted">
                        {tag}
                      </span>
                    ))}
                  {e.lead ? <span className="px-1 font-body text-[11px] text-muted">Led by {e.lead}</span> : null}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      {create.allowed ? (
        <section>
          <AddSession tracks={allowed} />
        </section>
      ) : null}
    </div>
  );
}
