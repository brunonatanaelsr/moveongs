'use client';

import { API_URL } from './api';
import type { Session } from './session';

export type LoginSuccessResponse = {
  token: string;
  refreshToken: string;
  refreshTokenExpiresAt: string;
  user: {
    id: string;
    name: string;
    email: string;
    roles: { slug: string; projectId?: string | null }[];
    permissions: { key: string }[];
  };
  projectScopes?: string[];
};

export type LoginMfaResponse = {
  mfaRequired: true;
  challengeId: string;
  methods: string[];
  expiresAt: string;
  webauthnOptions?: unknown;
};

export type LoginResponse = LoginSuccessResponse | LoginMfaResponse;

export function mapLoginResponseToSession(response: LoginSuccessResponse): Session {
  const permissions = response.user.permissions.map((permission) => permission.key);
  const roles = response.user.roles.map((role) => role.slug);

  return {
    token: response.token,
    refreshToken: response.refreshToken,
    refreshTokenExpiresAt: response.refreshTokenExpiresAt ?? null,
    permissions,
    roles,
    projectScopes: response.projectScopes ?? [],
    user: {
      id: response.user.id,
      name: response.user.name,
      email: response.user.email,
    },
  };
}

export async function login(email: string, password: string): Promise<LoginResponse> {
  const response = await fetch(`${API_URL}/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, password }),
  });

  if (response.status === 202) {
    const body = (await response.json()) as LoginMfaResponse;
    return body;
  }

  if (!response.ok) {
    let message = 'Não foi possível entrar. Verifique suas credenciais.';
    try {
      const body = (await response.json()) as { message?: string };
      if (body?.message) {
        message = body.message;
      }
    } catch (error) {
      // ignore parse errors
    }
    throw new Error(message);
  }

  const body = (await response.json()) as LoginSuccessResponse;
  return body;
}
