export type Role = 'ADMIN' | 'SPV' | 'SPG';
export type ReportType = 'GROSIR' | 'HORECA' | 'REGULER';
export interface CoverageItem { id: string; level: 'KAB' | 'KEC'; kode: string; label: string; since: string }
export interface AuthUser { id: string; username: string; name: string; role: Role; tugas: ReportType[]; area?: string | null; areas?: { kode: string; nama: string }[]; deletedAt?: string | null; active: boolean; coverage: CoverageItem[]; overlaps?: Record<string, string[]> }
export interface PageMeta { page?: number; pageSize?: number; total?: number; totalPages?: number; [k: string]: unknown }
export interface Kec { kode: string; nama: string; kab: string; kabKode: string; prov: string; provKode: string }
export interface KabRow { kode: string; nama: string; provKode: string; provinsi: string; manual?: boolean; kecamatan: { kode: string; nama: string; nonaktif?: boolean; manual?: boolean }[] }
export const ROLE_LABEL: Record<Role, string> = { ADMIN: 'Admin pusat', SPV: 'Supervisor', SPG: 'SPG' };
export const TYPE_LABEL: Record<ReportType, string> = { GROSIR: 'Grosir', HORECA: 'HORECA', REGULER: 'Reguler' };
export const TYPES: ReportType[] = ['GROSIR', 'HORECA', 'REGULER'];
