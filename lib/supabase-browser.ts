import { createClient } from '@supabase/supabase-js';

const productionUrl = 'https://bmxhkgsgpxivzxepwvvq.supabase.co';
const productionPublishableKey = 'sb_publishable_mPdf0KizuFmOHb5pg4FhIA_83t-EymG';
const developmentUrl = 'https://dqpjojgmnhrcuybiiuxf.supabase.co';
const developmentPublishableKey = 'sb_publishable_eTGxWz9sRZocLaXD92YMcw_Q1Ilp146';
let client: ReturnType<typeof createClient> | null = null;

export function getBrowserClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || productionUrl;
  const knownProjectKey = url === developmentUrl
    ? developmentPublishableKey
    : url === productionUrl
      ? productionPublishableKey
      : null;
  const key = knownProjectKey || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!key) throw new Error('Supabase publishable key is not configured for this project.');
  if (!client) client = createClient(url, key);
  return client;
}
