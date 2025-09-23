import type { FastifyRequest } from 'fastify';
import { ForbiddenError } from '../../shared/errors';

export type AnalyticsScope = {
  allowedProjectIds: string[] | null;
  scopeKey: string;
};

const ALLOWED_ROLES = new Set(['admin', 'coordenacao', 'tecnica', 'educadora']);

export function resolveAnalyticsScope(request: FastifyRequest): AnalyticsScope {
  const userRoles = new Set(request.user.roles);
  const hasAllowedRole = [...ALLOWED_ROLES].some((role) => userRoles.has(role));

  if (!hasAllowedRole) {
    throw new ForbiddenError('Analytics access denied');
  }

  const projectScopes = new Set(request.user.projectScopes ?? []);

  if (userRoles.has('educadora') && projectScopes.size === 0) {
    throw new ForbiddenError('Educadora sem escopo de projeto definido');
  }

  const query = (request.query ?? {}) as Record<string, string | undefined>;
  const requestProject = query.projectId ?? null;

  if (projectScopes.size === 0 || userRoles.has('admin') || userRoles.has('coordenacao') || userRoles.has('tecnica')) {
    if (userRoles.has('educadora') && projectScopes.size > 0 && requestProject && !projectScopes.has(requestProject)) {
      throw new ForbiddenError('Projeto fora do escopo do usuário');
    }
    const scopeKey = projectScopes.size > 0 ? Array.from(projectScopes).sort().join(',') : 'all';
    return { allowedProjectIds: projectScopes.size > 0 ? Array.from(projectScopes) : null, scopeKey };
  }

  const allowedProjects = Array.from(projectScopes);

  if (requestProject && !projectScopes.has(requestProject)) {
    throw new ForbiddenError('Projeto fora do escopo do usuário');
  }

  return {
    allowedProjectIds: allowedProjects,
    scopeKey: allowedProjects.sort().join(','),
  };
}
