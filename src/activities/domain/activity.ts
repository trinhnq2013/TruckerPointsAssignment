import { randomUUID } from 'node:crypto';
import { ActivityRecorded } from './activity-recorded.event';
import { isSupportedActivityType, pointsFor, type ActivityType } from './activity-type';
import { UnsupportedActivityTypeError } from './activity.errors';

export interface RecordActivityInput {
  providerId: string;
  externalEventId: string;
  driverId: string;
  activityType: string;
  occurredAt: Date;
}

export interface PersistedActivityProps {
  id: string;
  providerId: string;
  externalEventId: string;
  driverId: string;
  activityType: ActivityType;
  pointsAwarded: number;
  occurredAt: Date;
  createdAt: Date;
}

/**
 * A rewardable driver activity. Identified to the outside world by
 * `(providerId, externalEventId)` — the same pair the database enforces as unique.
 */
export class Activity {
  private readonly events: ActivityRecorded[] = [];

  private constructor(
    readonly id: string,
    readonly providerId: string,
    readonly externalEventId: string,
    readonly driverId: string,
    readonly activityType: ActivityType,
    readonly pointsAwarded: number,
    readonly occurredAt: Date,
    readonly createdAt: Date,
  ) {}

  /**
   * Records an activity for the first time: rejects unsupported types before anything is
   * persisted, awards the points, and raises the outbox event.
   */
  static record(input: RecordActivityInput): Activity {
    if (!isSupportedActivityType(input.activityType)) {
      throw new UnsupportedActivityTypeError(input.activityType);
    }

    const activity = new Activity(
      randomUUID(),
      input.providerId,
      input.externalEventId,
      input.driverId,
      input.activityType,
      pointsFor(input.activityType),
      input.occurredAt,
      new Date(),
    );

    activity.events.push(
      new ActivityRecorded(
        activity.id,
        activity.providerId,
        activity.driverId,
        activity.activityType,
        activity.pointsAwarded,
      ),
    );

    return activity;
  }

  /**
   * Rebuilds an activity that is already in the database.
   *
   * Points are read back, never recomputed: a persisted row is history, and recomputing
   * would silently rewrite past awards if the points table ever changed. No event is
   * raised either — that already happened when the row was first written.
   */
  static rehydrate(props: PersistedActivityProps): Activity {
    return new Activity(
      props.id,
      props.providerId,
      props.externalEventId,
      props.driverId,
      props.activityType,
      props.pointsAwarded,
      props.occurredAt,
      props.createdAt,
    );
  }

  /** Drains the pending events so the adapter can persist them inside its transaction. */
  pullEvents(): ActivityRecorded[] {
    return this.events.splice(0, this.events.length);
  }
}
