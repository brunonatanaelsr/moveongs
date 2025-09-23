import type { FastifyRequest } from 'fastify';
import { ForbiddenError } from '../../shared/errors';

export function hasPermission(request: FastifyRequest, key: string): boolean {
  return Array.isArray(request.user?.permissions) && request.user.permissions.includes(key);
}

export function ensureProjectScope(request: FastifyRequest, projectId: string | null) {
  if (!projectId) {
    return;
  }

  const scopes = request.user?.projectScopes ?? [];
  if (scopes.length === 0) {
    return;
  }

  if (!scopes.includes(projectId)) {
    throw new ForbiddenError('Projeto fora do escopo do usuário');
  }
}

export function shouldIncludeHidden(request: FastifyRequest, includeHiddenFlag?: string): boolean {
  if (!includeHiddenFlag) {
    return false;
  }

  const normalized = includeHiddenFlag === '1' || includeHiddenFlag === 'true';
  if (!normalized) {
    return false;
  }

  if (!hasPermission(request, 'activities:moderate')) {
    throw new ForbiddenError('Somente moderadores podem visualizar posts ocultos');
  }

  return true;
}
