import { NotificationsInbox } from "@/components/notifications/NotificationsInbox";

export const dynamic = "force-dynamic";

/**
 * S23 · Notifications Center (screen 9). The full-page inbox for the signed-in
 * user's own notifications — triage by status/category, search, and act
 * (read / acknowledge / archive / open). Personal by definition (the store is
 * scoped to recipient_id in the service), so no leadership gate; the (portal)
 * layout already requires an authenticated session.
 */
export default function NotificationsPage() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="mb-1 font-heading text-4xl text-white">Notifications</h1>
        <p className="font-body text-sm font-light text-muted">
          Everything the portal has sent you — approvals awaiting you, SLA alerts, delegations and
          system notices. Read, acknowledge or archive.
        </p>
      </div>
      <NotificationsInbox />
    </div>
  );
}
