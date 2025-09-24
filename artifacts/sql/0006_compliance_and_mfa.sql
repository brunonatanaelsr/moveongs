-- MFA and compliance enhancements

create table if not exists user_mfa_settings (
  user_id uuid primary key references users(id) on delete cascade,
  preferred_method text,
  totp_enabled boolean default false,
  webauthn_enabled boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists user_totp_factors (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  label text,
  secret text not null,
  confirmed_at timestamptz,
  created_at timestamptz default now(),
  last_used_at timestamptz
);

create index if not exists idx_user_totp_user on user_totp_factors (user_id);

create table if not exists user_webauthn_credentials (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  name text not null,
  credential_id text not null,
  public_key text not null,
  sign_count bigint default 0,
  transports text[],
  created_at timestamptz default now(),
  last_used_at timestamptz
);

create unique index if not exists idx_webauthn_user_credential on user_webauthn_credentials (user_id, credential_id);

create table if not exists auth_mfa_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  purpose text not null,
  methods text[] default array[]::text[],
  payload jsonb,
  challenge text,
  challenge_type text,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz default now()
);

create index if not exists idx_auth_mfa_session_user on auth_mfa_sessions (user_id);
create index if not exists idx_auth_mfa_session_expiry on auth_mfa_sessions (expires_at);

create table if not exists consent_review_queue (
  id uuid primary key default gen_random_uuid(),
  consent_id uuid not null references consents(id) on delete cascade,
  beneficiary_id uuid not null references beneficiaries(id) on delete cascade,
  due_at timestamptz not null,
  status text not null default 'pending',
  last_notified_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz default now()
);

create unique index if not exists idx_consent_review_pending on consent_review_queue (consent_id) where status = 'pending';

create table if not exists data_subject_requests (
  id uuid primary key default gen_random_uuid(),
  beneficiary_id uuid not null references beneficiaries(id) on delete cascade,
  requested_by uuid references users(id),
  request_type text not null,
  status text not null default 'pending',
  requested_at timestamptz default now(),
  due_at timestamptz not null,
  completed_at timestamptz,
  sla_breached boolean default false,
  metadata jsonb
);

create index if not exists idx_dsr_beneficiary on data_subject_requests (beneficiary_id);
create index if not exists idx_dsr_status on data_subject_requests (status);

create table if not exists data_subject_request_exports (
  request_id uuid primary key references data_subject_requests(id) on delete cascade,
  exported_at timestamptz default now(),
  payload jsonb not null
);
