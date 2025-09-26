-- IMM v0.3 additions: fine-grained RBAC and social profiles
-- Esta migração adapta esquemas antigos (pré-RBAC granular) para o layout
-- utilizado pelos seeds atuais. Use apenas instruções incrementais para evitar
-- referências a colunas inexistentes.

-- ---------------------------------------------------------------------------
-- Roles: adicionar slug exclusivo
ALTER TABLE roles
  ADD COLUMN IF NOT EXISTS slug TEXT;

UPDATE roles
SET slug = lower(regexp_replace(name, '[^a-z0-9]+', '_', 'gi'))
WHERE (slug IS NULL OR slug = '') AND name IS NOT NULL;

-- Garantir unicidade mesmo após normalização básica
WITH duplicates AS (
  SELECT id, slug,
         ROW_NUMBER() OVER (PARTITION BY slug ORDER BY id) AS rn
  FROM roles
  WHERE slug IS NOT NULL
)
UPDATE roles r
SET slug = slug || '_' || rn
FROM duplicates d
WHERE r.id = d.id AND d.rn > 1;

ALTER TABLE roles
  ALTER COLUMN slug SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM   pg_constraint
    WHERE  conrelid = 'roles'::regclass
    AND    conname = 'roles_slug_key'
  ) THEN
    ALTER TABLE roles ADD CONSTRAINT roles_slug_key UNIQUE (slug);
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- Resources: criar tabela somente se ainda não existir
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'resources'
  ) THEN
    CREATE TABLE resources (
      id SERIAL PRIMARY KEY,
      slug TEXT NOT NULL UNIQUE,
      description TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- Permissions: alinhar colunas ao novo modelo (resource/action/scope)
ALTER TABLE permissions
  ADD COLUMN IF NOT EXISTS resource_id INTEGER;

ALTER TABLE permissions
  ADD COLUMN IF NOT EXISTS action TEXT;

ALTER TABLE permissions
  ADD COLUMN IF NOT EXISTS scope TEXT;

ALTER TABLE permissions
  ADD COLUMN IF NOT EXISTS description TEXT;

ALTER TABLE permissions
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE permissions
  ALTER COLUMN id SET DEFAULT uuid_generate_v4();

INSERT INTO resources (slug, description)
SELECT 'legacy', 'Permissões herdadas de versões anteriores'
WHERE NOT EXISTS (
  SELECT 1 FROM resources WHERE slug = 'legacy'
);

UPDATE permissions
SET resource_id = r.id
FROM resources r
WHERE r.slug = 'legacy' AND permissions.resource_id IS NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'permissions'
      AND column_name = 'name'
  ) THEN
    EXECUTE 'UPDATE permissions
               SET action = COALESCE(action, name, ''legacy_action'')
             WHERE action IS NULL';
  ELSE
    UPDATE permissions
       SET action = COALESCE(action, 'legacy_action')
     WHERE action IS NULL;
  END IF;
END;
$$;

UPDATE permissions
SET scope = COALESCE(scope, 'global');

ALTER TABLE permissions
  ALTER COLUMN resource_id SET NOT NULL;

ALTER TABLE permissions
  ALTER COLUMN action SET NOT NULL;

ALTER TABLE permissions
  ALTER COLUMN scope SET DEFAULT 'global';

ALTER TABLE permissions
  ALTER COLUMN scope SET NOT NULL;

ALTER TABLE permissions
  DROP CONSTRAINT IF EXISTS permissions_name_key;

ALTER TABLE permissions
  DROP COLUMN IF EXISTS name;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'permissions'::regclass
      AND conname = 'permissions_resource_id_action_scope_key'
  ) THEN
    ALTER TABLE permissions
      ADD CONSTRAINT permissions_resource_id_action_scope_key
        UNIQUE (resource_id, action, scope);
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS permissions_resource_scope_idx
  ON permissions (resource_id, action, scope);

-- ---------------------------------------------------------------------------
-- Role permissions: adicionar chave primária e índice auxiliar
ALTER TABLE role_permissions
  ADD COLUMN IF NOT EXISTS id UUID;

UPDATE role_permissions
SET id = uuid_generate_v4()
WHERE id IS NULL;

ALTER TABLE role_permissions
  ALTER COLUMN id SET DEFAULT uuid_generate_v4();

ALTER TABLE role_permissions
  ALTER COLUMN id SET NOT NULL;

ALTER TABLE role_permissions
  DROP CONSTRAINT IF EXISTS role_permissions_pkey;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'role_permissions'::regclass
      AND conname = 'role_permissions_role_permission_key'
  ) THEN
    ALTER TABLE role_permissions
      ADD CONSTRAINT role_permissions_role_permission_key
        UNIQUE (role_id, permission_id);
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'role_permissions'::regclass
      AND contype = 'p'
  ) THEN
    ALTER TABLE role_permissions
      ADD CONSTRAINT role_permissions_pkey PRIMARY KEY (id);
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS role_permissions_role_idx
  ON role_permissions (role_id);

-- ---------------------------------------------------------------------------
-- User roles: adicionar chave primária UUID e manter unicidade lógica
ALTER TABLE user_roles
  ADD COLUMN IF NOT EXISTS id UUID;

UPDATE user_roles
SET id = uuid_generate_v4()
WHERE id IS NULL;

ALTER TABLE user_roles
  ALTER COLUMN id SET DEFAULT uuid_generate_v4();

ALTER TABLE user_roles
  ALTER COLUMN id SET NOT NULL;

ALTER TABLE user_roles
  DROP CONSTRAINT IF EXISTS user_roles_pkey;

ALTER TABLE user_roles
  DROP CONSTRAINT IF EXISTS user_roles_user_id_role_id_project_id_key;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'user_roles'::regclass
      AND conname = 'user_roles_unique_assignment'
  ) THEN
    ALTER TABLE user_roles
      ADD CONSTRAINT user_roles_unique_assignment
        UNIQUE (user_id, role_id, project_id);
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'user_roles'::regclass
      AND contype = 'p'
  ) THEN
    ALTER TABLE user_roles
      ADD CONSTRAINT user_roles_pkey PRIMARY KEY (id);
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS user_roles_project_id_idx
  ON user_roles (project_id);

-- ---------------------------------------------------------------------------
-- Perfis sociais e atividades: criar tabelas apenas se necessário
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'user_profiles'
  ) THEN
    CREATE TABLE user_profiles (
      user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      display_name TEXT,
      avatar_url TEXT,
      bio TEXT,
      pronouns TEXT,
      location TEXT,
      links JSONB DEFAULT '[]'::jsonb,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'user_follows'
  ) THEN
    CREATE TABLE user_follows (
      follower_id UUID REFERENCES users(id) ON DELETE CASCADE,
      following_id UUID REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      PRIMARY KEY (follower_id, following_id),
      CONSTRAINT ck_not_self_follow CHECK (follower_id <> following_id)
    );
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'user_activities'
  ) THEN
    CREATE TABLE user_activities (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      body TEXT NOT NULL,
      visibility TEXT NOT NULL DEFAULT 'internal',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_user_follows_following
  ON user_follows (following_id);

CREATE INDEX IF NOT EXISTS idx_user_activities_user
  ON user_activities (user_id, created_at DESC);
