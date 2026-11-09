import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { configureApp, setupSwagger } from './bootstrap';
import { env } from './config/env';

async function bootstrap() {
  process.env.TZ = 'UTC'; // storage & computation in UTC; Asia/Jakarta only for business dates/display
  const e = env();
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: false });
  app.useBodyParser('json', { limit: '2mb' });
  configureApp(app);
  setupSwagger(app);
  app.enableShutdownHooks();
  await app.listen(e.API_PORT, '0.0.0.0');
  Logger.log(`API listening on :${e.API_PORT} (docs: /api/docs)`, 'Bootstrap');
}
void bootstrap();
