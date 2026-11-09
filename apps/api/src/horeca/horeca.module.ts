import { Module } from '@nestjs/common';
import { HorecaController } from './horeca.controller';
import { HorecaService } from './horeca.service';
@Module({ controllers: [HorecaController], providers: [HorecaService] })
export class HorecaModule {}
