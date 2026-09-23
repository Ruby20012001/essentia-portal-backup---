import Link from "next/link";
import { BoardPulse } from "@/components/hiring/BoardPulse";
import { HiringBoard } from "@/components/hiring/HiringBoard";
import { RepliesList } from "@/components/hiring/RepliesList";
import { RoundsList } from "@/components/hiring/RoundsList";
import { listReplies } from "@/lib/services/candidate-portal";
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
          <div className="flex flex-wrap gap-2">
            <Link
              href="/hr/contact"
              className="rounded-lg border border-line px-4 py-2 font-body text-sm font-bold text-white hover:bg-hover"
            >
              Reach them
            </Link>
            <Link
              href="/hr/questions"
              className="rounded-lg border border-line px-4 py-2 font-body text-sm font-bold text-white hover:bg-hover"
            >
              Question bank
            </Link>
          </div>
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
  /* `allRounds` is the same listInterviews with its filter left off, which
     answers past rounds too — that is the only way to say how long a write-up
     has been outstanding, and it needs no new read model to do it. */
  const [roles, candidates, upcoming, allRounds, stages, departments, replies] =
    await Promise.all([
      listOpenRoles(user),
      listCandidates(user, {}),
      listInterviews(user, { upcomingOnly: true }),
      listInterviews(user, {}),
      listStages(),
      getDepartments(),
      listReplies(user),
    ]);

  const seatsOpen = roles.filter((r) => r.status === "open");
  const headcount = seatsOpen.reduce((n, r) => n + r.headcount, 0);
  const owedCount = candidates.reduce((n, c) => n + c.feedbackOutstanding, 0);

  const now = Date.now();
  const weekOut = now + 7 * 24 * 60 * 60 * 1000;
  const roundsThisWeek = upcoming.filter(
    (i) => new Date(i.scheduledAt).getTime() <= weekOut,
  ).length;

  /* Stage counts come from the candidates already fetched. Stages are rows in
     hr.interview_stages, so the shape of this follows the data rather than a
     list written here. */
  const byStage = stages.map((s) => ({
    code: s.code,
    label: s.label,
    count: candidates.filter((c) => c.stage === s.code).length,
  }));

  /* A round that has been sat in and not fully written up. Oldest first,
     because the one that has been waiting longest is the one holding somebody
     still. */
  const waiting = allRounds
    .filter((i) => {
      const held = new Date(i.scheduledAt).getTime() < now;
      return held && i.status !== "cancelled" && i.scorecardsIn < i.panel.length;
    })
    .map((i) => ({
      interviewId: i.id,
      candidateId: i.candidateId,
      candidateName: i.candidateName,
      stageLabel: i.stageLabel,
      written: i.scorecardsIn,
      panelSize: i.panel.length,
      daysWaiting: Math.max(
        0,
        Math.floor((now - new Date(i.scheduledAt).getTime()) / 86_400_000),
      ),
    }))
    .sort((a, b) => b.daysWaiting - a.daysWaiting);

  return (
    <>
      <BoardPulse
        seatsOpen={seatsOpen.length}
        headcount={headcount}
        peopleMoving={candidates.length}
        roundsThisWeek={roundsThisWeek}
        roundsAhead={upcoming.length}
        feedbackOwed={owedCount}
        stages={byStage}
        owed={waiting}
        canOpenSeat={rights.add}
      />

      {/* Above the board. A candidate who cannot make Thursday is the most
          time-sensitive thing on this screen — the room is booked and three
          people have it in their diary. */}
      <RepliesList replies={replies} />

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
