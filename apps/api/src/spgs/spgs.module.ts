import { Module } from '@nestjs/common';
import { SpgsController } from './spgs.controller';
import { SpgsService } from './spgs.service';

@Module({ controllers: [SpgsController], providers: [SpgsService], exports: [SpgsService] })
export class SpgsModule {}
