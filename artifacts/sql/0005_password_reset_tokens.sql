create table if not exists password_reset_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz default now()
);

create index if not exists password_reset_tokens_user_idx on password_reset_tokens(user_id);
create index if not exists password_reset_tokens_expires_idx on password_reset_tokens(expires_at);
