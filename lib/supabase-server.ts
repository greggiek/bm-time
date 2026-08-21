import { createClient } from '@supabase/supabase-js';

function previewDatabaseIsBlocked() {
  const usesDedicatedPreviewDatabase = process.env.NEXT_PUBLIC_SUPABASE_URL === 'https://dqpjojgmnhrcuybiiuxf.supabase.co';
  return (
    process.env.VERCEL === '1' &&
    process.env.VERCEL_ENV !== 'production' &&
    !usesDedicatedPreviewDatabase &&
    process.env.ALLOW_PREVIEW_DATABASE !== 'true'
  );
}

export function getAdminClient() {
  // Vercel preview deployments must never inherit access to the live BM Time
  // database. The known bm-time-development project is safe for previews;
  // any other preview database still requires explicit opt-in.
  if (previewDatabaseIsBlocked()) return null;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}
