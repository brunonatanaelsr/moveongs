import { compare } from 'bcryptjs';
import { createHash, randomBytes } from 'crypto';
import { withTransaction } from '../../db';
import { AppError, UnauthorizedError } from '../../shared/errors';
import { publishNotificationEvent } from '../notifications/service';
import { getUserByEmailWithPassword, type PermissionGrant } from '../users/repository';
import { hashPassword } from '../users/service';
import {
  deleteExpiredPasswordResetTokens,
  deletePasswordResetTokensForUser,
  findPasswordResetTokenByHash,
  insertPasswordResetToken,
  markPasswordResetTokenUsed,
} from './repository';

export type AuthenticatedUser = {
  id: string;
  name: string;
  email: string;
  roles: { slug: string; projectId?: string | null }[];
  permissions: PermissionGrant[];
};

const RESET_TOKEN_BYTE_LENGTH = 32;
const RESET_TOKEN_EXPIRATION_MINUTES = 60;
const DEFAULT_RESET_URL = 'https://imm.local/reset-password';

export async function validateCredentials(email: string, password: string): Promise<AuthenticatedUser> {
  const user = await getUserByEmailWithPassword(email);

  if (!user || !user.isActive) {
    throw new UnauthorizedError('Invalid credentials');
  }

  const passwordMatches = await compare(password, user.passwordHash);

  if (!passwordMatches) {
    throw new UnauthorizedError('Invalid credentials');
  }

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    roles: user.roles,
    permissions: user.permissions,
  };
}

function generateResetToken(): string {
  return randomBytes(RESET_TOKEN_BYTE_LENGTH).toString('hex');
}

function hashResetToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function resolveResetUrl(token: string, redirectTo?: string): string {
  const baseUrl = redirectTo && redirectTo.trim().length > 0 ? redirectTo : DEFAULT_RESET_URL;

  let url: URL;
  try {
    url = new URL(baseUrl);
  } catch {
    throw new AppError('Invalid redirect URL', 400);
  }

  url.searchParams.set('token', token);
  return url.toString();
}

export async function requestPasswordReset(email: string, redirectTo?: string): Promise<void> {
  const user = await getUserByEmailWithPassword(email);

  if (!user || !user.isActive) {
    return;
  }

  const token = generateResetToken();
  const tokenHash = hashResetToken(token);
  const expiresAt = new Date(Date.now() + RESET_TOKEN_EXPIRATION_MINUTES * 60 * 1000);

  await withTransaction(async (client) => {
    await deleteExpiredPasswordResetTokens(client);
    await deletePasswordResetTokensForUser(user.id, client);
    await insertPasswordResetToken({
      userId: user.id,
      tokenHash,
      expiresAt,
    }, client);
  });

  const resetUrl = resolveResetUrl(token, redirectTo);

  publishNotificationEvent({
    type: 'auth.password_reset_requested',
    data: {
      email: user.email,
      name: user.name,
      resetUrl,
      expiresAt: expiresAt.toISOString(),
    },
  });
}

export async function resetPasswordWithToken(token: string, newPassword: string): Promise<void> {
  const tokenHash = hashResetToken(token);
  const record = await findPasswordResetTokenByHash(tokenHash);

  if (!record || record.usedAt || record.expiresAt.getTime() <= Date.now()) {
    throw new AppError('Invalid or expired reset token', 400);
  }

  const passwordHash = await hashPassword(newPassword);

  await withTransaction(async (client) => {
    await client.query(
      `update users
          set password_hash = $1,
              updated_at = now()
        where id = $2`,
      [passwordHash, record.userId],
    );

    await markPasswordResetTokenUsed(record.id, client);
    await client.query(
      `delete from password_reset_tokens
        where user_id = $1
          and id <> $2`,
      [record.userId, record.id],
    );
  });
}
