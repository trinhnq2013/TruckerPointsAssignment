/**
 * The points table. Hardcoded, as the assignment permits.
 *
 * A `const` record plus a derived union keeps "which types exist" and "what each is
 * worth" in one place, so adding a type is a one-line change the compiler checks.
 * Deliberately not a rules engine, a strategy registry, or configuration.
 */
export const ACTIVITY_POINTS = {
  POD_UPLOAD: 50,
  GPS_TRACKING: 20,
  PICKUP_CONFIRMED: 10,
  DELIVERY_CONFIRMED: 30,
} as const;

export type ActivityType = keyof typeof ACTIVITY_POINTS;

/**
 * `hasOwnProperty` rather than `in`, so inherited names like `toString` or `constructor`
 * are not mistaken for supported activity types.
 */
export function isSupportedActivityType(value: string): value is ActivityType {
  return Object.prototype.hasOwnProperty.call(ACTIVITY_POINTS, value);
}

export function pointsFor(activityType: ActivityType): number {
  return ACTIVITY_POINTS[activityType];
}
