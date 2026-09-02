import { Inject, Injectable } from '@nestjs/common';
import type { Activity } from '../../domain/activity';
import { ActivityNotFoundError } from '../../domain/activity.errors';
import {
  ACTIVITY_REPOSITORY,
  type ActivityRepository,
} from '../ports/activity-repository.port';

@Injectable()
export class GetActivityUseCase {
  constructor(
    @Inject(ACTIVITY_REPOSITORY) private readonly activities: ActivityRepository,
  ) {}

  async execute(providerId: string, externalEventId: string): Promise<Activity> {
    const activity = await this.activities.findByProviderAndExternalEventId(
      providerId,
      externalEventId,
    );

    if (activity === null) {
      // An event owned by a different provider lands here too, because providerId is part
      // of the lookup rather than a separate authorization check. The HTTP layer maps this
      // to 404 — never 403, which would reveal that the id exists under another provider.
      throw new ActivityNotFoundError(providerId, externalEventId);
    }

    return activity;
  }
}
