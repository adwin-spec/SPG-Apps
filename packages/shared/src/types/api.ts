export interface ApiEnvelope<T> { data: T; meta?: PageMeta }
export interface PageMeta { page: number; pageSize: number; total: number; totalPages: number }
export interface ApiErrorBody { statusCode: number; error: { code: string; message: string; details?: unknown } }

export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  roles: string[];
  permissions: string[];
  spgId: string | null;
  spgCategory: 'GROSIR' | 'HORECA' | 'REGULER' | null;
  supervisorId: string | null;
  regionId: string | null;
  areaId: string | null;
}
