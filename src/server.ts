import { createApp } from './app';
import { getEnv } from './config/env';
import { logger } from './config/logger';
import { startObservability } from './observability/opentelemetry';

async function bootstrap() {
  const env = getEnv();
  const observability = await startObservability();
  const app = await createApp();

  const gracefulShutdown = async (signal?: string) => {
    logger.info({ signal }, 'shutting down application');

    try {
      await app.close();
    } catch (error) {
      logger.error({ err: error }, 'failed to close http server');
    }

    await observability.shutdown();
    process.exit(0);
  };

  process.on('SIGTERM', () => {
    void gracefulShutdown('SIGTERM');
  });

  process.on('SIGINT', () => {
    void gracefulShutdown('SIGINT');
  });

  try {
    await app.listen({ host: env.HOST, port: Number(env.PORT) });
    logger.info({ port: env.PORT }, 'HTTP server running');
  } catch (error) {
    logger.error({ err: error }, 'failed to start server');
    await observability.shutdown();
    process.exit(1);
  }
}

bootstrap();
