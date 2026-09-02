import {
  Body,
  Controller,
  Get,
  HttpStatus,
  Param,
  Post,
  Res,
  UseFilters,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { GetActivityUseCase } from '../../application/use-cases/get-activity.use-case';
import { SubmitActivityUseCase } from '../../application/use-cases/submit-activity.use-case';
import { DomainErrorFilter } from './domain-error.filter';
import { ActivityResponseDto } from './dto/activity-response.dto';
import { SubmitActivityDto } from './dto/submit-activity.dto';

@ApiTags('activities')
@UseFilters(DomainErrorFilter)
@Controller('providers/:providerId/activities')
export class ActivitiesController {
  constructor(
    private readonly submitActivity: SubmitActivityUseCase,
    private readonly getActivity: GetActivityUseCase,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Submit an activity. Idempotent per (providerId, externalEventId).' })
  @ApiParam({ name: 'providerId', example: 'lkw-walter' })
  @ApiResponse({ status: 201, description: 'Recorded for the first time', type: ActivityResponseDto })
  @ApiResponse({ status: 200, description: 'Already processed — replayed, points awarded once', type: ActivityResponseDto })
  @ApiResponse({ status: 400, description: 'Missing or malformed fields' })
  @ApiResponse({ status: 422, description: 'Unsupported activityType' })
  async submit(
    @Param('providerId') providerId: string,
    @Body() dto: SubmitActivityDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<ActivityResponseDto> {
    const { created, activity } = await this.submitActivity.execute({
      // Always from the route, never the body: a body-supplied provider would let a
      // caller write into another provider's namespace.
      providerId,
      externalEventId: dto.externalEventId,
      driverId: dto.driverId,
      activityType: dto.activityType,
      occurredAt: new Date(dto.occurredAt),
    });

    // 201 only when a row was actually created. A replay created nothing, and answering
    // 201 twice would misreport that it had.
    response.status(created ? HttpStatus.CREATED : HttpStatus.OK);

    return ActivityResponseDto.from(activity);
  }

  @Get(':externalEventId')
  @ApiOperation({ summary: "Read one of this provider's activities" })
  @ApiParam({ name: 'providerId', example: 'lkw-walter' })
  @ApiParam({ name: 'externalEventId', example: 'evt-12345' })
  @ApiResponse({ status: 200, type: ActivityResponseDto })
  @ApiResponse({ status: 404, description: 'Unknown event, or owned by another provider' })
  async findOne(
    @Param('providerId') providerId: string,
    @Param('externalEventId') externalEventId: string,
  ): Promise<ActivityResponseDto> {
    const activity = await this.getActivity.execute(providerId, externalEventId);

    return ActivityResponseDto.from(activity);
  }
}
