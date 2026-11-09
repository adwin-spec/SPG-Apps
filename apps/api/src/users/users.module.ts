import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { RolesController } from '../roles/roles.controller';

@Module({ controllers: [UsersController, RolesController], providers: [UsersService], exports: [UsersService] })
export class UsersModule {}
