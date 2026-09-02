import { execSync } from 'node:child_process';
import { config } from 'dotenv';

/**
 * Applies migrations to the test database once, before any suite runs, so the schema is
 * never assumed to be already in place.
 */
export default function globalSetup(): void {
  config({ quiet: true });

  const testDatabaseUrl = process.env.TEST_DATABASE_URL;
  if (!testDatabaseUrl) {
    throw new Error('TEST_DATABASE_URL is not set. Copy .env.example to .env.');
  }

  execSync('pnpm prisma migrate deploy', {
    env: { ...process.env, DATABASE_URL: testDatabaseUrl },
    stdio: 'inherit',
  });
}
