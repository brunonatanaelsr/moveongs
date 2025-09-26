-- IMM v0.1 database bootstrap
-- Garante extensoes requeridas
create extension if not exists pgcrypto;

-- Usuarios e papeis ---------------------------------------------------------
create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text unique not null,
  password_hash text not null,
  is_active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists roles (
  id serial primary key,
  slug text unique not null,
  name text not null
);

create table if not exists user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade,
  role_id int references roles(id) on delete cascade,
  project_id uuid null
);

create unique index if not exists user_roles_unique_global on user_roles (user_id, role_id) where project_id is null;
create unique index if not exists user_roles_unique_project on user_roles (user_id, role_id, project_id) where project_id is not null;

-- Beneficiarias e familia ---------------------------------------------------
create table if not exists beneficiaries (
  id uuid primary key default gen_random_uuid(),
  code text unique,
  full_name text not null,
  birth_date date,
  cpf text,
  rg text,
  rg_issuer text,
  rg_issue_date date,
  nis text,
  phone1 text,
  phone2 text,
  email text,
  address text,
  neighborhood text,
  city text,
  state text,
  reference text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists household_members (
  id uuid primary key default gen_random_uuid(),
  beneficiary_id uuid not null references beneficiaries(id) on delete cascade,
  name text,
  birth_date date,
  works boolean,
  income numeric(12,2),
  schooling text,
  relationship text,
  created_at timestamptz default now()
);

create table if not exists vulnerabilities (
  id serial primary key,
  slug text unique,
  label text not null
);

create table if not exists beneficiary_vulnerabilities (
  beneficiary_id uuid references beneficiaries(id) on delete cascade,
  vulnerability_id int references vulnerabilities(id) on delete cascade,
  created_at timestamptz default now(),
  primary key (beneficiary_id, vulnerability_id)
);

-- Formularios ---------------------------------------------------------------
create table if not exists form_templates (
  id uuid primary key default gen_random_uuid(),
  form_type text not null,
  schema_version text not null,
  schema jsonb not null,
  status text not null default 'active',
  published_at timestamptz default now(),
  unique (form_type, schema_version)
);

create table if not exists form_template_revisions (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references form_templates(id) on delete cascade,
  form_type text not null,
  schema_version text not null,
  revision int not null,
  schema jsonb not null,
  status text not null,
  published_at timestamptz,
  created_at timestamptz default now(),
  created_by uuid references users(id),
  unique (template_id, revision)
);

create index if not exists form_template_revisions_lookup
  on form_template_revisions (form_type, schema_version, revision desc);

create table if not exists form_submissions (
  id uuid primary key default gen_random_uuid(),
  beneficiary_id uuid references beneficiaries(id) on delete cascade,
  form_type text not null,
  schema_version text not null,
  payload jsonb not null,
  signed_by text[],
  signed_at timestamptz[],
  attachments jsonb,
  created_by uuid references users(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Projetos, turmas e presenca ----------------------------------------------
create table if not exists projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique,
  description text,
  coordinator_id uuid references users(id),
  active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists cohorts (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade,
  code text,
  weekday smallint,
  shift text,
  start_time time,
  end_time time,
  capacity int,
  location text,
  created_at timestamptz default now()
);

create table if not exists cohort_educators (
  cohort_id uuid references cohorts(id) on delete cascade,
  user_id uuid references users(id) on delete cascade,
  primary key (cohort_id, user_id)
);

create table if not exists enrollments (
  id uuid primary key default gen_random_uuid(),
  beneficiary_id uuid references beneficiaries(id) on delete cascade,
  cohort_id uuid references cohorts(id) on delete restrict,
  status text not null default 'active',
  enrolled_at date not null default current_date,
  terminated_at date,
  termination_reason text,
  agreement_acceptance jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists attendance (
  id uuid primary key default gen_random_uuid(),
  enrollment_id uuid references enrollments(id) on delete cascade,
  date date not null,
  present boolean not null,
  justification text,
  recorded_by uuid references users(id),
  created_at timestamptz default now(),
  unique (enrollment_id, date)
);

-- Plano de acao e evolucao --------------------------------------------------
create table if not exists action_plans (
  id uuid primary key default gen_random_uuid(),
  beneficiary_id uuid references beneficiaries(id) on delete cascade,
  created_by uuid references users(id),
  status text default 'active',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists action_items (
  id uuid primary key default gen_random_uuid(),
  action_plan_id uuid references action_plans(id) on delete cascade,
  title text not null,
  responsible text,
  due_date date,
  status text default 'pending',
  support text,
  notes text,
  completed_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists evolutions (
  id uuid primary key default gen_random_uuid(),
  beneficiary_id uuid references beneficiaries(id) on delete cascade,
  date date not null,
  description text not null,
  category text,
  responsible text,
  requires_signature boolean default false,
  created_by uuid references users(id),
  created_at timestamptz default now()
);

-- Mensagens internas --------------------------------------------------------
create table if not exists threads (
  id uuid primary key default gen_random_uuid(),
  scope text not null,
  created_by uuid references users(id),
  subject text,
  visibility text default 'internal',
  classification text default 'publico_interno',
  retention_expires_at timestamptz,
  search_terms text[] default '{}'::text[],
  created_at timestamptz default now()
);

create table if not exists thread_members (
  thread_id uuid references threads(id) on delete cascade,
  user_id uuid references users(id) on delete cascade,
  primary key (thread_id, user_id)
);

create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid references threads(id) on delete cascade,
  author_id uuid references users(id),
  body text not null,
  visibility text default 'internal',
  is_confidential boolean default false,
  classification text default 'publico_interno',
  retention_expires_at timestamptz,
  mentions uuid[] default '{}'::uuid[],
  attachment_ids uuid[] default '{}'::uuid[],
  search_terms text[] default '{}'::text[],
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Feed institucional --------------------------------------------------------
create table if not exists posts (
  id uuid primary key default gen_random_uuid(),
  project_id uuid null references projects(id) on delete set null,
  author_id uuid references users(id),
  title text,
  body text,
  tags text[],
  published_at timestamptz default now(),
  visibility text default 'internal'
);

create table if not exists comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid references posts(id) on delete cascade,
  author_id uuid references users(id),
  body text,
  created_at timestamptz default now()
);

-- Consentimentos e auditoria ------------------------------------------------
create table if not exists consents (
  id uuid primary key default gen_random_uuid(),
  beneficiary_id uuid references beneficiaries(id) on delete cascade,
  type text not null,
  text_version text not null,
  granted boolean not null,
  granted_at timestamptz not null,
  revoked_at timestamptz,
  evidence jsonb,
  created_by uuid references users(id)
);

create table if not exists audit_logs (
  id bigserial primary key,
  user_id uuid,
  entity text,
  entity_id uuid,
  action text,
  before_data jsonb,
  after_data jsonb,
  justification text,
  created_at timestamptz default now()
);

-- Anexos --------------------------------------------------------------------
create table if not exists attachments (
  id uuid primary key default gen_random_uuid(),
  owner_type text not null,
  owner_id uuid not null,
  file_path text not null,
  file_name text,
  mime_type text,
  size_bytes bigint,
  checksum text,
  uploaded_by uuid references users(id),
  scan_status text not null default 'skipped',
  scan_signature text,
  scan_engine text,
  scan_started_at timestamptz,
  scan_completed_at timestamptz,
  scan_error text,
  created_at timestamptz default now()
);

-- Indexes -------------------------------------------------------------------
create index if not exists idx_users_email on users (email);
create index if not exists idx_beneficiaries_name on beneficiaries using gin (to_tsvector('simple', full_name));
create index if not exists idx_beneficiaries_code on beneficiaries (code);
create index if not exists idx_household_beneficiary on household_members (beneficiary_id);
create index if not exists idx_form_submissions_beneficiary on form_submissions (beneficiary_id, form_type);
create index if not exists idx_projects_slug on projects (slug);
create index if not exists idx_enrollments_beneficiary on enrollments (beneficiary_id);
create index if not exists idx_enrollments_cohort on enrollments (cohort_id);
create index if not exists idx_attendance_enrollment on attendance (enrollment_id, date);
create index if not exists idx_action_plans_beneficiary on action_plans (beneficiary_id);
create index if not exists idx_evolutions_beneficiary on evolutions (beneficiary_id, date);
create index if not exists idx_threads_scope on threads (scope);
create index if not exists idx_messages_thread on messages (thread_id, created_at);
create index if not exists idx_posts_project on posts (project_id, published_at desc);
create index if not exists idx_consents_beneficiary on consents (beneficiary_id, type);

create index if not exists idx_audit_logs_entity on audit_logs (entity, entity_id);
