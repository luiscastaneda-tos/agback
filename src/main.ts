import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';

import { AppModule } from './app.module';
import { loadRuntimeConfig } from './config/runtime-config';

async function bootstrap(): Promise<void> {
  const config = loadRuntimeConfig();
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  await app.listen(config.port);
}

void bootstrap();
