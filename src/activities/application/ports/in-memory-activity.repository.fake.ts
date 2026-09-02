import type { ActivityRecorded } from '../../domain/activity-recorded.event';
import type { Activity } from '../../domain/activity';
import type { ActivityRepository, SaveResult } from './activity-repository.port';

/**
 * Test double bound through the same `ACTIVITY_REPOSITORY` token as the Prisma adapter.
 *
 * It models the replay contract rather than merely storing rows: a duplicate key returns
 * the existing activity with `created: false` and emits no event, exactly as the real
 * adapter does after a P2002. A fake that returned `created: true` for a duplicate would
 * let the duplicate tests pass for the wrong reason.
 */
export class InMemoryActivityRepository implements ActivityRepository {
  private readonly rows = new Map<string, Activity>();

  /** Everything that would have been written to `outbox_events`. */
  readonly publishedEvents: ActivityRecorded[] = [];

  findByProviderAndExternalEventId(
    providerId: string,
    externalEventId: string,
  ): Promise<Activity | null> {
    return Promise.resolve(this.rows.get(keyOf(providerId, externalEventId)) ?? null);
  }

  save(activity: Activity): Promise<SaveResult> {
    const key = keyOf(activity.providerId, activity.externalEventId);
    const existing = this.rows.get(key);

    if (existing !== undefined) {
      return Promise.resolve({ created: false, activity: existing });
    }

    this.rows.set(key, activity);
    this.publishedEvents.push(...activity.pullEvents());

    return Promise.resolve({ created: true, activity });
  }

  get count(): number {
    return this.rows.size;
  }
}

function keyOf(providerId: string, externalEventId: string): string {
  return `${providerId}:${externalEventId}`;
}
