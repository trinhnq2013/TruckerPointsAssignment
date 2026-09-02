-- Runs once on first container start. The e2e suite truncates tables freely,
-- so it must never share a database with local development data.
CREATE DATABASE truckerpoints_test OWNER truckerpoints;
