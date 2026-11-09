import { Prisma } from '@tanda/database';

/** Helpers for safe parameterised analytic SQL (no string interpolation of user input). */
export const statusList = (statuses: string[]) => Prisma.join(statuses.map((s) => Prisma.sql`${s}::"ValidationStatus"`));
export const inUuids = (column: Prisma.Sql, ids: string[] | null) =>
  ids === null ? Prisma.empty : ids.length === 0 ? Prisma.sql`AND false` : Prisma.sql`AND ${column} IN (${Prisma.join(ids.map((i) => Prisma.sql`${i}::uuid`))})`;
/** Converts bigint / Decimal values from raw queries to numbers for JSON. */
export function num<T extends Record<string, unknown>>(rows: T[]): T[] {
  return rows.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, typeof v === 'bigint' ? Number(v) : v instanceof Prisma.Decimal ? Number(v) : v])) as T);
}
