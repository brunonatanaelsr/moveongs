import { withTransaction, query } from '../../db';
import { getEnv } from '../../config/env';
import { logger } from '../../config/logger';
import { removeAttachment } from '../../modules/attachments/service';

let intervalHandle: NodeJS.Timeout | null = null;

async function anonymizeBeneficiaries(): Promise<void> {
  const env = getEnv();
  const anonymizeDays = Number(env.DATA_RETENTION_ANONYMIZE_DAYS);

  await withTransaction(async (client) => {
    await client.query(
      `update beneficiaries
          set cpf = null,
              rg = null,
              rg_issuer = null,
              nis = null,
              phone1 = null,
              phone2 = null,
              email = null,
              address = null,
              neighborhood = null,
              city = null,
              state = null,
              reference = null,
              updated_at = now()
        where updated_at < now() - ($1 || ' days')::interval
          and (
            cpf is not null or rg is not null or rg_issuer is not null or nis is not null or
            phone1 is not null or phone2 is not null or email is not null or address is not null or
            neighborhood is not null or city is not null or state is not null or reference is not null
          )`,
      [anonymizeDays],
    );
  });
}

async function purgeExpiredAttachments(): Promise<void> {
  const env = getEnv();
  const retentionDays = Number(env.DATA_RETENTION_DAYS);

  const { rows } = await query<{ id: string }>(
    `select id
       from attachments
      where created_at < now() - ($1 || ' days')::interval
      order by created_at asc
      limit 100`,
    [retentionDays],
  );

  for (const row of rows) {
    try {
      await removeAttachment(row.id, null);
    } catch (error) {
      logger.warn({ err: error, attachmentId: row.id }, 'failed to purge attachment during retention');
    }
  }
}

export async function applyDataRetentionPolicies(): Promise<void> {
  try {
    await anonymizeBeneficiaries();
  } catch (error) {
    logger.error({ err: error }, 'failed to anonymize beneficiaries');
  }

  try {
    await purgeExpiredAttachments();
  } catch (error) {
    logger.error({ err: error }, 'failed to purge expired attachments');
  }
}

export function startDataRetentionJob(): void {
  if (intervalHandle) {
    return;
  }

  const oneDay = 24 * 60 * 60 * 1000;
  intervalHandle = setInterval(() => {
    void applyDataRetentionPolicies();
  }, oneDay);

  void applyDataRetentionPolicies();
}

export function stopDataRetentionJob(): void {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
}
