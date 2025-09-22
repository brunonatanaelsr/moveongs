import { query, withTransaction } from '../../db';
import { AppError, NotFoundError } from '../../shared/errors';

export type ProjectRecord = {
  id: string;
  name: string;
  slug: string | null;
  description: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type CohortRecord = {
  id: string;
  projectId: string;
  code: string | null;
  weekday: number | null;
  shift: string | null;
  startTime: string | null;
  endTime: string | null;
  capacity: number | null;
  location: string | null;
  createdAt: string;
  educators: Array<{ id: string; name: string | null }>;
};

function mapProject(row: any): ProjectRecord {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    active: row.active,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

function parseEducators(raw: any) {
  if (!raw) {
    return [];
  }

  if (Array.isArray(raw)) {
    return raw;
  }

  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function mapCohort(row: any): CohortRecord {
  const educatorsRaw = parseEducators(row.educators);
  const educators = Array.isArray(educatorsRaw)
    ? educatorsRaw.filter(Boolean).map((item: any) => ({ id: item.id, name: item.name ?? null }))
    : [];

  return {
    id: row.id,
    projectId: row.project_id,
    code: row.code,
    weekday: row.weekday,
    shift: row.shift,
    startTime: row.start_time ? row.start_time.substring(0, 5) : null,
    endTime: row.end_time ? row.end_time.substring(0, 5) : null,
    capacity: row.capacity,
    location: row.location,
    createdAt: row.created_at.toISOString(),
    educators,
  };
}

export async function createProject(params: {
  name: string;
  slug?: string | null;
  description?: string | null;
  active?: boolean;
}): Promise<ProjectRecord> {
  const slug = params.slug?.trim().toLowerCase() ?? null;

  if (slug) {
    const existingSlug = await query('select 1 from projects where slug = $1', [slug]);
    if (existingSlug.rowCount && existingSlug.rowCount > 0) {
      throw new AppError('Project slug already in use', 409);
    }
  }

  const { rows } = await query(
    `insert into projects (name, slug, description, active)
     values ($1, $2, $3, coalesce($4, true))
     returning *`,
    [params.name, slug, params.description ?? null, params.active ?? null],
  );

  return mapProject(rows[0]);
}

export async function updateProject(id: string, params: {
  name?: string;
  slug?: string | null;
  description?: string | null;
  active?: boolean;
}): Promise<ProjectRecord> {
  const current = await query('select * from projects where id = $1', [id]);

  if (current.rowCount === 0) {
    throw new NotFoundError('Project not found');
  }

  const row = current.rows[0];

  const newSlug = params.slug === undefined ? row.slug : params.slug;

  if (newSlug && newSlug !== row.slug) {
    const existing = await query('select 1 from projects where slug = $1 and id <> $2', [newSlug, id]);
    if (existing.rowCount && existing.rowCount > 0) {
      throw new AppError('Project slug already in use', 409);
    }
  }

  await query(
    `update projects set
       name = coalesce($2, name),
       slug = $3,
       description = coalesce($4, description),
       active = coalesce($5, active),
       updated_at = now()
     where id = $1`,
    [
      id,
      params.name ?? null,
      newSlug ?? null,
      params.description ?? null,
      params.active ?? null,
    ],
  );

  const refreshed = await query('select * from projects where id = $1', [id]);
  return mapProject(refreshed.rows[0]);
}

export async function listProjects(params: { includeInactive?: boolean }): Promise<ProjectRecord[]> {
  const { rows } = await query(
    `select * from projects
      where ($1::boolean is true) or active = true
      order by created_at desc`,
    [params.includeInactive ?? false],
  );

  return rows.map(mapProject);
}

export async function getProject(id: string): Promise<ProjectRecord | null> {
  const { rows } = await query('select * from projects where id = $1', [id]);
  if (rows.length === 0) {
    return null;
  }

  return mapProject(rows[0]);
}

async function assertProjectExists(projectId: string) {
  const result = await query('select 1 from projects where id = $1', [projectId]);
  if (result.rowCount === 0) {
    throw new NotFoundError('Project not found');
  }
}

async function fetchCohort(id: string): Promise<CohortRecord> {
  const { rows } = await query(
    `select c.*,
            coalesce(json_agg(json_build_object('id', u.id, 'name', u.name))
              filter (where u.id is not null), '[]') as educators
       from cohorts c
       left join cohort_educators ce on ce.cohort_id = c.id
       left join users u on u.id = ce.user_id
      where c.id = $1
      group by c.id`,
    [id],
  );

  if (rows.length === 0) {
    throw new NotFoundError('Cohort not found');
  }

  return mapCohort(rows[0]);
}

export async function createCohort(projectId: string, params: {
  code?: string | null;
  weekday: number;
  shift: string;
  startTime: string;
  endTime: string;
  capacity?: number | null;
  location?: string | null;
  educatorIds: string[];
}): Promise<CohortRecord> {
  return withTransaction(async (client) => {
    await assertProjectExists(projectId);

    const { rows } = await client.query(
      `insert into cohorts (
         project_id, code, weekday, shift, start_time, end_time, capacity, location
       ) values ($1,$2,$3,$4,$5,$6,$7,$8)
       returning *`,
      [
        projectId,
        params.code ?? null,
        params.weekday,
        params.shift,
        `${params.startTime}:00`,
        `${params.endTime}:00`,
        params.capacity ?? null,
        params.location ?? null,
      ],
    );

    const cohortId = rows[0].id;

    if (params.educatorIds.length > 0) {
      for (const educatorId of params.educatorIds) {
        await client.query(
          `insert into cohort_educators (cohort_id, user_id)
             values ($1, $2)
             on conflict do nothing`,
          [cohortId, educatorId],
        );
      }
    }

    return fetchCohort(cohortId);
  });
}

export async function listCohortsByProject(projectId: string): Promise<CohortRecord[]> {
  await assertProjectExists(projectId);

  const { rows } = await query(
    `select c.*,
            coalesce(json_agg(json_build_object('id', u.id, 'name', u.name))
              filter (where u.id is not null), '[]') as educators
       from cohorts c
       left join cohort_educators ce on ce.cohort_id = c.id
       left join users u on u.id = ce.user_id
      where c.project_id = $1
      group by c.id
      order by c.created_at desc`,
    [projectId],
  );

  return rows.map((row) => mapCohort(row));
}
