import { Body, Controller, Get, HttpCode, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { PERMISSIONS, type AuthUser } from '@tanda/shared';
import { CurrentUser, RequirePermissions } from '../common/decorators';
import { ZodPipe } from '../common/pipes/zod.pipe';
import { NotificationsService } from './notifications.service';

const listQ = z.object({ unread: z.enum(['true', 'false']).optional() });
const readSchema = z.object({ ids: z.array(z.uuid()).max(500).optional() });

@ApiTags('Notifications')
@ApiBearerAuth()
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly svc: NotificationsService) {}

  @Get() @RequirePermissions(PERMISSIONS.NOTIFICATION_SELF)
  list(@CurrentUser() u: AuthUser, @Query(new ZodPipe(listQ)) q: z.infer<typeof listQ>) { return this.svc.list(u, q.unread === 'true'); }

  @Get('unread-count') @RequirePermissions(PERMISSIONS.NOTIFICATION_SELF)
  count(@CurrentUser() u: AuthUser) { return this.svc.unreadCount(u); }

  @Post('read') @HttpCode(200) @RequirePermissions(PERMISSIONS.NOTIFICATION_SELF)
  read(@CurrentUser() u: AuthUser, @Body(new ZodPipe(readSchema)) b: z.infer<typeof readSchema>) { return this.svc.markRead(u, b.ids); }

  @Post('scan') @HttpCode(200) @RequirePermissions(PERMISSIONS.SETTINGS_MANAGE)
  scan() { return this.svc.scan(); }
}
