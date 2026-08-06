import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { readSessionToken, sessionCookie } from '@/lib/auth-session';
import { getAdminClient } from '@/lib/supabase-server';

const BaseSchema = z.object({
  action: z.string().optional(),
});

const CreateSchema = z.object({
  action: z.literal('create'),
  name: z.string().trim().min(1).max(100),
  pin: z.string().regex(/^\d{4}$/),
  locationId: z.string().uuid().nullable(),
  allLocations: z.boolean(),
});

const UpdateSchema = z.object({
  action: z.literal('update'),
  userId: z.string().uuid(),
  name: z.string().trim().min(1).max(100),
  pin: z.union([z.literal(''), z.string().regex(/^\d{4}$/)]).optional(),
  locationId: z.string().uuid().nullable(),
  allLocations: z.boolean(),
  active: z.boolean(),
});

const DeactivateSchema = z.object({
  action: z.literal('deactivate'),
  userId: z.string().uuid(),
});

export async function POST(request: NextRequest) {
  const session = readSessionToken(request.cookies.get(sessionCookie.name)?.value);
  if (!session) {
    return NextResponse.json({ message: 'Sign in with your administrator PIN.' }, { status: 401 });
  }
  if (session.role !== 'admin') {
    return NextResponse.json({ message: 'Administrator access is required.' }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const base = BaseSchema.safeParse(body);
  if (!base.success) {
    return NextResponse.json({ message: 'Invalid request.' }, { status: 400 });
  }

  const supabase = getAdminClient();
  if (!supabase) {
    return NextResponse.json({ message: 'Supabase is not configured.' }, { status: 503 });
  }

  if (body.action === 'create') {
    const parsed = CreateSchema.safeParse(body);
    if (!parsed.success || (!parsed.data.allLocations && !parsed.data.locationId)) {
      return NextResponse.json({ message: 'Enter a name, 4-digit PIN, and warehouse access.' }, { status: 400 });
    }

    if (await pinIsTaken(supabase, parsed.data.pin)) {
      return NextResponse.json({ message: 'That PIN is already assigned to another user.' }, { status: 409 });
    }

    const pinHash = await bcrypt.hash(parsed.data.pin, 10);
    const { error } = await supabase.from('time_users').insert({
      name: parsed.data.name,
      pin_hash: pinHash,
      role: 'manager',
      location_id: parsed.data.allLocations ? null : parsed.data.locationId,
      all_locations: parsed.data.allLocations,
      active: true,
    });

    if (error) return NextResponse.json({ message: error.message }, { status: 400 });
  }

  if (body.action === 'update') {
    const parsed = UpdateSchema.safeParse(body);
    if (!parsed.success || (!parsed.data.allLocations && !parsed.data.locationId)) {
      return NextResponse.json({ message: 'Complete all required manager fields.' }, { status: 400 });
    }

    const updates: Record<string, unknown> = {
      name: parsed.data.name,
      location_id: parsed.data.allLocations ? null : parsed.data.locationId,
      all_locations: parsed.data.allLocations,
      active: parsed.data.active,
    };

    if (parsed.data.pin) {
      if (await pinIsTaken(supabase, parsed.data.pin, parsed.data.userId)) {
        return NextResponse.json({ message: 'That PIN is already assigned to another user.' }, { status: 409 });
      }
      updates.pin_hash = await bcrypt.hash(parsed.data.pin, 10);
    }

    const { error } = await supabase
      .from('time_users')
      .update(updates)
      .eq('id', parsed.data.userId)
      .eq('role', 'manager');

    if (error) return NextResponse.json({ message: error.message }, { status: 400 });
  }

  if (body.action === 'deactivate') {
    const parsed = DeactivateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ message: 'Invalid manager.' }, { status: 400 });
    }

    const { error } = await supabase
      .from('time_users')
      .update({ active: false })
      .eq('id', parsed.data.userId)
      .eq('role', 'manager');

    if (error) return NextResponse.json({ message: error.message }, { status: 400 });
  }

  return loadManagers(supabase, session.userId);
}

async function pinIsTaken(
  supabase: NonNullable<ReturnType<typeof getAdminClient>>,
  pin: string,
  excludedUserId?: string,
) {
  const { data, error } = await supabase.from('time_users').select('id,pin_hash');
  if (error) throw new Error(error.message);

  for (const user of data || []) {
    if (user.id !== excludedUserId && await bcrypt.compare(pin, user.pin_hash)) return true;
  }
  return false;
}

async function loadManagers(
  supabase: NonNullable<ReturnType<typeof getAdminClient>>,
  currentUserId: string,
) {
  const [{ data: managers, error }, { data: locations, error: locationsError }] = await Promise.all([
    supabase
      .from('time_users')
      .select('id,name,role,location_id,all_locations,active,time_locations(name)')
      .eq('role', 'manager')
      .order('name'),
    supabase.from('time_locations').select('id,name').eq('active', true).order('name'),
  ]);

  if (error) return NextResponse.json({ message: error.message }, { status: 500 });
  if (locationsError) return NextResponse.json({ message: locationsError.message }, { status: 500 });

  return NextResponse.json({
    currentUserId,
    managers: (managers || []).map((manager: any) => ({
      id: manager.id,
      name: manager.name,
      locationId: manager.location_id,
      locationName: Array.isArray(manager.time_locations)
        ? manager.time_locations[0]?.name || null
        : manager.time_locations?.name || null,
      allLocations: Boolean(manager.all_locations),
      active: Boolean(manager.active),
    })),
    locations: locations || [],
  });
}
