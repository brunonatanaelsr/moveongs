import type { PoolClient } from 'pg';
import { query, withTransaction } from '../../db';
import { AppError, NotFoundError } from '../../shared/errors';

export type HouseholdMember = {
  id: string;
  name: string | null;
  birthDate: string | null;
  works: boolean | null;
  income: string | null;
  schooling: string | null;
  relationship: string | null;
};

export type VulnerabilityTag = {
  slug: string;
  label: string | null;
};

export type BeneficiaryRecord = {
  id: string;
  code: string | null;
  fullName: string;
  birthDate: string | null;
  cpf: string | null;
  rg: string | null;
  rgIssuer: string | null;
  rgIssueDate: string | null;
  nis: string | null;
  phone1: string | null;
  phone2: string | null;
  email: string | null;
  address: string | null;
  neighborhood: string | null;
  city: string | null;
  state: string | null;
  reference: string | null;
  createdAt: string;
  updatedAt: string;
  householdMembers: HouseholdMember[];
  vulnerabilities: VulnerabilityTag[];
};

export type CreateBeneficiaryParams = {
  code?: string | null;
  fullName: string;
  birthDate?: string | null;
  cpf?: string | null;
  rg?: string | null;
  rgIssuer?: string | null;
  rgIssueDate?: string | null;
  nis?: string | null;
  phone1?: string | null;
  phone2?: string | null;
  email?: string | null;
  address?: string | null;
  neighborhood?: string | null;
  city?: string | null;
  state?: string | null;
  reference?: string | null;
  householdMembers: Array<{
    name?: string | null;
    birthDate?: string | null;
    works?: boolean | null;
    income?: number | null;
    schooling?: string | null;
    relationship?: string | null;
  }>;
  vulnerabilities: string[];
};

export type UpdateBeneficiaryParams = Partial<Omit<CreateBeneficiaryParams, 'householdMembers' | 'vulnerabilities' | 'fullName'>> & {
  fullName?: string;
  householdMembers?: CreateBeneficiaryParams['householdMembers'];
  vulnerabilities?: string[];
};

function mapBeneficiaryRow(row: any): BeneficiaryRecord {
  return {
    id: row.id,
    code: row.code,
    fullName: row.full_name,
    birthDate: row.birth_date ? row.birth_date.toISOString().substring(0, 10) : null,
    cpf: row.cpf,
    rg: row.rg,
    rgIssuer: row.rg_issuer,
    rgIssueDate: row.rg_issue_date ? row.rg_issue_date.toISOString().substring(0, 10) : null,
    nis: row.nis,
    phone1: row.phone1,
    phone2: row.phone2,
    email: row.email,
    address: row.address,
    neighborhood: row.neighborhood,
    city: row.city,
    state: row.state,
    reference: row.reference,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    householdMembers: [],
    vulnerabilities: [],
  };
}

async function loadHouseholdMembers(client: PoolClient, beneficiaryId: string): Promise<HouseholdMember[]> {
  const { rows } = await client.query<{
    id: string;
    name: string | null;
    birth_date: Date | null;
    works: boolean | null;
    income: string | null;
    schooling: string | null;
    relationship: string | null;
  }>(
    `select id, name, birth_date, works, income::text as income, schooling, relationship
       from household_members
      where beneficiary_id = $1
      order by created_at asc`,
    [beneficiaryId],
  );

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    birthDate: row.birth_date ? row.birth_date.toISOString().substring(0, 10) : null,
    works: row.works,
    income: row.income,
    schooling: row.schooling,
    relationship: row.relationship,
  }));
}

async function loadVulnerabilities(client: PoolClient, beneficiaryId: string): Promise<VulnerabilityTag[]> {
  const { rows } = await client.query<{
    slug: string;
    label: string | null;
  }>(
    `select v.slug, v.label
       from beneficiary_vulnerabilities bv
       join vulnerabilities v on v.id = bv.vulnerability_id
      where bv.beneficiary_id = $1
      order by v.slug`,
    [beneficiaryId],
  );

  return rows.map((row) => ({ slug: row.slug, label: row.label }));
}

async function resolveVulnerabilityIds(client: PoolClient, slugs: string[]): Promise<Map<string, number>> {
  if (slugs.length === 0) {
    return new Map();
  }

  const placeholders = slugs.map((_, index) => `$${index + 1}`).join(',');
  const { rows } = await client.query<{ id: number; slug: string }>(
    `select id, slug from vulnerabilities where slug in (${placeholders})`,
    slugs,
  );

  if (rows.length !== slugs.length) {
    const existing = new Set(rows.map((row) => row.slug));
    const missing = slugs.filter((slug) => !existing.has(slug));
    throw new AppError(`Unknown vulnerabilities: ${missing.join(', ')}`, 400);
  }

  return new Map(rows.map((row) => [row.slug, row.id] as const));
}

export async function createBeneficiary(params: CreateBeneficiaryParams): Promise<BeneficiaryRecord> {
  return withTransaction(async (client) => {
    const { rows } = await client.query(
      `insert into beneficiaries (
         code, full_name, birth_date, cpf, rg, rg_issuer, rg_issue_date, nis,
         phone1, phone2, email, address, neighborhood, city, state, reference
       ) values (
         $1,$2,$3,$4,$5,$6,$7,$8,
         $9,$10,$11,$12,$13,$14,$15,$16
       ) returning *`,
      [
        params.code ?? null,
        params.fullName,
        params.birthDate ?? null,
        params.cpf ?? null,
        params.rg ?? null,
        params.rgIssuer ?? null,
        params.rgIssueDate ?? null,
        params.nis ?? null,
        params.phone1 ?? null,
        params.phone2 ?? null,
        params.email ?? null,
        params.address ?? null,
        params.neighborhood ?? null,
        params.city ?? null,
        params.state ?? null,
        params.reference ?? null,
      ],
    );

    const beneficiary = mapBeneficiaryRow(rows[0]);

    if (params.householdMembers.length > 0) {
      for (const member of params.householdMembers) {
        await client.query(
          `insert into household_members (
             beneficiary_id, name, birth_date, works, income, schooling, relationship
           ) values ($1,$2,$3,$4,$5,$6,$7)`,
          [
            beneficiary.id,
            member.name ?? null,
            member.birthDate ?? null,
            member.works ?? null,
            member.income ?? null,
            member.schooling ?? null,
            member.relationship ?? null,
          ],
        );
      }
    }

    if (params.vulnerabilities.length > 0) {
      const map = await resolveVulnerabilityIds(client, params.vulnerabilities);

      for (const slug of params.vulnerabilities) {
        const vulnId = map.get(slug);
        if (!vulnId) {
          throw new AppError(`Unknown vulnerability: ${slug}`, 400);
        }

        await client.query(
          `insert into beneficiary_vulnerabilities (beneficiary_id, vulnerability_id)
             values ($1, $2)
             on conflict do nothing`,
          [beneficiary.id, vulnId],
        );
      }
    }

    const householdMembers = await loadHouseholdMembers(client, beneficiary.id);
    const vulnerabilities = await loadVulnerabilities(client, beneficiary.id);

    return { ...beneficiary, householdMembers, vulnerabilities };
  });
}

export async function updateBeneficiary(id: string, params: UpdateBeneficiaryParams): Promise<BeneficiaryRecord> {
  return withTransaction(async (client) => {
    const existing = await client.query('select * from beneficiaries where id = $1', [id]);

    if (existing.rowCount === 0) {
      throw new NotFoundError('Beneficiary not found');
    }

    const row = existing.rows[0];

    const merged = {
      code: params.code ?? row.code,
      fullName: params.fullName ?? row.full_name,
      birthDate: params.birthDate ?? row.birth_date,
      cpf: params.cpf ?? row.cpf,
      rg: params.rg ?? row.rg,
      rgIssuer: params.rgIssuer ?? row.rg_issuer,
      rgIssueDate: params.rgIssueDate ?? row.rg_issue_date,
      nis: params.nis ?? row.nis,
      phone1: params.phone1 ?? row.phone1,
      phone2: params.phone2 ?? row.phone2,
      email: params.email ?? row.email,
      address: params.address ?? row.address,
      neighborhood: params.neighborhood ?? row.neighborhood,
      city: params.city ?? row.city,
      state: params.state ?? row.state,
      reference: params.reference ?? row.reference,
    };

    await client.query(
      `update beneficiaries set
         code = $2,
         full_name = $3,
         birth_date = $4,
         cpf = $5,
         rg = $6,
         rg_issuer = $7,
         rg_issue_date = $8,
         nis = $9,
         phone1 = $10,
         phone2 = $11,
         email = $12,
         address = $13,
         neighborhood = $14,
         city = $15,
         state = $16,
         reference = $17,
         updated_at = now()
       where id = $1`,
      [
        id,
        merged.code,
        merged.fullName,
        merged.birthDate ?? null,
        merged.cpf,
        merged.rg,
        merged.rgIssuer,
        merged.rgIssueDate ?? null,
        merged.nis,
        merged.phone1,
        merged.phone2,
        merged.email,
        merged.address,
        merged.neighborhood,
        merged.city,
        merged.state,
        merged.reference,
      ],
    );

    if (params.householdMembers) {
      await client.query('delete from household_members where beneficiary_id = $1', [id]);
      for (const member of params.householdMembers) {
        await client.query(
          `insert into household_members (
             beneficiary_id, name, birth_date, works, income, schooling, relationship
           ) values ($1,$2,$3,$4,$5,$6,$7)`,
          [
            id,
            member.name ?? null,
            member.birthDate ?? null,
            member.works ?? null,
            member.income ?? null,
            member.schooling ?? null,
            member.relationship ?? null,
          ],
        );
      }
    }

    if (params.vulnerabilities) {
      await client.query('delete from beneficiary_vulnerabilities where beneficiary_id = $1', [id]);

      if (params.vulnerabilities.length > 0) {
        const map = await resolveVulnerabilityIds(client, params.vulnerabilities);
        for (const slug of params.vulnerabilities) {
          const vulnId = map.get(slug);
          if (!vulnId) {
            throw new AppError(`Unknown vulnerability: ${slug}`, 400);
          }

          await client.query(
            `insert into beneficiary_vulnerabilities (beneficiary_id, vulnerability_id)
               values ($1,$2)`,
            [id, vulnId],
          );
        }
      }
    }

    const updated = await client.query('select * from beneficiaries where id = $1', [id]);
    const beneficiary = mapBeneficiaryRow(updated.rows[0]);

    const householdMembers = await loadHouseholdMembers(client, id);
    const vulnerabilities = await loadVulnerabilities(client, id);

    return { ...beneficiary, householdMembers, vulnerabilities };
  });
}

export async function getBeneficiaryById(id: string): Promise<BeneficiaryRecord | null> {
  return withTransaction(async (client) => {
    const { rows } = await client.query('select * from beneficiaries where id = $1', [id]);
    if (rows.length === 0) {
      return null;
    }

    const beneficiary = mapBeneficiaryRow(rows[0]);
    const householdMembers = await loadHouseholdMembers(client, id);
    const vulnerabilities = await loadVulnerabilities(client, id);

    return { ...beneficiary, householdMembers, vulnerabilities };
  });
}

export async function listBeneficiaries(params: { search?: string; limit: number; offset: number }) {
  const { rows } = await query<{
    id: string;
    code: string | null;
    full_name: string;
    birth_date: Date | null;
    cpf: string | null;
    phone1: string | null;
    created_at: Date;
    updated_at: Date;
    vulnerabilities: string[] | null;
  }>(
    `select b.id,
            b.code,
            b.full_name,
            b.birth_date,
            b.cpf,
            b.phone1,
            b.created_at,
            b.updated_at,
            coalesce(array_agg(distinct v.slug) filter (where v.slug is not null), '{}') as vulnerabilities
       from beneficiaries b
       left join beneficiary_vulnerabilities bv on bv.beneficiary_id = b.id
       left join vulnerabilities v on v.id = bv.vulnerability_id
      where ($1::text is null or to_tsvector('simple', b.full_name) @@ plainto_tsquery('simple', $1))
      group by b.id
      order by b.created_at desc
      limit $2 offset $3`,
    [params.search ?? null, params.limit, params.offset],
  );

  return rows.map((row) => ({
    id: row.id,
    code: row.code,
    fullName: row.full_name,
    birthDate: row.birth_date ? row.birth_date.toISOString().substring(0, 10) : null,
    cpf: row.cpf,
    phone1: row.phone1,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    vulnerabilities: row.vulnerabilities ?? [],
  }));
}
