import fs from 'fs/promises';
import path from 'path';
import { hash } from 'bcryptjs';
import { randomUUID } from 'crypto';

import { getEnv } from '../config/env';
import { pool } from '../db/pool';
import { logger } from '../config/logger';

type SeedFormTemplate = {
  formType: string;
  schemaVersion: string;
  file: string;
  status?: 'active' | 'inactive';
};

const FORM_TEMPLATE_SEED: SeedFormTemplate[] = [
  { formType: 'anamnese_social', schemaVersion: 'v1', file: 'form.anamnese_social.v1.json' },
  { formType: 'ficha_evolucao', schemaVersion: 'v1', file: 'form.ficha_evolucao.v1.json' },
];

const ROLE_SEED = [
  { slug: 'admin', name: 'Admin' },
  { slug: 'coordenacao', name: 'Coordenação' },
  { slug: 'tecnica', name: 'Técnica de Referência' },
  { slug: 'educadora', name: 'Educadora Social' },
  { slug: 'recepcao', name: 'Atendimento/Recepção' },
  { slug: 'voluntaria', name: 'Voluntária' },
  { slug: 'financeiro', name: 'Financeiro/Administrativo' },
  { slug: 'leitura_externa', name: 'Leitura Externa' },
  { slug: 'beneficiaria', name: 'Beneficiária' },
];

const VULNERABILITY_SEED = [
  { slug: 'nis', label: 'Sem Número NIS' },
  { slug: 'desemprego', label: 'Situação de desemprego' },
  { slug: 'instabilidade_empregatica', label: 'Instabilidade empregatícia' },
  { slug: 'dependencias', label: 'Dependência química' },
  { slug: 'crianca_adolescente', label: 'Criança ou adolescente' },
  { slug: 'idosos', label: 'Idosa/idosos no núcleo familiar' },
  { slug: 'pessoa_com_deficiencia', label: 'Pessoa com deficiência' },
  { slug: 'violencia', label: 'Situação de violência' },
  { slug: 'inseguranca_alimentar', label: 'Insegurança alimentar' },
];

const RESOURCE_SEED = [
  { slug: 'beneficiaries', description: 'Cadastro e acompanhamento de beneficiárias' },
  { slug: 'form_submissions', description: 'Formulários estruturados' },
  { slug: 'projects', description: 'Projetos e oficinas' },
  { slug: 'cohorts', description: 'Turmas / agendas' },
  { slug: 'enrollments', description: 'Inscrições e presença' },
  { slug: 'attendance', description: 'Registro de assiduidade' },
  { slug: 'certificates', description: 'Certificados de participação' },
  { slug: 'profiles', description: 'Perfis de usuários e voluntários' },
  { slug: 'activities', description: 'Atividades e feed interno' },
  { slug: 'analytics', description: 'Relatórios e analytics' },
  { slug: 'consents', description: 'Termos e consentimentos LGPD/Imagem' },
  { slug: 'attachments', description: 'Anexos e arquivos enviados' },
  { slug: 'notifications', description: 'Eventos e webhooks de notificações' },
  { slug: 'audit_logs', description: 'Trilha de auditoria' },
  { slug: 'evolutions', description: 'Registros de evolução/atendimentos' },
  { slug: 'action_plans', description: 'Planos de ação e tarefas' }
];

const PERMISSION_SEED = [
  { resource: 'beneficiaries', action: 'create', scope: 'global', description: 'Criar beneficiárias' },
  { resource: 'beneficiaries', action: 'read', scope: 'global', description: 'Ver beneficiárias' },
  { resource: 'beneficiaries', action: 'update', scope: 'global', description: 'Atualizar beneficiárias' },
  { resource: 'beneficiaries', action: 'delete', scope: 'global', description: 'Excluir beneficiárias' },
  { resource: 'beneficiaries', action: 'read', scope: 'own', description: 'Visualizar perfil próprio (beneficiária)' },

  { resource: 'form_submissions', action: 'create', scope: 'global', description: 'Criar formulários' },
  { resource: 'form_submissions', action: 'read', scope: 'global', description: 'Consultar formulários' },
  { resource: 'form_submissions', action: 'update', scope: 'global', description: 'Atualizar formulários' },
  { resource: 'form_submissions', action: 'delete', scope: 'global', description: 'Remover formulários' },
  { resource: 'form_submissions', action: 'read', scope: 'own', description: 'Visualizar formulários próprios (beneficiária)' },

  { resource: 'projects', action: 'create', scope: 'global', description: 'Criar projetos' },
  { resource: 'projects', action: 'read', scope: 'global', description: 'Consultar projetos' },
  { resource: 'projects', action: 'update', scope: 'global', description: 'Atualizar projetos' },
  { resource: 'projects', action: 'archive', scope: 'global', description: 'Arquivar projetos' },

  { resource: 'cohorts', action: 'create', scope: 'project', description: 'Criar turmas' },
  { resource: 'cohorts', action: 'read', scope: 'project', description: 'Consultar turmas' },
  { resource: 'cohorts', action: 'update', scope: 'project', description: 'Atualizar turmas' },

  { resource: 'enrollments', action: 'create', scope: 'project', description: 'Cadastrar inscrições' },
  { resource: 'enrollments', action: 'read', scope: 'project', description: 'Consultar inscrições' },
  { resource: 'enrollments', action: 'update', scope: 'project', description: 'Atualizar inscrições' },
  { resource: 'enrollments', action: 'attendance', scope: 'project', description: 'Registrar presença' },
  { resource: 'enrollments', action: 'read', scope: 'own', description: 'Beneficiária acompanha inscrição' },

  { resource: 'attendance', action: 'read', scope: 'project', description: 'Relatórios de assiduidade' },

  { resource: 'certificates', action: 'issue', scope: 'project', description: 'Emitir certificados de participação' },
  { resource: 'certificates', action: 'read', scope: 'project', description: 'Consultar certificados emitidos' },
  { resource: 'certificates', action: 'read', scope: 'own', description: 'Beneficiária visualiza certificados próprios' },

  { resource: 'profiles', action: 'read', scope: 'global', description: 'Ver perfis' },
  { resource: 'profiles', action: 'update', scope: 'global', description: 'Atualizar perfis' },
  { resource: 'profiles', action: 'read', scope: 'own', description: 'Visualizar perfil próprio' },
  { resource: 'profiles', action: 'update', scope: 'own', description: 'Atualizar perfil próprio' },

  { resource: 'activities', action: 'create', scope: 'global', description: 'Criar atividade/feed' },
  { resource: 'activities', action: 'read', scope: 'global', description: 'Ler feed interno' },
  { resource: 'activities', action: 'moderate', scope: 'global', description: 'Moderar feed' },
  { resource: 'analytics', action: 'read', scope: 'global', description: 'Consultar dashboards e relatórios' },
  { resource: 'analytics', action: 'export', scope: 'global', description: 'Exportar relatórios' },
  { resource: 'analytics', action: 'read', scope: 'project', description: 'Consultar analytics do projeto' },

  { resource: 'consents', action: 'create', scope: 'global', description: 'Registrar consentimentos' },
  { resource: 'consents', action: 'read', scope: 'global', description: 'Consultar consentimentos' },
  { resource: 'consents', action: 'update', scope: 'global', description: 'Atualizar ou revogar consentimentos' },
  { resource: 'consents', action: 'read', scope: 'own', description: 'Beneficiária visualiza consentimentos próprios' },

  { resource: 'attachments', action: 'upload', scope: 'global', description: 'Enviar arquivos' },
  { resource: 'attachments', action: 'read', scope: 'global', description: 'Visualizar anexos' },
  { resource: 'attachments', action: 'delete', scope: 'global', description: 'Remover anexos' },

  { resource: 'notifications', action: 'manage_webhooks', scope: 'global', description: 'Gerenciar webhooks de notificações' },

  { resource: 'audit_logs', action: 'read', scope: 'global', description: 'Consultar trilha de auditoria' },

  { resource: 'evolutions', action: 'create', scope: 'global', description: 'Registrar evolução/atendimento' },
  { resource: 'evolutions', action: 'read', scope: 'global', description: 'Consultar evoluções' },

  { resource: 'action_plans', action: 'create', scope: 'global', description: 'Criar plano de ação' },
  { resource: 'action_plans', action: 'read', scope: 'global', description: 'Consultar planos de ação' },
  { resource: 'action_plans', action: 'update', scope: 'global', description: 'Atualizar plano de ação' }
];

const ROLE_PERMISSION_MAP: Record<string, string[]> = {
  admin: ['*'],
  coordenacao: [
    'beneficiaries:create',
    'beneficiaries:read',
    'beneficiaries:update',
    'beneficiaries:delete',
    'form_submissions:create',
    'form_submissions:read',
    'form_submissions:update',
    'projects:create',
    'projects:read',
    'projects:update',
    'projects:archive',
    'cohorts:create:project',
    'cohorts:read:project',
    'cohorts:update:project',
    'enrollments:create:project',
    'enrollments:read:project',
    'enrollments:update:project',
    'enrollments:attendance:project',
    'attendance:read:project',
    'certificates:issue:project',
    'certificates:read:project',
    'profiles:read',
    'profiles:update',
    'activities:read',
    'activities:moderate',
    'analytics:read',
    'analytics:export',
    'consents:create',
    'consents:read',
    'consents:update',
    'attachments:upload',
    'attachments:read',
    'attachments:delete',
    'notifications:manage_webhooks',
    'audit_logs:read',
    'evolutions:create',
    'evolutions:read',
    'action_plans:create',
    'action_plans:read',
    'action_plans:update'
  ],
  tecnica: [
    'beneficiaries:read',
    'beneficiaries:update',
    'form_submissions:create',
    'form_submissions:read',
    'form_submissions:update',
    'cohorts:read:project',
    'enrollments:read:project',
    'enrollments:update:project',
    'enrollments:attendance:project',
    'attendance:read:project',
    'certificates:issue:project',
    'certificates:read:project',
    'profiles:read',
    'activities:create',
    'activities:read',
    'analytics:read',
    'consents:create',
    'consents:read',
    'consents:update',
    'attachments:upload',
    'attachments:read',
    'evolutions:create',
    'evolutions:read',
    'action_plans:create',
    'action_plans:read',
    'action_plans:update'
  ],
  educadora: [
    'beneficiaries:read',
    'form_submissions:create',
    'form_submissions:read',
    'cohorts:read:project',
    'enrollments:attendance:project',
    'certificates:read:project',
    'attendance:read:project',
    'profiles:read',
    'activities:create',
    'activities:read',
    'analytics:read:project',
    'attachments:upload',
    'attachments:read',
    'evolutions:create',
    'evolutions:read',
    'action_plans:read',
    'action_plans:update'
  ],
  recepcao: [
    'beneficiaries:create',
    'beneficiaries:read',
    'form_submissions:create',
    'form_submissions:read',
    'certificates:read:project',
    'consents:create',
    'consents:read',
    'attachments:upload',
    'attachments:read',
    'evolutions:create',
    'evolutions:read',
    'action_plans:create',
    'action_plans:read'
  ],
  financeiro: [
    'beneficiaries:read',
    'form_submissions:read',
    'projects:read',
    'profiles:read',
    'attachments:read',
    'certificates:read:project',
    'evolutions:read',
    'action_plans:read'
  ],
  voluntaria: [
    'beneficiaries:read',
    'form_submissions:read',
    'profiles:read',
    'activities:read',
    'attachments:read',
    'certificates:read:project',
    'evolutions:read',
    'action_plans:read'
  ],
  leitura_externa: [
    'beneficiaries:read',
    'form_submissions:read',
    'projects:read',
    'profiles:read',
    'attachments:read',
    'certificates:read:project',
    'evolutions:read',
    'action_plans:read'
  ],
  beneficiaria: [
    'beneficiaries:read:own',
    'form_submissions:read:own',
    'profiles:read:own',
    'profiles:update:own',
    'enrollments:read:own',
    'certificates:read:own',
    'activities:create',
    'activities:read',
    'consents:read:own',
    'evolutions:read',
    'action_plans:read'
  ],
};

function buildPermissionKey(resource: string, action: string, scope: string) {
  return scope === 'global' ? `${resource}:${action}` : `${resource}:${action}:${scope}`;
}

async function seedRoles() {
  for (const role of ROLE_SEED) {
    await pool.query(
      `insert into roles (slug, name)
       values ($1, $2)
       on conflict (slug) do update set name = excluded.name`,
      [role.slug, role.name],
    );
  }
  logger.info({ count: ROLE_SEED.length }, 'seeded roles');
}

async function seedVulnerabilities() {
  for (const vulnerability of VULNERABILITY_SEED) {
    await pool.query(
      `insert into vulnerabilities (slug, label)
       values ($1, $2)
       on conflict (slug) do update set label = excluded.label`,
      [vulnerability.slug, vulnerability.label],
    );
  }
  logger.info({ count: VULNERABILITY_SEED.length }, 'seeded vulnerabilities');
}

async function seedResources() {
  for (const resource of RESOURCE_SEED) {
    await pool.query(
      `insert into resources (slug, description)
       values ($1, $2)
       on conflict (slug) do update set description = excluded.description`,
      [resource.slug, resource.description],
    );
  }
  logger.info({ count: RESOURCE_SEED.length }, 'seeded resources');
}

async function seedPermissions() {
  const resourceMap = new Map<string, number>();
  for (const resource of RESOURCE_SEED) {
    const { rows } = await pool.query<{ id: number }>(
      `select id from resources where slug = $1`,
      [resource.slug],
    );

    if (rows.length === 0) {
      throw new Error(`Resource not found: ${resource.slug}`);
    }

    resourceMap.set(resource.slug, rows[0].id);
  }

  const permissionIds = new Map<string, string>();

  for (const permission of PERMISSION_SEED) {
    const resourceId = resourceMap.get(permission.resource);
    if (!resourceId) {
      throw new Error(`Resource not found for permission seed: ${permission.resource}`);
    }

    const { rows } = await pool.query<{ id: string }>(
      `insert into permissions (id, resource_id, action, scope, description)
       values ($1, $2, $3, $4, $5)
       on conflict (resource_id, action, scope)
       do update set description = excluded.description
       returning id`,
      [randomUUID(), resourceId, permission.action, permission.scope, permission.description],
    );

    const key = buildPermissionKey(permission.resource, permission.action, permission.scope);
    permissionIds.set(key, rows[0].id);
  }

  logger.info({ count: permissionIds.size }, 'seeded permissions');
  return permissionIds;
}

async function seedRolePermissions(permissionIds: Map<string, string>) {
  const roleMap = new Map<string, number>();

  for (const role of ROLE_SEED) {
    const { rows } = await pool.query<{ id: number }>(
      `select id from roles where slug = $1`,
      [role.slug],
    );

    if (rows.length === 0) {
      logger.warn({ roleSlug: role.slug }, 'role not found when preparing permissions');
      continue;
    }

    roleMap.set(role.slug, rows[0].id);
  }

  const allPermissionIds = Array.from(permissionIds.values());

  for (const [roleSlug, grants] of Object.entries(ROLE_PERMISSION_MAP)) {
    const roleId = roleMap.get(roleSlug);
    if (!roleId) {
      logger.warn({ roleSlug }, 'role not found when seeding permissions');
      continue;
    }

    const permissionsForRole = grants.includes('*')
      ? [...allPermissionIds]
      : grants
          .map((grant) => {
            const permissionId = permissionIds.get(grant);
            if (!permissionId) {
              logger.warn({ roleSlug, grant }, 'permission grant not found');
            }
            return permissionId;
          })
          .filter(Boolean) as string[];

    for (const permissionId of permissionsForRole) {
      await pool.query(
        `insert into role_permissions (id, role_id, permission_id)
         values ($1, $2, $3)
         on conflict do nothing`,
        [randomUUID(), roleId, permissionId],
      );
    }
  }

  logger.info('seeded role permissions');
}

async function seedAdminUser() {
  const adminEmail = process.env.SEED_ADMIN_EMAIL ?? 'admin@imm.local';
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? 'ChangeMe123!';

  const { rowCount, rows } = await pool.query<{ id: string }>(
    `select id from users where lower(email) = lower($1)` ,
    [adminEmail],
  );

  let userId = rows[0]?.id;

  if (!rowCount || rowCount === 0) {
    const passwordHash = await hash(adminPassword, 12);
    const newUserId = randomUUID();
    const userInsert = await pool.query<{ id: string }>(
      `insert into users (id, name, email, password_hash)
       values ($1, $2, $3, $4)
       returning id`,
      [newUserId, 'Admin IMM', adminEmail, passwordHash],
    );
    userId = userInsert.rows[0].id;
  }

  if (!userId) {
    throw new Error('admin user id missing after seeding');
  }

  const roleIdResult = await pool.query<{ id: number }>(
    `select id from roles where slug = 'admin'`);

  if (roleIdResult.rowCount === 0) {
    throw new Error('admin role not found after seeding');
  }

  const roleId = roleIdResult.rows[0].id;

  await pool.query(
    `insert into user_roles (id, user_id, role_id, project_id)
     values ($1, $2, $3, null)
     on conflict do nothing`,
    [randomUUID(), userId, roleId],
  );

  await pool.query(
    `insert into user_profiles (user_id, display_name)
     values ($1, $2)
     on conflict (user_id) do update set display_name = excluded.display_name`,
    [userId, 'Admin IMM'],
  );

  logger.info({ email: adminEmail }, 'seeded admin user');
}

type DemoUserSeed = {
  email: string;
  name: string;
  displayName: string;
  roles: Array<{ slug: string; projectSlug?: string | null }>;
};

const DEMO_USERS: DemoUserSeed[] = [
  {
    email: 'coordenacao@imm.local',
    name: 'Coordenação Demo',
    displayName: 'Maria da Coordenação',
    roles: [{ slug: 'coordenacao' }],
  },
  {
    email: 'tecnica@imm.local',
    name: 'Técnica Demo',
    displayName: 'Ana Técnica',
    roles: [{ slug: 'tecnica', projectSlug: 'demo-artesanato' }],
  },
  {
    email: 'educadora@imm.local',
    name: 'Educadora Demo',
    displayName: 'Paula Educadora',
    roles: [{ slug: 'educadora', projectSlug: 'demo-gastronomia' }],
  },
  {
    email: 'financeiro@imm.local',
    name: 'Financeiro Demo',
    displayName: 'Carlos Financeiro',
    roles: [{ slug: 'financeiro' }],
  },
];

async function seedDemoUsers(projectMap: Map<string, string>): Promise<Map<string, string>> {
  const defaultPasswordHash = await hash('ChangeMe123!', 12);
  const roleSlugs = Array.from(new Set(DEMO_USERS.flatMap((user) => user.roles.map((role) => role.slug))));
  const { rows: roleRows } = await pool.query<{ id: number; slug: string }>(
    `select id, slug from roles where slug = any($1)` ,
    [roleSlugs],
  );

  const roleIdMap = new Map(roleRows.map((row) => [row.slug, row.id] as const));
  const userIdMap = new Map<string, string>();

  for (const demoUser of DEMO_USERS) {
    const emailLower = demoUser.email.toLowerCase();
    const existing = await pool.query<{ id: string; name: string }>(
      `select id, name from users where lower(email) = lower($1)` ,
      [demoUser.email],
    );

    let userId = existing.rows[0]?.id;

    if (!userId) {
      const inserted = await pool.query<{ id: string }>(
        `insert into users (id, name, email, password_hash)
         values ($1, $2, $3, $4)
         returning id`,
        [randomUUID(), demoUser.name, demoUser.email, defaultPasswordHash],
      );
      userId = inserted.rows[0]?.id ?? null;
    } else if (existing.rows[0]?.name !== demoUser.name) {
      await pool.query(
        `update users set name = $2 where id = $1`,
        [userId, demoUser.name],
      );
    }

    if (!userId) {
      logger.warn({ email: demoUser.email }, 'failed to ensure demo user');
      continue;
    }

    userIdMap.set(emailLower, userId);

    await pool.query(
      `insert into user_profiles (user_id, display_name)
       values ($1, $2)
       on conflict (user_id) do update set display_name = excluded.display_name`,
      [userId, demoUser.displayName],
    );

    for (const role of demoUser.roles) {
      const roleId = roleIdMap.get(role.slug);
      if (!roleId) {
        logger.warn({ role: role.slug }, 'demo role not found when seeding users');
        continue;
      }

      const projectId = role.projectSlug ? projectMap.get(role.projectSlug) ?? null : null;
      const existingRole = await pool.query<{ id: string; project_id: string | null }>(
        `select id, project_id from user_roles where user_id = $1 and role_id = $2 limit 1`,
        [userId, roleId],
      );

      if (existingRole.rowCount === 0) {
        await pool.query(
          `insert into user_roles (id, user_id, role_id, project_id)
           values ($1, $2, $3, $4)`,
          [randomUUID(), userId, roleId, projectId],
        );
      } else if ((existingRole.rows[0].project_id ?? null) !== (projectId ?? null)) {
        await pool.query(
          `update user_roles set project_id = $2 where id = $1`,
          [existingRole.rows[0].id, projectId],
        );
      }
    }
  }

  logger.info({ count: userIdMap.size }, 'seeded demo users');
  return userIdMap;
}

async function seedDemoEvolutions(
  beneficiaries: Array<{ id: string; full_name: string }>,
  createdBy: string | null,
) {
  if (beneficiaries.length === 0) {
    return;
  }

  const categories = ['Atendimento social', 'Acompanhamento psicológico', 'Encaminhamento'];
  const responsibles = ['Equipe Técnica', 'Coordenação MoveONgs', 'Rede Parceira'];

  for (const [index, benef] of beneficiaries.slice(0, 10).entries()) {
    const events = [
      {
        description: `Atendimento inicial de ${benef.full_name.split(' ')[0] ?? 'beneficiária'} com acolhimento e definição de plano.`,
        category: categories[index % categories.length],
        requiresSignature: index % 2 === 0,
      },
      {
        description: 'Reunião de acompanhamento mensal com atualização de metas.',
        category: 'Acompanhamento',
        requiresSignature: false,
      },
    ];

    for (const [eventIndex, event] of events.entries()) {
      const date = new Date(Date.now() - (index * 10 + eventIndex * 5) * 86_400_000);
      await pool.query(
        `insert into evolutions (id, beneficiary_id, date, description, category, responsible, requires_signature, created_by)
         select $1, $2, $3, $4, $5, $6, $7, $8
         where not exists (
           select 1 from evolutions
            where beneficiary_id = $2
              and date = $3
              and description = $4
         )`,
        [
          randomUUID(),
          benef.id,
          date,
          event.description,
          event.category,
          responsibles[(index + eventIndex) % responsibles.length],
          event.requiresSignature,
          createdBy,
        ],
      );
    }
  }

  logger.info('seeded demo evolutions');
}

async function seedDemoFeed(
  projectMap: Map<string, string>,
  userIdMap: Map<string, string>,
) {
  const posts = [
    {
      title: 'Boas-vindas ao ciclo de Artesanato',
      body: 'Esta semana retomamos as oficinas com foco em renda extra. Confiram o calendário no mural da sala 1.',
      projectSlug: 'demo-artesanato',
      tags: ['boas-vindas', 'artesanato'],
      visibility: 'project',
      authorEmail: 'tecnica@imm.local',
      daysAgo: 7,
      comments: [
        { authorEmail: 'coordenacao@imm.local', body: 'Obrigada pela atualização! Equipe preparada para apoiar.' },
        { authorEmail: 'educadora@imm.local', body: 'Participantes animadas e presentes nas primeiras aulas.' },
      ],
    },
    {
      title: 'Agenda Gastronômica da Semana',
      body: 'Teremos aula prática de panificação social na quarta-feira. Levem avental e recipiente para levar as produções.',
      projectSlug: 'demo-gastronomia',
      tags: ['agenda', 'gastronomia'],
      visibility: 'project',
      authorEmail: 'educadora@imm.local',
      daysAgo: 4,
      comments: [
        { authorEmail: 'coordenacao@imm.local', body: 'Vamos registrar imagens para o relatório mensal.' },
      ],
    },
    {
      title: 'Comunicado geral de segurança',
      body: 'Reforçamos que todas as visitas externas devem assinar o termo LGPD e usar crachá identificado.',
      projectSlug: null,
      tags: ['comunicado', 'lgpd'],
      visibility: 'internal',
      authorEmail: 'coordenacao@imm.local',
      daysAgo: 2,
      comments: [
        { authorEmail: 'financeiro@imm.local', body: 'Portaria já avisada, alinharemos com voluntariado.' },
      ],
    },
  ];

  for (const post of posts) {
    const authorId = userIdMap.get(post.authorEmail);
    if (!authorId) {
      logger.warn({ authorEmail: post.authorEmail }, 'demo post skipped: author missing');
      continue;
    }

    const projectId = post.projectSlug ? projectMap.get(post.projectSlug) ?? null : null;
    const publishedAt = new Date(Date.now() - post.daysAgo * 86_400_000);
    const postId = randomUUID();

    const inserted = await pool.query<{ id: string }>(
      `insert into posts (id, project_id, author_id, title, body, tags, visibility, published_at)
       select $1, $2, $3, $4, $5, $6, $7, $8
       where not exists (select 1 from posts where author_id = $3 and title = $4)
       returning id`,
      [postId, projectId, authorId, post.title, post.body, post.tags, post.visibility, publishedAt],
    );

    const effectivePostId = inserted.rows[0]?.id
      ?? (await pool.query<{ id: string }>(
        `select id from posts where author_id = $1 and title = $2 limit 1`,
        [authorId, post.title],
      )).rows[0]?.id;

    if (!effectivePostId) {
      continue;
    }

    for (const comment of post.comments) {
      const commenterId = userIdMap.get(comment.authorEmail);
      if (!commenterId) {
        continue;
      }

      await pool.query(
        `insert into comments (id, post_id, author_id, body)
         select $1, $2, $3, $4
         where not exists (
           select 1 from comments where post_id = $2 and author_id = $3 and body = $4
         )`,
        [randomUUID(), effectivePostId, commenterId, comment.body],
      );
    }
  }

  logger.info('seeded demo feed posts');
}

async function seedDemoMessages(
  projectMap: Map<string, string>,
  userIdMap: Map<string, string>,
) {
  const threads = [
    {
      scope: projectMap.get('demo-artesanato') ?? 'demo-artesanato',
      subject: 'Acompanhamento Artesanato - Março',
      visibility: 'project',
      createdBy: 'tecnica@imm.local',
      memberEmails: ['coordenacao@imm.local', 'educadora@imm.local'],
      messages: [
        {
          authorEmail: 'tecnica@imm.local',
          body: 'Equipe, registramos evolução de 80% das participantes com presença completa nas duas últimas oficinas.',
          visibility: 'project',
          isConfidential: false,
        },
        {
          authorEmail: 'coordenacao@imm.local',
          body: 'Excelente! Vamos preparar material para apresentação ao conselho.',
          visibility: 'project',
          isConfidential: false,
        },
      ],
    },
    {
      scope: 'comite-lgpd',
      subject: 'Checklist LGPD mensal',
      visibility: 'internal',
      createdBy: 'coordenacao@imm.local',
      memberEmails: ['financeiro@imm.local', 'tecnica@imm.local'],
      messages: [
        {
          authorEmail: 'coordenacao@imm.local',
          body: 'Favor revisar consentimentos pendentes antes do relatório trimestral.',
          visibility: 'internal',
          isConfidential: false,
        },
        {
          authorEmail: 'financeiro@imm.local',
          body: 'Planilha consolidada anexada. Apenas 3 casos aguardando atualização.',
          visibility: 'internal',
          isConfidential: true,
        },
      ],
    },
  ];

  for (const thread of threads) {
    const creatorId = userIdMap.get(thread.createdBy);
    if (!creatorId) {
      logger.warn({ createdBy: thread.createdBy }, 'demo thread skipped: creator missing');
      continue;
    }

    const threadId = randomUUID();
    const inserted = await pool.query<{ id: string }>(
      `insert into threads (id, scope, created_by, subject, visibility)
       select $1, $2, $3, $4, $5
       where not exists (select 1 from threads where scope = $2 and subject = $4)
       returning id`,
      [threadId, thread.scope, creatorId, thread.subject, thread.visibility],
    );

    const effectiveThreadId = inserted.rows[0]?.id
      ?? (await pool.query<{ id: string }>(
        `select id from threads where scope = $1 and subject = $2 limit 1`,
        [thread.scope, thread.subject],
      )).rows[0]?.id;

    if (!effectiveThreadId) {
      continue;
    }

    const memberIds = new Set<string>();
    memberIds.add(creatorId);
    for (const email of thread.memberEmails) {
      const memberId = userIdMap.get(email);
      if (memberId) {
        memberIds.add(memberId);
      }
    }

    for (const memberId of memberIds) {
      await pool.query(
        `insert into thread_members (thread_id, user_id)
         values ($1, $2)
         on conflict do nothing`,
        [effectiveThreadId, memberId],
      );
    }

    for (const message of thread.messages) {
      const authorId = userIdMap.get(message.authorEmail);
      if (!authorId) {
        continue;
      }

      await pool.query(
        `insert into messages (id, thread_id, author_id, body, visibility, is_confidential)
         select $1, $2, $3, $4, $5, $6
         where not exists (
           select 1 from messages where thread_id = $2 and author_id = $3 and body = $4
         )`,
        [
          randomUUID(),
          effectiveThreadId,
          authorId,
          message.body,
          message.visibility ?? thread.visibility,
          message.isConfidential ?? false,
        ],
      );
    }
  }

  logger.info('seeded demo message threads');
}

async function seedFormTemplates() {
  const baseDir = path.join(__dirname, '../../artifacts/json_schemas');

  for (const template of FORM_TEMPLATE_SEED) {
    const schemaPath = path.join(baseDir, template.file);
    let schema: unknown;

    try {
      const raw = await fs.readFile(schemaPath, 'utf8');
      schema = JSON.parse(raw);
    } catch (error) {
      logger.error({ schemaPath, err: error }, 'failed to load form template schema');
      throw error;
    }

    const status = template.status ?? 'active';
    const existing = await pool.query<{ id: string; status: string }>(
      `select id, status from form_templates where form_type = $1 and schema_version = $2`,
      [template.formType, template.schemaVersion],
    );

    if (existing.rowCount && existing.rowCount > 0) {
      const row = existing.rows[0];
      await pool.query(
        `update form_templates set
           schema = $2,
           status = $3,
           published_at = case
             when $3 = 'active' and status <> 'active' then now()
             when $3 <> 'active' then null
             else published_at
           end
         where id = $1`,
        [row.id, schema, status],
      );
      logger.info(
        { formType: template.formType, schemaVersion: template.schemaVersion },
        'updated seeded form template',
      );
      continue;
    }

    const id = randomUUID();

    await pool.query(
      `insert into form_templates (id, form_type, schema_version, schema, status, published_at)
       values ($1, $2, $3, $4, $5, case when $5 = 'active' then now() else null end)`,
      [id, template.formType, template.schemaVersion, schema, status],
    );

    logger.info(
      { formType: template.formType, schemaVersion: template.schemaVersion },
      'seeded form template',
    );
  }
}

export async function seedDatabase() {
  getEnv();
  await seedRoles();
  await seedVulnerabilities();
  await seedResources();
  const permissionIds = await seedPermissions();
  await seedRolePermissions(permissionIds);
  await seedAdminUser();
  await seedFormTemplates();
  await seedDemoData();
  logger.info('Seed completed');
}

async function run() {
  try {
    await seedDatabase();
  } catch (error) {
    logger.error({ err: error }, 'Seed failed');
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  run();
}

const SHOULD_SEED_DEMO = (process.env.SEED_DEMO_DATA ?? '').toLowerCase() === 'true' || (process.env.SEED_DEMO_DATA ?? '') === '1';

async function seedDemoData() {
  if (!SHOULD_SEED_DEMO) {
    return;
  }

  const demoSlugs = ['demo-artesanato', 'demo-gastronomia'];
  const { rows: existing } = await pool.query<{ slug: string }>(
    `select slug from projects where slug = any($1)` ,
    [demoSlugs],
  );

  const hasAllProjects = existing.length === demoSlugs.length;
  if (hasAllProjects) {
    logger.info('Demo projects already present; refreshing demo fixtures');
  } else {
    logger.info('Seeding demo analytics dataset');
  }

  const projects = await pool.query<{ id: string; slug: string }>(
    `insert into projects (name, slug, description, active)
       values
         ('Projeto Artesanato', 'demo-artesanato', 'Oficinas de artesanato para geração de renda', true),
         ('Projeto Gastronomia', 'demo-gastronomia', 'Capacitação em gastronomia social', true)
     on conflict (slug) do update set description = excluded.description
     returning id, slug`,
  );

  const projectMap = new Map(projects.rows.map((row) => [row.slug, row.id] as const));
  const demoUserIds = await seedDemoUsers(projectMap);

  const cohortRows = await pool.query<{ id: string }>(
    `insert into cohorts (project_id, code, weekday, shift, start_time, end_time, capacity, location)
       values
         ($1, 'ART-MANHA', 1, 'manha', '08:00', '10:00', 20, 'Sala 1'),
         ($1, 'ART-TARDE', 3, 'tarde', '14:00', '16:00', 18, 'Sala 1'),
         ($2, 'GAST-MANHA', 2, 'manha', '09:00', '11:00', 18, 'Cozinha Escola'),
         ($2, 'GAST-NOITE', 4, 'noite', '19:00', '21:00', 22, 'Cozinha Escola')
     on conflict do nothing
     returning id`,
    [projectMap.get('demo-artesanato'), projectMap.get('demo-gastronomia')],
  );

  let cohortIds = cohortRows.rows.map((row) => row.id);
  if (cohortIds.length === 0) {
    const fallback = await pool.query<{ id: string }>(
      `select id from cohorts where project_id = any($1)` ,
      [[...projectMap.values()]],
    );
    cohortIds = fallback.rows.map((row) => row.id);
  }

  const neighborhoods = ['Bom Jardim', 'Jardim Catarina', 'Centro', 'Porto da Pedra', 'Nova Cidade'];
  const beneficiaryValues: string[] = [];
  for (let i = 0; i < 40; i += 1) {
    const name = `Demo Beneficiaria ${i + 1}`;
    const birthYear = 1980 + (i % 25);
    const birthMonth = ((i % 12) + 1).toString().padStart(2, '0');
    const birthDay = ((i % 27) + 1).toString().padStart(2, '0');
    const birthDate = `${birthYear}-${birthMonth}-${birthDay}`;
    const neighborhood = neighborhoods[i % neighborhoods.length];
    beneficiaryValues.push(`('${name}', '${birthDate}', '${neighborhood}')`);
  }

  await pool.query(
    `insert into beneficiaries (full_name, birth_date, neighborhood)
       values ${beneficiaryValues.join(', ')}
       on conflict (full_name) do nothing`,
  );

  const { rows: beneficiaries } = await pool.query<{ id: string; full_name: string }>(
    `select id, full_name from beneficiaries where full_name like 'Demo Beneficiaria %'`,
  );

  const evolutionAuthor = demoUserIds.get('tecnica@imm.local')
    ?? demoUserIds.get('coordenacao@imm.local')
    ?? null;
  await seedDemoEvolutions(beneficiaries, evolutionAuthor);

  const enrollmentRows: Array<{ beneficiary_id: string; cohort_id: string; status: string; enrolled_at: string; terminated_at: string | null }> = [];
  const startDate = Date.now() - 90 * 86_400_000;
  const cohortCount = cohortIds.length;

  beneficiaries.forEach((benef, index) => {
    const cohortId = cohortIds[index % cohortCount];
    const status = index % 9 === 0 ? 'terminated' : 'active';
    const enrolledAt = new Date(startDate + (index % 20) * 86_400_000).toISOString().slice(0, 10);
    const terminatedAt = status === 'terminated'
      ? new Date(startDate + (index % 20 + 60) * 86_400_000).toISOString().slice(0, 10)
      : null;
    enrollmentRows.push({ beneficiary_id: benef.id, cohort_id: cohortId, status, enrolled_at: enrolledAt, terminated_at: terminatedAt });
  });

  for (const row of enrollmentRows) {
    await pool.query(
      `insert into enrollments (beneficiary_id, cohort_id, status, enrolled_at, terminated_at)
         values ($1, $2, $3, $4, $5)
         on conflict (beneficiary_id, cohort_id) do update set status = excluded.status, terminated_at = excluded.terminated_at`,
      [row.beneficiary_id, row.cohort_id, row.status, row.enrolled_at, row.terminated_at],
    );
  }

  const { rows: attendanceSource } = await pool.query<{ id: string; cohort_id: string }>(
    `select id, cohort_id from enrollments where beneficiary_id in (select id from beneficiaries where full_name like 'Demo Beneficiaria %')`,
  );

  for (const enrollment of attendanceSource) {
    const { rows: cohortInfo } = await pool.query<{ weekday: number }>(
      `select weekday from cohorts where id = $1`,
      [enrollment.cohort_id],
    );
    const weekday = cohortInfo[0]?.weekday ?? 1;
    const dates = generateSessionDates(weekday, 12);
    for (const date of dates) {
      const present = Math.random() > 0.22;
      await pool.query(
        `insert into attendance (enrollment_id, date, present, recorded_by)
           values ($1, $2, $3, null)
           on conflict (enrollment_id, date) do update set present = excluded.present`,
        [enrollment.id, date, present],
      );
    }
  }

  const { rows: vulnerabilities } = await pool.query<{ id: number }>('select id from vulnerabilities');
  for (const benef of beneficiaries) {
    const selected = vulnerabilities
      .filter((_, idx) => (benef.full_name.charCodeAt(0) + idx) % 3 === 0)
      .slice(0, 2);
    for (const vuln of selected) {
      await pool.query(
        `insert into beneficiary_vulnerabilities (beneficiary_id, vulnerability_id)
           values ($1, $2)
           on conflict do nothing`,
        [benef.id, vuln.id],
      );
    }
  }

  for (const benef of beneficiaries.slice(0, 25)) {
    await pool.query(
      `insert into consents (beneficiary_id, type, text_version, granted, granted_at)
         values ($1, 'lgpd', 'demo-v1', true, now() - interval '30 days')
         on conflict (beneficiary_id, type) do update set granted = excluded.granted, granted_at = excluded.granted_at`,
      [benef.id],
    );
  }

  for (const benef of beneficiaries.slice(25, 35)) {
    await pool.query(
      `insert into consents (beneficiary_id, type, text_version, granted, granted_at, revoked_at)
         values ($1, 'lgpd', 'demo-v1', false, null, now() - interval '10 days')
         on conflict do update set granted = excluded.granted, revoked_at = excluded.revoked_at`,
      [benef.id],
    );
  }

  const { rows: users } = await pool.query<{ id: string }>(`select id from users order by created_at asc limit 1`);
  const createdBy = demoUserIds.get('tecnica@imm.local')
    ?? demoUserIds.get('coordenacao@imm.local')
    ?? users[0]?.id
    ?? null;

  if (createdBy) {
    const planTargets = beneficiaries.slice(0, 12);
    for (const [index, benef] of planTargets.entries()) {
      const { rows: planRows } = await pool.query<{ id: string }>(
        `insert into action_plans (beneficiary_id, created_by, status)
           values ($1, $2, 'active')
           returning id`,
        [benef.id, createdBy],
      );
      const planId = planRows[0]?.id;
      if (!planId) continue;
      const statuses = ['pending', 'in_progress', 'done', 'blocked'];
      for (let i = 0; i < 3; i += 1) {
        const status = statuses[(index + i) % statuses.length];
        await pool.query(
          `insert into action_items (action_plan_id, title, due_date, status)
             values ($1, $2, $3, $4)
             on conflict do nothing`,
          [planId, `Ação ${i + 1}`, new Date(Date.now() + i * 7 * 86_400_000).toISOString().slice(0, 10), status],
        );
      }
    }
  }

  await seedDemoFeed(projectMap, demoUserIds);
  await seedDemoMessages(projectMap, demoUserIds);

  logger.info('Demo dataset ready');
}

function generateSessionDates(weekday: number, weeks: number): string[] {
  const today = new Date();
  const sessions: string[] = [];
  for (let i = 0; i < weeks; i += 1) {
    const base = new Date(today.getTime() - i * 7 * 86_400_000);
    const adjusted = adjustToWeekday(base, weekday);
    sessions.push(adjusted.toISOString().slice(0, 10));
  }
  return sessions;
}

function adjustToWeekday(base: Date, weekday: number): Date {
  const diff = (weekday - base.getUTCDay() + 7) % 7;
  return new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate() + diff));
}
