import { UnsupportedActivityTypeError } from '../../domain/activity.errors';
import type { ActivityType } from '../../domain/activity-type';
import { InMemoryActivityRepository } from '../ports/in-memory-activity.repository.fake';
import { SubmitActivityUseCase } from './submit-activity.use-case';

describe('SubmitActivityUseCase', () => {
  let repository: InMemoryActivityRepository;
  let useCase: SubmitActivityUseCase;

  beforeEach(() => {
    repository = new InMemoryActivityRepository();
    useCase = new SubmitActivityUseCase(repository);
  });

  const command = (overrides: Partial<Parameters<SubmitActivityUseCase['execute']>[0]> = {}) => ({
    providerId: 'lkw-walter',
    externalEventId: 'evt-12345',
    driverId: 'driver-1001',
    activityType: 'POD_UPLOAD',
    occurredAt: new Date('2026-08-20T14:30:00Z'),
    ...overrides,
  });

  describe('point calculation', () => {
    it.each<[ActivityType, number]>([
      ['POD_UPLOAD', 50],
      ['GPS_TRACKING', 20],
      ['PICKUP_CONFIRMED', 10],
      ['DELIVERY_CONFIRMED', 30],
    ])('awards %i points for %s', async (activityType, expectedPoints) => {
      const { activity } = await useCase.execute(command({ activityType }));

      expect(activity.pointsAwarded).toBe(expectedPoints);
      expect(activity.activityType).toBe(activityType);
    });
  });

  describe('duplicate events', () => {
    it('awards points only once when the same provider event is submitted twice', async () => {
      const first = await useCase.execute(command());
      const second = await useCase.execute(command());

      expect(first.created).toBe(true);
      expect(second.created).toBe(false);
      expect(second.activity.id).toBe(first.activity.id);
      expect(second.activity.pointsAwarded).toBe(50);
      expect(repository.count).toBe(1);
    });

    it('does not raise a second outbox event on a replay', async () => {
      await useCase.execute(command());
      await useCase.execute(command());

      // A duplicate event would double-award points downstream in Gamification.
      expect(repository.publishedEvents).toHaveLength(1);
    });
  });

  describe('unsupported activity types', () => {
    it('rejects an unknown activity type', async () => {
      await expect(useCase.execute(command({ activityType: 'UNKNOWN_ACTIVITY' }))).rejects.toThrow(
        UnsupportedActivityTypeError,
      );
    });

    it('persists nothing when the activity type is unsupported', async () => {
      await expect(
        useCase.execute(command({ activityType: 'UNKNOWN_ACTIVITY' })),
      ).rejects.toThrow();

      expect(repository.count).toBe(0);
      expect(repository.publishedEvents).toHaveLength(0);
    });
  });

  describe('provider isolation', () => {
    it('treats the same external event id from two providers as two activities', async () => {
      const walter = await useCase.execute(command({ providerId: 'lkw-walter' }));
      const sennder = await useCase.execute(command({ providerId: 'sennder' }));

      expect(walter.created).toBe(true);
      expect(sennder.created).toBe(true);
      expect(sennder.activity.id).not.toBe(walter.activity.id);
      expect(repository.count).toBe(2);
    });
  });

  it('records the event payload Gamification needs', async () => {
    const { activity } = await useCase.execute(command());

    expect(repository.publishedEvents[0].toPayload()).toEqual({
      activityId: activity.id,
      providerId: 'lkw-walter',
      driverId: 'driver-1001',
      activityType: 'POD_UPLOAD',
      pointsAwarded: 50,
    });
  });
});
