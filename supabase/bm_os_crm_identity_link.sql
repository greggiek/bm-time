alter table public.crm_users
  add column if not exists bm_identity_id uuid
  references public.bm_identities(id) on delete restrict;

create unique index if not exists crm_users_bm_identity_id_key
  on public.crm_users(bm_identity_id)
  where bm_identity_id is not null;

update public.crm_users as crm
set bm_identity_id = identity.id,
    updated_at = now()
from public.bm_identities as identity
where crm.bm_identity_id is null
  and identity.active = true
  and identity.google_email is not null
  and lower(identity.google_email) = lower(crm.email);

