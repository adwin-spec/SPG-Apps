import { Module } from '@nestjs/common';
import { RegularController } from './regular.controller';
import { RegularService } from './regular.service';
@Module({ controllers: [RegularController], providers: [RegularService] })
export class RegularModule {}
