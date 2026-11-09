import { Global, Module } from '@nestjs/common';
import { QueueService } from './queue.service';
import { GoogleClient } from '../integrations/google.client';
@Global()
@Module({ providers: [QueueService, GoogleClient], exports: [QueueService, GoogleClient] })
export class QueueModule {}
