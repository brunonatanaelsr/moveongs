import type { PropsWithChildren } from 'react';

type PermissionRequirement = string | string[] | {
  any?: string[];
  all?: string[];
};

type PermissionContext = {
  permissions: Set<string>;
  roles: Set<string>;
};

function normalize(requirement: PermissionRequirement) {
  if (typeof requirement === 'string') {
    return { any: [requirement] };
  }

  if (Array.isArray(requirement)) {
    return { any: requirement };
  }

  return requirement;
}

function hasPermission(ctx: PermissionContext, requirement: PermissionRequirement) {
  const normalized = normalize(requirement);

  if (normalized.all && normalized.all.some((value) => !ctx.permissions.has(value) && !ctx.roles.has(value))) {
    return false;
  }

  if (normalized.any && normalized.any.length > 0) {
    return normalized.any.some((value) => ctx.permissions.has(value) || ctx.roles.has(value));
  }

  return true;
}

export interface PermissionGuardProps {
  require?: PermissionRequirement;
  fallback?: JSX.Element | null;
  context?: PermissionContext;
}

export function PermissionGuard({ children, require = [], fallback = null, context }: PropsWithChildren<PermissionGuardProps>) {
  // Em um app real, substitua por hook/Contexto (ex.: usePermissions())
  const runtime = context ?? getDefaultContext();

  if (!hasPermission(runtime, require)) {
    return fallback;
  }

  return <>{children}</>;
}

function getDefaultContext(): PermissionContext {
  if (typeof window !== 'undefined') {
    const raw = window.localStorage.getItem('imm:session');
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        const permissions = new Set<string>(parsed.permissions ?? []);
        const roles = new Set<string>(parsed.roles ?? []);
        return { permissions, roles };
      } catch (error) {
        console.warn('failed to parse stored session', error);
      }
    }
  }

  return { permissions: new Set(), roles: new Set() };
}
