import { Injectable } from '@nestjs/common';
import { env } from '../config/env';
import { GoogleClient } from '../integrations/google.client';

export interface OcrOutput { provider: string; rawText: string; rawJson: unknown; confidence: number | null }

/** OCR provider selection. `none` = human transcription (no automatic text), never a fake result. */
@Injectable()
export class OcrProvider {
  constructor(private readonly google: GoogleClient) {}
  get name() { return env().OCR_PROVIDER; }
  async extract(buf: Buffer, mime: string): Promise<OcrOutput> {
    if (env().OCR_PROVIDER === 'google_vision') {
      if (mime === 'application/pdf') return { provider: 'google_vision', rawText: '', rawJson: { note: 'PDF requires manual transcription (async Vision PDF not enabled)' }, confidence: null };
      const r = await this.google.visionText(buf);
      return { provider: 'google_vision', rawText: r.text, rawJson: r.raw, confidence: r.confidence };
    }
    return { provider: 'none', rawText: '', rawJson: { note: 'OCR_PROVIDER=none – transcribe manually in the review screen' }, confidence: null };
  }
}
