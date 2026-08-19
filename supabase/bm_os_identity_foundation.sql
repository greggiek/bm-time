-- DRAFT ONLY: do not run against production until the live schema is exported,
-- reviewed, backed up, and tested in a separate Supabase project.
--
-- These tables are additive and intentionally do not alter existing time_ tables.

create table if not exists public.bm_identities (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid unique,
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
  primary key (role_id, permission_id)
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

create index if not exists bm_identity_roles_identity_idx
  on public.bm_identity_roles(identity_id);
create index if not exists bm_audit_events_resource_idx
  on public.bm_audit_events(resource_type, resource_id, occurred_at desc);
create index if not exists bm_audit_events_actor_idx
  on public.bm_audit_events(actor_identity_id, occurred_at desc);

alter table public.bm_identities enable row level security;
alter table public.bm_roles enable row level security;
alter table public.bm_permissions enable row level security;
alter table public.bm_role_permissions enable row level security;
alter table public.bm_identity_roles enable row level security;
alter table public.bm_audit_events enable row level security;

revoke all on table public.bm_identities from anon, authenticated;
revoke all on table public.bm_roles from anon, authenticated;
revoke all on table public.bm_permissions from anon, authenticated;
revoke all on table public.bm_role_permissions from anon, authenticated;
revoke all on table public.bm_identity_roles from anon, authenticated;
revoke all on table public.bm_audit_events from anon, authenticated;
