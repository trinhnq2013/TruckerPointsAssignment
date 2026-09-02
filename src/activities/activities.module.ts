import { Module } from '@nestjs/common';
import { ActivitiesController } from './adapters/http/activities.controller';
import { ACTIVITY_REPOSITORY } from './application/ports/activity-repository.port';
import { GetActivityUseCase } from './application/use-cases/get-activity.use-case';
import { SubmitActivityUseCase } from './application/use-cases/submit-activity.use-case';
import { PrismaActivityRepository } from './infrastructure/persistence/prisma-activity.repository';
import { PrismaService } from './infrastructure/persistence/prisma.service';

@Module({
  controllers: [ActivitiesController],
  providers: [
    SubmitActivityUseCase,
    GetActivityUseCase,
    PrismaService,
    // The one line that binds the port to an implementation. Tests swap in an in-memory
    // fake through the same token, which is what makes the port worth having.
    { provide: ACTIVITY_REPOSITORY, useClass: PrismaActivityRepository },
  ],
})
export class ActivitiesModule {}
