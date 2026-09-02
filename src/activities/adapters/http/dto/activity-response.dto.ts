import { ApiProperty } from '@nestjs/swagger';
import type { Activity } from '../../../domain/activity';

export class ActivityResponseDto {
  @ApiProperty({ example: '3f1a8c52-9d0e-4a71-b3c4-1e2f5a6b7c8d' })
  readonly activityId: string;

  @ApiProperty({ example: 'lkw-walter' })
  readonly providerId: string;

  @ApiProperty({ example: 'driver-1001' })
  readonly driverId: string;

  @ApiProperty({ example: 'POD_UPLOAD' })
  readonly activityType: string;

  @ApiProperty({ example: 50 })
  readonly pointsAwarded: number;

  /** The contract from the assignment. A response field, not persisted entity state. */
  @ApiProperty({ example: 'PROCESSED', enum: ['PROCESSED'] })
  readonly status = 'PROCESSED';

  private constructor(activity: Activity) {
    this.activityId = activity.id;
    this.providerId = activity.providerId;
    this.driverId = activity.driverId;
    this.activityType = activity.activityType;
    this.pointsAwarded = activity.pointsAwarded;
  }

  static from(activity: Activity): ActivityResponseDto {
    return new ActivityResponseDto(activity);
  }
}
