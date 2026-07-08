import { query } from "@/lib/db";
import { dispatchEvent } from "@/lib/notifications/engine/dispatch";
import type { DomainEventInput, StoredEvent } from "@/lib/notifications/events/types";

/**
 * The event bus. publishEvent persists an immutable domain event, then hands
 * it to the notification engine for fan-out. Publishing is decoupled from
 * delivery: a module states that something happened; the engine decides who
 * hears about it and how.
 *
 * Dedup: an event carrying a dedupeKey that already exists is skipped and the
 * existing event returned (centralises "don't alert twice").
 */
export async function publishEvent(
  input: DomainEventInput,
): Promise<{ event: StoredEvent; deduped: boolean }> {
  const [row] = await query<{
    id: string;
    created_at: string;
    inserted: boolean;
  }>(
    `INSERT INTO portal.events
       (event_type, category, entity_type, entity_id, entity_ref, actor_id,
        department_id, priority, payload, correlation_id, dedupe_key)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11)
     ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING
     RETURNING id, created_at::TEXT, TRUE AS inserted`,
    [
      input.type,
      input.category,
      input.entityType ?? null,
      input.entityId ?? null,
      input.entityRef ?? null,
      input.actorId ?? null,
      input.departmentId ?? null,
      input.priority ?? "informational",
      JSON.stringify(input.payload ?? {}),
      input.correlationId ?? null,
      input.dedupeKey ?? null,
    ],
  );

  if (!row) {
    // Deduped — return the pre-existing event, do not re-dispatch.
    const [existing] = await query<{ id: string; created_at: string }>(
      `SELECT id, created_at::TEXT FROM portal.events WHERE dedupe_key = $1`,
      [input.dedupeKey],
    );
    return {
      event: { ...input, id: existing.id, createdAt: existing.created_at },
      deduped: true,
    };
  }

  const event: StoredEvent = { ...input, id: row.id, createdAt: row.created_at };
  // Fan-out is best-effort at publish time; the dispatch job retries any
  // deliveries that could not complete. A dispatch failure never fails the
  // business action that published the event.
  try {
    await dispatchEvent(event);
  } catch (error) {
    console.error("event dispatch failed at publish:", input.type, error);
  }
  return { event, deduped: false };
}
