import Link from "next/link";
import { MetricCard } from "@/components/dashboard/MetricCard";
import { HiringBoard } from "@/components/hiring/HiringBoard";
import { RoundsList } from "@/components/hiring/RoundsList";
import { getCurrentUser, type SessionUser } from "@/lib/auth/session";
import { getDepartments } from "@/lib/services/departments";
import {
  hiringRights,
  listCandidates,
  listInterviews,
  listMyRounds,
  listOpenRoles,
  listStages,
  type HiringRights,
} from "@/lib/services/hiring";

export const dynamic = "force-dynamic";

/**
 * S11 · Hiring (Brief §32, §36). Open seats, the people against them, the
 * rounds in the diary, and what each interviewer thought.
 *
 * The page has two audiences and shows a different thing to each. HR gets the
 * board. Everybody else gets the rounds they are personally sitting in — which
 * is why a drafting HOD who is on a panel lands on something useful here
 * rather than on the word "Restricted".
 */
export default async function HrPage() {
  const user = await getCurrentUser();
  const [rights, myRounds] = await Promise.all([
    hiringRights(user),
    listMyRounds(user),
  ]);

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="mb-1 font-heading text-4xl text-white">Hiring</h1>
          <p className="font-body text-sm font-light text-muted">
            The seats that are open, who is against them, and what the people
            who met them actually thought.
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
          <h2 className="mb-1 font-heading text-2xl text-white">Your rounds</h2>
          <p className="mb-3 font-body text-sm font-light text-muted">
            Conversations you are sitting in. Write yours up before you hear
            what anybody else thought.
          </p>
          <RoundsList rounds={myRounds} viewerId={user.id} />
        </section>
      ) : null}

      {rights.see ? (
        <Board user={user} rights={rights} />
      ) : (
        <NotHr hasRounds={myRounds.length > 0} />
      )}
    </div>
  );
}

async function Board({
  user,
  rights,
}: {
  user: SessionUser;
  rights: HiringRights;
}) {
  const [roles, candidates, upcoming, stages, departments] = await Promise.all([
    listOpenRoles(user),
    listCandidates(user, {}),
    listInterviews(user, { upcomingOnly: true }),
    listStages(),
    getDepartments(),
  ]);

  const seatsOpen = roles.filter((r) => r.status === "open");
  const headcount = seatsOpen.reduce((n, r) => n + r.headcount, 0);
  const owed = candidates.reduce((n, c) => n + c.feedbackOutstanding, 0);

  return (
    <>
      <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <MetricCard label="Seats open" value={String(seatsOpen.length)} sub={`${headcount} to fill`} />
        <MetricCard label="People moving" value={String(candidates.length)} />
        <MetricCard label="Rounds ahead" value={String(upcoming.length)} sub="scheduled" />
        <MetricCard
          label="Feedback owed"
          value={String(owed)}
          sub={owed === 0 ? "nothing outstanding" : "rounds held, nothing written"}
        />
      </div>

      <HiringBoard
        roles={roles}
        candidates={candidates}
        upcoming={upcoming}
        stages={stages}
        departments={departments.map((d) => ({ id: d.id, name: d.name }))}
        rights={rights}
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
          ? "The rounds above are the ones you are sitting in. The hiring board itself — every seat, every candidate and what they are asking for — is HR's and the founders'."
          : "Candidate data is available to HR and the founders. If you are meant to be interviewing somebody, ask HR to put you on the panel and the round will appear here."}
      </p>
    </div>
  );
}
