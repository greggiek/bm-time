import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getAdminClient } from '@/lib/supabase-server';

const RequestSchema = z.object({
  kioskToken: z.string().min(8),
});

const demoLocations = [
  { kioskId: '00000000-0000-4000-8000-000000000336', name: 'Amityville' },
  { kioskId: '00000000-0000-4000-8000-000000001611', name: 'Bohemia' },
  { kioskId: '00000000-0000-4000-8000-000000001133', name: 'Riverhead' },
  { kioskId: '00000000-0000-4000-8000-000000000730', name: 'Windham' },
];

export async function POST(request: Request) {
  const parsed = RequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ message: 'This kiosk is not registered.' }, { status: 401 });
  }

  if (process.env.NEXT_PUBLIC_DEMO_MODE === 'true') {
    return NextResponse.json({
      warehouses: demoLocations,
      defaultKioskId: demoLocations[0].kioskId,
    });
  }

  const supabase = getAdminClient();
  if (!supabase) {
    return NextResponse.json({ message: 'Supabase is not configured.' }, { status: 503 });
  }

  const { data: authorizedKiosk, error: authorizationError } = await supabase
    .from('time_kiosks')
    .select('id,location_id')
    .eq('token', parsed.data.kioskToken)
    .eq('active', true)
    .maybeSingle();

  if (authorizationError || !authorizedKiosk) {
    return NextResponse.json({ message: 'This kiosk is not registered.' }, { status: 401 });
  }

  const { data, error } = await supabase
    .from('time_kiosks')
    .select('id,location_id,time_locations!time_kiosks_location_id_fkey(name)')
    .eq('active', true);

  if (error) {
    return NextResponse.json({ message: 'Unable to load locations.' }, { status: 500 });
  }

  const byLocation = new Map<string, { kioskId: string; name: string }>();
  const orderedKiosks = [
    ...(data || []).filter((kiosk: any) => kiosk.id === authorizedKiosk.id),
    ...(data || []).filter((kiosk: any) => kiosk.id !== authorizedKiosk.id),
  ];

  for (const kiosk of orderedKiosks as any[]) {
    if (!byLocation.has(kiosk.location_id)) {
      byLocation.set(kiosk.location_id, {
        kioskId: kiosk.id,
        name: kiosk.time_locations?.name || 'Unnamed location',
      });
    }
  }

  const warehouses = Array.from(byLocation.values()).sort((a, b) => a.name.localeCompare(b.name));
  const defaultWarehouse = Array.from(byLocation.entries())
    .find(([locationId]) => locationId === authorizedKiosk.location_id)?.[1];

  return NextResponse.json({
    warehouses,
    defaultKioskId: defaultWarehouse?.kioskId || warehouses[0]?.kioskId || '',
  });
}
