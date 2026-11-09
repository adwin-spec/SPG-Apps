import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { PERMISSIONS, areaSchema, districtSchema, regionSchema, subdistrictSchema, supervisorSchema, territorySchema, type AuthUser } from '@tanda/shared';
import { ApiZodBody, CurrentUser, RequirePermissions } from '../common/decorators';
import { ZodPipe } from '../common/pipes/zod.pipe';
import { OrganizationService } from './organization.service';

const statusSchema = z.object({ name: z.string().trim().min(1).max(120).optional(), status: z.enum(['ACTIVE', 'INACTIVE']).optional() });
const parentQuery = z.object({ parentId: z.uuid().optional() });

@ApiTags('Organization')
@ApiBearerAuth()
@Controller('organization')
export class OrganizationController {
  constructor(private readonly org: OrganizationService) {}

  /** Full hierarchy tree used by filters and drill-down (scoped to the user's territory). */
  @Get('tree') @RequirePermissions(PERMISSIONS.ORG_READ)
  tree(@CurrentUser() u: AuthUser) { return this.org.tree(u); }

  @Get('regions') @RequirePermissions(PERMISSIONS.ORG_READ)
  regions() { return this.org.list('region'); }
  @Post('regions') @RequirePermissions(PERMISSIONS.ORG_MANAGE) @ApiZodBody(regionSchema)
  createRegion(@Body(new ZodPipe(regionSchema)) b: z.infer<typeof regionSchema>, @CurrentUser() u: AuthUser) { return this.org.createRegion(b, u); }
  @Patch('regions/:id') @RequirePermissions(PERMISSIONS.ORG_MANAGE) @ApiZodBody(statusSchema)
  updateRegion(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(statusSchema)) b: z.infer<typeof statusSchema>, @CurrentUser() u: AuthUser) { return this.org.update('region', id, b, u); }

  @Get('areas') @RequirePermissions(PERMISSIONS.ORG_READ)
  areas(@Query(new ZodPipe(parentQuery)) q: z.infer<typeof parentQuery>) { return this.org.list('area', q.parentId); }
  @Post('areas') @RequirePermissions(PERMISSIONS.ORG_MANAGE) @ApiZodBody(areaSchema)
  createArea(@Body(new ZodPipe(areaSchema)) b: z.infer<typeof areaSchema>, @CurrentUser() u: AuthUser) { return this.org.create('area', b, u); }
  @Patch('areas/:id') @RequirePermissions(PERMISSIONS.ORG_MANAGE) @ApiZodBody(statusSchema)
  updateArea(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(statusSchema)) b: z.infer<typeof statusSchema>, @CurrentUser() u: AuthUser) { return this.org.update('area', id, b, u); }

  @Get('districts') @RequirePermissions(PERMISSIONS.ORG_READ)
  districts(@Query(new ZodPipe(parentQuery)) q: z.infer<typeof parentQuery>) { return this.org.list('district', q.parentId); }
  @Post('districts') @RequirePermissions(PERMISSIONS.ORG_MANAGE) @ApiZodBody(districtSchema)
  createDistrict(@Body(new ZodPipe(districtSchema)) b: z.infer<typeof districtSchema>, @CurrentUser() u: AuthUser) { return this.org.create('district', b, u); }

  @Get('subdistricts') @RequirePermissions(PERMISSIONS.ORG_READ)
  subdistricts(@Query(new ZodPipe(parentQuery)) q: z.infer<typeof parentQuery>) { return this.org.list('subdistrict', q.parentId); }
  @Post('subdistricts') @RequirePermissions(PERMISSIONS.ORG_MANAGE) @ApiZodBody(subdistrictSchema)
  createSubdistrict(@Body(new ZodPipe(subdistrictSchema)) b: z.infer<typeof subdistrictSchema>, @CurrentUser() u: AuthUser) { return this.org.create('subdistrict', b, u); }

  @Get('territories') @RequirePermissions(PERMISSIONS.ORG_READ)
  territories(@Query(new ZodPipe(parentQuery)) q: z.infer<typeof parentQuery>) { return this.org.list('territory', q.parentId); }
  @Post('territories') @RequirePermissions(PERMISSIONS.ORG_MANAGE) @ApiZodBody(territorySchema)
  createTerritory(@Body(new ZodPipe(territorySchema)) b: z.infer<typeof territorySchema>, @CurrentUser() u: AuthUser) { return this.org.create('territory', b, u); }

  @Get('supervisors') @RequirePermissions(PERMISSIONS.ORG_READ)
  supervisors(@Query(new ZodPipe(parentQuery)) q: z.infer<typeof parentQuery>, @CurrentUser() u: AuthUser) { return this.org.supervisors(u, q.parentId); }
  @Post('supervisors') @RequirePermissions(PERMISSIONS.ORG_MANAGE) @ApiZodBody(supervisorSchema)
  createSupervisor(@Body(new ZodPipe(supervisorSchema)) b: z.infer<typeof supervisorSchema>, @CurrentUser() u: AuthUser) { return this.org.createSupervisor(b, u); }
}
