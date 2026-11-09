import { Global, Module } from '@nestjs/common';
import { DataQualityController } from './data-quality.controller';
import { DataQualityService } from './data-quality.service';
@Global()
@Module({ controllers: [DataQualityController], providers: [DataQualityService], exports: [DataQualityService] })
export class DataQualityModule {}
