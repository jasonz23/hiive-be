import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { AppModule } from './app.module';
import { corsOriginMatcher } from './common/cors';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  app.useLogger(app.get(Logger));
  app.setGlobalPrefix('api');
  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  const config = app.get(ConfigService);
  // Wildcard-aware CORS: the allow-list may contain patterns like
  // `https://*.vercel.app`, so match the incoming Origin against each pattern.
  const isAllowedOrigin = corsOriginMatcher(
    config.get<string[]>('corsAllowList') ?? ['http://localhost:8000'],
  );
  app.enableCors({
    origin: (origin, callback) => callback(null, isAllowedOrigin(origin)),
    credentials: true,
  });

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Hiive Agentic Marketing OS')
    .setDescription(
      'Mission-driven, multi-agent marketing operating system: RAG memory, ' +
        'campaign intelligence, swarm simulation, autonomous monitoring, ' +
        'human-in-the-loop approvals, and a continuous learning flywheel.',
    )
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document);

  // Persist the OpenAPI contract for the frontend client generator (Orval).
  if (config.get<string>('nodeEnv') !== 'production') {
    writeFileSync(
      join(process.cwd(), 'openapi.json'),
      JSON.stringify(document, null, 2),
    );
  }

  const port = config.get<number>('port') ?? 8001;
  await app.listen(port);
  app
    .get(Logger)
    .log(`Hiive backend listening on http://localhost:${port}/api`);
}

void bootstrap();
