import { ApiProperty } from '@nestjs/swagger';
import { IsISO8601, IsNotEmpty, IsString } from 'class-validator';

export class SubmitActivityDto {
  @ApiProperty({ example: 'evt-12345', description: 'Unique per provider, used for idempotency' })
  @IsString()
  @IsNotEmpty()
  externalEventId!: string;

  @ApiProperty({ example: 'driver-1001' })
  @IsString()
  @IsNotEmpty()
  driverId!: string;

  /**
   * Validated as a plain string, deliberately not `@IsEnum`. An unsupported type is a
   * domain rejection (422), not malformed input (400); `@IsEnum` would collapse the two.
   */
  @ApiProperty({ example: 'POD_UPLOAD' })
  @IsString()
  @IsNotEmpty()
  activityType!: string;

  @ApiProperty({ example: '2026-08-20T14:30:00Z' })
  @IsISO8601()
  occurredAt!: string;
}
