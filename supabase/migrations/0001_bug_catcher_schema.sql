-- Durable submission storage: written before any Linear API call is attempted.
create table if not exists bug_catcher_submissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  url text not null,
  user_agent text not null,
  description text not null,
  console_entries jsonb not null,
  screenshot_path text not null,
  linear_status text not null default 'pending' check (linear_status in ('pending', 'created', 'failed')),
  linear_issue_url text,
  linear_error text,
  created_at timestamptz not null default now()
);

alter table bug_catcher_submissions enable row level security;

create policy "service role full access to submissions"
  on bug_catcher_submissions
  for all
  to service_role
  using (true)
  with check (true);

-- Postgres-backed sliding-window rate limit: one row per (user, window bucket).
create table if not exists bug_catcher_rate_limits (
  user_id uuid not null,
  window_start timestamptz not null,
  request_count int not null default 1,
  primary key (user_id, window_start)
);

alter table bug_catcher_rate_limits enable row level security;

create policy "service role full access to rate limits"
  on bug_catcher_rate_limits
  for all
  to service_role
  using (true)
  with check (true);

create or replace function bug_catcher_check_rate_limit(
  p_user_id uuid,
  p_max_requests int,
  p_window_minutes int
) returns boolean
language plpgsql
security definer
as $$
declare
  v_window_start timestamptz;
  v_count int;
begin
  v_window_start := to_timestamp(floor(extract(epoch from now()) / (p_window_minutes * 60)) * (p_window_minutes * 60));

  insert into bug_catcher_rate_limits (user_id, window_start, request_count)
  values (p_user_id, v_window_start, 1)
  on conflict (user_id, window_start)
  do update set request_count = bug_catcher_rate_limits.request_count + 1
  returning request_count into v_count;

  return v_count <= p_max_requests;
end;
$$;

revoke execute on function bug_catcher_check_rate_limit(uuid, int, int) from public;
grant execute on function bug_catcher_check_rate_limit(uuid, int, int) to service_role;

-- Private bucket: screenshots are never public; the Edge Function generates
-- 1-year signed URLs embedded directly in the Linear issue description.
insert into storage.buckets (id, name, public)
values ('bug-catcher-screenshots', 'bug-catcher-screenshots', false)
on conflict (id) do nothing;
