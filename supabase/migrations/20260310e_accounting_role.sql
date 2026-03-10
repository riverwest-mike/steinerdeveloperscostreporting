-- Add 'accounting' role to the users table role constraint.
-- Accounting has the same access as Admin except:
--   - No Users & Access (cannot invite, change roles, or toggle user status)
--   - Cannot delete projects
--   - Cannot delete or reopen gates

alter table users
  drop constraint if exists users_role_check;

alter table users
  add constraint users_role_check
  check (role in ('admin', 'project_manager', 'read_only', 'accounting'));
