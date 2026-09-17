import Link from "next/link";
import { NotInstalled } from "@/components/hiring/NotInstalled";
import { QuestionBank } from "@/components/hiring/QuestionBank";
import { getCurrentUser } from "@/lib/auth/session";
import {
  hiringNotInstalled,
  hiringRights,
  listOpenRoles,
  listQuestionSets,
  listStages,
} from "@/lib/services/hiring";

export const dynamic = "force-dynamic";

/**
 * The question bank (Brief §32). The same questions, asked of everybody
 * against a seat, so two candidates can be compared on something other than
 * who each interviewer happened to warm to.
 */
export default async function QuestionsPage() {
  const user = await getCurrentUser();

  try {
    const rights = await hiringRights(user);
    if (!rights.see) {
      return (
        <div className="rounded-lg border border-line bg-card px-6 py-16 text-center">
          <p className="font-heading text-2xl text-white">Restricted</p>
          <p className="mx-auto mt-1 max-w-lg font-body text-sm font-light text-muted">
            The question bank is HR&apos;s. The questions for an interview you are sitting in
            appear on the interview itself.
          </p>
        </div>
      );
    }

    const [sets, stages, roles] = await Promise.all([
      listQuestionSets(user),
      listStages(),
      listOpenRoles(user),
    ]);

    return (
      <div>
        <Link href="/hr" className="font-body text-sm text-muted underline-offset-4 hover:text-white hover:underline">
          ← Hiring
        </Link>
        <div className="mb-6 mt-4">
          <h1 className="mb-1 font-heading text-4xl text-white">Question bank</h1>
          <p className="font-body text-sm font-light text-muted">
            A set belongs to an interview, or a seat, or both. When an interview is scheduled
            the most specific set is chosen for it, so nobody has to remember.
          </p>
        </div>
        <QuestionBank
          sets={sets}
          stages={stages}
          roles={roles.map((r) => ({ id: r.id, title: r.title }))}
          canAdd={rights.add}
        />
      </div>
    );
  } catch (error) {
    if (hiringNotInstalled(error)) return <NotInstalled />;
    throw error;
  }
}
