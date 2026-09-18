import { Module, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_PIPE } from '@nestjs/core';
import { ActivitiesModule } from './activities/activities.module';
import { HealthController } from './health.controller';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), ActivitiesModule],
  controllers: [HealthController],
  providers: [
    {
      // Registered here rather than in main.ts so the e2e suite exercises exactly the
      // validation the running service uses. Malformed payloads are rejected with a 400
      // before any use case sees them.
      provide: APP_PIPE,
      useValue: new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    },
  ],
})
export class AppModule {}
