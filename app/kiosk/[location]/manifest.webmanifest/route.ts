import { NextResponse } from 'next/server';

const LOCATIONS: Record<string, string> = {
  amityville: 'Amityville',
  bohemia: 'Bohemia',
  riverhead: 'Riverhead',
  windham: 'Windham',
};

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ location: string }> },
) {
  const { location } = await params;
  const slug = location.toLowerCase();
  const name = LOCATIONS[slug];

  if (!name) {
    return NextResponse.json({ message: 'Unknown kiosk location.' }, { status: 404 });
  }

  return NextResponse.json(
    {
      name: `BM Time — ${name}`,
      short_name: `BM ${name}`,
      start_url: `/kiosk/${slug}`,
      scope: `/kiosk/${slug}`,
      display: 'standalone',
      background_color: '#f5f6f7',
      theme_color: '#151515',
      orientation: 'portrait',
    },
    {
      headers: {
        'content-type': 'application/manifest+json',
        'cache-control': 'public, max-age=300',
      },
    },
  );
}
