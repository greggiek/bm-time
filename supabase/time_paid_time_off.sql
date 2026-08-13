create table if not exists public.time_paid_time_off (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.time_employees(id),
  location_id uuid not null references public.time_locations(id),
  entry_type text not null check (entry_type in ('vacation', 'sick')),
  entry_date date not null,
  hours numeric(5,2) not null check (hours > 0 and hours <= 24),
  note text not null default '',
  created_by uuid references public.time_users(id),
  created_at timestamptz not null default now()
);

alter table public.time_paid_time_off enable row level security;
create index if not exists time_paid_time_off_date_idx on public.time_paid_time_off(entry_date);
create index if not exists time_paid_time_off_employee_idx on public.time_paid_time_off(employee_id);
