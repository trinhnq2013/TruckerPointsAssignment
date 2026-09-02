/**
 * Domain errors carry meaning, not HTTP status codes. The HTTP adapter decides that the
 * first is a 422 and the second a 404 — the domain must never import `HttpException`.
 */

export class UnsupportedActivityTypeError extends Error {
  constructor(readonly activityType: string) {
    super(`Unsupported activity type: ${activityType}`);
    this.name = 'UnsupportedActivityTypeError';
  }
}

export class ActivityNotFoundError extends Error {
  constructor(
    readonly providerId: string,
    readonly externalEventId: string,
  ) {
    super(`Activity "${externalEventId}" not found for provider "${providerId}"`);
    this.name = 'ActivityNotFoundError';
  }
}
