"use client";

import { DesignAvatar } from "@/components/design-tracker/DesignAvatar";
import { HEAT_DOT, HEAT_MEANING } from "@/components/design-tracker/HeatPill";
import type { DesignBoard } from "@/lib/services/design-tracker";
import { forPerson, personRows } from "@/lib/services/design-tracker-logic";

/** This person's running projects, worst first — the board already sorts them. */
function mine(board: DesignBoard, personId: string) {
  return forPerson(board.projects, personId).filter((p) => p.heat !== "DONE");
}

/**
 * Team performance — a card per designer, read rather than worked.
 *
 * It answers the question a head of department actually asks, which is not
 * "how many activities exist" but "who is carrying what, and who is stuck"
 * (Monica, 18 Sep: "team performance ka button bhi chahiye").
 *
 * PERFORMANCE HERE IS LOAD AND BLOCKAGE, NOT A SCORE. Lateness on this chart is
 * very often somebody else's — the worst delay on the board is a layout sitting
 * with the ID team, not with the designer whose name is on the project. So each
 * card says how much a person is carrying, how much of it is late, and who the
 * late work is waiting on. It deliberately does not rank people, because the
 * number that would rank them is mostly a fact about other teams.
 *
 * Clicking a card is the same person lens the other tabs use, so the whole
 * board narrows to that designer.
 */
export function DesignTeamView({
  board,
  onPerson,
}: {
  board: DesignBoard;
  onPerson: (id: string | null) => void;
}) {
  const rows = personRows(board.projects, board.people).filter(
    (row) => row.role === "designer" || row.counts.running + row.counts.done > 0,
  );

  if (rows.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-line-strong bg-card px-6 py-8 text-center font-body text-sm font-light text-muted">
        Nobody on the team has a project yet.
      </p>
    );
  }

  const busiest = Math.max(1, ...rows.map((r) => r.counts.running));

  return (
    <section>
      <h2 className="mb-1 font-heading text-2xl text-white">Team performance</h2>
      <p className="mb-5 font-body text-sm font-light text-muted">
        What each designer is carrying, and how much of it is running late. Late work is usually waiting
        on another team — the name under &ldquo;waiting on&rdquo; says whose. Click a card to narrow the
        whole board to that person.
      </p>

      <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {rows.map((row) => {
          const { running, hot, warm, cold, done, notTracked } = row.counts;
          const late = row.worst && row.worst.heat === "HOT" ? row.worst : null;
          /* Every reason this person is behind, not only the worst one
             (Monica, 18 Sep: "mujhe reasons bhi do"). One line per overdue
             task, longest wait first, each naming the project and the team it
             is sitting with — because on this chart the reason is almost never
             the designer, and a card that says "50 days late" without saying
             whose desk it is on reads like a verdict on them. */
          const reasons = mine(board, row.id)
            .flatMap((p) => p.late.map((a) => ({ p, a })))
            .sort((x, y) => (y.a.daysLate ?? 0) - (x.a.daysLate ?? 0));
          return (
            <li key={row.id}>
              <button
                type="button"
                onClick={() => onPerson(row.id)}
                className="flex h-full w-full flex-col rounded-lg border border-line bg-card px-5 py-4 text-left transition-colors hover:bg-hover"
              >
                <div className="flex items-center gap-3">
                  <DesignAvatar name={row.name} size={34} />
                  <div className="min-w-0">
                    <p className="truncate font-body text-sm font-bold text-ink">{row.name}</p>
                    <p className="font-body text-[11px] font-light text-muted">
                      {row.role === "head" ? "Head of the team" : "Designer"}
                    </p>
                  </div>
                  <span className="ml-auto text-right">
                    <span className="block font-heading text-2xl leading-none text-white">
                      {running}
                    </span>
                    <span className="block font-body text-[10px] font-light uppercase tracking-[0.12em] text-muted">
                      running
                    </span>
                  </span>
                </div>

                {/* How the load splits. One bar, in the board's own colours, so
                    a glance says "mostly red" or "mostly blue" before any
                    number is read. */}
                <div className="mt-4 flex h-2.5 w-full overflow-hidden rounded-sm bg-hover">
                  {running === 0 ? null : (
                    <>
                      <Seg n={hot} of={running} className="bg-alert" />
                      <Seg n={warm} of={running} className="bg-warning" />
                      <Seg n={cold} of={running} className="bg-navy" />
                      <Seg n={notTracked} of={running} className="bg-line-strong" />
                    </>
                  )}
                </div>
                {/* Widths are of this person's own work, so the bar is always
                    full. The count beside each dot is what compares people. */}
                <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 font-body text-[11px] font-light text-muted">
                  <Dot heat="HOT" n={hot} word="late" />
                  <Dot heat="WARM" n={warm} word="due soon" />
                  <Dot heat="COLD" n={cold} word="on time" />
                  {notTracked > 0 ? <Dot heat="NOT TRACKED" n={notTracked} word="no start date" /> : null}
                  {done > 0 ? <span className="text-forest">{done} done</span> : null}
                </div>

                <div className="mt-3 border-t border-line pt-3 font-body text-[12px] font-light">
                  {late ? (
                    <>
                      <p className="mb-1.5 text-ink">
                        <span className="font-bold text-alert">
                          {late.delayDays} {late.delayDays === 1 ? "day" : "days"} late
                        </span>{" "}
                        on <span className="font-bold">{late.name}</span>
                      </p>
                      <p className="mb-1 font-body text-[10px] font-bold uppercase tracking-[0.12em] text-muted">
                        why · {reasons.length} {reasons.length === 1 ? "task" : "tasks"} overdue
                      </p>
                      <ul className="space-y-1">
                        {reasons.slice(0, 4).map(({ p, a }) => (
                          <li key={`${p.id}:${a.id}`} className="text-muted">
                            <span className="font-bold text-alert">{a.daysLate}d</span> {a.task}
                            <span className="text-secondary"> · waiting on {a.dependsOn}</span>
                            {reasons.some((r) => r.p.id !== p.id) ? (
                              <span className="text-muted"> ({p.name})</span>
                            ) : null}
                          </li>
                        ))}
                        {reasons.length > 4 ? (
                          <li className="text-muted">and {reasons.length - 4} more</li>
                        ) : null}
                      </ul>
                    </>
                  ) : running === 0 ? (
                    <p className="text-muted">No running projects.</p>
                  ) : (
                    <p className="text-forest">Nothing late.</p>
                  )}
                </div>

                {/* WHAT THEY ARE ACTUALLY CARRYING, BY NAME (Monica, 19 Sep:
                    "in logo ki project list bhi honi chahiye isme").

                    The card counted their work and named the one project in
                    the most trouble, which answers "is anything wrong" but not
                    "what is she on". Worst first, because that is the order the
                    board sorts by and the order a head reads in. */}
                {running > 0 ? (
                  <div className="mt-3 border-t border-line pt-3">
                    <p className="mb-1.5 font-body text-[10px] font-bold uppercase tracking-[0.12em] text-muted">
                      their projects · {running}
                    </p>
                    <ul className="space-y-1">
                      {mine(board, row.id).map((p) => (
                        <li
                          key={p.id}
                          className="flex items-baseline gap-2 font-body text-[12px] font-light"
                        >
                          <span
                            className={`mt-1.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full ${HEAT_DOT[p.heat]}`}
                            title={HEAT_MEANING[p.heat]}
                          />
                          <span className="truncate text-ink">{p.name}</span>
                          <span className="ml-auto whitespace-nowrap text-muted">
                            {p.heat === "HOT"
                              ? `${p.delayDays}d late`
                              : p.day === null
                                ? "no start date"
                                : `day ${p.day}`}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {/* Share of the busiest person's load — the one comparison
                    across cards that is honestly about the designer. */}
                <p className="mt-3 font-body text-[10px] font-light uppercase tracking-[0.12em] text-muted">
                  {running === 0
                    ? "nothing running"
                    : running === busiest
                      ? "carrying the most"
                      : `${busiest - running} fewer than the busiest`}
                </p>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Seg({ n, of, className }: { n: number; of: number; className: string }) {
  if (n <= 0) return null;
  return <span className={className} style={{ width: `${(n / of) * 100}%` }} />;
}

function Dot({ heat, n, word }: { heat: keyof typeof HEAT_DOT; n: number; word: string }) {
  if (n <= 0) return null;
  return (
    <span className="flex items-center gap-1" title={HEAT_MEANING[heat]}>
      <span className={`inline-block h-2 w-2 rounded-full ${HEAT_DOT[heat]}`} />
      {n} {word}
    </span>
  );
}
