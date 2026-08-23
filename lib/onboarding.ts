export const onboardingChecklist = [
  ['i9_form', 'I-9 Form'],
  ['pay_rate_acknowledgement', 'Acknowledgement of Pay Rate'],
  ['ls54_notice', 'LS-54 Notice'],
  ['sexual_harassment_policy', 'Sexual Harassment Policy'],
  ['sexual_harassment_training', 'Sexual Harassment Prevention Training'],
  ['anti_harassment_policy', 'Anti-Harassment & Discrimination Policy'],
  ['employee_handbook', 'Employee Handbook'],
  ['handbook_acknowledgement', 'Employee Handbook Acknowledgement'],
  ['direct_deposit_form', 'Direct Deposit Form'],
  ['it_asset_receipt', 'IT Asset Receipt & Acknowledgement'],
  ['digital_rights_policy', 'Digital Rights & Computer Use Policy'],
  ['academy_training', 'Complete Required BM Academy Training'],
] as const;

export const onboardingItemStatuses = ['not_started', 'sent', 'completed', 'not_applicable'] as const;
