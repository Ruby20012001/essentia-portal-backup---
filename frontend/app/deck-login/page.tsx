import { LoginStage } from "@/components/auth/LoginStage";

export const dynamic = "force-dynamic";

/**
 * The design team's way in.
 *
 * A second door, not a second lock. Monica asked for the two sides kept apart
 * — the WIO team on the tracker, the design team on the decks (10 Sep 2026) —
 * and a designer handed the tracker's sign-in page has to be told, every time,
 * that it is also hers. So this page says decks on it and lands on /decks.
 *
 * Underneath it is the same account, the same password and the same session as
 * /login. Nothing is duplicated: a second set of credentials would be a second
 * thing to reset, to forget, and to leak. What each account may then open is
 * decided where it should be — by the page it opens, against its own list.
 */
export default function DeckLoginPage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  return (
    <LoginStage
      entraConfigured={Boolean(process.env.ENTRA_TENANT_ID)}
      devLogin={process.env.AUTH_ALLOW_DEV_LOGIN === "true"}
      next="/decks"
      error={searchParams.error}
      eyebrow="concept decks"
      caption="Sign in with your essentia email"
    />
  );
}
