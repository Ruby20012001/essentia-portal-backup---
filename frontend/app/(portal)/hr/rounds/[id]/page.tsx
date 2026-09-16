import Link from "next/link";
import { notFound } from "next/navigation";
import { ScorecardForm } from "@/components/hiring/ScorecardForm";
import { getCurrentUser } from "@/lib/auth/session";
import { NotFoundError } from "@/lib/services/blocking";
import { PermissionError } from "@/lib/services/permissions";
import { getRoundForPanel } from "@/lib/services/hiring";
import { modeLabel, when } from "@/components/hiring/RoundsList";

export const dynamic = "force-dynamic";

/**
 * A round, as the person sitting in it sees it.
 *
 * This is the one screen in the module that is not HR's. Being on the panel is
 * the permission — which is the whole point of a panel — so a department HOD
 * reaches this without reaching anything else. They are told who they are
 * meeting, what to ask, and nothing about what anybody is being paid.
 */
export default async function RoundPage({ params }: { params: { id: string } }) {
  const user = await getCurrentUser();

  try {
    const round = await getRoundForPanel(user, params.id);
    const { interview, candidate, questions, mine } = round;

    return (
      <div>
        <Link
          href="/hr"
          className="font-body text-sm text-muted underline-offset-4 hover:text-white hover:underline"
        >
          ← Hiring
        </Link>

        <header className="mt-4">
          <h1 className="font-heading text-4xl text-white">{candidate.name}</h1>
          <p className="mt-1 font-body text-sm font-light text-muted">
            {candidate.roleTitle} · {candidate.stageLabel} · {when(interview.scheduledAt)} ·{" "}
            {interview.durationMins} min · {modeLabel(interview.mode)}
            {interview.location ? ` · ${interview.location}` : ""}
          </p>
          <p className="mt-1 font-body text-sm font-light text-muted">
            In the room: {interview.panel.map((p) => p.name).join(", ")}
          </p>
          {candidate.resumeUrl ? (
            <a
              href={candidate.resumeUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-2 inline-block font-body text-sm text-white underline underline-offset-4"
            >
              Open the CV
            </a>
          ) : null}
        </header>

        <ScorecardForm
          interviewId={interview.id}
          questions={questions}
          existing={mine}
        />
      </div>
    );
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    if (error instanceof PermissionError) {
      return (
        <div className="rounded-lg border border-line bg-card px-6 py-16 text-center">
          <p className="font-heading text-2xl text-white">Not your round</p>
          <p className="mx-auto mt-1 max-w-lg font-body text-sm font-light text-muted">
            Only the people sitting in a conversation can open it. If you are
            meant to be in this one, ask HR to add you to the panel.
          </p>
        </div>
      );
    }
    throw error;
  }
}
