import { authenticator } from 'otplib';
import { randomBytes } from 'crypto';
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from '@simplewebauthn/server';
import type {
  AuthenticatorTransportFuture,
  AuthenticationResponseJSON,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
  VerifiedAuthenticationResponse,
  VerifiedRegistrationResponse,
} from '@simplewebauthn/server';
import { getEnv } from '../../../config/env';
import { AppError, UnauthorizedError } from '../../../shared/errors';
import { recordAuditLog } from '../../../shared/audit';
import type { AuthenticatedUser } from '../service';
import {
  confirmTotpFactor,
  createMfaSession,
  createTotpFactor,
  deleteExpiredSessions,
  deleteTotpFactors,
  deleteUnconfirmedTotpFactors,
  getMfaSession,
  getMfaSettings,
  getTotpFactorById,
  insertWebauthnCredential,
  listTotpFactors,
  listWebauthnCredentials,
  markSessionConsumed,
  touchTotpFactorUsage,
  updateSessionChallenge,
  updateWebauthnCredential,
  upsertMfaSettings,
  type MfaSessionRecord,
} from './repository';
import { publishNotificationEvent } from '../../notifications/service';

const env = getEnv();

authenticator.options = {
  window: 1,
};

export type MfaSessionPayload = {
  user: AuthenticatedUser;
};

const MFA_SESSION_TTL_MS = Number.parseInt(env.MFA_SESSION_TTL_SECONDS ?? '300', 10) * 1000 || 300_000;

function sanitizeTotp(code: string): string {
  return code.replace(/\s+/g, '');
}

export async function getUserMfaStatus(userId: string): Promise<{
  totpEnabled: boolean;
  webauthnEnabled: boolean;
}> {
  const settings = await getMfaSettings(userId);
  if (!settings) {
    return { totpEnabled: false, webauthnEnabled: false };
  }

  return {
    totpEnabled: settings.totpEnabled,
    webauthnEnabled: settings.webauthnEnabled,
  };
}

export async function initiateTotpEnrollment(params: {
  user: { id: string; email: string; name: string };
  label?: string | null;
}): Promise<{ factorId: string; secret: string; otpauthUrl: string }> {
  await deleteUnconfirmedTotpFactors(params.user.id);
  const secret = authenticator.generateSecret();
  const factor = await createTotpFactor({ userId: params.user.id, secret, label: params.label ?? 'Authenticator' });

  const issuer = env.MFA_TOTP_ISSUER ?? 'IMM Dashboard';
  const otpauthUrl = authenticator.keyuri(params.user.email, issuer, secret);

  await recordAuditLog({
    userId: params.user.id,
    entity: 'user',
    entityId: params.user.id,
    action: 'mfa_totp_setup_started',
    afterData: { factorId: factor.id, label: factor.label },
  });

  return { factorId: factor.id, secret, otpauthUrl };
}

export async function confirmTotpEnrollment(params: {
  userId: string;
  factorId: string;
  code: string;
}): Promise<void> {
  const factor = await getTotpFactorById(params.factorId);
  if (!factor || factor.userId !== params.userId) {
    throw new AppError('Invalid enrollment factor', 404);
  }

  if (factor.confirmedAt) {
    throw new AppError('Factor already confirmed', 400);
  }

  const normalized = sanitizeTotp(params.code);
  const valid = authenticator.check(normalized, factor.secret);

  if (!valid) {
    throw new AppError('Invalid verification code', 400);
  }

  await confirmTotpFactor(factor.id);
  await upsertMfaSettings({ userId: params.userId, totpEnabled: true });

  await recordAuditLog({
    userId: params.userId,
    entity: 'user',
    entityId: params.userId,
    action: 'mfa_totp_enabled',
    afterData: { factorId: factor.id },
  });

  publishNotificationEvent({
    type: 'auth.mfa_updated',
    data: {
      userId: params.userId,
      method: 'totp',
      status: 'enabled',
    },
  });
}

export async function disableTotp(params: { userId: string }): Promise<void> {
  await deleteTotpFactors(params.userId);
  await upsertMfaSettings({ userId: params.userId, totpEnabled: false });

  await recordAuditLog({
    userId: params.userId,
    entity: 'user',
    entityId: params.userId,
    action: 'mfa_totp_disabled',
  });

  publishNotificationEvent({
    type: 'auth.mfa_updated',
    data: {
      userId: params.userId,
      method: 'totp',
      status: 'disabled',
    },
  });
}

export async function createAuthenticationSession(params: {
  user: AuthenticatedUser;
  methods: string[];
}): Promise<{ id: string; sessionId: string; expiresAt: string }> {
  await deleteExpiredSessions();
  const expiresAt = new Date(Date.now() + MFA_SESSION_TTL_MS);
  const session = await createMfaSession({
    userId: params.user.id,
    purpose: 'authenticate',
    methods: params.methods,
    payload: { user: params.user } satisfies MfaSessionPayload,
    expiresAt,
  });

  return { id: session.id, sessionId: session.id, expiresAt: session.expiresAt };
}

async function requireValidSession(
  sessionId: string,
  purpose: string,
  options?: { requirePayload?: boolean },
): Promise<{ session: MfaSessionRecord; user?: AuthenticatedUser }> {
  const session = await getMfaSession(sessionId);
  if (!session) {
    throw new UnauthorizedError('MFA session not found');
  }

  if (session.purpose !== purpose) {
    throw new UnauthorizedError('Invalid MFA session');
  }

  if (session.consumedAt) {
    throw new UnauthorizedError('MFA session already used');
  }

  if (new Date(session.expiresAt).getTime() <= Date.now()) {
    throw new UnauthorizedError('MFA session expired');
  }

  const payload = session.payload as MfaSessionPayload | null;
  const requirePayload = options?.requirePayload ?? purpose === 'authenticate';

  if (requirePayload && (!payload || !payload.user)) {
    throw new UnauthorizedError('Invalid MFA session payload');
  }

  return { session, user: payload?.user };
}

export async function verifyTotpAuthentication(params: { sessionId: string; code: string }): Promise<AuthenticatedUser> {
  const { session, user } = await requireValidSession(params.sessionId, 'authenticate');

  if (!user) {
    throw new UnauthorizedError('Invalid MFA session payload');
  }

  if (!session.methods.includes('totp')) {
    throw new UnauthorizedError('TOTP not enabled for session');
  }

  const factors = await listTotpFactors(user.id, { confirmedOnly: true });
  if (factors.length === 0) {
    throw new UnauthorizedError('No confirmed TOTP factors');
  }

  const sanitized = sanitizeTotp(params.code);
  let matchedFactorId: string | null = null;

  for (const factor of factors) {
    if (authenticator.check(sanitized, factor.secret)) {
      matchedFactorId = factor.id;
      break;
    }
  }

  if (!matchedFactorId) {
    throw new UnauthorizedError('Invalid verification code');
  }

  await markSessionConsumed(session.id);
  await touchTotpFactorUsage(matchedFactorId);

  await recordAuditLog({
    userId: user.id,
    entity: 'user',
    entityId: user.id,
    action: 'mfa_totp_authenticated',
  });

  return user;
}

export async function generateWebauthnRegistrationOptions(params: {
  user: { id: string; email: string; name: string };
  sessionId?: string;
  authenticatorName: string;
}): Promise<{ options: PublicKeyCredentialCreationOptionsJSON; sessionId: string }> {
  const credentials = await listWebauthnCredentials(params.user.id);
  const sessionRecord = params.sessionId
    ? (await requireValidSession(params.sessionId, 'webauthn_register', { requirePayload: false })).session
    : await createMfaSession({
      userId: params.user.id,
      purpose: 'webauthn_register',
      methods: ['webauthn'],
      payload: null,
      expiresAt: new Date(Date.now() + MFA_SESSION_TTL_MS),
    });

  const options = await generateRegistrationOptions({
    rpID: env.MFA_WEBAUTHN_RP_ID ?? 'imm.local',
    rpName: env.MFA_WEBAUTHN_RP_NAME ?? 'IMM Dashboard',
    userID: Buffer.from(params.user.id, 'utf8'),
    userName: params.user.email,
    userDisplayName: params.user.name,
    attestationType: 'none',
    excludeCredentials: credentials.map((credential) => ({
      id: credential.credentialId,
      type: 'public-key',
      transports: credential.transports as AuthenticatorTransportFuture[] | undefined,
    })),
    authenticatorSelection: {
      residentKey: 'preferred',
      userVerification: 'preferred',
    },
  });

  await updateSessionChallenge({ sessionId: sessionRecord.id, challenge: options.challenge, challengeType: 'webauthn' });

  return { options, sessionId: sessionRecord.id };
}

export async function verifyWebauthnRegistration(params: {
  sessionId: string;
  response: RegistrationResponseJSON;
  authenticatorName: string;
  userId: string;
}): Promise<void> {
  const { session } = await requireValidSession(params.sessionId, 'webauthn_register', { requirePayload: false });
  if (!session.challenge) {
    throw new AppError('Missing challenge', 400);
  }

  const verification: VerifiedRegistrationResponse = await verifyRegistrationResponse({
    response: params.response,
    expectedChallenge: session.challenge,
    expectedOrigin: env.MFA_WEBAUTHN_ORIGIN ?? 'https://imm.local',
    expectedRPID: env.MFA_WEBAUTHN_RP_ID ?? 'imm.local',
    requireUserVerification: true,
  });

  if (!verification.verified || !verification.registrationInfo) {
    throw new AppError('WebAuthn verification failed', 400);
  }

  const { credential } = verification.registrationInfo;
  const credentialId = credential.id;
  const publicKey = Buffer.from(credential.publicKey).toString('base64url');

  await insertWebauthnCredential({
    userId: params.userId,
    name: params.authenticatorName,
    credentialId,
    publicKey,
    signCount: credential.counter,
    transports: params.response.response.transports?.map((transport) => transport as AuthenticatorTransportFuture) ?? null,
  });

  await upsertMfaSettings({ userId: params.userId, webauthnEnabled: true });
  await markSessionConsumed(session.id);

  await recordAuditLog({
    userId: params.userId,
    entity: 'user',
    entityId: params.userId,
    action: 'mfa_webauthn_registered',
    afterData: { credentialId },
  });

  publishNotificationEvent({
    type: 'auth.mfa_updated',
    data: {
      userId: params.userId,
      method: 'webauthn',
      status: 'enabled',
    },
  });
}

export async function generateWebauthnAuthenticationOptions(params: { sessionId: string }): Promise<PublicKeyCredentialRequestOptionsJSON> {
  const { session, user } = await requireValidSession(params.sessionId, 'authenticate');
  if (!session.methods.includes('webauthn')) {
    throw new UnauthorizedError('WebAuthn not enabled for session');
  }

  if (!user) {
    throw new UnauthorizedError('Invalid MFA session payload');
  }

  const credentials = await listWebauthnCredentials(user.id);
  if (credentials.length === 0) {
    throw new UnauthorizedError('No WebAuthn credentials');
  }

  const options = await generateAuthenticationOptions({
    rpID: env.MFA_WEBAUTHN_RP_ID ?? 'imm.local',
    allowCredentials: credentials.map((credential) => ({
      id: credential.credentialId,
      type: 'public-key',
      transports: credential.transports as AuthenticatorTransportFuture[] | undefined,
    })),
    userVerification: 'preferred',
  });

  await updateSessionChallenge({ sessionId: session.id, challenge: options.challenge, challengeType: 'webauthn' });

  return options;
}

export async function verifyWebauthnAuthentication(params: {
  sessionId: string;
  response: AuthenticationResponseJSON;
}): Promise<AuthenticatedUser> {
  const { session, user } = await requireValidSession(params.sessionId, 'authenticate');
  if (!session.methods.includes('webauthn')) {
    throw new UnauthorizedError('WebAuthn not enabled for session');
  }

  if (!session.challenge) {
    throw new AppError('Missing challenge', 400);
  }

  if (!user) {
    throw new UnauthorizedError('Invalid MFA session payload');
  }

  const credentials = await listWebauthnCredentials(user.id);
  const credential = credentials.find((item) => item.credentialId === params.response.rawId);
  if (!credential) {
    throw new UnauthorizedError('Credential not recognized');
  }

  const verification: VerifiedAuthenticationResponse = await verifyAuthenticationResponse({
    response: params.response,
    expectedChallenge: session.challenge,
    expectedOrigin: env.MFA_WEBAUTHN_ORIGIN ?? 'https://imm.local',
    expectedRPID: env.MFA_WEBAUTHN_RP_ID ?? 'imm.local',
    credential: {
      id: credential.credentialId,
      publicKey: Buffer.from(credential.publicKey, 'base64url'),
      counter: credential.signCount,
      transports: credential.transports as AuthenticatorTransportFuture[] | undefined,
    },
    requireUserVerification: true,
  });

  if (!verification.verified || !verification.authenticationInfo) {
    throw new UnauthorizedError('WebAuthn verification failed');
  }

  await updateWebauthnCredential({
    credentialId: credential.credentialId,
    userId: user.id,
    signCount: verification.authenticationInfo.newCounter,
    lastUsedAt: new Date(),
  });

  await markSessionConsumed(session.id);

  await recordAuditLog({
    userId: user.id,
    entity: 'user',
    entityId: user.id,
    action: 'mfa_webauthn_authenticated',
    afterData: { credentialId: credential.credentialId },
  });

  return user;
}

export function generateBackupCode(): string {
  return randomBytes(5).toString('hex');
}
