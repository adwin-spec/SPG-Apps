import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Queue, JobsOptions } from 'bullmq';
import { env } from '../config/env';

export const QUEUES = ['ocr', 'integrations', 'maintenance'] as const;
export type QueueName = (typeof QUEUES)[number];
type Handler = (data: Record<string, unknown>) => Promise<unknown>;

export function redisConnection() {
  const u = new URL(env().REDIS_URL);
  return { host: u.hostname, port: Number(u.port || 6379), username: u.username || undefined, password: u.password || undefined, db: Number(u.pathname.slice(1) || 0), maxRetriesPerRequest: null };
}

/**
 * Producer side of BullMQ. With QUEUES_ENABLED=false (tests, single-process dev) jobs run inline
 * through the same handlers the worker uses, so behaviour is identical.
 */
@Injectable()
export class QueueService implements OnModuleDestroy {
  private readonly log = new Logger(QueueService.name);
  private readonly queues = new Map<QueueName, Queue>();
  readonly handlers = new Map<string, Handler>();

  register(queue: QueueName, name: string, handler: Handler) { this.handlers.set(`${queue}:${name}`, handler); }

  queue(name: QueueName) {
    if (!this.queues.has(name)) this.queues.set(name, new Queue(name, { connection: redisConnection(), defaultJobOptions: { attempts: 3, backoff: { type: 'exponential', delay: 30_000 }, removeOnComplete: 1000, removeOnFail: 5000 } }));
    return this.queues.get(name)!;
  }

  async enqueue(queue: QueueName, name: string, data: Record<string, unknown>, opts: JobsOptions = {}) {
    if (!env().QUEUES_ENABLED) {
      const h = this.handlers.get(`${queue}:${name}`);
      if (!h) throw new Error(`No handler for ${queue}:${name}`);
      await h(data);
      return { inline: true };
    }
    const job = await this.queue(queue).add(name, data, opts);
    return { jobId: job.id };
  }

  async onModuleDestroy() { await Promise.all([...this.queues.values()].map((q) => q.close().catch(() => undefined))); }
}
