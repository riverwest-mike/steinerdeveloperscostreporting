-- Stores project assignments for invited users who have not yet completed sign-up.
-- Rows are created when an admin grants a pending invite access to a project,
-- and are consumed (applied → project_users, then deleted) when the user signs up.
create table if not exists pending_project_assignments (
  id           uuid        primary key default gen_random_uuid(),
  invite_email text        not null,
  project_id   uuid        not null references projects(id) on delete cascade,
  assigned_by  text        not null references users(id),
  created_at   timestamptz not null    default now(),
  unique(invite_email, project_id)
);

create index if not exists pending_project_assignments_email_idx
  on pending_project_assignments(invite_email);
