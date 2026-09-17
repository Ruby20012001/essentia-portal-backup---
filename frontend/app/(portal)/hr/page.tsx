import Link from "next/link";
import { MetricCard } from "@/components/dashboard/MetricCard";
import { HiringBoard } from "@/components/hiring/HiringBoard";
import { NotInstalled } from "@/components/hiring/NotInstalled";
import { RoundsList } from "@/components/hiring/RoundsList";
import { getCurrentUser, type SessionUser } from "@/lib/auth/session";
import { getDepartments } from "@/lib/services/departments";
import {
  hiringNotInstalled,
  hiringRights,
  listCandidates,
  listInterviews,
  listMyRounds,
  listOpenRoles,
  listStages,
  type HiringRights,
} from "@/lib/services/hiring";
import { seatsToFill } from "@/lib/services/hiring-logic";

export const dynamic = "force-dynamic";

/**
 * Departments that exist only to hold a shared login, not a team anybody is
 * hired into. Named here rather than flagged in the schema because there is
 * one of them; if a second appears, it wants a column on public.departments.
 */
const NOT_A_TEAM = new Set(["TRACKER_VIEW"]);

/**
 * S11 · Hiring (Brief §32, §36). Open seats, the people against them, the
 * interviews in the diary, and what each interviewer thought.
 *
 * Two audiences, two views. HR gets the board. Everybody else gets the
 * interviews they are personally sitting in — which is why a drafting HOD on a
 * panel lands on something useful here rather than on the word "Restricted".
 */
export default async function HrPage({
  searchParams,
}: {
  searchParams: { all?: string };
}) {
  const user = await getCurrentUser();

  try {
    const [rights, myRounds] = await Promise.all([hiringRights(user), listMyRounds(user)]);
    const owedByMe = myRounds.filter(
      (r) => r.happened && r.mine !== "submitted" && r.status !== "cancelled" && r.status !== "no_show",
    ).length;

    return (
      <div>
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="mb-1 font-heading text-4xl text-white">Hiring</h1>
            <p className="font-body text-sm font-light text-muted">
              The seats that are open, who is against them, and what the people who met them
              actually thought.
            </p>
          </div>
          {rights.see ? (
            <Link
              href="/hr/questions"
              className="rounded-lg border border-line px-4 py-2 font-body text-sm font-bold text-white hover:bg-hover"
            >
              Question bank
            </Link>
          ) : null}
        </div>

        {myRounds.length > 0 ? (
          <section className="mb-10">
            <h2 className="mb-1 font-heading text-2xl text-white">Your interviews</h2>
            <p className="mb-3 font-body text-sm font-light text-muted">
              {owedByMe > 0
                ? `You owe ${owedByMe} write-up${owedByMe === 1 ? "" : "s"}. Write yours before you hear what anybody else thought.`
                : "Interviews you are sitting in. Write yours up after the conversation, before you hear what anybody else thought."}
            </p>
            <RoundsList rounds={myRounds} viewerId={user.id} canView={rights.see} />
          </section>
        ) : null}

        {rights.see ? (
          <Board user={user} rights={rights} showStopped={searchParams.all === "1"} />
        ) : (
          <NotHr hasRounds={myRounds.length > 0} />
        )}
      </div>
    );
  } catch (error) {
    if (hiringNotInstalled(error)) return <NotInstalled />;
    throw error;
  }
}

async function Board({
  user,
  rights,
  showStopped,
}: {
  user: SessionUser;
  rights: HiringRights;
  showStopped: boolean;
}) {
  const [roles, candidates, upcoming, stages, departments] = await Promise.all([
    listOpenRoles(user),
    listCandidates(user, { includeClosed: showStopped }),
    listInterviews(user, { upcomingOnly: true }),
    listStages(),
    getDepartments(),
  ]);

  const seatsOpen = roles.filter((r) => r.status === "open");
  const toFill = seatsToFill(roles);
  const moving = candidates.filter((c) => c.status === "active" || c.status === "offered");
  const owed = moving.reduce((n, c) => n + c.feedbackOutstanding, 0);

  return (
    <>
      <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <MetricCard
          label="Seats open"
          value={String(seatsOpen.length)}
          sub={`${toFill} ${toFill === 1 ? "place" : "places"} to fill`}
        />
        <MetricCard label="People moving" value={String(moving.length)} />
        <MetricCard label="Interviews ahead" value={String(upcoming.length)} sub="scheduled" />
        <MetricCard
          label="Write-ups owed"
          value={String(owed)}
          sub={owed === 0 ? "nothing outstanding" : "interviews held, nothing written"}
        />
      </div>

      <HiringBoard
        roles={roles}
        candidates={candidates}
        upcoming={upcoming}
        stages={stages}
        departments={departments
          .filter((d) => !NOT_A_TEAM.has(d.code))
          .map((d) => ({ id: d.id, name: d.name }))}
        rights={rights}
        viewer={{ id: user.id, name: user.name }}
        showStopped={showStopped}
      />
    </>
  );
}

function NotHr({ hasRounds }: { hasRounds: boolean }) {
  return (
    <div className="rounded-lg border border-line bg-card px-6 py-16 text-center">
      <p className="font-heading text-2xl text-white">
        {hasRounds ? "That is everything you can see" : "Restricted"}
      </p>
      <p className="mx-auto mt-1 max-w-lg font-body text-sm font-light text-muted">
        {hasRounds
          ? "The interviews above are the ones you are sitting in. The hiring board itself — every seat, every candidate and what they are asking for — is HR's and the founders'."
          : "Candidate data is available to HR and the founders. If you are meant to be interviewing somebody, ask HR to put you on the panel — the interview will appear here and you will be notified."}
      </p>
    </div>
  );
}
