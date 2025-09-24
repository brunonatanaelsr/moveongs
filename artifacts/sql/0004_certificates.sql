-- IMM v0.5 certificates and attendance artifacts ---------------------------------

create table if not exists certificates (
  id uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null references enrollments(id) on delete cascade,
  type text not null default 'completion',
  issued_at timestamptz not null default now(),
  issued_by uuid references users(id) on delete set null,
  total_sessions integer not null,
  present_sessions integer not null,
  attendance_rate numeric(5,4),
  file_path text not null,
  file_name text not null,
  mime_type text not null default 'application/pdf',
  metadata jsonb,
  created_at timestamptz not null default now()
);

create index if not exists certificates_enrollment_idx on certificates (enrollment_id);
create index if not exists certificates_issued_at_idx on certificates (issued_at desc);
