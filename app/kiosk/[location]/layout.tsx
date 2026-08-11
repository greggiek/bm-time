import type { Metadata } from 'next';

const LOCATIONS: Record<string, string> = {
  amityville: 'Amityville',
  bohemia: 'Bohemia',
  riverhead: 'Riverhead',
  windham: 'Windham',
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ location: string }>;
}): Promise<Metadata> {
  const { location } = await params;
  const slug = location.toLowerCase();
  const name = LOCATIONS[slug];

  if (!name) return {};

  return {
    title: `BM Time — ${name}`,
    manifest: `/kiosk/${slug}/manifest.webmanifest`,
  };
}

export default function LocationKioskLayout({ children }: { children: React.ReactNode }) {
  return children;
}
