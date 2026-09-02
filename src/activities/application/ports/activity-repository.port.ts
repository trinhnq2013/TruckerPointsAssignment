import type { Activity } from '../../domain/activity';

/**
 * A TypeScript interface does not exist at runtime, so it cannot be a DI token. The
 * symbol lives next to the port it names so the two cannot drift apart.
 */
export const ACTIVITY_REPOSITORY = Symbol('ACTIVITY_REPOSITORY');

/**
 * Tells a first write apart from an idempotent replay without leaking the reason upward.
 * The use case never learns that Prisma, Postgres, or a unique-constraint violation exist.
 */
export interface SaveResult {
  created: boolean;
  activity: Activity;
}

export interface ActivityRepository {
  /**
   * Reads are always scoped by provider. There is deliberately no `findById(id)`: the
   * assignment has no use for one, and adding it would invite a lookup that bypasses
   * provider scoping.
   */
  findByProviderAndExternalEventId(
    providerId: string,
    externalEventId: string,
  ): Promise<Activity | null>;

  /**
   * Persists the activity and its pending events atomically, or — when the same
   * `(providerId, externalEventId)` already exists — returns the winning row unchanged.
   */
  save(activity: Activity): Promise<SaveResult>;
}
