import { config } from 'dotenv';

config({ quiet: true });

const testDatabaseUrl = process.env.TEST_DATABASE_URL;

// Refuse rather than fall back: this suite truncates tables between cases, so silently
// running against the development database would destroy local data.
if (!testDatabaseUrl) {
  throw new Error(
    'TEST_DATABASE_URL is not set. Copy .env.example to .env — the e2e suite will not run against the development database.',
  );
}

process.env.DATABASE_URL = testDatabaseUrl;
