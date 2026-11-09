import { Injectable, Logger } from '@nestjs/common';
import { JWT } from 'google-auth-library';
import { env } from '../config/env';

/**
 * Minimal Google REST client (Drive v3, Sheets v4, Vision v1) using a service account.
 * Credentials come only from the environment (GOOGLE_SERVICE_ACCOUNT_JSON_BASE64) – never from source.
 */
@Injectable()
export class GoogleClient {
  private readonly log = new Logger(GoogleClient.name);
  private jwt: JWT | null = null;

  get configured() { return !!env().GOOGLE_SERVICE_ACCOUNT_JSON_BASE64; }

  private client(): JWT {
    if (!this.configured) throw new Error('Google integration is not configured (GOOGLE_SERVICE_ACCOUNT_JSON_BASE64 is empty)');
    if (!this.jwt) {
      const sa = JSON.parse(Buffer.from(env().GOOGLE_SERVICE_ACCOUNT_JSON_BASE64, 'base64').toString('utf8'));
      this.jwt = new JWT({ email: sa.client_email, key: sa.private_key, scopes: [
        'https://www.googleapis.com/auth/drive.readonly', 'https://www.googleapis.com/auth/spreadsheets', 'https://www.googleapis.com/auth/cloud-vision'] });
    }
    return this.jwt;
  }

  private async request<T>(url: string, init: RequestInit = {}): Promise<T> {
    const { token } = await this.client().getAccessToken();
    const res = await fetch(url, { ...init, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', ...(init.headers ?? {}) } });
    if (!res.ok) throw new Error(`Google API ${res.status}: ${(await res.text()).slice(0, 300)}`);
    return (res.headers.get('content-type')?.includes('json') ? res.json() : res.arrayBuffer()) as Promise<T>;
  }

  async listFolder(folderId: string, modifiedAfter?: string) {
    const q = [`'${folderId.replace(/'/g, '')}' in parents`, 'trashed = false', "(mimeType contains 'image/' or mimeType = 'application/pdf')", modifiedAfter ? `modifiedTime > '${modifiedAfter}'` : null].filter(Boolean).join(' and ');
    const files: { id: string; name: string; mimeType: string; modifiedTime: string; md5Checksum?: string }[] = [];
    let pageToken: string | undefined;
    do {
      const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=nextPageToken,files(id,name,mimeType,modifiedTime,md5Checksum)&pageSize=200&orderBy=modifiedTime${pageToken ? `&pageToken=${pageToken}` : ''}`;
      const r = await this.request<{ files: typeof files; nextPageToken?: string }>(url);
      files.push(...r.files); pageToken = r.nextPageToken;
    } while (pageToken);
    return files;
  }

  async download(fileId: string): Promise<Buffer> {
    return Buffer.from(await this.request<ArrayBuffer>(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`));
  }

  async readSheet(spreadsheetId: string, sheet: string): Promise<string[][]> {
    const r = await this.request<{ values?: string[][] }>(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(sheet)}`);
    return r.values ?? [];
  }

  async appendRows(spreadsheetId: string, sheet: string, rows: (string | number | null)[][]) {
    if (!rows.length) return;
    await this.request(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(sheet)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
      { method: 'POST', body: JSON.stringify({ values: rows }) });
  }

  async visionText(image: Buffer): Promise<{ text: string; confidence: number | null; raw: unknown }> {
    const r = await this.request<{ responses: { fullTextAnnotation?: { text: string; pages?: { confidence?: number }[] }; error?: { message: string } }[] }>(
      'https://vision.googleapis.com/v1/images:annotate', { method: 'POST', body: JSON.stringify({ requests: [{ image: { content: image.toString('base64') }, features: [{ type: 'DOCUMENT_TEXT_DETECTION' }], imageContext: { languageHints: ['id', 'en'] } }] }) });
    const resp = r.responses[0];
    if (resp?.error) throw new Error(`Vision: ${resp.error.message}`);
    const pages = resp?.fullTextAnnotation?.pages ?? [];
    const conf = pages.length ? pages.reduce((a, p) => a + (p.confidence ?? 0), 0) / pages.length : null;
    return { text: resp?.fullTextAnnotation?.text ?? '', confidence: conf, raw: resp };
  }
}
