import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configureSecurity } from './common/configure-security';
import { connectRateLimitStores } from './common/rate-limit-stores';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api');

  let limits: Awaited<ReturnType<typeof connectRateLimitStores>>;
  try {
    limits = await connectRateLimitStores();
  } catch (error) {
    await app.close();
    throw error;
  }
  configureSecurity(app, limits.stores, limits.ready);
  app.getHttpServer().once('close', () => {
    void limits.close();
  });
  app.enableShutdownHooks();

  await app.listen(process.env.PORT ?? 3010, process.env.HOST ?? '127.0.0.1');
}
bootstrap();
