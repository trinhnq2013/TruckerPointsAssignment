import { Activity } from '../../domain/activity';
import { ActivityNotFoundError } from '../../domain/activity.errors';
import { InMemoryActivityRepository } from '../ports/in-memory-activity.repository.fake';
import { GetActivityUseCase } from './get-activity.use-case';

describe('GetActivityUseCase', () => {
  let repository: InMemoryActivityRepository;
  let useCase: GetActivityUseCase;

  beforeEach(async () => {
    repository = new InMemoryActivityRepository();
    useCase = new GetActivityUseCase(repository);

    await repository.save(
      Activity.record({
        providerId: 'lkw-walter',
        externalEventId: 'evt-100',
        driverId: 'driver-1001',
        activityType: 'POD_UPLOAD',
        occurredAt: new Date('2026-08-20T14:30:00Z'),
      }),
    );
  });

  it('returns the activity to the provider that owns it', async () => {
    const activity = await useCase.execute('lkw-walter', 'evt-100');

    expect(activity.externalEventId).toBe('evt-100');
    expect(activity.pointsAwarded).toBe(50);
  });

  it('rejects an event id that does not exist', async () => {
    await expect(useCase.execute('lkw-walter', 'evt-does-not-exist')).rejects.toThrow(
      ActivityNotFoundError,
    );
  });

  it("hides an event that belongs to another provider", async () => {
    // sennder must not observe lkw-walter's evt-100, even though the id is identical.
    await expect(useCase.execute('sennder', 'evt-100')).rejects.toThrow(ActivityNotFoundError);
  });
});
