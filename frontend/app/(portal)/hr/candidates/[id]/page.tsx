import Link from "next/link";
import { notFound } from "next/navigation";
import { CandidateFile } from "@/components/hiring/CandidateFile";
import { NotInstalled } from "@/components/hiring/NotInstalled";
import { getCurrentUser } from "@/lib/auth/session";
import { NotFoundError } from "@/lib/services/blocking";
import { PermissionError } from "@/lib/services/permissions";
import { invalidId } from "@/lib/api/params";
import {
  getCandidate,
  hiringNotInstalled,
  hiringRights,
  listQuestionSets,
  listStages,
} from "@/lib/services/hiring";

export const dynamic = "force-dynamic";

/**
 * One candidate: where they are, every interview they have had, what each
 * interviewer thought, earlier applications, and the trail of who did what.
 *
 * HR only. A panel member reaches their own interview at /hr/rounds/[id]
 * and sees the person they are meeting there — not this, which carries every
 * other conversation the company has had about them.
 */
export default async function CandidatePage({ params }: { params: { id: string } }) {
  if (invalidId(params.id)) notFound();
  const user = await getCurrentUser();

  try {
    const rights = await hiringRights(user);
    if (!rights.see) {
      return (
        <Restricted message="A candidate's file is HR's and the founders'. If you are interviewing this person, your interview is on the Hiring screen." />
      );
    }

    const [candidate, stages, questionSets] = await Promise.all([
      getCandidate(user, params.id),
      listStages(),
      listQuestionSets(user),
    ]);
    return (
      <div>
        <Link href="/hr" className="font-body text-sm text-muted underline-offset-4 hover:text-white hover:underline">
          ← Hiring
        </Link>
        <CandidateFile
          candidate={candidate}
          stages={stages}
          questionSets={questionSets}
          rights={rights}
          viewer={{ id: user.id, name: user.name }}
        />
      </div>
    );
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    if (hiringNotInstalled(error)) return <NotInstalled />;
    if (error instanceof PermissionError) return <Restricted message={error.message} />;
    throw error;
  }
}

function Restricted({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-line bg-card px-6 py-16 text-center">
      <p className="font-heading text-2xl text-white">Restricted</p>
      <p className="mx-auto mt-1 max-w-lg font-body text-sm font-light text-muted">{message}</p>
    </div>
  );
}
