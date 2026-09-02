# TruckerPoints — Activities Service

A backend service that processes rewardable truck-driver activities submitted by logistics
providers. Points are awarded per activity type, submissions are idempotent per provider, and each
provider can only read its own data.

Requirements 1–7, plus three of the optional bonuses: **outbox**, **Docker**, **OpenAPI/Swagger**.

---

## Setup

```bash
pnpm install
cp .env.example .env
docker compose up -d                 # PostgreSQL 16, plus a truckerpoints_test database
pnpm prisma migrate dev              # apply migrations, generate the client
pnpm start:dev                       # http://localhost:3000 — Swagger at /api
```

```bash
pnpm test        # 13 unit tests, no database needed
pnpm test:e2e    # 12 API tests against Postgres (needs docker compose up)
pnpm lint
pnpm build
```

> If port 5432 is already taken by a local PostgreSQL install, set `POSTGRES_PORT` in `.env` (for
> example `5433`) and point `DATABASE_URL` / `TEST_DATABASE_URL` at it. `docker-compose.yml` reads
> that variable and defaults to 5432.

The e2e suite runs against a separate `truckerpoints_test` database and **refuses to start** if
`TEST_DATABASE_URL` is missing, rather than silently truncating development data.

## API

```
POST /providers/:providerId/activities
  { "externalEventId": "evt-12345", "driverId": "driver-1001",
    "activityType": "POD_UPLOAD", "occurredAt": "2026-08-20T14:30:00Z" }

  201 → { activityId, providerId, driverId, activityType, pointsAwarded: 50, status: "PROCESSED" }
  200 → identical body, when the event was already processed
  400 → missing or malformed fields
  422 → well-formed payload naming an unsupported activityType

GET /providers/:providerId/activities/:externalEventId
  200 → the activity, only if it belongs to :providerId
  404 → unknown event, or an event belonging to a different provider
```

| Activity type | Points |
|---------------|--------|
| `POD_UPLOAD` | 50 |
| `GPS_TRACKING` | 20 |
| `PICKUP_CONFIRMED` | 10 |
| `DELIVERY_CONFIRMED` | 30 |

Hardcoded in the domain, as the assignment permits — a `const` record with a derived union type, so
adding a type is a one-line change the compiler checks.

---

## Architecture

```
src/activities/
  domain/            entity, points table, domain events, domain errors — plain TypeScript
  application/
    ports/           ActivityRepository interface + its DI token
    use-cases/       SubmitActivityUseCase, GetActivityUseCase
  infrastructure/
    persistence/     PrismaService, PrismaActivityRepository
  adapters/http/     controller, DTOs, domain-error filter
```

Dependencies point inward. `domain/` imports nothing but Node builtins — no `@nestjs/*`, no
`@prisma/client`, no DTOs. `application/` imports `@Injectable` and `@Inject` from
`@nestjs/common` and nothing else from the framework; that is the one pragmatic concession that
keeps NestJS DI working without hand-wiring a container.

**The interesting direction is on the driven side.** Control flows outward — use case → port →
Prisma → Postgres — but the *dependency* runs back inward: `PrismaActivityRepository` implements
`ActivityRepository`, and the port has no idea Prisma exists. That inversion is the whole reason the
port is there.

**Why only one port.** An interface with a single production implementation is usually dead weight,
and the brief explicitly penalises unnecessary abstraction. It earns its place here because the unit
tests bind a real in-memory fake through the same `ACTIVITY_REPOSITORY` token — no `jest.mock`, no
stubbed Prisma call shapes. That test seam is the justification, and it is the only abstraction in
the codebase that has one. There is no `BaseRepository<T>`, no mapper interface, no rules engine, no
CQRS bus.

**Where the layers are enforced.** The rule is checkable, not just described:

```bash
grep -rE "@nestjs|@prisma" src/activities/domain/                    # → nothing
grep -rE "@prisma|PrismaService|@Controller" src/activities/application/   # → nothing
grep -rE "@prisma|infrastructure/persistence" src/activities/adapters/     # → nothing
```

**Error mapping** lives in one small `DomainErrorFilter`. The domain throws
`UnsupportedActivityTypeError` and `ActivityNotFoundError` — plain `Error` subclasses that know
nothing about HTTP — and the filter turns them into 422 and 404. No `try/catch` in the use cases.

---

## Idempotency

The key is `(providerId, externalEventId)`, enforced by a database constraint:

```prisma
@@unique([providerId, externalEventId])
```

`lkw-walter + evt-123` and `sennder + evt-123` are two different events, which is why
`externalEventId` is deliberately *not* unique on its own.

**There is no application-level duplicate check.** The obvious flow is wrong:

```ts
const existing = await repo.find(providerId, externalEventId);   // ← both requests see null
if (existing) return existing;
return repo.save(activity);                                       // ← both insert
```

Between the read and the write a second request passes the same check. So the read is simply not
there: the use case always attempts the insert, and the unique index arbitrates.

## Concurrency

When two identical requests arrive simultaneously:

1. Both build an `Activity` in the domain and compute 50 points. Nothing is persisted yet.
2. Both open a transaction and `INSERT` into `activities`.
3. Postgres lets one commit. The second blocks on the unique index, then fails with `23505`, which
   Prisma surfaces as **`P2002`**.
4. The losing transaction **rolls back entirely** — so it leaves no orphan outbox row behind.
5. The adapter catches `P2002`, re-reads by `(providerId, externalEventId)`, and returns the winning
   row as `{ created: false, activity }`.
6. Both callers get the same `activityId` and the same body. One gets 201, the other 200. Points
   are awarded exactly once.

Deliberately absent: no advisory lock, no `SERIALIZABLE` isolation, no application-level mutex.
Postgres already provides exactly the mutual exclusion needed.

`P2002` is caught in the **adapter**, never in the use case — the use case must not know Prisma or
Postgres exist. The port models the outcome as `{ created: boolean; activity: Activity }` instead of
leaking an error code upward. The re-read is not redundant: the winner is committed by then, and the
loser needs its `activityId` to return an identical body.

This is covered by a test, not just described:

> `test/activities.e2e-spec.ts` → *"writes one activity and one outbox event when two identical
> requests race"* — fires two `POST`s with `Promise.all` and asserts one 201, one 200, the same
> `activityId`, exactly one activity row and exactly one outbox row.

## Provider isolation

`providerId` comes from the route, never the request body — a body-supplied provider would let a
caller write into someone else's namespace, and `forbidNonWhitelisted` rejects the extra field
anyway.

Every read is scoped: `findByProviderAndExternalEventId(providerId, externalEventId)` puts both in
the `where` clause. **The port has no `findById(id)`** — the assignment has no use for one, and
adding it would invite a lookup that bypasses scoping.

The consequence is that isolation needs no separate authorization check that someone could forget to
write: a cross-provider read reaches `null` naturally and the filter returns **404, not 403**, so a
caller cannot learn that the event id exists under another provider.

## Outbox

The activity row and its `outbox_events` row are written in **one `prisma.$transaction`**. Either
both land or neither does.

```json
{ "activityId": "…", "providerId": "lkw-walter", "driverId": "driver-1001",
  "activityType": "POD_UPLOAD", "pointsAwarded": 50 }
```

On an idempotent replay **no new outbox row is written** — the losing transaction rolled back. A
duplicate event would double-award points downstream in Gamification.

Scope stops at the table: there is no relay worker, scheduler or broker client here.

---

## Architecture extension question

**How to integrate Gamification without letting it touch the Activities tables.**

The activity and an `ActivityRecorded` event are committed together, atomically. A separate relay
process — not part of this solution — polls `outbox_events WHERE publishedAt IS NULL`, publishes to
a broker, then stamps `publishedAt`. Gamification subscribes to that stream. It never queries
`activities`, and the two modules share no schema; the event payload is the contract.

The port/domain-event structure is already in place for this: the domain raises `ActivityRecorded`,
and the adapter persists it. Swapping the outbox table for a real broker changes the adapter and
adds the relay — no domain or use-case change.

**What happens if the transaction commits but publishing fails.**

Nothing is lost. The outbox row is already committed and simply stays unpublished; the relay retries
it on its next pass. Delivery is therefore **at-least-once**, which makes idempotency Gamification's
responsibility too — it should dedupe on `activityId`, which is why that field is in the payload
even though the assignment's example omits it.

This is precisely why the event is written transactionally rather than published inline. An inline
publish **after** commit can be lost if the process dies in between. A publish **before** commit can
announce an activity that then rolls back and never existed. Writing the event in the same
transaction removes both failure modes and moves the remaining problem — duplicate delivery — to a
place where it is cheap to solve.

The relay is also where ordering guarantees would have to be addressed. This design does not provide
them.

---

## Trade-offs

**Decisions a reviewer may want to challenge:**

- **201 on first write, 200 on replay.** A replay created nothing; answering 201 twice would
  misreport that it had. The alternative — always 200, or always 201 — is simpler but less truthful.
- **422 for an unsupported activity type, not 400.** This is why `activityType` is validated as
  `@IsString`, **not** `@IsEnum`. `@IsEnum` would collapse an unsupported type into the same 400 as
  a malformed body and lose the distinction Requirement 7 asks for. The cost is that the accepted
  set of types is documented rather than enforced by the DTO.
- **`activityType` stored as `String`, not a Prisma enum.** Adding a type stays a code change
  instead of a migration; the price is that the database does not constrain the value, so the
  adapter narrows it on read and fails loudly on an unknown one.
- **Pinned one major behind on two dependencies.** Prisma 6.19.3 rather than 7/8, and NestJS 11
  rather than 12 — both for concrete, verified reasons, described under *AI usage* below.

**What would change in production:**

- **A relay worker for the outbox**, with backoff, a dead-letter path and metrics on lag. Today the
  table just accumulates.
- **Authentication.** `providerId` is trusted from the route; as written, any caller can address any
  provider namespace. It should come from an authenticated credential, and the route parameter
  should be checked against it.
- **Observability** — structured logging, request ids, tracing across the outbox boundary. There is
  none.
- **Retention and reversal.** No way to correct a wrongly-awarded activity, and no archival policy
  for `outbox_events`.
- `occurredAt` is stored but never used for business rules — no late-event handling, no ordering, no
  window in which an activity is still rewardable.
- No pagination, rate limiting or caching. No driver balance endpoint (an optional bonus, not
  selected).

---

## Testing

**13 unit tests** — the use cases and domain, in process, no database, no HTTP. They bind an
in-memory `ActivityRepository` through the production DI token rather than mocking Prisma, so they
assert on behaviour (returned activity, points, row count, events raised) instead of on ORM call
shapes.

The fake models the *replay contract*, not just storage: a duplicate key returns the existing
activity with `created: false` and raises no event. A fake that returned `created: true` for a
duplicate would let the duplicate tests pass for the wrong reason.

Covered: point calculation for all four types (table-driven), duplicate handling, no second outbox
event on replay, unsupported type rejected **with nothing persisted**, and two providers reusing one
`externalEventId` producing two activities.

**12 API tests** — the real Nest application over Supertest against real Postgres. Covered: 201 with
50 points, replay returning 200 with the same `activityId` and exactly one row, cross-provider read
returning 404, three malformed-body cases returning 400 with nothing persisted, unsupported type
returning 422, the concurrency race described above, and the outbox payload being written exactly
once and unpublished.

No controller unit tests with a mocked use case — the e2e tests cover that path for real.

---

## AI usage

**Tool:** Claude Code (Anthropic), used for requirement analysis, project scaffolding,
implementation and test authoring. Every dependency version, architectural decision and test
assertion was reviewed before being accepted.

**An AI suggestion that was reviewed and rejected — NestJS 12.**

The scaffold was generated on `@nestjs/*@12.0.1`, the current major. Peer ranges were checked,
`pnpm build` passed, the service booted, Swagger rendered, and a manual `curl` pass over all seven
API behaviours returned the right status codes and point values. It looked complete.

Then `pnpm test` failed on both suites with *"Must use import to load ES Module"*. Inspecting the
package manifest showed `@nestjs/common@12` declares `"type": "module"` with a single `./index.js`
export — **NestJS 12 ships ESM only**. The build and the running service were unaffected because
Node 22.12+ permits CommonJS to `require()` an ESM package (`process.features.require_module` is
`true` on the Node 24.14.1 used here), but Jest's module registry intercepts `require` and refuses.

Accepting the suggestion would have meant migrating the project to ESM — `module: nodenext`,
`"type": "module"`, `.js` extensions on every relative import, Jest under
`--experimental-vm-modules` — a large amount of configuration for a solution the brief asks to keep
deliberately small, and a real risk of `pnpm test` failing on a different machine. The whole
`@nestjs/*` set was pinned to 11.2.3 (with `@nestjs/config` at 4.0.4, the version whose peer range
covers Nest 11), which is CommonJS and needs none of it.

The point worth drawing out: the defect was invisible to the compiler, to the running service and to
a manual API check. Only the automated tests exposed it — which is also the argument for having
written them.

**Three other corrections made the same way:**

- **Prisma 8/7 → 6.19.3.** `latest` currently points at an `8.0.0-rc` (the stable tag is `prev:
  7.10.0`), and Prisma 7 removed `url = env("DATABASE_URL")` from the schema — verified by running
  `prisma validate`, which fails with `P1012` and demands a `prisma.config.ts` plus a
  `@prisma/adapter-pg` driver adapter. Not worth splitting the connection string across two files at
  this size.
- **TypeScript 7 → 5.9.3.** `ts-jest@29` declares `typescript: >=4.3 <7` and `typescript-eslint@8`
  declares `>=4.8.4 <6.1.0`; TS 7 would have broken both toolchains. 5.9.3 is what `@nestjs/cli@11`
  itself depends on.
- **`ValidationPipe` moved from `main.ts` into `AppModule` as `APP_PIPE`.** The suggested
  `app.useGlobalPipes()` in `main.ts` is the common example, but `Test.createTestingModule()` never
  runs `main.ts` — the e2e suite would have exercised an application with no validation while
  production had it.
- **`*.tsbuildinfo` added to `.dockerignore`.** The image built cleanly and then failed to start
  with `Cannot find module '/app/dist/main'`: `incremental: true` meant the local build cache was
  copied in, TypeScript concluded the outputs already existed and emitted nothing, and
  `.dockerignore` had excluded the `dist/` they supposedly lived in. Found by running the container,
  not by reading the Dockerfile.
