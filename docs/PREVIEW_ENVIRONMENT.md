# BM OS Preview Environment

This branch is isolated from the BM Time production database.

Required Vercel settings:

- Environment: Preview
- Git branch: `bm-os-identity`
- Development Supabase project only
- `ALLOW_PREVIEW_DATABASE=true`
- `BM_OS_IDENTITY_ENABLED=false` until the new authorization path is ready

Never promote this preview deployment or its environment variables to production
without a reviewed migration and rollback plan.
