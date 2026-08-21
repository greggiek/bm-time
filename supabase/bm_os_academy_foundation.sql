-- BM Academy foundation. Run against the BM OS development project first.
create table if not exists public.academy_job_title_modules (
  job_title_id uuid not null references public.time_job_titles(id) on delete cascade,
  module_code text not null,
  required boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (job_title_id, module_code)
);

create table if not exists public.academy_attempts (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.time_employees(id) on delete cascade,
  module_code text not null,
  score smallint not null check (score between 0 and 5),
  passed boolean not null,
  attempted_at timestamptz not null default now()
);

create table if not exists public.academy_completions (
  employee_id uuid not null references public.time_employees(id) on delete cascade,
  module_code text not null,
  latest_score smallint not null check (latest_score between 0 and 5),
  completed_at timestamptz not null default now(),
  primary key (employee_id, module_code)
);

create index if not exists academy_attempts_employee_module_idx
  on public.academy_attempts(employee_id, module_code, attempted_at desc);

alter table public.academy_job_title_modules enable row level security;
alter table public.academy_attempts enable row level security;
alter table public.academy_completions enable row level security;
revoke all on public.academy_job_title_modules from anon, authenticated;
revoke all on public.academy_attempts from anon, authenticated;
revoke all on public.academy_completions from anon, authenticated;

with modules(code, school) as (
  values
    ('door-01','door'),('door-02','door'),('door-03','door'),('door-04','door'),('door-05','door'),('door-06','door'),('door-07','door'),('door-08','door'),
    ('moulding-01','moulding'),('moulding-02','moulding'),('moulding-03','moulding'),('moulding-04','moulding'),('moulding-05','moulding'),('moulding-06','moulding'),('moulding-07','moulding'),('moulding-08','moulding'),
    ('pvc-01','pvc'),('pvc-02','pvc'),('pvc-03','pvc'),('pvc-04','pvc'),('pvc-05','pvc'),('pvc-06','pvc'),('pvc-07','pvc'),('pvc-08','pvc'),
    ('sop-cash','sop'),('sop-delivery','sop'),('sop-returns','sop'),('sop-damaged','sop'),('sop-backorders','sop'),('sop-cycle-count','sop'),('sop-purchase-orders','sop')
), school_rules(job_title, school) as (
  values
    ('Counter Sales','door'),('Counter Sales','moulding'),('Counter Sales','pvc'),
    ('Inside Sales','door'),('Inside Sales','moulding'),('Inside Sales','pvc'),
    ('Branch Manager','door'),('Branch Manager','moulding'),('Branch Manager','pvc'),
    ('Warehouse Manager','moulding'),('Warehouse Manager','pvc'),
    ('Warehouse Worker','moulding'),('Warehouse Worker','pvc'),
    ('Door Shop Manager','door'),('Door Shop Worker','door'),('Door Shop Employee','door'),
    ('Inventory Manager','moulding'),('Inventory Manager','pvc')
), sop_rules(job_title, code) as (
  values
    ('Counter Sales','sop-cash'),('Counter Sales','sop-returns'),('Counter Sales','sop-backorders'),
    ('Inside Sales','sop-cash'),('Inside Sales','sop-returns'),('Inside Sales','sop-backorders'),('Inside Sales','sop-purchase-orders'),
    ('Branch Manager','sop-cash'),('Branch Manager','sop-returns'),('Branch Manager','sop-backorders'),('Branch Manager','sop-damaged'),('Branch Manager','sop-cycle-count'),('Branch Manager','sop-purchase-orders'),
    ('Kitchen Cabinet Specialist','sop-cash'),('Kitchen Cabinet Specialist','sop-returns'),('Kitchen Cabinet Specialist','sop-backorders'),('Kitchen Cabinet Specialist','sop-purchase-orders'),
    ('Warehouse Manager','sop-delivery'),('Warehouse Manager','sop-damaged'),('Warehouse Manager','sop-backorders'),('Warehouse Manager','sop-cycle-count'),('Warehouse Manager','sop-purchase-orders'),
    ('Warehouse Worker','sop-damaged'),('Warehouse Worker','sop-cycle-count'),
    ('Door Shop Manager','sop-damaged'),('Door Shop Manager','sop-cycle-count'),('Door Shop Worker','sop-damaged'),('Door Shop Employee','sop-damaged'),
    ('Delivery Driver','sop-delivery'),('Delivery Driver','sop-damaged'),('Driver','sop-delivery'),('Driver','sop-damaged'),
    ('Inventory Manager','sop-damaged'),('Inventory Manager','sop-backorders'),('Inventory Manager','sop-cycle-count'),('Inventory Manager','sop-purchase-orders'),
    ('Accounting','sop-cash'),('Accounting','sop-returns'),('Accounting','sop-purchase-orders')
), desired as (
  select jt.id job_title_id, m.code module_code
  from school_rules r join public.time_job_titles jt on lower(jt.name)=lower(r.job_title) join modules m on m.school=r.school
  union
  select jt.id, r.code from sop_rules r join public.time_job_titles jt on lower(jt.name)=lower(r.job_title)
  union
  select jt.id, m.code from public.time_job_titles jt cross join modules m where lower(jt.name) in ('coo','director of operations')
)
insert into public.academy_job_title_modules(job_title_id,module_code)
select job_title_id,module_code from desired on conflict do nothing;
