import Redis from 'ioredis';
import { getEnv } from './env';
import { logger } from './logger';

let client: Redis | null = null;
let initialized = false;

export function getRedis(): Redis | null {
  if (!initialized) {
    initialized = true;
    const env = getEnv();
    if (!env.REDIS_URL) {
      logger.warn('REDIS_URL not set; caching disabled');
      return null;
    }

    client = new Redis(env.REDIS_URL, {
      lazyConnect: true,
    });

    client.on('error', (error) => {
      logger.error({ error }, 'Redis error');
    });
  }

  return client;
}
