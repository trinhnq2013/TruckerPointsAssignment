import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

/**
 * Liveness only — deliberately not a readiness check.
 *
 * It answers "is this process up and serving HTTP", which is what the container
 * healthcheck and a restart policy act on. A readiness probe that also pings the database
 * would need `PrismaService` exported across a module boundary, which is more coupling
 * than this endpoint is worth here.
 */
@ApiTags('health')
@Controller('health')
export class HealthController {
  @Get()
  @ApiOperation({ summary: 'Liveness probe used by the container healthcheck' })
  @ApiResponse({ status: 200, description: 'The process is serving HTTP' })
  check(): { status: string } {
    return { status: 'ok' };
  }
}
