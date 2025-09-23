-- IMM v0.3 additions: fine-grained RBAC and social profiles

-- RBAC --------------------------------------------------------------
create table if not exists resources (
  id serial primary key,
  slug text not null unique,
  description text
);

create table if not exists permissions (
  id uuid primary key default gen_random_uuid(),
  resource_id int not null references resources(id) on delete cascade,
  action text not null,
  scope text not null default 'global',
  description text,
  unique (resource_id, action, scope)
);

create table if not exists role_permissions (
  id uuid primary key default gen_random_uuid(),
  role_id int not null references roles(id) on delete cascade,
  permission_id uuid not null references permissions(id) on delete cascade,
  constraint uq_role_permission unique (role_id, permission_id)
);

-- Profiles / social layer --------------------------------------------
create table if not exists user_profiles (
  user_id uuid primary key references users(id) on delete cascade,
  display_name text,
  avatar_url text,
  bio text,
  pronouns text,
  location text,
  links jsonb default '[]'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists user_follows (
  follower_id uuid references users(id) on delete cascade,
  following_id uuid references users(id) on delete cascade,
  created_at timestamptz default now(),
  primary key (follower_id, following_id),
  constraint ck_not_self_follow check (follower_id <> following_id)
);

create table if not exists user_activities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  body text not null,
  visibility text not null default 'internal', -- internal|project|public
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Helpful indexes ----------------------------------------------------
create index if not exists idx_permissions_resource_action on permissions (resource_id, action, scope);
create index if not exists idx_role_permissions_role on role_permissions (role_id);
create index if not exists idx_user_follows_following on user_follows (following_id);
create index if not exists idx_user_activities_user on user_activities (user_id, created_at desc);
