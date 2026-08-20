-- BM OS DEVELOPMENT: APPLY EXPLICIT ROSTER SYSTEM ACCESS
-- Source of truth: live Google Sheet "Bargain Academy — SOP Training by Role", Roster tab.
-- Run only in bm-time-development. Idempotent and safe to rerun.

begin;

create temporary table bm_roster_system_access (
  display_name text not null,
  google_email text,
  employee_number text,
  bm_warehouse boolean not null,
  bm_sales boolean not null,
  bm_prospecting boolean not null
) on commit drop;

insert into bm_roster_system_access
  (display_name,google_email,employee_number,bm_warehouse,bm_sales,bm_prospecting)
values
  ('Evener Josue Umanzor','evener.umanzor@bargainmoulding.com','2002',true,false,false),
  ('Irvin Velasquez','irvin.velasquez@bargainmoulding.com','5515',true,false,false),
  ('Joseph Gonzalez','joeyg@bargainmoulding.com','551',true,false,false),
  ('Salvador Portillo','sal@bargainmoulding.com','453',true,false,false),
  ('Christian Mendoza','christian.mendoza@bargainmoulding.com','7574',false,true,false),
  ('Craig Feltz','craig@bargainmoulding.com','3193',false,true,false),
  ('Cruz JoseLuis','cruz@bargainmoulding.com','9008',true,true,false),
  ('Alejandro Lopez Aguilar','','9705',true,false,false),
  ('Edwin Santos','edwin@bargainmoulding.com','',true,true,false),
  ('Angel Uceda Benitez','','8820',true,false,false),
  ('Arley Marulanda Castano','','2708',true,false,false),
  ('Bryan Flores','','7849',true,false,false),
  ('Franclin Hernandez','franclin@bargainmoulding.com','4453',true,true,false),
  ('Gerald Garcia','jerry@bargainmoulding.com','6254',false,true,false),
  ('Greg K','greg@bargainmoulding.com','1',true,true,true),
  ('Daniel Castro','','18',true,false,false),
  ('Eli Ameya','','3792',true,false,false),
  ('Jack Donnelly-Swanson','jack.donnelly@bargainmoulding.com','2719',false,true,false),
  ('Jason Benitez','jason@bargainmoulding.com','3621',true,true,false),
  ('Jay Gambino','jay@bargainmoulding.com','DEV-4428',true,true,false),
  ('Erik Flores','','1375',true,false,false),
  ('Jeffery Ricottone','jeff@bargainmoulding.com','6969',true,true,false),
  ('Herson Umanzor','','3927',true,false,false),
  ('Jeferson Velasquez','','2868',true,false,false),
  ('Jose Rivera','jose@bargainmoulding.com','2106',true,false,false),
  ('Jose Arias','','8353',true,false,false),
  ('Joshua Gonsalves','','4806',true,false,false),
  ('Leighton Carriera','','5316',true,false,false),
  ('Kevin Bonilla','kevinb@bargainmoulding.com','9549',false,true,false),
  ('Melvin Alvarado','','5119',true,false,false),
  ('Lilly Moran','lilly.moran@bargainmoulding.com','6100',false,true,false),
  ('Luis Rubio Cabrera','luis@bargainmoulding.com','5212',false,true,false),
  ('Matthew Kleczka','matt@bargainmoulding.com','',true,true,true),
  ('Michael Gorcenski','','6290',true,false,false),
  ('Omar Gonzalez Zelaya','omar.gonzalez@bargainmoulding.com','8158',true,false,false),
  ('Pedro Argueta','','4580',true,false,false),
  ('Owen Cassidy','owenc@bargainmoulding.com','512',true,true,true),
  ('Percy Almeyda','percy@bargainmoulding.com','3711',true,false,false),
  ('Selvin Uceda','','1642',true,false,false),
  ('Justin Messineo','justin@bargainmoulding.com','',true,true,true);

insert into public.bm_roles (code,name,description)
values
  ('warehouse_access','BM Warehouse Access','Explicit access selected in the employee roster'),
  ('sales_access','BM Sales Access','Explicit access selected in the employee roster'),
  ('prospecting_access','BM Prospecting Access','Explicit access selected in the employee roster')
on conflict (code) do update set
  name=excluded.name,
  description=excluded.description,
  active=true;

-- System entry is controlled only by the explicit access roles.
delete from public.bm_role_permissions
where role_id in (
  select id from public.bm_roles
  where code in ('warehouse_access','sales_access','prospecting_access')
);

insert into public.bm_role_permissions (role_id,permission_id)
select r.id,p.id
from public.bm_roles r
join public.bm_permissions p on
  (r.code='warehouse_access' and p.code='warehouse.use')
  or (r.code='sales_access' and p.code='sales.use')
  or (r.code='prospecting_access' and p.code='prospecting.use');

-- Remove inferred system-entry permissions from job-title roles.
delete from public.bm_role_permissions rp
using public.bm_roles r, public.bm_permissions p
where rp.role_id=r.id
  and rp.permission_id=p.id
  and r.code in (
    'sales','warehouse','driver','door_shop','administration',
    'branch_manager','warehouse_manager','door_shop_manager','operations_director'
  )
  and p.code in ('warehouse.use','sales.use','prospecting.use');

-- Rebuild only the three explicit system-access assignments.
delete from public.bm_identity_roles
where role_id in (
  select id from public.bm_roles
  where code in ('warehouse_access','sales_access','prospecting_access')
);

with matched as (
  select distinct
    i.id as identity_id,
    a.bm_warehouse,
    a.bm_sales,
    a.bm_prospecting
  from bm_roster_system_access a
  join public.bm_identities i
    on (
      nullif(a.google_email,'') is not null
      and lower(i.google_email)=lower(a.google_email)
    )
    or lower(i.display_name)=lower(a.display_name)
  left join public.time_employees e on e.id=i.employee_id
  where
    nullif(a.employee_number,'') is null
    or e.id is null
    or ltrim(e.employee_number,'0')=ltrim(a.employee_number,'0')
),
wanted as (
  select identity_id,'warehouse_access'::text as role_code from matched where bm_warehouse
  union all
  select identity_id,'sales_access' from matched where bm_sales
  union all
  select identity_id,'prospecting_access' from matched where bm_prospecting
)
insert into public.bm_identity_roles
  (identity_id,role_id,scope_type,scope_ids,reason)
select
  w.identity_id,
  r.id,
  case
    when lower(coalesce(i.google_email,'')) in (
      'greg@bargainmoulding.com',
      'matt@bargainmoulding.com',
      'edwin@bargainmoulding.com',
      'justin@bargainmoulding.com'
    ) then 'company'
    when e.primary_location_id is not null then 'location'
    else 'self'
  end,
  case
    when lower(coalesce(i.google_email,'')) in (
      'greg@bargainmoulding.com',
      'matt@bargainmoulding.com',
      'edwin@bargainmoulding.com',
      'justin@bargainmoulding.com'
    ) then '{}'::uuid[]
    when e.primary_location_id is not null then array[e.primary_location_id]
    else '{}'::uuid[]
  end,
  'Explicit X selection from Roster tab'
from wanted w
join public.bm_roles r on r.code=w.role_code
join public.bm_identities i on i.id=w.identity_id
left join public.time_employees e on e.id=i.employee_id;

-- A job title can set the level only inside a roster-approved system.
-- Remove materialized job-role assignments when the matching X is absent.
delete from public.bm_identity_roles ir
using public.bm_roles r
where ir.role_id=r.id
  and ir.reason like 'Default access from job title:%'
  and (
    (
      r.code in ('warehouse','driver','door_shop','warehouse_manager','door_shop_manager')
      and not exists (
        select 1
        from public.bm_identity_roles access_ir
        join public.bm_roles access_role on access_role.id=access_ir.role_id
        where access_ir.identity_id=ir.identity_id
          and access_role.code='warehouse_access'
      )
    )
    or
    (
      r.code='sales'
      and not exists (
        select 1
        from public.bm_identity_roles access_ir
        join public.bm_roles access_role on access_role.id=access_ir.role_id
        where access_ir.identity_id=ir.identity_id
          and access_role.code='sales_access'
      )
    )
  );

-- Remove the obsolete manual assignment superseded by the roster and current job title.
delete from public.bm_identity_roles ir
using public.bm_roles r, public.bm_identities i
where ir.role_id=r.id
  and ir.identity_id=i.id
  and r.code='branch_manager'
  and lower(coalesce(i.google_email,''))='jay@bargainmoulding.com'
  and ir.reason='Initial Amityville Branch Manager assignment';

commit;

select
  r.name as system_access,
  count(*) as assignments
from public.bm_identity_roles ir
join public.bm_roles r on r.id=ir.role_id
where r.code in ('warehouse_access','sales_access','prospecting_access')
group by r.name
order by r.name;

