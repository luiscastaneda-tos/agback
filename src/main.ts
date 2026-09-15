import { NestFactory } from "@nestjs/core";
import { NestExpressApplication } from "@nestjs/platform-express";

import { AppModule } from "./app.module";
import { loadRuntimeConfig } from "./config/runtime-config";

async function bootstrap(): Promise<void> {
  const config = loadRuntimeConfig();
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.enableCors({
    origin: ["http://localhost:5173"],
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "Last-Event-ID"],
  });
  await app.listen(config.port);
}

void bootstrap();
