/**
 * Notification framework public surface. Modules import { publishEvent }
 * from here and nothing else — they never touch channels, templates, or the
 * inbox directly.
 */
export { publishEvent } from "@/lib/notifications/events/bus";
export { processDueDeliveries } from "@/lib/notifications/engine/dispatch";
export type { DomainEventInput, EventCategory } from "@/lib/notifications/events/types";
