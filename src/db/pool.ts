import { Pool } from 'pg';
import { getEnv } from '../config/env';
import { logger } from '../config/logger';

const env = getEnv();

export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30_000,
});

pool.on('error', (error: Error) => {
  logger.error({ error }, 'database pool error');
});
