import type { FastifyInstance } from 'fastify';
import { ForbiddenError, UnauthorizedError } from '../../shared/errors';

interface AuthorizationOptions {
  roles?: string[];
  permissions?: string[];
  strategy?: 'any' | 'all';
}

type AuthorizationRequirement = string | string[] | AuthorizationOptions;

export async function registerAuthDecorators(app: FastifyInstance) {
  app.decorate('authenticate', async (request) => {
    try {
      await request.jwtVerify();
    } catch {
      throw new UnauthorizedError();
    }
  });

  app.decorate('authorize', (requirement: AuthorizationRequirement) => async (request) => {
    const { roles, permissions, strategy } = normalizeRequirement(requirement);
    const userRoles = new Set(request.user?.roles ?? []);
    const userPermissions = new Set(request.user?.permissions ?? []);

    const checks: boolean[] = [];

    if (roles.length > 0) {
      checks.push(matches(userRoles, roles, strategy));
    }

    if (permissions.length > 0) {
      checks.push(matches(userPermissions, permissions, strategy));
    }

    const shouldAllow = checks.length === 0 ? true : strategy === 'all' ? checks.every(Boolean) : checks.some(Boolean);

    if (!shouldAllow) {
      throw new ForbiddenError('Insufficient permissions');
    }

    const requiredProjectPermissions = permissions.filter((permission) => permission.endsWith(':project'));
    if (requiredProjectPermissions.length > 0) {
      const userProjectPermissions = requiredProjectPermissions.filter((permission) => userPermissions.has(permission));
      if (userProjectPermissions.length > 0) {
        const projectScopes = Array.isArray(request.user?.projectScopes) ? request.user?.projectScopes ?? [] : [];
        const hasGlobalRole = Array.isArray(request.user?.roles)
          ? request.user.roles.some((role) => role === 'admin')
          : false;
        if (!hasGlobalRole && projectScopes.length === 0) {
          throw new ForbiddenError('Project scope required');
        }
      }
    }
  });
}

function normalizeRequirement(requirement: AuthorizationRequirement): Required<AuthorizationOptions> {
  if (typeof requirement === 'string') {
    return { roles: [requirement], permissions: [], strategy: 'any' };
  }

  if (Array.isArray(requirement)) {
    return { roles: requirement, permissions: [], strategy: 'any' };
  }

  return {
    roles: requirement.roles ?? [],
    permissions: requirement.permissions ?? [],
    strategy: requirement.strategy ?? 'any',
  };
}

function matches(set: Set<string>, expected: string[], strategy: 'any' | 'all') {
  if (strategy === 'all') {
    return expected.every((value) => set.has(value));
  }

  return expected.some((value) => set.has(value));
}
