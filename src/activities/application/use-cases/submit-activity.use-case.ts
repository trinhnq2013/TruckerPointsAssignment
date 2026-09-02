import { Inject, Injectable } from '@nestjs/common';
import { Activity } from '../../domain/activity';
import {
  ACTIVITY_REPOSITORY,
  type ActivityRepository,
  type SaveResult,
} from '../ports/activity-repository.port';

export interface SubmitActivityCommand {
  providerId: string;
  externalEventId: string;
  driverId: string;
  activityType: string;
  occurredAt: Date;
}

@Injectable()
export class SubmitActivityUseCase {
  constructor(
    @Inject(ACTIVITY_REPOSITORY) private readonly activities: ActivityRepository,
  ) {}

  async execute(command: SubmitActivityCommand): Promise<SaveResult> {
    // Throws UnsupportedActivityTypeError before the repository is touched, so a payload
    // naming an unknown type persists nothing.
    const activity = Activity.record(command);

    // Deliberately no read-before-write. Checking for an existing row here would let two
    // concurrent requests both pass the check; instead the unique index arbitrates and
    // the adapter turns the losing insert into a replay. One code path, no race.
    return this.activities.save(activity);
  }
}
