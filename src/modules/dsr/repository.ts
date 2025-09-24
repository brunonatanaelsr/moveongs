import { query } from '../../db';

export async function fetchBeneficiaryProfile(beneficiaryId: string) {
  const { rows } = await query('select * from beneficiaries where id = $1', [beneficiaryId]);
  return rows[0] ?? null;
}

export async function fetchHouseholdMembers(beneficiaryId: string) {
  const { rows } = await query(
    `select * from household_members
       where beneficiary_id = $1
       order by created_at asc`,
    [beneficiaryId],
  );
  return rows;
}

export async function fetchVulnerabilities(beneficiaryId: string) {
  const { rows } = await query(
    `select v.slug, v.label, bv.created_at
       from beneficiary_vulnerabilities bv
       join vulnerabilities v on v.id = bv.vulnerability_id
      where bv.beneficiary_id = $1
      order by v.label asc`,
    [beneficiaryId],
  );
  return rows;
}

export async function fetchConsentsForBeneficiary(beneficiaryId: string) {
  const { rows } = await query('select * from consents where beneficiary_id = $1 order by granted_at desc', [beneficiaryId]);
  return rows;
}

export async function fetchFormSubmissions(beneficiaryId: string) {
  const { rows } = await query(
    `select * from form_submissions
       where beneficiary_id = $1
       order by created_at desc`,
    [beneficiaryId],
  );
  return rows;
}

export async function fetchEnrollments(beneficiaryId: string) {
  const { rows } = await query(
    `select e.*, c.code as cohort_code, p.name as project_name
       from enrollments e
       left join cohorts c on c.id = e.cohort_id
       left join projects p on p.id = c.project_id
      where e.beneficiary_id = $1
      order by e.created_at desc`,
    [beneficiaryId],
  );
  return rows;
}

export async function fetchActionPlans(beneficiaryId: string) {
  const { rows } = await query(
    `select ap.*, coalesce(json_agg(ai order by ai.created_at) filter (where ai.id is not null), '[]'::json) as items
       from action_plans ap
       left join action_items ai on ai.action_plan_id = ap.id
      where ap.beneficiary_id = $1
      group by ap.id
      order by ap.created_at desc`,
    [beneficiaryId],
  );
  return rows;
}

export async function fetchEvolutions(beneficiaryId: string) {
  const { rows } = await query(
    `select * from evolutions
       where beneficiary_id = $1
       order by date desc, created_at desc`,
    [beneficiaryId],
  );
  return rows;
}

export async function fetchAttachmentsMetadata(beneficiaryId: string) {
  const { rows } = await query(
    `select id, owner_type, owner_id, file_name, mime_type, size_bytes, created_at
       from attachments
      where owner_type = 'beneficiary' and owner_id = $1
      order by created_at desc`,
    [beneficiaryId],
  );
  return rows;
}

export async function fetchAuditLogsForBeneficiary(beneficiaryId: string) {
  const { rows } = await query(
    `select * from audit_logs
       where entity_id = $1
       order by created_at desc
       limit 200`,
    [beneficiaryId],
  );
  return rows;
}

export async function insertDsrRequest(params: {
  beneficiaryId: string;
  requestedBy?: string | null;
  payload: Record<string, unknown>;
}): Promise<{ id: string; fulfilledAt: Date }>
{
  const { rows } = await query(
    `insert into dsr_requests (beneficiary_id, requested_by, fulfilled_at, export_payload)
     values ($1, $2, now(), $3)
     returning id, fulfilled_at`,
    [params.beneficiaryId, params.requestedBy ?? null, params.payload],
  );
  const row = rows[0];
  return { id: row.id, fulfilledAt: row.fulfilled_at };
}
