import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Worker } from 'bullmq';
import { AppModule } from './app.module';
import { env } from './config/env';
import { QUEUES, QueueService, redisConnection } from './queue/queue.service';

/**
 * Background worker (same codebase, separate process – ADR §2.1).
 * Consumes: ocr, integrations, maintenance. Schedules (Asia/Jakarta):
 *   00:30 mark missed visit plans · 02:15 KPI recalculation (prev + current month) + performance alerts
 *   03:10 data-quality scan · 10:05 & 21:35 notification scans · DRIVE_POLL_CRON Google Drive polling
 */
async function bootstrap() {
  process.env.TZ = 'UTC';
  const log = new Logger('Worker');
  const app = await NestFactory.createApplicationContext(AppModule, { bufferLogs: false });
  const queue = app.get(QueueService);
  const workers = QUEUES.map((name) => new Worker(name, async (job) => {
    const handler = queue.handlers.get(`${name}:${job.name}`);
    if (!handler) throw new Error(`No handler for ${name}:${job.name}`);
    log.log(`→ ${name}:${job.name} (${job.id})`);
    return handler(job.data);
  }, { connection: redisConnection(), concurrency: name === 'ocr' ? 4 : 1 }));
  workers.forEach((w) => w.on('failed', (job, err) => log.error(`✗ ${w.name}:${job?.name} ${job?.id}: ${err.message}`)));

  const tz = 'Asia/Jakarta';
  const schedule = async (q: (typeof QUEUES)[number], name: string, pattern: string) =>
    queue.queue(q).upsertJobScheduler(name, { pattern, tz }, { name, data: {}, opts: { attempts: 2 } });
  await schedule('maintenance', 'mark-missed-plans', '30 0 * * *');
  await schedule('maintenance', 'kpi-recalc', '15 2 * * *');
  await schedule('maintenance', 'dq-scan', '10 3 * * *');
  await schedule('maintenance', 'notifications-scan', '5 10,21 * * *');
  if (env().GOOGLE_SERVICE_ACCOUNT_JSON_BASE64 && env().GOOGLE_DRIVE_INBOX_FOLDER_ID) await schedule('integrations', 'drive-sync', env().DRIVE_POLL_CRON);
  log.log(`Worker started: queues ${QUEUES.join(', ')}`);

  const shutdown = async () => { log.log('Shutting down worker…'); await Promise.all(workers.map((w) => w.close())); await app.close(); process.exit(0); };
  process.on('SIGTERM', shutdown); process.on('SIGINT', shutdown);
}
void bootstrap();
