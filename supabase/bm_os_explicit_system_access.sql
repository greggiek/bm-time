-- BM OS access is intentionally independent from an employee's job title.
create table if not exists public.bm_identity_system_access (
  identity_id uuid not null references public.bm_identities(id) on delete cascade,
  system_code text not null check (system_code in ('time','academy','warehouse','sales','prospecting')),
  access_level text not null check (access_level in ('user','location_manager','company_manager','administrator')),
  scope_type text not null default 'self' check (scope_type in ('self','location','company')),
  scope_ids uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (identity_id, system_code)
);

create index if not exists bm_identity_system_access_system_idx
  on public.bm_identity_system_access(system_code, access_level);

alter table public.bm_identity_system_access enable row level security;
revoke all on public.bm_identity_system_access from anon, authenticated;
grant all on public.bm_identity_system_access to service_role;

-- Preserve the access BM OS currently reports before removing job-title coupling.
insert into public.bm_identity_system_access(identity_id, system_code, access_level, scope_type, scope_ids)
select distinct on (ir.identity_id)
  ir.identity_id,
  'time',
  case
    when bool_or(p.code = 'time.manage_company') then 'company_manager'
    when bool_or(p.code = 'time.manage_location') then 'location_manager'
    else 'user'
  end,
  case
    when bool_or(p.code = 'time.manage_company') then 'company'
    when bool_or(p.code = 'time.manage_location') then 'location'
    else 'self'
  end,
  case
    when bool_or(p.code = 'time.manage_location') and not bool_or(p.code = 'time.manage_company')
      then coalesce((select array_agg(distinct x) from public.bm_identity_roles z cross join lateral unnest(z.scope_ids) x where z.identity_id=ir.identity_id), '{}')
    else '{}'
  end
from public.bm_identity_roles ir
join public.bm_role_permissions rp on rp.role_id=ir.role_id
join public.bm_permissions p on p.id=rp.permission_id
where p.code like 'time.%'
group by ir.identity_id
on conflict (identity_id, system_code) do nothing;

insert into public.bm_identity_system_access(identity_id, system_code, access_level, scope_type, scope_ids)
select
  ir.identity_id,
  'academy',
  case
    when bool_or(p.code = 'academy.manage') then 'company_manager'
    when bool_or(p.code = 'academy.assign_location') then 'location_manager'
    else 'user'
  end,
  case
    when bool_or(p.code = 'academy.manage') then 'company'
    when bool_or(p.code = 'academy.assign_location') then 'location'
    else 'self'
  end,
  case
    when bool_or(p.code = 'academy.assign_location') and not bool_or(p.code = 'academy.manage')
      then coalesce((select array_agg(distinct x) from public.bm_identity_roles z cross join lateral unnest(z.scope_ids) x where z.identity_id=ir.identity_id), '{}')
    else '{}'
  end
from public.bm_identity_roles ir
join public.bm_role_permissions rp on rp.role_id=ir.role_id
join public.bm_permissions p on p.id=rp.permission_id
where p.code like 'academy.%'
group by ir.identity_id
on conflict (identity_id, system_code) do nothing;

-- These three systems were already protected by explicit access gates.
insert into public.bm_identity_system_access(identity_id, system_code, access_level, scope_type, scope_ids)
select ir.identity_id, replace(r.code, '_access', ''), 'user', ir.scope_type, ir.scope_ids
from public.bm_identity_roles ir
join public.bm_roles r on r.id=ir.role_id
where r.code in ('warehouse_access','sales_access','prospecting_access')
on conflict (identity_id, system_code) do nothing;

comment on table public.bm_identity_system_access is
  'Authoritative BM OS system access. Job titles must not grant rows in this table.';

-- Intentionally additive. Retire bm_job_title_roles only after administrators
-- verify the explicit access registry person by person in the BM OS UI.
