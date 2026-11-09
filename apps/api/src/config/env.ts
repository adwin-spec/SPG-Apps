import { z } from 'zod';

// Load .env from the working directory when present (Node ≥ 21.7). Real environment variables win.
try { if (require('fs').existsSync('.env')) process.loadEnvFile('.env'); } catch { /* optional */ }

/** Fail fast on misconfiguration. No secret has a default (Security: no credentials in source). */
const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  QUEUES_ENABLED: z.string().default('true').transform((v) => v === 'true'),
  API_PORT: z.coerce.number().default(4000),
  CORS_ORIGINS: z.string().default('http://localhost:3000'),
  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be ≥ 32 characters'),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(7),
  COOKIE_SECURE: z.string().default('false').transform((v) => v === 'true'),
  RATE_LIMIT_TTL_SECONDS: z.coerce.number().default(60),
  RATE_LIMIT_MAX: z.coerce.number().default(300),
  LOGIN_RATE_LIMIT_MAX: z.coerce.number().default(10),
  STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
  STORAGE_LOCAL_DIR: z.string().default('./storage'),
  S3_ENDPOINT: z.string().optional(),
  S3_REGION: z.string().default('ap-southeast-3'),
  S3_BUCKET: z.string().default('tanda-tambah'),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  S3_FORCE_PATH_STYLE: z.string().default('true').transform((v) => v === 'true'),
  UPLOAD_MAX_BYTES: z.coerce.number().default(10 * 1024 * 1024),
  UPLOAD_ALLOWED_MIME: z.string().default('image/jpeg,image/png,image/webp,application/pdf'),
  GOOGLE_SERVICE_ACCOUNT_JSON_BASE64: z.string().optional().default(''),
  GOOGLE_DRIVE_INBOX_FOLDER_ID: z.string().optional().default(''),
  GOOGLE_SHEETS_SPREADSHEET_ID: z.string().optional().default(''),
  DRIVE_POLL_CRON: z.string().default('*/10 * * * *'),
  OCR_PROVIDER: z.enum(['none', 'google_vision']).default('none'),
}).superRefine((v, ctx) => {
  if (v.NODE_ENV === 'production' && !v.COOKIE_SECURE) ctx.addIssue({ code: 'custom', path: ['COOKIE_SECURE'], message: 'must be true in production (HTTPS)' });
  if (v.NODE_ENV === 'production' && v.STORAGE_DRIVER === 'local') ctx.addIssue({ code: 'custom', path: ['STORAGE_DRIVER'], message: 'use s3 in production' });
  if (v.STORAGE_DRIVER === 's3' && (!v.S3_ACCESS_KEY_ID || !v.S3_SECRET_ACCESS_KEY)) ctx.addIssue({ code: 'custom', path: ['S3_ACCESS_KEY_ID'], message: 'S3 credentials required' });
});

export type Env = z.infer<typeof schema>;
let cached: Env | null = null;
export function env(): Env {
  if (!cached) {
    const r = schema.safeParse(process.env);
    if (!r.success) {
      const msg = r.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
      throw new Error(`Invalid environment configuration:\n${msg}`);
    }
    cached = r.data;
  }
  return cached;
}
export function resetEnvCache() { cached = null; }
