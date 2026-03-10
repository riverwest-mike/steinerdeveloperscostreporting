-- Track when each user last signed in.
alter table users
  add column if not exists last_login_at timestamptz;
