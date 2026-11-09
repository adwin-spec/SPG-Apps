import { BadRequestException, Injectable, Logger, PayloadTooLargeException } from '@nestjs/common';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { createHash, randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import * as path from 'path';
import { Readable } from 'stream';
import { env } from '../../config/env';

/** Magic-byte signatures – the declared MIME type is never trusted (Security: file type validation). */
const SIGNATURES: { mime: string; ext: string; test: (b: Buffer) => boolean }[] = [
  { mime: 'image/jpeg', ext: 'jpg', test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { mime: 'image/png', ext: 'png', test: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { mime: 'image/webp', ext: 'webp', test: (b) => b.subarray(0, 4).toString() === 'RIFF' && b.subarray(8, 12).toString() === 'WEBP' },
  { mime: 'application/pdf', ext: 'pdf', test: (b) => b.subarray(0, 5).toString() === '%PDF-' },
];

export interface StoredObject { storageKey: string; mimeType: string; sizeBytes: number; checksumSha256: string }

/** Object storage abstraction: `local` (dev/test) or any S3-compatible store (prod). DB holds metadata only. */
@Injectable()
export class StorageService {
  private readonly log = new Logger(StorageService.name);
  private s3?: S3Client;

  constructor() {
    const e = env();
    if (e.STORAGE_DRIVER === 's3') {
      this.s3 = new S3Client({ region: e.S3_REGION, endpoint: e.S3_ENDPOINT || undefined, forcePathStyle: e.S3_FORCE_PATH_STYLE,
        credentials: { accessKeyId: e.S3_ACCESS_KEY_ID!, secretAccessKey: e.S3_SECRET_ACCESS_KEY! } });
    }
  }

  detectMime(buf: Buffer): { mime: string; ext: string } | null {
    const s = SIGNATURES.find((x) => x.test(buf));
    return s ? { mime: s.mime, ext: s.ext } : null;
  }

  checksum(buf: Buffer) { return createHash('sha256').update(buf).digest('hex'); }

  async put(buf: Buffer, prefix: string): Promise<StoredObject> {
    const e = env();
    if (buf.length === 0) throw new BadRequestException({ code: 'FILE_EMPTY', message: 'File is empty' });
    if (buf.length > e.UPLOAD_MAX_BYTES) throw new PayloadTooLargeException({ code: 'FILE_TOO_LARGE', message: `Max ${e.UPLOAD_MAX_BYTES} bytes` });
    const detected = this.detectMime(buf);
    const allowed = e.UPLOAD_ALLOWED_MIME.split(',').map((s) => s.trim());
    if (!detected || !allowed.includes(detected.mime)) throw new BadRequestException({ code: 'FILE_TYPE_NOT_ALLOWED', message: `Allowed types: ${allowed.join(', ')}` });
    const now = new Date();
    const storageKey = `${prefix}/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}/${randomUUID()}.${detected.ext}`;
    if (this.s3) {
      await this.s3.send(new PutObjectCommand({ Bucket: e.S3_BUCKET, Key: storageKey, Body: buf, ContentType: detected.mime, ServerSideEncryption: 'AES256' }));
    } else {
      const full = path.resolve(e.STORAGE_LOCAL_DIR, storageKey);
      await fs.mkdir(path.dirname(full), { recursive: true });
      await fs.writeFile(full, buf, { mode: 0o600 });
    }
    return { storageKey, mimeType: detected.mime, sizeBytes: buf.length, checksumSha256: this.checksum(buf) };
  }

  async getStream(storageKey: string): Promise<Readable> {
    if (storageKey.includes('..')) throw new BadRequestException('Invalid key');
    if (this.s3) {
      const r = await this.s3.send(new GetObjectCommand({ Bucket: env().S3_BUCKET, Key: storageKey }));
      return r.Body as Readable;
    }
    const { createReadStream } = await import('fs');
    return createReadStream(path.resolve(env().STORAGE_LOCAL_DIR, storageKey));
  }

  async getBuffer(storageKey: string): Promise<Buffer> {
    const s = await this.getStream(storageKey);
    const chunks: Buffer[] = [];
    for await (const c of s) chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c));
    return Buffer.concat(chunks);
  }
}
