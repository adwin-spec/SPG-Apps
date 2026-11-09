import { PaginationQuery } from '@tanda/shared';

export class Paginated<T> {
  constructor(public readonly items: T[], public readonly total: number, public readonly page: number, public readonly pageSize: number) {}
  get meta() { return { page: this.page, pageSize: this.pageSize, total: this.total, totalPages: Math.max(1, Math.ceil(this.total / this.pageSize)) }; }
}

export function pageArgs(q: Pick<PaginationQuery, 'page' | 'pageSize'>) {
  return { skip: (q.page - 1) * q.pageSize, take: q.pageSize };
}

/** Whitelisted sort to prevent arbitrary field ordering. */
export function orderBy(sort: string | undefined, allowed: string[], fallback: Record<string, 'asc' | 'desc'>) {
  if (!sort) return fallback;
  const [field, dir] = sort.split(':');
  if (!allowed.includes(field)) return fallback;
  return field.split('.').reverse().reduce<unknown>((acc, k, i) => (i === 0 ? { [k]: dir } : { [k]: acc }), null) as Record<string, unknown>;
}

export const toDate = (d: string) => new Date(`${d}T00:00:00.000Z`);
