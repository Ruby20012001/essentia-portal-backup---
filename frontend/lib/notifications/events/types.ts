/**
 * Domain event contract (Phase 3). Modules publish these; the notification
 * engine consumes them. No module sends notifications directly.
 */

export type EventCategory =
  | "workflow"
  | "approval"
  | "user"
  | "project"
  | "department"
  | "system"
  | "ai"
  | "integration";

export type EventPriority = "urgent" | "action_required" | "informational";

/** Input to publishEvent — the id/timestamp are assigned by the store. */
export type DomainEventInput = {
  type: string; // e.g. 'wio.created', 'workflow.step_pending'
  category: EventCategory;
  entityType?: string;
  entityId?: string | null;
  entityRef?: string | null;
  actorId?: string | null;
  departmentId?: string | null;
  priority?: EventPriority;
  payload?: Record<string, unknown>;
  correlationId?: string | null;
  /** When set, a second event with the same key is skipped (dedup). */
  dedupeKey?: string | null;
};

export type StoredEvent = DomainEventInput & {
  id: string;
  createdAt: string;
};

export const CHANNELS = ["in_app", "teams", "email", "whatsapp", "sms", "push"] as const;
export type Channel = (typeof CHANNELS)[number];

export type NotificationType =
  | "assignment"
  | "approval_request"
  | "approval_granted"
  | "approval_rejected"
  | "escalation"
  | "reminder"
  | "deadline"
  | "delay"
  | "workflow_completed"
  | "workflow_cancelled"
  | "ai_insight"
  | "system_alert";
