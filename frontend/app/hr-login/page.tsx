import { LoginStage } from "@/components/auth/LoginStage";

export const dynamic = "force-dynamic";

/**
 * HR's way in.
 *
 * A second door, not a second lock — the same rule `/deck-login` set for the
 * design team. Underneath this page is the same account, the same password
 * and the same session as `/login`. Nothing is duplicated: a second set of
 * credentials would be a second thing to reset, to forget, and to leak.
 *
 * What it buys is that somebody whose whole job here is hiring is not handed
 * a sign-in page belonging to the WIO tracker and left to work out that it is
 * also theirs. This one says hiring on it and lands on the board.
 *
 * What may then be opened is still decided where it should be — by `/hr`
 * itself, against `hr_access`. Signing in here grants nothing; an account
 * outside HR that arrives at this page lands on the board and is told the
 * same "Restricted" it would be told anywhere else.
 */
/* Where signing in returns to. The board, the question bank, or one candidate
   or round by id — and nothing else, because a sign-in page that follows
   whatever ?next= says is a page that can send people somewhere else. */
function hrReturn(next: string | undefined): string {
  if (next === "/hr" || next === "/hr/questions") return next;
  if (next && /^\/hr\/(candidates|rounds)\/[0-9a-fA-F-]{36}$/.test(next)) {
    return next;
  }
  return "/hr";
}

export default function HrLoginPage({
  searchParams,
}: {
  searchParams: { error?: string; next?: string; email?: string };
}) {
  return (
    <LoginStage
      entraConfigured={Boolean(process.env.ENTRA_TENANT_ID)}
      devLogin={process.env.AUTH_ALLOW_DEV_LOGIN === "true"}
      next={hrReturn(searchParams.next)}
      error={searchParams.error}
      /* Filled in for somebody who arrived from /hr-team, where they picked
         their name. It saves them their own address and nothing else — the
         password is still theirs to type, which is the whole difference
         between this door and the design team's. Candidate data is fenced at
         L2/L3 by db/049 on purpose, and a page that signed you in by name
         would walk straight through that. */
      email={searchParams.email}
      eyebrow="hiring"
      caption="Sign in with your essentia email"
    />
  );
}
