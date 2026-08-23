type AdminClient = any;

export async function syncAcademyOnboardingStatus(supabase: AdminClient, employeeId: string) {
  const { data: employee, error: employeeError } = await supabase
    .from('time_employees')
    .select('job_title_id')
    .eq('id', employeeId)
    .maybeSingle();
  if (employeeError) throw new Error(employeeError.message);
  if (!employee) return;

  const [{ data: assignments, error: assignmentError }, { data: attempts, error: attemptError }, { data: onboarding, error: onboardingError }] = await Promise.all([
    employee.job_title_id
      ? supabase.from('academy_job_title_modules').select('module_code').eq('job_title_id', employee.job_title_id).eq('required', true)
      : Promise.resolve({ data: [], error: null }),
    supabase.from('academy_attempts').select('module_code').eq('employee_id', employeeId),
    supabase.from('hr_onboarding_records').select('id').eq('employee_id', employeeId).eq('status', 'active').maybeSingle(),
  ]);
  const firstError = assignmentError || attemptError || onboardingError;
  if (firstError) throw new Error(firstError.message);
  if (!onboarding) return;

  const moduleCodes = (assignments || []).map((row: { module_code: string }) => row.module_code);
  const { data: completions, error: completionError } = moduleCodes.length
    ? await supabase.from('academy_completions').select('module_code').eq('employee_id', employeeId).in('module_code', moduleCodes)
    : { data: [], error: null };
  if (completionError) throw new Error(completionError.message);

  const hasStarted = (attempts || []).some((row: { module_code: string }) => moduleCodes.includes(row.module_code));
  const isComplete = moduleCodes.length > 0 && (completions || []).length === moduleCodes.length;
  const itemStatus = moduleCodes.length === 0 ? 'not_applicable' : isComplete ? 'completed' : hasStarted ? 'sent' : 'not_started';
  const completed = itemStatus === 'completed' || itemStatus === 'not_applicable';
  const timestamp = completed ? new Date().toISOString() : null;
  const { data: item, error: itemError } = await supabase
    .from('hr_onboarding_items')
    .select('id')
    .eq('onboarding_id', onboarding.id)
    .eq('item_key', 'academy_training')
    .maybeSingle();
  if (itemError) throw new Error(itemError.message);

  const values = {
    item_status: itemStatus,
    completed,
    completed_by_name: completed ? 'BM Academy' : null,
    completed_at: timestamp,
  };
  const { error: saveError } = item
    ? await supabase.from('hr_onboarding_items').update(values).eq('id', item.id)
    : await supabase.from('hr_onboarding_items').insert({
        onboarding_id: onboarding.id,
        item_key: 'academy_training',
        label: 'Complete Required BM Academy Training',
        sort_order: 11,
        ...values,
      });
  if (saveError) throw new Error(saveError.message);
}
