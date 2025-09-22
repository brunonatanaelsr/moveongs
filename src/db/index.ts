import type { PoolClient, QueryConfig, QueryResult, QueryResultRow } from 'pg';
import { pool } from './pool';

export type DbClient = PoolClient;

export async function query<T extends QueryResultRow = QueryResultRow>(
  queryConfig: QueryConfig<any[] | any> | string,
  values?: unknown[],
): Promise<QueryResult<T>> {
  if (typeof queryConfig === 'string') {
    return pool.query<T>(queryConfig, values as any[] | undefined);
  }

  return pool.query<T>(queryConfig);
}

export async function withTransaction<T>(handler: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    const result = await handler(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
