-- Non-sensitive HR onboarding checklist for BM Time.
create table if not exists public.hr_onboarding_records (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.time_employees(id) on delete restrict,
  start_date date,
  assigned_manager text not null default '' check (char_length(assigned_manager) <= 120),
  notes text not null default '' check (char_length(notes) <= 1000),
  status text not null default 'active' check (status in ('active', 'completed', 'cancelled')),
  created_by_name text not null check (char_length(created_by_name) <= 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (employee_id)
);

create table if not exists public.hr_onboarding_items (
  id uuid primary key default gen_random_uuid(),
  onboarding_id uuid not null references public.hr_onboarding_records(id) on delete cascade,
  item_key text not null check (char_length(item_key) <= 80),
  label text not null check (char_length(label) <= 180),
  sort_order integer not null default 0,
  completed boolean not null default false,
  completed_by_name text,
  completed_at timestamptz,
  unique (onboarding_id, item_key)
);

create index if not exists hr_onboarding_records_status_idx on public.hr_onboarding_records(status, created_at desc);
create index if not exists hr_onboarding_items_record_idx on public.hr_onboarding_items(onboarding_id, sort_order);

alter table public.hr_onboarding_records enable row level security;
alter table public.hr_onboarding_items enable row level security;
revoke all on public.hr_onboarding_records from anon, authenticated;
revoke all on public.hr_onboarding_items from anon, authenticated;
grant all on public.hr_onboarding_records to service_role;
grant all on public.hr_onboarding_items to service_role;

comment on table public.hr_onboarding_records is
  'Non-sensitive onboarding workflow only. Never store SSNs, DOBs, tax, banking, medical, I-9 document numbers, or identity-document images.';

