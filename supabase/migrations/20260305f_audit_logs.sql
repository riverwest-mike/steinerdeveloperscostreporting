-- Audit log table for tracking all user-initiated changes
create table if not exists audit_logs (
  id          uuid        primary key default gen_random_uuid(),
  created_at  timestamptz not null    default now(),
  user_id     text        not null,
  action      text        not null,   -- e.g. 'contract.create', 'gate.delete'
  entity_type text        not null,   -- 'contract', 'gate', 'change_order', 'project'
  entity_id   text,
  project_id  text,
  label       text,                   -- human-readable summary of the affected record
  payload     jsonb                   -- relevant field values at time of action
);

create index if not exists audit_logs_created_at_idx  on audit_logs (created_at desc);
create index if not exists audit_logs_user_id_idx     on audit_logs (user_id);
create index if not exists audit_logs_project_id_idx  on audit_logs (project_id);
create index if not exists audit_logs_action_idx      on audit_logs (action);
