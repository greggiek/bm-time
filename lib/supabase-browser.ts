import { createClient } from '@supabase/supabase-js';

const productionUrl = 'https://bmxhkgsgpxivzxepwvvq.supabase.co';
const productionPublishableKey = 'sb_publishable_mPdf0KizuFmOHb5pg4FhIA_83t-EymG';
let client: ReturnType<typeof createClient> | null = null;

export function getBrowserClient() {
  if (!client) client = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || productionUrl,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || productionPublishableKey,
  );
  return client;
}
