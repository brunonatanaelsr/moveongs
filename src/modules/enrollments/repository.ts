import { query, withTransaction } from '../../db';
import { AppError, ForbiddenError, NotFoundError } from '../../shared/errors';

function appendScopeCondition(
  conditions: string[],
  values: unknown[],
  column: string,
  scopes?: string[] | null,
) {
  if (!scopes || scopes.length === 0) {
    return;
  }

  const placeholders = scopes.map((scope) => {
    values.push(scope);
    return `$${values.length}`;
  });

  conditions.push(`${column} in (${placeholders.join(', ')})`);
}

function parseJson(value: any) {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === 'object') {
    return value;
  }
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export type EnrollmentRecord = {
  id: string;
  beneficiaryId: string;
  beneficiaryName: string;
  cohortId: string;
  cohortCode: string | null;
  projectId: string;
  projectName: string;
  status: string;
  enrolledAt: string;
  terminatedAt: string | null;
  terminationReason: string | null;
  agreementAcceptance: Record<string, unknown> | null;
  attendance: {
    totalSessions: number;
    presentSessions: number;
    attendanceRate: number | null;
  };
  createdAt: string;
  updatedAt: string;
};

export type AttendanceRecord = {
  id: string;
  enrollmentId: string;
  date: string;
  present: boolean;
  justification: string | null;
  recordedBy: string | null;
  createdAt: string;
};

async function assertBeneficiaryExists(id: string) {
  const result = await query('select 1 from beneficiaries where id = $1', [id]);
  if (result.rowCount === 0) {
    throw new NotFoundError('Beneficiary not found');
  }
}

async function getCohort(id: string, allowedProjectIds?: string[] | null) {
  const result = await query('select id, project_id from cohorts where id = $1', [id]);
  if (result.rowCount === 0) {
    throw new NotFoundError('Cohort not found');
  }

  const row = result.rows[0];
  const scopes = allowedProjectIds && allowedProjectIds.length > 0 ? allowedProjectIds : null;
  if (scopes && !scopes.includes(row.project_id)) {
    throw new ForbiddenError('Cohort belongs to a restricted project');
  }

  return row;
}

function mapEnrollmentRow(row: any): EnrollmentRecord {
  const totalSessions = Number(row.total_sessions ?? 0);
  const presentSessions = Number(row.present_sessions ?? 0);
  const attendanceRate = totalSessions > 0 ? presentSessions / totalSessions : null;

  return {
    id: row.id,
    beneficiaryId: row.beneficiary_id,
    beneficiaryName: row.beneficiary_name,
    cohortId: row.cohort_id,
    cohortCode: row.cohort_code,
    projectId: row.project_id,
    projectName: row.project_name,
    status: row.status,
    enrolledAt: row.enrolled_at.toISOString().substring(0, 10),
    terminatedAt: row.terminated_at ? row.terminated_at.toISOString().substring(0, 10) : null,
    terminationReason: row.termination_reason,
    agreementAcceptance: parseJson(row.agreement_acceptance),
    attendance: {
      totalSessions,
      presentSessions,
      attendanceRate,
    },
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

export async function createEnrollment(params: {
  beneficiaryId: string;
  cohortId: string;
  enrolledAt?: string;
  status?: string;
  agreementAcceptance?: Record<string, unknown> | null;
  allowedProjectIds?: string[] | null;
}): Promise<EnrollmentRecord> {
  return withTransaction(async (client) => {
    await assertBeneficiaryExists(params.beneficiaryId);
    await getCohort(params.cohortId, params.allowedProjectIds ?? null);

    const existing = await client.query(
      `select 1 from enrollments
        where beneficiary_id = $1 and cohort_id = $2 and status = 'active'`,
      [params.beneficiaryId, params.cohortId],
    );

    if (existing.rowCount && existing.rowCount > 0 && (params.status ?? 'active') === 'active') {
      throw new AppError('Beneficiary already enrolled and active in this cohort', 409);
    }

    const { rows } = await client.query(
      `insert into enrollments (
         beneficiary_id, cohort_id, status, enrolled_at, agreement_acceptance
       ) values ($1,$2,$3,coalesce($4, current_date), $5)
       returning id`,
      [
        params.beneficiaryId,
        params.cohortId,
        params.status ?? 'active',
        params.enrolledAt ?? null,
        params.agreementAcceptance ? JSON.stringify(params.agreementAcceptance) : null,
      ],
    );

    const enrollmentId = rows[0].id;
    const enrollment = await getEnrollmentById(enrollmentId, params.allowedProjectIds ?? null);
    if (!enrollment) {
      throw new AppError('Failed to load enrollment after creation', 500);
    }

    return enrollment;
  });
}

export async function updateEnrollment(id: string, params: {
  status?: string;
  terminatedAt?: string;
  terminationReason?: string | null;
  allowedProjectIds?: string[] | null;
}): Promise<EnrollmentRecord> {
  const current = await getEnrollmentById(id, params.allowedProjectIds ?? null);
  if (!current) {
    throw new NotFoundError('Enrollment not found');
  }

  const normalizedTerminationReason = (() => {
    if (typeof params.terminationReason === 'string') {
      const trimmed = params.terminationReason.trim();
      return trimmed.length > 0 ? trimmed : null;
    }

    return params.terminationReason ?? null;
  })();

  if (params.status === 'terminated') {
    if (!normalizedTerminationReason) {
      throw new AppError('terminationReason is required when terminating an enrollment');
    }

    if (!params.terminatedAt) {
      throw new AppError('terminatedAt is required when terminating an enrollment');
    }
  }

  await query(
    `update enrollments set
       status = coalesce($2, status),
       terminated_at = coalesce($3::date, terminated_at),
       termination_reason = coalesce($4, termination_reason),
       updated_at = now()
     where id = $1`,
    [id, params.status ?? null, params.terminatedAt ?? null, normalizedTerminationReason],
  );

  const enrollment = await getEnrollmentById(id, params.allowedProjectIds ?? null);
  if (!enrollment) {
    throw new AppError('Failed to load enrollment after update', 500);
  }

  return enrollment;
}

export async function getEnrollmentById(
  id: string,
  allowedProjectIds?: string[] | null,
): Promise<EnrollmentRecord | null> {
  const scopes = allowedProjectIds && allowedProjectIds.length > 0 ? allowedProjectIds : null;
  const values: unknown[] = [id];
  const conditions = [`e.id = $1`];

  appendScopeCondition(conditions, values, 'c.project_id', scopes);

  const whereClause = `where ${conditions.join(' and ')}`;

  const { rows } = await query(
    `select e.id,
            e.beneficiary_id,
            e.cohort_id,
            e.status,
            e.enrolled_at,
            e.terminated_at,
            e.termination_reason,
            e.agreement_acceptance,
            e.created_at,
            e.updated_at,
            b.full_name as beneficiary_name,
            c.code as cohort_code,
            c.project_id,
            p.name as project_name,
            coalesce(sum(case when a.present then 1 else 0 end), 0) as present_sessions,
            count(a.id) as total_sessions
       from enrollments e
       join beneficiaries b on b.id = e.beneficiary_id
       join cohorts c on c.id = e.cohort_id
       join projects p on p.id = c.project_id
       left join attendance a on a.enrollment_id = e.id
      ${whereClause}
      group by e.id, e.beneficiary_id, e.cohort_id, e.status, e.enrolled_at,
               e.terminated_at, e.termination_reason, e.agreement_acceptance,
               e.created_at, e.updated_at,
               b.full_name, c.code, c.project_id, p.name`,
    values,
  );

  if (rows.length === 0) {
    return null;
  }

  return mapEnrollmentRow(rows[0]);
}

export async function listEnrollments(params: {
  beneficiaryId?: string;
  cohortId?: string;
  projectId?: string;
  status?: string;
  activeOnly?: boolean;
  limit: number;
  offset: number;
  allowedProjectIds?: string[] | null;
}): Promise<EnrollmentRecord[]> {
  const scopes = params.allowedProjectIds && params.allowedProjectIds.length > 0 ? params.allowedProjectIds : null;
  const values: unknown[] = [];
  const conditions: string[] = [];

  if (params.beneficiaryId) {
    values.push(params.beneficiaryId);
    conditions.push(`e.beneficiary_id = $${values.length}`);
  }

  if (params.cohortId) {
    values.push(params.cohortId);
    conditions.push(`e.cohort_id = $${values.length}`);
  }

  if (params.projectId) {
    values.push(params.projectId);
    conditions.push(`c.project_id = $${values.length}`);
  }

  if (params.status) {
    values.push(params.status);
    conditions.push(`e.status = $${values.length}`);
  }

  if (params.activeOnly) {
    conditions.push(`e.status = 'active'`);
  }

  appendScopeCondition(conditions, values, 'c.project_id', scopes);

  const whereClause = conditions.length > 0 ? `where ${conditions.join(' and ')}` : '';

  const limitIndex = values.push(params.limit);
  const offsetIndex = values.push(params.offset);

  const { rows } = await query(
    `select e.id,
            e.beneficiary_id,
            e.cohort_id,
            e.status,
            e.enrolled_at,
            e.terminated_at,
            e.termination_reason,
            e.agreement_acceptance,
            e.created_at,
            e.updated_at,
            b.full_name as beneficiary_name,
            c.code as cohort_code,
            c.project_id,
            p.name as project_name,
            coalesce(sum(case when a.present then 1 else 0 end), 0) as present_sessions,
            count(a.id) as total_sessions
       from enrollments e
       join beneficiaries b on b.id = e.beneficiary_id
       join cohorts c on c.id = e.cohort_id
       join projects p on p.id = c.project_id
       left join attendance a on a.enrollment_id = e.id
      ${whereClause}
      group by e.id, e.beneficiary_id, e.cohort_id, e.status, e.enrolled_at,
               e.terminated_at, e.termination_reason, e.agreement_acceptance,
               e.created_at, e.updated_at,
               b.full_name, c.code, c.project_id, p.name
      order by e.enrolled_at desc
      limit $${limitIndex} offset $${offsetIndex}`,
    values,
  );

  return rows.map(mapEnrollmentRow);
}

export async function upsertAttendance(params: {
  enrollmentId: string;
  date: string;
  present: boolean;
  justification?: string | null;
  recordedBy?: string | null;
  allowedProjectIds?: string[] | null;
}): Promise<AttendanceRecord> {
  await getEnrollmentByIdOrFail(params.enrollmentId, params.allowedProjectIds ?? null);

  const { rows } = await query(
    `insert into attendance (enrollment_id, date, present, justification, recorded_by)
       values ($1, $2, $3, $4, $5)
       on conflict (enrollment_id, date)
       do update set present = excluded.present,
                     justification = excluded.justification,
                     recorded_by = excluded.recorded_by,
                     created_at = now()
       returning *`,
    [
      params.enrollmentId,
      params.date,
      params.present,
      params.justification ?? null,
      params.recordedBy ?? null,
    ],
  );

  return mapAttendanceRow(rows[0]);
}

function mapAttendanceRow(row: any): AttendanceRecord {
  return {
    id: row.id,
    enrollmentId: row.enrollment_id,
    date: row.date.toISOString().substring(0, 10),
    present: row.present,
    justification: row.justification,
    recordedBy: row.recorded_by,
    createdAt: row.created_at.toISOString(),
  };
}

async function getEnrollmentByIdOrFail(id: string, allowedProjectIds?: string[] | null) {
  const enrollment = await getEnrollmentById(id, allowedProjectIds ?? null);
  if (!enrollment) {
    throw new NotFoundError('Enrollment not found');
  }
}

export async function listAttendance(params: {
  enrollmentId: string;
  startDate?: string;
  endDate?: string;
  allowedProjectIds?: string[] | null;
}): Promise<AttendanceRecord[]> {
  await getEnrollmentByIdOrFail(params.enrollmentId, params.allowedProjectIds ?? null);

  const { rows } = await query(
    `select * from attendance
      where enrollment_id = $1
        and ($2::date is null or date >= $2)
        and ($3::date is null or date <= $3)
      order by date desc`,
    [params.enrollmentId, params.startDate ?? null, params.endDate ?? null],
  );

  return rows.map(mapAttendanceRow);
}
