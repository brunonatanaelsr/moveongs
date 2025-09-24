import { createApp } from './app';
import { getEnv } from './config/env';
import { logger } from './config/logger';
import { startComplianceJobs } from './modules/compliance/service';

async function bootstrap() {
  const env = getEnv();
  const app = await createApp();

  if (env.NODE_ENV !== 'test') {
    startComplianceJobs();
  }

  try {
    await app.listen({ host: env.HOST, port: Number(env.PORT) });
    logger.info({ port: env.PORT }, 'HTTP server running');
  } catch (error) {
    logger.error({ err: error }, 'failed to start server');
    process.exit(1);
  }
}

bootstrap();
