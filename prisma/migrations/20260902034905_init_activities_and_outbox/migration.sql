-- CreateTable
CREATE TABLE "activities" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "externalEventId" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "activityType" TEXT NOT NULL,
    "pointsAwarded" INTEGER NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outbox_events" (
    "id" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedAt" TIMESTAMP(3),

    CONSTRAINT "outbox_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "activities_driverId_idx" ON "activities"("driverId");

-- CreateIndex
CREATE UNIQUE INDEX "activities_providerId_externalEventId_key" ON "activities"("providerId", "externalEventId");

-- CreateIndex
CREATE INDEX "outbox_events_publishedAt_idx" ON "outbox_events"("publishedAt");
