import { Module } from '@nestjs/common';
import { FieldController } from './field.controller';
@Module({ controllers: [FieldController] })
export class FieldModule {}
