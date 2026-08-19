-- BM TIME DEVELOPMENT BOOTSTRAP
-- Run ONLY inside the bm-time-development Supabase project.
-- This creates structure and non-sensitive reference data only.
-- Generate development users, PINs, and kiosk tokens privately in Supabase.

create extension if not exists pgcrypto;

do $$ begin
  create type public.time_punch_action as enum ('clock_in','clock_out');
exception when duplicate_object then null;
end $$;

create table if not exists public.time_locations (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  code text not null unique,
  active boolean not null default true
);
create table if not exists public.time_job_titles (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  active boolean not null default true
);
create table if not exists public.time_employees (
  id uuid primary key default gen_random_uuid(),
  employee_number text not null unique,
  first_name text not null,
  last_name text not null,
  pin_hash text not null,
  primary_location_id uuid not null references public.time_locations(id),
  job_title_id uuid references public.time_job_titles(id),
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create table if not exists public.time_kiosks (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.time_locations(id),
  name text not null,
  token text not null unique,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create table if not exists public.time_users (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  pin_hash text not null,
  role text not null check (role in ('admin','manager')),
  location_id uuid references public.time_locations(id),
  all_locations boolean not null default false,
  can_manage_employees boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint time_users_location_scope check (all_locations or location_id is not null)
);
create table if not exists public.time_punch_events (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.time_employees(id),
  location_id uuid not null references public.time_locations(id),
  kiosk_id uuid not null references public.time_kiosks(id),
  action public.time_punch_action not null,
  occurred_at timestamptz not null default now()
);
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
create table if not exists public.time_paid_time_off (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.time_employees(id),
  location_id uuid not null references public.time_locations(id),
  entry_type text not null check (entry_type in ('vacation','sick')),
  entry_date date not null,
  hours numeric(5,2) not null check (hours > 0 and hours <= 24),
  note text not null default '',
  created_by uuid references public.time_users(id),
  created_at timestamptz not null default now()
);
create unique index if not exists time_breaks_one_open_per_employee_idx
  on public.time_breaks(employee_id) where ended_at is null;
create index if not exists time_punch_events_employee_time_idx
  on public.time_punch_events(employee_id,occurred_at desc);
create index if not exists time_breaks_employee_start_idx
  on public.time_breaks(employee_id,started_at desc);
create index if not exists time_paid_time_off_date_idx
  on public.time_paid_time_off(entry_date);
create index if not exists time_paid_time_off_employee_idx
  on public.time_paid_time_off(employee_id);

create table if not exists public.bm_identities (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid unique references public.time_employees(id),
  display_name text not null,
  google_email text unique,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.bm_roles (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  description text not null default '',
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create table if not exists public.bm_permissions (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  description text not null default '',
  created_at timestamptz not null default now()
);
create table if not exists public.bm_role_permissions (
  role_id uuid not null references public.bm_roles(id) on delete cascade,
  permission_id uuid not null references public.bm_permissions(id) on delete cascade,
  primary key (role_id,permission_id)
);
create table if not exists public.bm_identity_roles (
  id uuid primary key default gen_random_uuid(),
  identity_id uuid not null references public.bm_identities(id) on delete cascade,
  role_id uuid not null references public.bm_roles(id) on delete cascade,
  scope_type text not null check (scope_type in ('self','location','department','company')),
  scope_ids uuid[] not null default '{}',
  expires_at timestamptz,
  granted_by uuid references public.bm_identities(id),
  reason text not null default '',
  created_at timestamptz not null default now()
);
create table if not exists public.bm_audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_identity_id uuid references public.bm_identities(id),
  approver_identity_id uuid references public.bm_identities(id),
  action text not null,
  resource_type text not null,
  resource_id text,
  location_id uuid,
  reason text not null default '',
  before_data jsonb,
  after_data jsonb,
  occurred_at timestamptz not null default now()
);

insert into public.time_locations(name,code) values
  ('Amityville','336'),('Bohemia','1611'),('Riverhead','1133'),('Windham','730')
on conflict (code) do nothing;
insert into public.time_job_titles(name) values
  ('Branch Manager'),('Sales'),('Warehouse'),('Driver'),('Administration'),
  ('Director of Operations'),('Door Shop Employee')
on conflict (name) do nothing;

alter table public.time_locations enable row level security;
alter table public.time_job_titles enable row level security;
alter table public.time_employees enable row level security;
alter table public.time_kiosks enable row level security;
alter table public.time_users enable row level security;
alter table public.time_punch_events enable row level security;
alter table public.time_breaks enable row level security;
alter table public.time_paid_time_off enable row level security;
alter table public.bm_identities enable row level security;
alter table public.bm_roles enable row level security;
alter table public.bm_permissions enable row level security;
alter table public.bm_role_permissions enable row level security;
alter table public.bm_identity_roles enable row level security;
alter table public.bm_audit_events enable row level security;

revoke all on all tables in schema public from anon, authenticated;
