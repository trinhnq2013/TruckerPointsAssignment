import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Server } from 'node:http';
import request from 'supertest';
import { PrismaService } from '../src/activities/infrastructure/persistence/prisma.service';
import { AppModule } from '../src/app.module';

const podUpload = {
  externalEventId: 'evt-12345',
  driverId: 'driver-1001',
  activityType: 'POD_UPLOAD',
  occurredAt: '2026-08-20T14:30:00Z',
};

/** Supertest types `body` as `any`; narrowing it once keeps the assertions type-checked. */
interface ActivityResponseBody {
  activityId: string;
  providerId: string;
  driverId: string;
  activityType: string;
  pointsAwarded: number;
  status: string;
}

const bodyOf = (response: request.Response): ActivityResponseBody =>
  response.body as ActivityResponseBody;

describe('Activities API', () => {
  let app: INestApplication;
  let server: Server;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();

    app = moduleRef.createNestApplication();
    await app.init();

    server = app.getHttpServer() as Server;
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await prisma.$executeRawUnsafe('TRUNCATE TABLE activities, outbox_events');
  });

  afterAll(async () => {
    // Closing the app disconnects Prisma through onModuleDestroy; without it Jest hangs.
    await app.close();
  });

  const post = (providerId: string, body: object) =>
    request(server).post(`/providers/${providerId}/activities`).send(body);

  const get = (providerId: string, externalEventId: string) =>
    request(server).get(`/providers/${providerId}/activities/${externalEventId}`);

  describe('POST /providers/:providerId/activities', () => {
    it('awards 50 points for a POD upload', async () => {
      const response = await post('lkw-walter', podUpload).expect(201);

      expect(bodyOf(response)).toMatchObject({
        providerId: 'lkw-walter',
        driverId: 'driver-1001',
        activityType: 'POD_UPLOAD',
        pointsAwarded: 50,
        status: 'PROCESSED',
      });
      expect(bodyOf(response).activityId).toEqual(expect.any(String));
    });

    it('does not award points twice for the same provider event', async () => {
      const first = await post('lkw-walter', podUpload).expect(201);
      const replay = await post('lkw-walter', podUpload).expect(200);

      expect(bodyOf(replay).activityId).toBe(bodyOf(first).activityId);
      expect(bodyOf(replay).pointsAwarded).toBe(50);
      await expect(prisma.activity.count()).resolves.toBe(1);
    });

    it('treats the same external event id from two providers as two activities', async () => {
      const walter = await post('lkw-walter', podUpload).expect(201);
      const sennder = await post('sennder', podUpload).expect(201);

      expect(bodyOf(sennder).activityId).not.toBe(bodyOf(walter).activityId);
      await expect(prisma.activity.count()).resolves.toBe(2);
    });

    it('rejects an unsupported activity type without persisting anything', async () => {
      await post('lkw-walter', { ...podUpload, activityType: 'UNKNOWN_ACTIVITY' }).expect(422);

      await expect(prisma.activity.count()).resolves.toBe(0);
      await expect(prisma.outboxEvent.count()).resolves.toBe(0);
    });

    it.each([
      ['a missing driverId', { ...podUpload, driverId: undefined }],
      ['a malformed occurredAt', { ...podUpload, occurredAt: 'not-a-date' }],
      ['an empty externalEventId', { ...podUpload, externalEventId: '' }],
    ])('rejects %s with 400 before reaching the use case', async (_label, body) => {
      await post('lkw-walter', body).expect(400);

      await expect(prisma.activity.count()).resolves.toBe(0);
    });
  });

  describe('GET /providers/:providerId/activities/:externalEventId', () => {
    it('returns the activity to the provider that owns it', async () => {
      await post('lkw-walter', { ...podUpload, externalEventId: 'evt-100' }).expect(201);

      const response = await get('lkw-walter', 'evt-100').expect(200);

      expect(bodyOf(response)).toMatchObject({ providerId: 'lkw-walter', pointsAwarded: 50 });
    });

    it("hides another provider's activity behind a 404", async () => {
      await post('sennder', { ...podUpload, externalEventId: 'evt-100' }).expect(201);

      // 404 rather than 403: lkw-walter must not learn that evt-100 exists at all.
      await get('lkw-walter', 'evt-100').expect(404);
    });

    it('returns 404 for an unknown event', async () => {
      await get('lkw-walter', 'evt-does-not-exist').expect(404);
    });
  });

  describe('concurrent duplicates', () => {
    it('writes one activity and one outbox event when two identical requests race', async () => {
      const [a, b] = await Promise.all([
        post('lkw-walter', podUpload),
        post('lkw-walter', podUpload),
      ]);

      // One request created the row, the other replayed it. Which one wins is not
      // deterministic, so assert on the pair rather than on a specific response.
      expect([a.status, b.status].sort()).toEqual([200, 201]);
      expect(bodyOf(a).activityId).toBe(bodyOf(b).activityId);
      expect(bodyOf(a).pointsAwarded).toBe(50);

      await expect(prisma.activity.count()).resolves.toBe(1);

      // The losing transaction rolled back, so it left no outbox row behind. A second one
      // would double-award points downstream in Gamification.
      await expect(prisma.outboxEvent.count()).resolves.toBe(1);
    });
  });

  describe('outbox', () => {
    it('records the event payload Gamification needs, unpublished', async () => {
      const created = await post('lkw-walter', podUpload).expect(201);

      const events = await prisma.outboxEvent.findMany();

      expect(events).toHaveLength(1);
      expect(events[0].eventType).toBe('ActivityRecorded');
      expect(events[0].publishedAt).toBeNull();
      expect(events[0].payload).toEqual({
        activityId: bodyOf(created).activityId,
        providerId: 'lkw-walter',
        driverId: 'driver-1001',
        activityType: 'POD_UPLOAD',
        pointsAwarded: 50,
      });
    });
  });
});
