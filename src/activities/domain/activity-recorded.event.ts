import type { ActivityType } from './activity-type';

/**
 * Raised when an activity is first recorded. The persistence adapter drains it and writes
 * it to `outbox_events` inside the same transaction as the activity row.
 *
 * `activityId` is not in the assignment's example payload but is included on purpose:
 * outbox delivery is at-least-once, so Gamification needs a stable key to dedupe on.
 */
export class ActivityRecorded {
  readonly eventType = 'ActivityRecorded';

  constructor(
    readonly activityId: string,
    readonly providerId: string,
    readonly driverId: string,
    readonly activityType: ActivityType,
    readonly pointsAwarded: number,
  ) {}

  toPayload(): Record<string, string | number> {
    return {
      activityId: this.activityId,
      providerId: this.providerId,
      driverId: this.driverId,
      activityType: this.activityType,
      pointsAwarded: this.pointsAwarded,
    };
  }
}
