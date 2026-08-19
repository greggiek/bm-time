export function bmOsIdentityEnabled() {
  return process.env.BM_OS_IDENTITY_ENABLED === 'true';
}

// This flag intentionally defaults to false. New BM OS authorization must not
// affect the existing BM Time routes until the migration is tested and approved.
