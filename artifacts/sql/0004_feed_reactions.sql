-- Feed post reactions
create table if not exists post_reactions (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references posts(id) on delete cascade,
  author_id uuid not null references users(id),
  type text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_post_reactions_post_author unique (post_id, author_id)
);

create index if not exists idx_post_reactions_post on post_reactions (post_id);
