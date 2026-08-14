create table if not exists public.time_breaks (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.time_employees(id) on delete cascade,
  location_id uuid not null references public.time_locations(id),
  kiosk_id uuid not null references public.time_kiosks(id),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  constraint time_breaks_end_after_start check (ended_at is null or ended_at >= started_at)
);

create unique index if not exists time_breaks_one_open_per_employee_idx
  on public.time_breaks(employee_id)
  where ended_at is null;

create index if not exists time_breaks_employee_start_idx
  on public.time_breaks(employee_id, started_at desc);

alter table public.time_breaks enable row level security;

-- Breaks are accessed only by server-side routes using the service role.
revoke all on table public.time_breaks from anon, authenticated;
