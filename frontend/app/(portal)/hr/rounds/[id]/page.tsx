import Link from "next/link";
import { notFound } from "next/navigation";
import { ScorecardForm } from "@/components/hiring/ScorecardForm";
import { getCurrentUser } from "@/lib/auth/session";
import { formatIST } from "@/lib/format";
import { NotFoundError } from "@/lib/services/blocking";
import { PermissionError } from "@/lib/services/permissions";
import { getRound, hiringNotInstalled } from "@/lib/services/hiring";
import { invalidId } from "@/lib/api/params";
import { modeLabel } from "@/lib/services/hiring-logic";
import { NotInstalled } from "@/components/hiring/NotInstalled";

export const dynamic = "force-dynamic";

/**
 * An interview, as the person sitting in it sees it — and as HR sees it when
 * checking one they are not on.
 *
 * Being on the panel is the permission for the write-up, which is the point
 * of a panel: a department HOD reaches this without reaching anything else.
 * They are told who they are meeting, what to ask, and nothing about pay.
 */
export default async function RoundPage({ params }: { params: { id: string } }) {
  // A link that picked up a trailing full stop in WhatsApp is not found, not a crash.
  if (invalidId(params.id)) notFound();
  const user = await getCurrentUser();

  try {
    const { interview, candidate, questions, mine, isPanelist, submitBlocked } = await getRound(
      user,
      params.id,
    );

    return (
      <div>
        <Link href="/hr" className="font-body text-sm text-muted underline-offset-4 hover:text-white hover:underline">
          ← Hiring
        </Link>

        <header className="mt-4">
          <h1 className="font-heading text-4xl text-white">{candidate.name}</h1>
          <p className="mt-1 font-body text-sm font-light text-muted">
            {candidate.roleTitle} · {interview.stageLabel} · {formatIST(interview.scheduledAt)} IST ·{" "}
            {interview.durationMins} min · {modeLabel(interview.mode)}
            {interview.location ? ` · ${interview.location}` : ""}
          </p>
          <p className="mt-1 font-body text-sm font-light text-muted">
            In the room: {interview.panel.map((p) => p.name).join(", ")}
          </p>
          {interview.status === "cancelled" || interview.status === "no_show" ? (
            <p className="mt-3 rounded-lg border border-alert/30 bg-alert/5 px-4 py-3 font-body text-sm text-alert">
              {interview.status === "cancelled"
                ? "This interview was called off."
                : "The candidate did not come to this interview."}
            </p>
          ) : null}
          <div className="mt-2 flex flex-wrap gap-4">
            {candidate.resumeUrl ? (
              <a
                href={candidate.resumeUrl}
                target="_blank"
                rel="noreferrer"
                className="font-body text-sm text-white underline underline-offset-4"
              >
                Open the CV
              </a>
            ) : null}
            {!isPanelist ? (
              <Link
                href={`/hr/candidates/${candidate.id}`}
                className="font-body text-sm text-white underline underline-offset-4"
              >
                The candidate&apos;s file
              </Link>
            ) : null}
          </div>
        </header>

        {isPanelist ? (
          <ScorecardForm
            interviewId={interview.id}
            questions={questions}
            existing={mine}
            submitBlocked={submitBlocked}
            scheduledAt={interview.scheduledAt}
            status={interview.status}
          />
        ) : (
          <section className="mt-8 rounded-lg border border-line bg-card p-5">
            <h2 className="font-heading text-2xl text-white">The questions</h2>
            <p className="mt-1 font-body text-sm font-light text-muted">
              You are not on this panel, so there is no write-up for you here.{" "}
              {interview.scorecardsIn} of {interview.panel.length} write-ups are in.
            </p>
            {questions.length === 0 ? (
              <p className="mt-4 font-body text-sm text-muted">No question set — a conversation.</p>
            ) : (
              <ol className="mt-4 space-y-3">
                <li className="font-body text-xs font-bold uppercase tracking-[0.16em] text-muted">
                  {interview.questionSetName}
                </li>
                {questions.map((q) => (
                  <li key={q.id}>
                    <p className="font-body text-[14px] text-white">
                      {q.seq}. {q.prompt}
                    </p>
                    {q.guidance ? (
                      <p className="mt-0.5 font-body text-xs font-light text-muted">{q.guidance}</p>
                    ) : null}
                  </li>
                ))}
              </ol>
            )}
          </section>
        )}
      </div>
    );
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    if (hiringNotInstalled(error)) return <NotInstalled />;
    if (error instanceof PermissionError) {
      return (
        <div>
          <Link href="/hr" className="font-body text-sm text-muted underline-offset-4 hover:text-white hover:underline">
            ← Hiring
          </Link>
          <div className="mt-4 rounded-lg border border-line bg-card px-6 py-16 text-center">
            <p className="font-heading text-2xl text-white">Not your interview</p>
            <p className="mx-auto mt-1 max-w-lg font-body text-sm font-light text-muted">
              Only the people sitting in an interview, and HR, can open it. If you are meant
              to be in this one, ask HR to add you to the panel — they can change it from the
              candidate&apos;s page, and you will be notified.
            </p>
          </div>
        </div>
      );
    }
    throw error;
  }
}
