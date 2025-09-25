import { authenticator } from 'otplib';
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
  isoBase64URL,
  type AuthenticationResponseJSON,
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
  type RegistrationResponseJSON,
  type WebAuthnCredential as LibraryWebAuthnCredential,
} from '@simplewebauthn/server';

import { getEnv } from '../../config/env';
import { AppError } from '../../shared/errors';
import { recordAuditLog } from '../../shared/audit';
import {
  confirmTotpSecret,
  createMfaChallenge,
  createMfaMethod,
  deleteMfaMethod,
  deleteWebAuthnCredential,
  findWebAuthnCredentialByCredentialId,
  findWebAuthnCredentialById,
  getActiveTotpMethodsByUser,
  getMfaChallengeById,
  getMfaMethodById,
  getTotpSecret,
  insertWebAuthnCredential,
  listMfaMethodsByUser,
  listWebAuthnCredentialsByMethod,
  listWebAuthnCredentialsByUser,
  saveTotpSecret,
  updateMfaMethod,
  updateWebAuthnCredentialCounter,
  consumeMfaChallenge,
} from './repository';
import type { MfaMethodRecord, MfaMethodType } from './repository';

const env = getEnv();

const totp = authenticator;
totp.options = {
  window: 1,
};

type LoginChallengePayload = {
  allowedMethods: MfaMethodType[];
  webauthnChallenge?: string | null;
};

type RegistrationChallengePayload = {
  methodId: string;
  challenge: string;
  deviceName?: string | null;
};

type ChallengeRecord<T extends Record<string, unknown>> = Awaited<ReturnType<typeof getMfaChallengeById<T>>>;

export type TotpEnrollmentResult = {
  method: MfaMethodRecord;
  secret: string;
  otpauthUrl: string;
};

export type LoginChallenge = {
  id: string;
  methods: MfaMethodType[];
  expiresAt: Date;
  webauthnOptions?: PublicKeyCredentialRequestOptionsJSON;
};

export type WebAuthnRegistrationChallenge = {
  challengeId: string;
  options: PublicKeyCredentialCreationOptionsJSON;
  method: MfaMethodRecord;
};

function ensureChallengeActive<T extends Record<string, unknown>>(
  challenge: ChallengeRecord<T> | null,
): asserts challenge is ChallengeRecord<T> {
  if (!challenge) {
    throw new AppError('MFA challenge not found', 404);
  }
  if (challenge.consumedAt) {
    throw new AppError('MFA challenge already used', 410);
  }
  if (challenge.expiresAt.getTime() < Date.now()) {
    throw new AppError('MFA challenge expired', 410);
  }
}

function assertMethodOwner(method: MfaMethodRecord | null, userId: string) {
  if (!method) {
    throw new AppError('MFA method not found', 404);
  }
  if (method.userId !== userId) {
    throw new AppError('MFA method not found', 404);
  }
}

export async function listUserMfaMethods(userId: string): Promise<MfaMethodRecord[]> {
  return listMfaMethodsByUser(userId);
}

export async function startTotpEnrollment(params: {
  userId: string;
  label?: string | null;
  accountLabel?: string;
}): Promise<TotpEnrollmentResult> {
  const allMethods = await listMfaMethodsByUser(params.userId);
  const active = allMethods.find((method) => method.type === 'totp' && method.enabled);
  if (active) {
    throw new AppError('TOTP already enabled for this user', 409);
  }

  let method = allMethods.find((item) => item.type === 'totp');
  if (method) {
    if (params.label !== undefined) {
      const beforeLabel = method.label;
      method = (await updateMfaMethod({ id: method.id, label: params.label ?? null })) ?? method;
      if (beforeLabel !== method.label) {
        await recordAuditLog({
          userId: params.userId,
          entity: 'mfa_totp',
          entityId: method.id,
          action: 'update',
          beforeData: { label: beforeLabel },
          afterData: { label: method.label },
        });
      }
    }
  } else {
    method = await createMfaMethod({
      userId: params.userId,
      type: 'totp',
      label: params.label ?? null,
      enabled: false,
    });

    await recordAuditLog({
      userId: params.userId,
      entity: 'mfa_totp',
      entityId: method.id,
      action: 'create',
      beforeData: null,
      afterData: { methodId: method.id, label: method.label },
    });
  }

  const secret = totp.generateSecret();
  await saveTotpSecret({ methodId: method.id, secret });

  const accountName = params.accountLabel ?? params.userId;
  const otpauthUrl = totp.keyuri(accountName, env.MFA_TOTP_ISSUER, secret);

  return { method, secret, otpauthUrl };
}

export async function confirmTotpEnrollment(params: {
  userId: string;
  methodId: string;
  code: string;
}): Promise<MfaMethodRecord> {
  const method = await getMfaMethodById(params.methodId);
  assertMethodOwner(method, params.userId);
  if (method.type !== 'totp') {
    throw new AppError('Invalid MFA method type', 400);
  }

  const stored = await getTotpSecret(method.id);
  if (!stored) {
    throw new AppError('MFA secret not found', 404);
  }

  const isValid = totp.verify({ token: params.code, secret: stored.secret });
  if (!isValid) {
    throw new AppError('Invalid MFA code', 400);
  }

  await confirmTotpSecret(params.methodId);
  const updated = await updateMfaMethod({ id: params.methodId, enabled: true, lastUsedAt: new Date() });
  if (!updated) {
    throw new AppError('Failed to update MFA method', 500);
  }

  await recordAuditLog({
    userId: params.userId,
    entity: 'mfa_totp',
    entityId: params.methodId,
    action: 'update',
    beforeData: { enabled: method.enabled },
    afterData: { enabled: updated.enabled },
  });

  return updated;
}

export async function disableTotpMethod(params: { userId: string; methodId: string }): Promise<void> {
  const method = await getMfaMethodById(params.methodId);
  assertMethodOwner(method, params.userId);
  if (method.type !== 'totp') {
    throw new AppError('Invalid MFA method type', 400);
  }

  await deleteMfaMethod(params.methodId);

  await recordAuditLog({
    userId: params.userId,
    entity: 'mfa_totp',
    entityId: params.methodId,
    action: 'delete',
    beforeData: { enabled: method.enabled },
    afterData: null,
  });
}

export async function verifyTotpCode(userId: string, code: string): Promise<boolean> {
  const methods = await getActiveTotpMethodsByUser(userId);
  for (const method of methods) {
    const isValid = totp.verify({ token: code, secret: method.secret });
    if (isValid) {
      await updateMfaMethod({ id: method.id, lastUsedAt: new Date() });
      return true;
    }
  }
  return false;
}

export async function createLoginChallengeForUser(userId: string): Promise<LoginChallenge | null> {
  const availableTotp = await getActiveTotpMethodsByUser(userId);
  const webauthnCredentials = await listWebAuthnCredentialsByUser(userId);

  const allowedMethods: MfaMethodType[] = [];
  if (availableTotp.length > 0) {
    allowedMethods.push('totp');
  }
  let webauthnOptions: PublicKeyCredentialRequestOptionsJSON | undefined;
  if (webauthnCredentials.length > 0) {
    allowedMethods.push('webauthn');
    webauthnOptions = await generateAuthenticationOptions({
      rpID: env.WEBAUTHN_RP_ID,
      allowCredentials: webauthnCredentials.map((credential) => ({
        id: credential.credentialId,
        transports: credential.transports ?? undefined,
      })),
      userVerification: 'preferred',
    });
  }

  if (allowedMethods.length === 0) {
    return null;
  }

  const ttlSeconds = Number(env.MFA_LOGIN_CHALLENGE_TTL_SECONDS);
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000);
  const challengeRecord = await createMfaChallenge<LoginChallengePayload>({
    userId,
    purpose: 'login',
    challenge: {
      allowedMethods,
      webauthnChallenge: webauthnOptions?.challenge ?? null,
    },
    expiresAt,
  });

  return {
    id: challengeRecord.id,
    methods: allowedMethods,
    expiresAt: challengeRecord.expiresAt,
    webauthnOptions,
  };
}

export async function verifyTotpLoginChallenge(params: {
  challengeId: string;
  code: string;
}): Promise<{ userId: string }> {
  const challenge = await getMfaChallengeById<LoginChallengePayload>(params.challengeId);
  ensureChallengeActive(challenge);

  if (challenge.purpose !== 'login') {
    throw new AppError('Invalid MFA challenge', 400);
  }

  const allowed = challenge.challenge.allowedMethods ?? [];
  if (!allowed.includes('totp')) {
    throw new AppError('TOTP not configured for this challenge', 400);
  }

  const isValid = await verifyTotpCode(challenge.userId, params.code);
  if (!isValid) {
    throw new AppError('Invalid MFA code', 400);
  }

  await consumeMfaChallenge(challenge.id);
  return { userId: challenge.userId };
}

function mapCredentialToLibraryType(record: {
  credentialId: string;
  publicKey: string;
  counter: number;
  transports: string[] | null;
}): LibraryWebAuthnCredential {
  return {
    id: record.credentialId,
    publicKey: isoBase64URL.toBuffer(record.publicKey),
    counter: record.counter,
    transports: record.transports ?? undefined,
  };
}

async function getOrCreateWebAuthnMethod(userId: string, label?: string | null): Promise<MfaMethodRecord> {
  const methods = await listMfaMethodsByUser(userId);
  const existing = methods.find((method) => method.type === 'webauthn');
  if (existing) {
    if (label && existing.label !== label) {
      await updateMfaMethod({ id: existing.id, label });
      existing.label = label ?? existing.label;
    }
    return existing;
  }

  return createMfaMethod({ userId, type: 'webauthn', label: label ?? null, enabled: false });
}

export async function startWebAuthnRegistration(params: {
  userId: string;
  userEmail: string;
  userName: string;
  deviceName?: string | null;
  label?: string | null;
}): Promise<WebAuthnRegistrationChallenge> {
  const method = await getOrCreateWebAuthnMethod(params.userId, params.label ?? params.deviceName ?? null);
  const existingCredentials = await listWebAuthnCredentialsByMethod(method.id);

  const options = await generateRegistrationOptions({
    rpID: env.WEBAUTHN_RP_ID,
    rpName: env.WEBAUTHN_RP_NAME,
    userName: params.userEmail,
    userDisplayName: params.userName,
    userID: isoBase64URL.toBuffer(isoBase64URL.fromUTF8String(params.userId)),
    attestationType: 'none',
    excludeCredentials: existingCredentials.map((credential) => ({
      id: credential.credentialId,
      transports: credential.transports ?? undefined,
    })),
    authenticatorSelection: {
      userVerification: 'preferred',
    },
  });

  const ttlSeconds = Number(env.MFA_LOGIN_CHALLENGE_TTL_SECONDS);
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000);
  const challenge = await createMfaChallenge<RegistrationChallengePayload>({
    userId: params.userId,
    purpose: 'webauthn_registration',
    challenge: {
      methodId: method.id,
      challenge: options.challenge,
      deviceName: params.deviceName ?? null,
    },
    expiresAt,
  });

  return {
    challengeId: challenge.id,
    options,
    method,
  };
}

export async function completeWebAuthnRegistration(params: {
  challengeId: string;
  response: RegistrationResponseJSON;
}): Promise<MfaMethodRecord> {
  const challenge = await getMfaChallengeById<RegistrationChallengePayload>(params.challengeId);
  ensureChallengeActive(challenge);

  if (challenge.purpose !== 'webauthn_registration') {
    throw new AppError('Invalid MFA registration challenge', 400);
  }

  const method = await getMfaMethodById(challenge.challenge.methodId);
  assertMethodOwner(method, challenge.userId);

  const verification = await verifyRegistrationResponse({
    response: params.response,
    expectedChallenge: challenge.challenge.challenge,
    expectedOrigin: env.WEBAUTHN_RP_ORIGIN,
    expectedRPID: env.WEBAUTHN_RP_ID,
    requireUserVerification: true,
  });

  if (!verification.verified || !verification.registrationInfo) {
    throw new AppError('WebAuthn registration could not be verified', 400);
  }

  const credential = verification.registrationInfo.credential;

  await insertWebAuthnCredential({
    methodId: method.id,
    credentialId: credential.id,
    publicKey: isoBase64URL.fromBuffer(credential.publicKey),
    counter: credential.counter,
    transports: credential.transports ?? null,
    attestationFormat: verification.registrationInfo.fmt,
    deviceName: challenge.challenge.deviceName ?? method.label ?? null,
  });

  await updateMfaMethod({ id: method.id, enabled: true, lastUsedAt: new Date() });
  await consumeMfaChallenge(challenge.id);

  await recordAuditLog({
    userId: challenge.userId,
    entity: 'mfa_webauthn',
    entityId: method.id,
    action: 'create',
    beforeData: null,
    afterData: { credentialId: credential.id },
  });

  const updated = await getMfaMethodById(method.id);
  if (!updated) {
    throw new AppError('MFA method not found after registration', 500);
  }

  return updated;
}

export async function removeWebAuthnCredential(params: { userId: string; credentialId: string }): Promise<void> {
  const credential = await findWebAuthnCredentialById(params.credentialId);
  if (!credential) {
    throw new AppError('Credential not found', 404);
  }

  const method = await getMfaMethodById(credential.methodId);
  assertMethodOwner(method, params.userId);

  await deleteWebAuthnCredential(credential.id);

  const remaining = await listWebAuthnCredentialsByMethod(credential.methodId);
  if (remaining.length === 0) {
    await updateMfaMethod({ id: credential.methodId, enabled: false });
  }

  await recordAuditLog({
    userId: params.userId,
    entity: 'mfa_webauthn',
    entityId: credential.methodId,
    action: 'delete',
    beforeData: { credentialId: credential.credentialId },
    afterData: null,
  });
}

export async function verifyWebAuthnLoginChallenge(params: {
  challengeId: string;
  response: AuthenticationResponseJSON;
}): Promise<{ userId: string }> {
  const challenge = await getMfaChallengeById<LoginChallengePayload>(params.challengeId);
  ensureChallengeActive(challenge);

  if (challenge.purpose !== 'login') {
    throw new AppError('Invalid MFA challenge', 400);
  }

  const allowed = challenge.challenge.allowedMethods ?? [];
  if (!allowed.includes('webauthn')) {
    throw new AppError('WebAuthn not configured for this challenge', 400);
  }

  if (!challenge.challenge.webauthnChallenge) {
    throw new AppError('WebAuthn challenge not available', 400);
  }

  const credential = await findWebAuthnCredentialByCredentialId(params.response.id);
  if (!credential) {
    throw new AppError('Credential not recognized', 404);
  }

  const method = await getMfaMethodById(credential.methodId);
  assertMethodOwner(method, challenge.userId);

  const verification = await verifyAuthenticationResponse({
    response: params.response,
    expectedChallenge: challenge.challenge.webauthnChallenge,
    expectedOrigin: env.WEBAUTHN_RP_ORIGIN,
    expectedRPID: env.WEBAUTHN_RP_ID,
    credential: mapCredentialToLibraryType({
      credentialId: credential.credentialId,
      publicKey: credential.publicKey,
      counter: credential.counter,
      transports: credential.transports,
    }),
    requireUserVerification: true,
  });

  if (!verification.verified) {
    throw new AppError('WebAuthn verification failed', 400);
  }

  await updateWebAuthnCredentialCounter({
    id: credential.id,
    counter: verification.authenticationInfo.newCounter,
    lastUsedAt: new Date(),
  });
  await updateMfaMethod({ id: credential.methodId, lastUsedAt: new Date() });
  await consumeMfaChallenge(challenge.id);

  return { userId: challenge.userId };
}

