import { createClient } from '@supabase/supabase-js';

function previewDatabaseIsBlocked() {
  return (
    process.env.VERCEL === '1' &&
    process.env.VERCEL_ENV !== 'production' &&
    process.env.ALLOW_PREVIEW_DATABASE !== 'true'
  );
}

export function getAdminClient() {
  // Vercel preview deployments must never inherit access to the live BM Time
  // database. Connect a dedicated preview Supabase project and explicitly set
  // ALLOW_PREVIEW_DATABASE=true when the preview environment is ready.
  if (previewDatabaseIsBlocked()) return null;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}
