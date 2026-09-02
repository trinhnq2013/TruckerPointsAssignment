import { Injectable } from '@nestjs/common';
import { Prisma, type Activity as ActivityRow } from '@prisma/client';
import type {
  ActivityRepository,
  SaveResult,
} from '../../application/ports/activity-repository.port';
import { Activity } from '../../domain/activity';
import { isSupportedActivityType } from '../../domain/activity-type';
import { PrismaService } from './prisma.service';

/** Prisma's code for a unique constraint violation. */
const UNIQUE_CONSTRAINT_VIOLATION = 'P2002';

@Injectable()
export class PrismaActivityRepository implements ActivityRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByProviderAndExternalEventId(
    providerId: string,
    externalEventId: string,
  ): Promise<Activity | null> {
    const row = await this.prisma.activity.findUnique({
      where: { providerId_externalEventId: { providerId, externalEventId } },
    });

    return row === null ? null : toDomain(row);
  }

  async save(activity: Activity): Promise<SaveResult> {
    const events = activity.pullEvents();

    try {
      const row = await this.prisma.$transaction(async (tx) => {
        const created = await tx.activity.create({
          data: {
            id: activity.id,
            providerId: activity.providerId,
            externalEventId: activity.externalEventId,
            driverId: activity.driverId,
            activityType: activity.activityType,
            pointsAwarded: activity.pointsAwarded,
            occurredAt: activity.occurredAt,
          },
        });

        // Same transaction as the activity row: either both land or neither does. An
        // inline publish after commit could be lost, and one before commit could announce
        // an activity that never existed.
        await tx.outboxEvent.createMany({
          data: events.map((event) => ({
            eventType: event.eventType,
            payload: event.toPayload(),
          })),
        });

        return created;
      });

      return { created: true, activity: toDomain(row) };
    } catch (error) {
      if (!isUniqueConstraintViolation(error)) {
        throw error;
      }

      // Lost the race. This transaction rolled back, so no orphan outbox row was written
      // and points are not awarded twice. The winner is committed by now; re-read it so
      // the caller gets an identical body, including the same activityId.
      const winner = await this.findByProviderAndExternalEventId(
        activity.providerId,
        activity.externalEventId,
      );

      // A P2002 with nothing to read back would mean the constraint fired for some other
      // reason. Surface it rather than pretending it was a replay.
      if (winner === null) {
        throw error;
      }

      return { created: false, activity: winner };
    }
  }
}

function isUniqueConstraintViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === UNIQUE_CONSTRAINT_VIOLATION
  );
}

function toDomain(row: ActivityRow): Activity {
  // activityType is a String column, so the database cannot enforce the domain's set of
  // types. Fail loudly rather than hand back a half-typed entity.
  if (!isSupportedActivityType(row.activityType)) {
    throw new Error(`Activity ${row.id} has an unknown activityType: ${row.activityType}`);
  }

  return Activity.rehydrate({
    id: row.id,
    providerId: row.providerId,
    externalEventId: row.externalEventId,
    driverId: row.driverId,
    activityType: row.activityType,
    pointsAwarded: row.pointsAwarded,
    occurredAt: row.occurredAt,
    createdAt: row.createdAt,
  });
}
