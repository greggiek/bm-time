# BM OS canonical database process

## Current status

Production is the authoritative schema while the historical migration chain is
being consolidated. The legacy SQL files in this directory are retained as
evidence, not as independent setup choices.

Known historical drift:

- Production contains CRM tables whose original foundation migration was not
  recorded in Git or the Supabase migration ledger.
- `schema.sql` describes the obsolete `locations`, `employees`, and
  `punch_events` model. Production uses the `time_*` model.
- `development_bootstrap.sql` is a development convenience script, not a
  Production migration or canonical baseline.

## One supported method

1. Capture a data-free schema from the live Production database.
2. Review the capture for tables, functions, triggers, policies, grants,
   extensions, indexes, and scheduled jobs.
3. Commit it as the numbered baseline in `supabase/migrations/`.
4. Put every later schema change in exactly one newer numbered migration.
5. Rebuild an empty disposable database and run application tests.
6. Merge only when the empty-database replay succeeds.

Direct Production SQL is prohibited except for an approved emergency. Any
emergency SQL must be copied immediately into a migration and replay-tested.

## File classifications

| Path | Classification | Action |
| --- | --- | --- |
| `schema.sql` | Obsolete MVP schema | Retain temporarily for audit; never run |
| `development_bootstrap.sql` | Development-only bootstrap | Retain temporarily; never run in Production |
| `time_*.sql` | Historical additive changes | Fold into the baseline |
| `bm_os_*.sql` | Current identity/access history | Preserve and order after the baseline |
| `hr_onboarding.sql` | Current onboarding history | Preserve and order after the baseline |

## Required gate

Run `npm run db:validate` before committing database work. The validator rejects
the obsolete setup instruction and requires the canonical documentation and
migration directory. A later consolidation commit will tighten this gate to
require the completed baseline and a clean-room replay receipt.
