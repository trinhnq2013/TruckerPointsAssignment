import { type ArgumentsHost, Catch, type ExceptionFilter, HttpStatus } from '@nestjs/common';
import { STATUS_CODES } from 'node:http';
import type { Response } from 'express';
import {
  ActivityNotFoundError,
  UnsupportedActivityTypeError,
} from '../../domain/activity.errors';

type DomainError = UnsupportedActivityTypeError | ActivityNotFoundError;

/**
 * The single place where domain errors become HTTP status codes. Keeping it here means
 * the domain never imports `HttpException`, and the use cases need no `try/catch`.
 */
@Catch(UnsupportedActivityTypeError, ActivityNotFoundError)
export class DomainErrorFilter implements ExceptionFilter {
  catch(error: DomainError, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();

    const status =
      error instanceof UnsupportedActivityTypeError
        ? // Well-formed payload the domain refuses. Distinct from a 400, which the
          // ValidationPipe already returns for malformed input.
          HttpStatus.UNPROCESSABLE_ENTITY
        : // 404 rather than 403, so a caller cannot learn that the event id exists under
          // a different provider.
          HttpStatus.NOT_FOUND;

    response.status(status).json({
      statusCode: status,
      message: error.message,
      // Mirrors the shape the ValidationPipe returns for a 400, so a client parses one
      // error contract instead of two.
      error: STATUS_CODES[status],
    });
  }
}
