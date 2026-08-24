create table if not exists public.bm_sso_handoffs (
  token_hash text primary key,
  identity_id uuid not null references public.bm_identities(id) on delete cascade,
  target_system text not null check (target_system in ('warehouse', 'prospecting')),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists bm_sso_handoffs_expires_idx on public.bm_sso_handoffs(expires_at);
alter table public.bm_sso_handoffs enable row level security;
revoke all on public.bm_sso_handoffs from anon, authenticated;
grant all on public.bm_sso_handoffs to service_role;
