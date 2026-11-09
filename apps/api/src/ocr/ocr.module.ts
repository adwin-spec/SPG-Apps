import { Module } from '@nestjs/common';
import { OcrController } from './ocr.controller';
import { OcrService } from './ocr.service';
import { OcrProvider } from './ocr-provider';
import { IntegrationsController } from '../integrations/integrations.controller';
import { IntegrationsService } from '../integrations/integrations.service';
import { TransactionsModule } from '../transactions/transactions.module';

@Module({ imports: [TransactionsModule], controllers: [OcrController, IntegrationsController], providers: [OcrService, OcrProvider, IntegrationsService], exports: [OcrService, IntegrationsService] })
export class OcrModule {}
