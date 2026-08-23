import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { readSessionToken, sessionCookie, TimeUserSession } from '@/lib/auth-session';
import { onboardingChecklist, onboardingItemStatuses } from '@/lib/onboarding';
import { getAdminClient } from '@/lib/supabase-server';
import { provisionEmployeeAccess } from '@/lib/bm-os/provision-employee';

const CreateSchema = z.object({
  action: z.literal('create'),
  employeeNumber: z.string().trim().min(1).max(20),
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  pin: z.string().regex(/^\d{4}$/),
  locationId: z.string().uuid(),
  jobTitleId: z.string().uuid(),
  startDate: z.union([z.literal(''), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)]),
  assignedManager: z.string().trim().max(120),
  notes: z.string().trim().max(1000),
});

const ToggleSchema = z.object({
  action: z.literal('toggle'),
  itemId: z.string().uuid(),
  itemStatus: z.enum(onboardingItemStatuses),
});

const StatusSchema = z.object({
  action: z.literal('status'),
  onboardingId: z.string().uuid(),
  status: z.enum(['active', 'completed', 'cancelled']),
});

export async function POST(request: NextRequest) {
  const session = readSessionToken(request.cookies.get(sessionCookie.name)?.value);
  if (!session) return NextResponse.json({ message: 'Sign in with your manager PIN.' }, { status: 401 });
  if (session.role !== 'admin' && !session.canManageEmployees) {
    return NextResponse.json({ message: 'You do not have permission to manage onboarding.' }, { status: 403 });
  }
  const supabase = getAdminClient();
  if (!supabase) return NextResponse.json({ message: 'Supabase is not configured.' }, { status: 503 });
  const body = await request.json().catch(() => ({}));
  if (!body?.action) return load(supabase, session);

  if (body.action === 'create') {
    const parsed = CreateSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ message: 'Complete the onboarding fields.' }, { status: 400 });
    if (!canAccessLocation(session, parsed.data.locationId)) {
      return NextResponse.json({ message: 'You cannot add employees to that location.' }, { status: 403 });
    }
    const { data: jobTitle, error: titleError } = await supabase.from('time_job_titles')
      .select('id,name,active').eq('id', parsed.data.jobTitleId).eq('active', true).maybeSingle();
    if (titleError || !jobTitle) return NextResponse.json({ message: 'Select an active canonical job title.' }, { status: 400 });
    const pinHash = await bcrypt.hash(parsed.data.pin, 10);
    const { data: employee, error: employeeError } = await supabase.from('time_employees').insert({
      employee_number: parsed.data.employeeNumber,
      first_name: parsed.data.firstName,
      last_name: parsed.data.lastName,
      pin_hash: pinHash,
      primary_location_id: parsed.data.locationId,
      job_title_id: parsed.data.jobTitleId,
      active: true,
    }).select('id,primary_location_id').single();
    if (employeeError || !employee) {
      return NextResponse.json({ message: employeeError?.code === '23505' ? 'That employee number already exists.' : employeeError?.message || 'Unable to create employee.' }, { status: 400 });
    }
    try {
      await provisionEmployeeAccess({
        supabase,
        employeeId: employee.id,
        displayName: `${parsed.data.firstName} ${parsed.data.lastName}`,
        jobTitle: jobTitle.name,
        locationId: parsed.data.locationId,
        actorName: session.name,
      });
    } catch (provisionError) {
      await supabase.from('time_employees').delete().eq('id', employee.id);
      return NextResponse.json({ message: provisionError instanceof Error ? provisionError.message : 'Unable to provision BM OS access.' }, { status: 500 });
    }
    const { data: record, error } = await supabase.from('hr_onboarding_records').insert({
      employee_id: employee.id,
      start_date: parsed.data.startDate || null,
      assigned_manager: parsed.data.assignedManager,
      notes: parsed.data.notes,
      created_by_name: session.name,
    }).select('id').single();
    if (error || !record) {
      await supabase.from('bm_identities').delete().eq('employee_id', employee.id);
      await supabase.from('time_employees').delete().eq('id', employee.id);
      return NextResponse.json({ message: error?.message || 'Unable to create onboarding.' }, { status: 400 });
    }
    const { error: itemsError } = await supabase.from('hr_onboarding_items').insert(
      onboardingChecklist.map(([item_key, label], sort_order) => ({ onboarding_id: record.id, item_key, label, sort_order })),
    );
    if (itemsError) {
      await supabase.from('hr_onboarding_records').delete().eq('id', record.id);
      await supabase.from('bm_identities').delete().eq('employee_id', employee.id);
      await supabase.from('time_employees').delete().eq('id', employee.id);
      return NextResponse.json({ message: itemsError.message }, { status: 500 });
    }
  }

  if (body.action === 'toggle') {
    const parsed = ToggleSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ message: 'Invalid checklist item.' }, { status: 400 });
    const { data: item } = await supabase.from('hr_onboarding_items')
      .select('id,onboarding_id,hr_onboarding_records!inner(employee_id,time_employees!inner(primary_location_id))')
      .eq('id', parsed.data.itemId).maybeSingle();
    const locationId = (item as any)?.hr_onboarding_records?.time_employees?.primary_location_id;
    if (!item || !canAccessLocation(session, locationId)) return NextResponse.json({ message: 'You do not have access to this checklist.' }, { status: 403 });
    const { error } = await supabase.from('hr_onboarding_items').update({
      item_status: parsed.data.itemStatus,
      completed: parsed.data.itemStatus === 'completed' || parsed.data.itemStatus === 'not_applicable',
      completed_by_name: parsed.data.itemStatus === 'completed' || parsed.data.itemStatus === 'not_applicable' ? session.name : null,
      completed_at: parsed.data.itemStatus === 'completed' || parsed.data.itemStatus === 'not_applicable' ? new Date().toISOString() : null,
    }).eq('id', parsed.data.itemId);
    if (error) return NextResponse.json({ message: error.message }, { status: 500 });
  }

  if (body.action === 'status') {
    const parsed = StatusSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ message: 'Invalid onboarding status.' }, { status: 400 });
    const { data: record } = await supabase.from('hr_onboarding_records')
      .select('id,time_employees!inner(primary_location_id)').eq('id', parsed.data.onboardingId).maybeSingle();
    const locationId = (record as any)?.time_employees?.primary_location_id;
    if (!record || !canAccessLocation(session, locationId)) return NextResponse.json({ message: 'You do not have access to this checklist.' }, { status: 403 });
    if (parsed.data.status === 'completed') {
      const { count, error: countError } = await supabase.from('hr_onboarding_items')
        .select('id', { count: 'exact', head: true })
        .eq('onboarding_id', parsed.data.onboardingId)
        .not('item_status', 'in', '(completed,not_applicable)');
      if (countError) return NextResponse.json({ message: countError.message }, { status: 500 });
      if ((count || 0) > 0) return NextResponse.json({ message: 'Complete or mark every checklist item not applicable first.' }, { status: 409 });
    }
    const { error } = await supabase.from('hr_onboarding_records').update({
      status: parsed.data.status,
      completed_at: parsed.data.status === 'completed' ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    }).eq('id', parsed.data.onboardingId);
    if (error) return NextResponse.json({ message: error.message }, { status: 500 });
  }

  return load(supabase, session);
}

function canAccessLocation(session: TimeUserSession, locationId?: string | null) {
  return session.role === 'admin' || session.allLocations || Boolean(locationId && session.locationId === locationId);
}

async function load(supabase: NonNullable<ReturnType<typeof getAdminClient>>, session: TimeUserSession) {
  let locationQuery = supabase.from('time_locations').select('id,name').eq('active', true).order('name');
  let recordQuery = supabase.from('hr_onboarding_records')
    .select('id,employee_id,start_date,assigned_manager,notes,status,created_at,completed_at,time_employees!inner(id,first_name,last_name,primary_location_id,time_locations!time_employees_primary_location_id_fkey(id,name),time_job_titles(id,name)),hr_onboarding_items(id,item_key,label,sort_order,item_status,completed,completed_by_name,completed_at)')
    .order('created_at', { ascending: false });
  if (session.role !== 'admin' && !session.allLocations && session.locationId) {
    locationQuery = locationQuery.eq('id', session.locationId);
    recordQuery = recordQuery.eq('time_employees.primary_location_id', session.locationId);
  }
  const [{ data: locations, error: locationError }, { data: jobTitles, error: titleError }, { data: records, error: recordError }] = await Promise.all([
    locationQuery,
    supabase.from('time_job_titles').select('id,name').eq('active', true).order('name'),
    recordQuery,
  ]);
  const error = locationError || titleError || recordError;
  if (error) return NextResponse.json({ message: error.message }, { status: 500 });
  const sorted = (records || []).map((record: any) => ({
    ...record,
    hr_onboarding_items: [...(record.hr_onboarding_items || [])].sort((a, b) => a.sort_order - b.sort_order),
  }));
  return NextResponse.json({ locations: locations || [], jobTitles: jobTitles || [], records: sorted });
}
