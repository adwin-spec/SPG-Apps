import { execSync } from 'child_process';
import * as path from 'path';
import { Client } from 'pg';

/**
 * Fresh, deterministic test database: drop/recreate schema → migrations → reference seed → demo seed.
 * SAFETY: refuses to run unless the target database name ends with "_test", so it can never wipe
 * a development or production database.
 */
export default async function () {
  require('./env');
  const url = new URL(process.env.DATABASE_URL!);
  const dbName = url.pathname.slice(1);
  if (!dbName.endsWith('_test')) throw new Error(`Refusing to reset "${dbName}": e2e tests only run against a database whose name ends with _test`);
  const c = new Client({ connectionString: process.env.DATABASE_URL!.replace(/\?.*$/, '') });
  await c.connect();
  await c.query('DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;');
  await c.end();
  const db = path.resolve(__dirname, '../../../packages/database');
  const env = { ...process.env, SEED_SUPERADMIN_PASSWORD: 'Admin12345!', DEMO_PASSWORD: 'Demo12345!', NODE_ENV: 'test' };
  execSync('npx prisma migrate deploy', { cwd: db, env, stdio: 'ignore' });
  execSync('npx tsx prisma/seed.ts', { cwd: db, env, stdio: 'ignore' });
  execSync('npx tsx prisma/seed-demo.ts', { cwd: db, env, stdio: 'ignore' });
  execSync('redis-cli -n 1 FLUSHDB', { stdio: 'ignore' });
}
