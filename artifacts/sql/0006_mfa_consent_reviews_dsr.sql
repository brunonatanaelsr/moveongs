-- MFA methods ---------------------------------------------------------------
create table if not exists mfa_methods (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  type text not null,
  label text,
  enabled boolean not null default false,
  last_used_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_mfa_methods_user on mfa_methods(user_id);

create table if not exists mfa_totp_secrets (
  method_id uuid primary key references mfa_methods(id) on delete cascade,
  secret text not null,
  confirmed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists mfa_webauthn_credentials (
  id uuid primary key default gen_random_uuid(),
  method_id uuid not null references mfa_methods(id) on delete cascade,
  credential_id text not null,
  public_key text not null,
  counter bigint not null default 0,
  transports text[],
  attestation_format text,
  device_name text,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  constraint uq_mfa_webauthn_credentials unique (method_id, credential_id)
);

create index if not exists idx_mfa_webauthn_method on mfa_webauthn_credentials(method_id);

create table if not exists mfa_challenges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  purpose text not null,
  challenge jsonb not null,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_mfa_challenges_user on mfa_challenges(user_id);

-- Consent review scheduling -------------------------------------------------
create table if not exists consent_review_schedules (
  consent_id uuid primary key references consents(id) on delete cascade,
  last_reviewed_at timestamptz,
  next_review_at timestamptz not null,
  last_notified_at timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Data subject requests -----------------------------------------------------
create table if not exists dsr_requests (
  id uuid primary key default gen_random_uuid(),
  beneficiary_id uuid not null references beneficiaries(id) on delete cascade,
  requested_by uuid references users(id),
  requested_at timestamptz not null default now(),
  fulfilled_at timestamptz,
  export_payload jsonb
);

create index if not exists idx_dsr_requests_beneficiary on dsr_requests(beneficiary_id);
