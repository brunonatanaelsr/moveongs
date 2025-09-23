import type { PoolClient, QueryResult } from 'pg';
import { query, withTransaction } from '../../db';
import { AppError } from '../../shared/errors';

export type RoleAssignment = {
  slug: string;
  projectId?: string | null;
};

export type PermissionGrant = {
  key: string;
  resource: string;
  action: string;
  scope: string;
};

export type UserRecord = {
  id: string;
  name: string;
  email: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  roles: RoleAssignment[];
  permissions: PermissionGrant[];
};

export type UserAuthRecord = {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  isActive: boolean;
  roles: RoleAssignment[];
  permissions: PermissionGrant[];
};

async function loadRoleIds(client: PoolClient, roleSlugs: string[]) {
  if (roleSlugs.length === 0) {
    return new Map<string, number>();
  }

  const placeholders = roleSlugs.map((_, index) => `$${index + 1}`).join(',');
  const { rows } = await client.query<{ id: number; slug: string }>(
    `select id, slug from roles where slug in (${placeholders})`,
    roleSlugs,
  );

  if (rows.length !== roleSlugs.length) {
    const foundSlugs = new Set(rows.map((row) => row.slug));
    const missing = roleSlugs.filter((slug) => !foundSlugs.has(slug));
    throw new AppError(`Unknown roles: ${missing.join(', ')}`, 400);
  }

  return new Map(rows.map((row) => [row.slug, row.id] as const));
}

function buildPermissionKey(resource: string, action: string, scope: string) {
  return scope === 'global' ? `${resource}:${action}` : `${resource}:${action}:${scope}`;
}

async function fetchPermissions(client: PoolClient | null, userIds: string[]): Promise<Map<string, PermissionGrant[]>> {
  if (userIds.length === 0) {
    return new Map();
  }

  const placeholders = userIds.map((_, index) => `$${index + 1}`).join(', ');
  const sql = `select distinct ur.user_id,
            res.slug as resource_slug,
            perm.action,
            perm.scope
       from user_roles ur
       join role_permissions rp on rp.role_id = ur.role_id
       join permissions perm on perm.id = rp.permission_id
       join resources res on res.id = perm.resource_id
      where ur.user_id in (${placeholders})`;

  const values = userIds;
  const result = client
    ? await client.query<{ user_id: string; resource_slug: string; action: string; scope: string }>(sql, values)
    : await query<{ user_id: string; resource_slug: string; action: string; scope: string }>(sql, values);

  const rows = (result as QueryResult<{ user_id: string; resource_slug: string; action: string; scope: string }>).rows;

  const map = new Map<string, PermissionGrant[]>();

  for (const row of rows) {
    if (!map.has(row.user_id)) {
      map.set(row.user_id, []);
    }

    map.get(row.user_id)!.push({
      key: buildPermissionKey(row.resource_slug, row.action, row.scope),
      resource: row.resource_slug,
      action: row.action,
      scope: row.scope,
    });
  }

  return map;
}


export async function createUser(params: {
  name: string;
  email: string;
  passwordHash: string;
  roles: RoleAssignment[];
}) {
  return withTransaction(async (client) => {
    const insertUser = await client.query<{
      id: string;
      name: string;
      email: string;
      is_active: boolean;
      created_at: Date;
      updated_at: Date;
    }>(
      `insert into users (name, email, password_hash)
       values ($1, $2, $3)
       returning id, name, email, is_active, created_at, updated_at`,
      [params.name, params.email, params.passwordHash],
    );

    const user = insertUser.rows[0];

    if (params.roles.length > 0) {
      const roleIds = await loadRoleIds(client, params.roles.map((role) => role.slug));

      for (const role of params.roles) {
        const roleId = roleIds.get(role.slug);
        if (!roleId) {
          throw new AppError(`Unknown role: ${role.slug}`, 400);
        }

        await client.query(
          `insert into user_roles (user_id, role_id, project_id)
           values ($1, $2, $3)
           on conflict do nothing`,
          [user.id, roleId, role.projectId ?? null],
        );
      }
    }

    const permissions = await fetchPermissions(client, [user.id]);

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      isActive: user.is_active,
      createdAt: user.created_at,
      updatedAt: user.updated_at,
      roles: params.roles,
      permissions: permissions.get(user.id) ?? [],
    } satisfies UserRecord;
  });
}

export async function listUsers(): Promise<UserRecord[]> {
  const { rows } = await query<{
    id: string;
    name: string;
    email: string;
    is_active: boolean;
    created_at: Date;
    updated_at: Date;
    role_slug: string | null;
    project_id: string | null;
  }>(
    `select u.id,
            u.name,
            u.email,
            u.is_active,
            u.created_at,
            u.updated_at,
            r.slug as role_slug,
            ur.project_id
       from users u
       left join user_roles ur on ur.user_id = u.id
       left join roles r on r.id = ur.role_id
       order by u.created_at desc`,
  );

  const users = new Map<string, UserRecord>();

  for (const row of rows) {
    if (!users.has(row.id)) {
      users.set(row.id, {
        id: row.id,
        name: row.name,
        email: row.email,
        isActive: row.is_active,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        roles: [],
        permissions: [],
      });
    }

    if (row.role_slug) {
      users.get(row.id)!.roles.push({ slug: row.role_slug, projectId: row.project_id });
    }
  }

  const permissions = await fetchPermissions(null, Array.from(users.keys()));
  for (const [userId, grants] of permissions.entries()) {
    const user = users.get(userId);
    if (user) {
      user.permissions = grants;
    }
  }

  return Array.from(users.values());
}

export async function getUserByEmailWithPassword(email: string): Promise<UserAuthRecord | null> {
  const { rows } = await query<{
    id: string;
    name: string;
    email: string;
    password_hash: string;
    is_active: boolean;
    role_slug: string | null;
    project_id: string | null;
  }>(
    `select u.id,
            u.name,
            u.email,
            u.password_hash,
            u.is_active,
            r.slug as role_slug,
            ur.project_id
       from users u
       left join user_roles ur on ur.user_id = u.id
       left join roles r on r.id = ur.role_id
      where lower(u.email) = lower($1)`,
    [email],
  );

  if (rows.length === 0) {
    return null;
  }

  const roles: RoleAssignment[] = [];

  for (const row of rows) {
    if (row.role_slug) {
      roles.push({ slug: row.role_slug, projectId: row.project_id });
    }
  }

  const base = rows[0];
  const permissions = await fetchPermissions(null, [base.id]);

  return {
    id: base.id,
    name: base.name,
    email: base.email,
    passwordHash: base.password_hash,
    isActive: base.is_active,
    roles,
    permissions: permissions.get(base.id) ?? [],
  } satisfies UserAuthRecord;
}

export async function getUserById(id: string): Promise<UserRecord | null> {
  const { rows } = await query<{
    id: string;
    name: string;
    email: string;
    is_active: boolean;
    created_at: Date;
    updated_at: Date;
    role_slug: string | null;
    project_id: string | null;
  }>(
    `select u.id,
            u.name,
            u.email,
            u.is_active,
            u.created_at,
            u.updated_at,
            r.slug as role_slug,
            ur.project_id
       from users u
       left join user_roles ur on ur.user_id = u.id
       left join roles r on r.id = ur.role_id
      where u.id = $1`,
    [id],
  );

  if (rows.length === 0) {
    return null;
  }

  const roles: RoleAssignment[] = [];

  for (const row of rows) {
    if (row.role_slug) {
      roles.push({ slug: row.role_slug, projectId: row.project_id });
    }
  }

  const base = rows[0];
  const permissions = await fetchPermissions(null, [base.id]);

  return {
    id: base.id,
    name: base.name,
    email: base.email,
    isActive: base.is_active,
    createdAt: base.created_at,
    updatedAt: base.updated_at,
    roles,
    permissions: permissions.get(base.id) ?? [],
  };
}
