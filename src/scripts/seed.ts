import { hash } from 'bcryptjs';

import { getEnv } from '../config/env';
import { pool } from '../db/pool';
import { logger } from '../config/logger';

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

async function seedAdminUser() {
  const adminEmail = process.env.SEED_ADMIN_EMAIL ?? 'admin@imm.local';
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? 'ChangeMe123!';

  const { rowCount } = await pool.query<{ id: string }>(
    `select id from users where lower(email) = lower($1)` ,
    [adminEmail],
  );

  if (rowCount && rowCount > 0) {
    logger.info({ email: adminEmail }, 'admin user already exists');
    return;
  }

  const passwordHash = await hash(adminPassword, 12);

  const userInsert = await pool.query<{ id: string }>(
    `insert into users (name, email, password_hash)
     values ($1, $2, $3)
     returning id`,
    ['Admin IMM', adminEmail, passwordHash],
  );

  const userId = userInsert.rows[0].id;

  const roleIdResult = await pool.query<{ id: number }>(
    `select id from roles where slug = 'admin'`);

  if (roleIdResult.rowCount === 0) {
    throw new Error('admin role not found after seeding');
  }

  const roleId = roleIdResult.rows[0].id;

  await pool.query(
    `insert into user_roles (user_id, role_id, project_id)
     values ($1, $2, null)
     on conflict do nothing`,
    [userId, roleId],
  );

  logger.info({ email: adminEmail }, 'seeded admin user');
}

export async function seedDatabase() {
  getEnv();
  await seedRoles();
  await seedVulnerabilities();
  await seedAdminUser();
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
