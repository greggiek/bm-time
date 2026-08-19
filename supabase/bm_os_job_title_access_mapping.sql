-- BM OS DEVELOPMENT JOB-TITLE ACCESS MAPPING
-- Run only in the bm-time-development Supabase project.
-- Idempotent: safe to rerun.

begin;

create table if not exists public.bm_job_title_roles (
  job_title_id uuid not null references public.time_job_titles(id) on delete cascade,
  role_id uuid not null references public.bm_roles(id) on delete cascade,
  primary key (job_title_id, role_id)
);

alter table public.bm_job_title_roles enable row level security;
revoke all on public.bm_job_title_roles from anon, authenticated;

insert into public.bm_roles (code, name, description)
values
  ('staff_member', 'Staff Member', 'Basic BM OS and BM Academy access without time-clock permission'),
  ('time_clock_user', 'Time Clock User', 'BM Time clock-in, clock-out and personal time access'),
  ('sales', 'Sales', 'Employee-facing BM Sales and BM Prospecting access'),
  ('warehouse', 'Warehouse', 'BM Warehouse operational access'),
  ('driver', 'Driver', 'BM Warehouse delivery workflow access'),
  ('door_shop', 'Door Shop', 'BM Warehouse manufacturing workflow access'),
  ('administration', 'Administration', 'Administrative employee access'),
  ('operations_director', 'Director of Operations', 'Company-wide operational management access')
on conflict (code) do update set
  name = excluded.name,
  description = excluded.description,
  active = true;

insert into public.bm_permissions (code, description)
values
  ('os.access', 'Open the BM OS hub'),
  ('time.clock', 'Clock in, clock out and manage personal breaks'),
  ('time.view_self', 'View personal time records'),
  ('time.view_location', 'View time records for an assigned location'),
  ('time.manage_location', 'Manage BM Time for an assigned location'),
  ('time.manage_company', 'Manage BM Time company-wide'),
  ('warehouse.use', 'Use assigned BM Warehouse workflows'),
  ('warehouse.delivery', 'Use BM Warehouse delivery workflows'),
  ('warehouse.manufacturing', 'Use BM Warehouse manufacturing workflows'),
  ('warehouse.manage_location', 'Manage BM Warehouse for an assigned location'),
  ('warehouse.manage_company', 'Manage BM Warehouse company-wide'),
  ('academy.learn', 'View assigned SOPs, training and tests'),
  ('academy.assign_location', 'Assign BM Academy training within an assigned location'),
  ('academy.manage', 'Manage BM Academy company-wide'),
  ('prospecting.use', 'Use BM Prospecting'),
  ('prospecting.manage', 'Manage BM Prospecting'),
  ('trade.use', 'Use contractor-facing BM Trade tools'),
  ('trade.manage', 'Manage BM Trade'),
  ('sales.use', 'Use employee-facing BM Sales'),
  ('sales.manage_location', 'Manage BM Sales for an assigned location'),
  ('sales.manage_company', 'Manage BM Sales company-wide'),
  ('os.manage_identities', 'Manage BM OS identities'),
  ('os.manage_roles', 'Manage BM OS roles and permissions'),
  ('os.view_audit', 'View BM OS audit history')
on conflict (code) do update set description = excluded.description;

-- Replace each managed role's permission bundle so reruns remain deterministic.
delete from public.bm_role_permissions
where role_id in (
  select id from public.bm_roles
  where code in ('staff_member','time_clock_user','sales','warehouse','driver','door_shop','administration','branch_manager','operations_director','company_admin')
);

insert into public.bm_role_permissions (role_id, permission_id)
select r.id, p.id
from public.bm_roles r
join public.bm_permissions p on
  (r.code = 'staff_member' and p.code in ('os.access','academy.learn')) or
  (r.code = 'time_clock_user' and p.code in ('time.clock','time.view_self')) or
  (r.code = 'sales' and p.code in ('prospecting.use','sales.use')) or
  (r.code = 'warehouse' and p.code in ('warehouse.use')) or
  (r.code = 'driver' and p.code in ('warehouse.use','warehouse.delivery')) or
  (r.code = 'door_shop' and p.code in ('warehouse.use','warehouse.manufacturing')) or
  (r.code = 'administration' and p.code in ('os.access','academy.learn')) or
  (r.code = 'branch_manager' and p.code in (
    'os.access','time.clock','time.view_self','time.view_location','time.manage_location',
    'warehouse.use','warehouse.manage_location','academy.learn','academy.assign_location',
    'prospecting.use','sales.use','sales.manage_location'
  )) or
  (r.code = 'operations_director' and p.code in (
    'os.access','time.view_location','time.manage_company','warehouse.use','warehouse.manage_company',
    'academy.learn','academy.manage','prospecting.use','prospecting.manage',
    'sales.use','sales.manage_company','os.view_audit'
  )) or
  (r.code = 'company_admin');

-- Job-title defaults. Time-clock permission is assigned separately below.
insert into public.bm_job_title_roles (job_title_id, role_id)
select jt.id, r.id
from public.time_job_titles jt
join public.bm_roles r on
  (lower(jt.name) = 'branch manager' and r.code = 'branch_manager') or
  (lower(jt.name) = 'sales' and r.code = 'sales') or
  (lower(jt.name) = 'warehouse' and r.code = 'warehouse') or
  (lower(jt.name) = 'driver' and r.code = 'driver') or
  (lower(jt.name) in ('door shop worker','door shop employee','door shop') and r.code = 'door_shop') or
  (lower(jt.name) = 'administration' and r.code = 'administration') or
  (lower(jt.name) = 'director of operations' and r.code = 'operations_director')
on conflict do nothing;

-- Every active identity gets basic BM OS and Academy access.
insert into public.bm_identity_roles (identity_id, role_id, scope_type, scope_ids, reason)
select i.id, r.id, 'self', '{}', 'Default staff access'
from public.bm_identities i
cross join public.bm_roles r
where i.active = true
  and r.code = 'staff_member'
  and not exists (
    select 1 from public.bm_identity_roles x
    where x.identity_id = i.id and x.role_id = r.id and x.scope_type = 'self'
  );

-- Only identities linked to active BM Time employees get time-clock permission.
insert into public.bm_identity_roles (identity_id, role_id, scope_type, scope_ids, reason)
select i.id, r.id, 'self', '{}', 'Active BM Time employee with PIN access'
from public.bm_identities i
join public.time_employees e on e.id = i.employee_id and e.active = true
cross join public.bm_roles r
where i.active = true
  and r.code = 'time_clock_user'
  and not exists (
    select 1 from public.bm_identity_roles x
    where x.identity_id = i.id and x.role_id = r.id and x.scope_type = 'self'
  );

-- Add job-specific access scoped to the employee's primary location.
insert into public.bm_identity_roles (identity_id, role_id, scope_type, scope_ids, reason)
select
  i.id,
  map.role_id,
  case when r.code = 'operations_director' then 'company' else 'location' end,
  case when r.code = 'operations_director' then '{}'::uuid[] else array[e.primary_location_id] end,
  'Default access from job title: ' || jt.name
from public.bm_identities i
join public.time_employees e on e.id = i.employee_id and e.active = true
join public.time_job_titles jt on jt.id = e.job_title_id
join public.bm_job_title_roles map on map.job_title_id = jt.id
join public.bm_roles r on r.id = map.role_id
where i.active = true
  and not exists (
    select 1 from public.bm_identity_roles x
    where x.identity_id = i.id
      and x.role_id = map.role_id
      and x.scope_type = case when r.code = 'operations_director' then 'company' else 'location' end
      and (
        r.code = 'operations_director'
        or e.primary_location_id = any(x.scope_ids)
      )
  );

commit;

-- Audit summary. Expected: 59 Staff Members and 53 Time Clock Users.
select r.name as role, count(*) as assignments
from public.bm_identity_roles ir
join public.bm_roles r on r.id = ir.role_id
group by r.name
order by r.name;

