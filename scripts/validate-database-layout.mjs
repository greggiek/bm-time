import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const required = [
  'supabase/CANONICAL_DATABASE.md',
  'supabase/schema.sql',
  'supabase/development_bootstrap.sql'
];

for (const relative of required) {
  if (!existsSync(join(root, relative))) {
    throw new Error(`Missing required database governance file: ${relative}`);
  }
}

const readme = readFileSync(join(root, 'README.md'), 'utf8');
if (/run\s+`?supabase\/schema\.sql`?/i.test(readme)) {
  throw new Error('README still instructs users to run the obsolete schema.sql setup path.');
}

const sqlFiles = readdirSync(join(root, 'supabase'))
  .filter((name) => name.endsWith('.sql'))
  .sort();

const allowedLegacy = new Set([
  'bm_os_academy_foundation.sql',
  'bm_os_crm_identity_link.sql',
  'bm_os_explicit_roster_access.sql',
  'bm_os_explicit_system_access.sql',
  'bm_os_identity_foundation.sql',
  'bm_os_job_title_access_mapping.sql',
  'bm_os_sso_handoffs.sql',
  'development_bootstrap.sql',
  'hr_onboarding.sql',
  'schema.sql',
  'time_breaks.sql',
  'time_paid_time_off.sql'
]);

const unexpected = sqlFiles.filter((name) => !allowedLegacy.has(name));
if (unexpected.length) {
  throw new Error(`Unclassified loose Supabase SQL: ${unexpected.join(', ')}`);
}

console.log(`Database layout validated; ${sqlFiles.length} legacy SQL files are explicitly classified.`);
