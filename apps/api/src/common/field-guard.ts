import { BadRequestException, ForbiddenException } from '@nestjs/common';
import type { OutletChannel } from '@tanda/database';
import { jakartaDate, type AuthUser } from '@tanda/shared';

/** Field endpoints act on the caller's own SPG record only. */
export function requireSpg(user: AuthUser): string {
  if (!user.spgId) throw new ForbiddenException({ code: 'NOT_AN_SPG', message: 'This action is only available to SPG accounts' });
  return user.spgId;
}

/** Which outlet channels each SPG category works with (separate workflows per category). */
export const CHANNELS_BY_CATEGORY: Record<string, OutletChannel[]> = {
  GROSIR: ['WHOLESALER', 'RETAILER'],
  HORECA: ['HORECA'],
  REGULER: ['REGULAR'],
};

export function assertChannel(user: AuthUser, channel: OutletChannel) {
  const allowed = CHANNELS_BY_CATEGORY[user.spgCategory ?? ''] ?? [];
  if (!allowed.includes(channel)) throw new ForbiddenException({ code: 'CHANNEL_NOT_ALLOWED', message: `SPG ${user.spgCategory} cannot record activity on ${channel} outlets` });
}

/**
 * Resolves the business time for an offline-capable record (risk R9).
 * - Offline records may be hours/days old: the device time is trusted when it is not in the future.
 * - Device clock ahead of server by ≤ maxSkew: clamp to server time.
 * - Device clock ahead by > maxSkew: server time is used and the record is flagged `skewed` for review.
 */
export function resolveClientTime(clientRecordedAt: string | undefined, maxSkewMin: number) {
  const server = new Date();
  if (!clientRecordedAt) return { at: server, workDate: jakartaDate(server), skewed: false };
  const client = new Date(clientRecordedAt);
  if (Number.isNaN(client.getTime())) throw new BadRequestException({ code: 'INVALID_TIMESTAMP', message: 'clientRecordedAt is invalid' });
  const aheadMin = (client.getTime() - server.getTime()) / 60000;
  if (aheadMin > maxSkewMin) return { at: server, workDate: jakartaDate(server), skewed: true };
  const at = aheadMin > 0 ? server : client;
  return { at, workDate: jakartaDate(at), skewed: false };
}
