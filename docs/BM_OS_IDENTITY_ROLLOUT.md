# BM OS Identity Rollout

## Safety rules

- `main` remains the production branch.
- All BM OS identity work happens on `bm-os-identity`.
- `BM_OS_IDENTITY_ENABLED` defaults to false.
- Vercel previews cannot access Supabase unless `ALLOW_PREVIEW_DATABASE=true`.
- Never point a preview deployment at the production Supabase project.
- SQL in `supabase/bm_os_identity_foundation.sql` is a draft and must not be run
  until the live schema is exported, reviewed, backed up, and tested.
- Existing employee punching remains unchanged until an approved cutover.

## Authentication model

Every person receives one BM identity. Authentication may be:

1. Registered kiosk + employee number/badge + PIN for hourly workflows.
2. Google Workspace login for managers, sales, office, HR, and administrators.
3. Manager re-authentication for sensitive approvals.

Authentication proves identity. Permissions separately determine what the person
may do.

## Authorization model

Job title supplies default role assignments. Routes authorize explicit
permissions with a data scope:

- self
- one or more locations
- one or more departments
- companywide

Individual exceptions are additional time-limited grants with a reason and
granting manager. New access is denied by default.

## Rollout phases

1. Export and normalize the live Supabase schema.
2. Create a separate Supabase preview project with fake employees and punches.
3. Apply and test the additive BM identity tables in preview.
4. Map existing BM Time employees and managers to identities without changing
   existing authentication.
5. Add role and permission administration behind the disabled feature flag.
6. Add Google Workspace login and link approved emails to identities.
7. Convert one read-only route to permission checks and compare results.
8. Add audit logging and manager re-authentication.
9. Run a controlled pilot at one location.
10. Enable production only after backup, approval, and rollback testing.
