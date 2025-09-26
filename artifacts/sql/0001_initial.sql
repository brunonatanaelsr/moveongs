CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Usuários e perfis
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE profiles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id),
  type TEXT NOT NULL,
  data JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX profiles_user_id_idx ON profiles(user_id);

-- Projetos e turmas
CREATE TABLE projects (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE cohorts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id),
  name TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX cohorts_project_id_idx ON cohorts(project_id);

-- Formulários e submissões
CREATE TABLE forms (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT NOT NULL,
  description TEXT,
  schema JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'active'
);

CREATE TABLE form_submissions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  form_id UUID NOT NULL REFERENCES forms(id),
  profile_id UUID NOT NULL REFERENCES profiles(id),
  data JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'submitted'
);

CREATE INDEX form_submissions_form_id_idx ON form_submissions(form_id);
CREATE INDEX form_submissions_profile_id_idx ON form_submissions(profile_id);

-- Consentimentos
CREATE TABLE consents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  profile_id UUID NOT NULL REFERENCES profiles(id),
  type TEXT NOT NULL,
  granted BOOLEAN NOT NULL,
  data JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX consents_profile_id_idx ON consents(profile_id);

-- Registros de auditoria
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id),
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id UUID,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX audit_logs_user_id_idx ON audit_logs(user_id);
CREATE INDEX audit_logs_resource_type_id_idx ON audit_logs(resource_type, resource_id);

-- Notificações
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id),
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  metadata JSONB,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX notifications_user_id_idx ON notifications(user_id);

-- Anexos
CREATE TABLE attachments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  filename TEXT NOT NULL,
  mimetype TEXT NOT NULL,
  key TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  scanned_at TIMESTAMPTZ,
  is_infected BOOLEAN,
  virus_names TEXT[]
);

-- Feed institucional
CREATE TABLE feed_posts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  author_id UUID NOT NULL REFERENCES users(id),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  metadata JSONB,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX feed_posts_author_id_idx ON feed_posts(author_id);
CREATE INDEX feed_posts_published_at_idx ON feed_posts(published_at);

-- Central de mensagens
CREATE TABLE message_threads (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE message_thread_participants (
  thread_id UUID NOT NULL REFERENCES message_threads(id),
  user_id UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (thread_id, user_id)
);

CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  thread_id UUID NOT NULL REFERENCES message_threads(id),
  sender_id UUID NOT NULL REFERENCES users(id),
  content TEXT NOT NULL,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX messages_thread_id_idx ON messages(thread_id);
CREATE INDEX messages_sender_id_idx ON messages(sender_id);

-- Inscrições e planos de ação
CREATE TABLE enrollments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  cohort_id UUID NOT NULL REFERENCES cohorts(id),
  profile_id UUID NOT NULL REFERENCES profiles(id),
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (cohort_id, profile_id)
);

CREATE INDEX enrollments_cohort_id_idx ON enrollments(cohort_id);
CREATE INDEX enrollments_profile_id_idx ON enrollments(profile_id);

CREATE TABLE action_plans (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  enrollment_id UUID NOT NULL REFERENCES enrollments(id),
  created_by UUID NOT NULL REFERENCES users(id),
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX action_plans_enrollment_id_idx ON action_plans(enrollment_id);

CREATE TABLE action_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  plan_id UUID NOT NULL REFERENCES action_plans(id),
  title TEXT NOT NULL,
  description TEXT,
  due_date DATE,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX action_items_plan_id_idx ON action_items(plan_id);

-- Certificados
CREATE TABLE certificates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  enrollment_id UUID NOT NULL REFERENCES enrollments(id),
  type TEXT NOT NULL,
  issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB,
  UNIQUE (enrollment_id, type)
);

CREATE INDEX certificates_enrollment_id_idx ON certificates(enrollment_id);

-- Funções e permissões
CREATE TABLE roles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE permissions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE role_permissions (
  role_id UUID NOT NULL REFERENCES roles(id),
  permission_id UUID NOT NULL REFERENCES permissions(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE user_roles (
  user_id UUID NOT NULL REFERENCES users(id),
  role_id UUID NOT NULL REFERENCES roles(id),
  project_id UUID REFERENCES projects(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, role_id, project_id)
);

CREATE INDEX user_roles_project_id_idx ON user_roles(project_id);

-- Views para análise
CREATE VIEW enrollments_overview AS
SELECT
  e.id AS enrollment_id,
  e.status AS enrollment_status,
  e.created_at AS enrollment_date,
  c.id AS cohort_id,
  c.name AS cohort_name,
  p.id AS project_id,
  p.name AS project_name,
  pr.id AS profile_id,
  u.id AS user_id,
  u.name AS user_name,
  u.email AS user_email
FROM enrollments e
JOIN cohorts c ON e.cohort_id = c.id
JOIN projects p ON c.project_id = p.id
JOIN profiles pr ON e.profile_id = pr.id
JOIN users u ON pr.user_id = u.id;

CREATE VIEW action_plans_overview AS
SELECT
  ap.id AS plan_id,
  ap.title AS plan_title,
  ap.status AS plan_status,
  ap.created_at AS plan_created_at,
  e.id AS enrollment_id,
  c.id AS cohort_id,
  c.name AS cohort_name,
  p.id AS project_id,
  p.name AS project_name,
  pr.id AS profile_id,
  u.id AS user_id,
  u.name AS user_name,
  u.email AS user_email,
  COUNT(ai.id) AS total_items,
  SUM(CASE WHEN ai.status = 'completed' THEN 1 ELSE 0 END) AS completed_items
FROM action_plans ap
JOIN enrollments e ON ap.enrollment_id = e.id
JOIN cohorts c ON e.cohort_id = c.id
JOIN projects p ON c.project_id = p.id
JOIN profiles pr ON e.profile_id = pr.id
JOIN users u ON pr.user_id = u.id
LEFT JOIN action_items ai ON ap.id = ai.plan_id
GROUP BY
  ap.id, ap.title, ap.status, ap.created_at,
  e.id, c.id, c.name, p.id, p.name,
  pr.id, u.id, u.name, u.email;

CREATE VIEW certificates_overview AS
SELECT
  cert.id AS certificate_id,
  cert.type AS certificate_type,
  cert.issued_at AS certificate_issued_at,
  e.id AS enrollment_id,
  e.status AS enrollment_status,
  c.id AS cohort_id,
  c.name AS cohort_name,
  p.id AS project_id,
  p.name AS project_name,
  pr.id AS profile_id,
  u.id AS user_id,
  u.name AS user_name,
  u.email AS user_email
FROM certificates cert
JOIN enrollments e ON cert.enrollment_id = e.id
JOIN cohorts c ON e.cohort_id = c.id
JOIN projects p ON c.project_id = p.id
JOIN profiles pr ON e.profile_id = pr.id
JOIN users u ON pr.user_id = u.id;

