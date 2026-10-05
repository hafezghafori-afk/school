// Persian labels shared by the «مرکز ارتقا صنف» wizard, batch list and print sheet.

export const OUTCOME_LABELS = {
  promoted: 'ارتقا',
  repeated: 'تکرار صنف',
  conditional: 'مشروط (چانس دوم)',
  graduated: 'فارغ',
  blocked: 'متوقف',
  skipped: 'مستثنا'
};

export const RESULT_STATUS_LABELS = {
  passed: 'کامیاب',
  failed: 'ناکام',
  conditional: 'مشروط',
  distinction: 'عالی',
  temporary: 'موقت',
  placement: 'تعیین سویه',
  excused: 'معذور',
  absent: 'غایب',
  pending: 'در انتظار',
  blocked: 'متوقف'
};

export const TRANSACTION_STATUS_LABELS = {
  applied: 'اعمال‌شده',
  held: 'در انتظار چانس دوم',
  rolled_back: 'بازگردانی‌شده'
};

export const BATCH_STATUS_LABELS = {
  applied: 'اعمال‌شده',
  partially_rolled_back: 'بخشی بازگردانی‌شده',
  rolled_back: 'بازگردانی‌شده'
};

const ISSUE_LABELS = {
  already_processed: 'قبلاً در یک دستهٔ ارتقا آمده است',
  membership_not_current: 'عضویتش در این صنف جاری نیست (منفک یا تبدیل شده)',
  excluded_by_operator: 'از این ارتقا بیرون گذاشته شد',
  outcome_not_actionable: 'نتیجه‌اش قابل اعمال نیست',
  official_result_not_ready: 'نتایج عمومی این صنف هنوز کامل نیست',
  official_result_pending: 'نمرات این شاگرد ناتکمیل است',
  score_policy_incomplete_results: 'نمرات این شاگرد ناتکمیل است',
  result_status_not_mapped: 'نتیجهٔ امتحان این شاگرد تعیین نشده',
  target_year_not_resolved: 'سال مقصد معلوم نیست',
  target_class_not_resolved: 'صنف مقصد معلوم نیست؛ صنف را انتخاب کنید',
  target_course_not_resolved: 'صنف مقصد به دورهٔ تعلیمی وصل نیست',
  student_already_enrolled_in_target_year: 'در سال مقصد در صنف دیگری ثبت است',
  membership_generation_failed: 'عضویت جدید ساخته نشد'
};

const ROLLBACK_BLOCKER_LABELS = {
  promotion_rollback_blocked_by_finance: 'برای عضویت جدیدش بل یا فیس ثبت شده؛ اول در مرکز مالی باطل شود',
  promotion_rollback_blocked_by_downstream_transactions: 'بعد از این، دوباره ارتقا یافته است',
  promotion_rollback_blocked_by_second_chance_fee: 'بل فیس چانس دوم دارد؛ اول در مرکز مالی باطل شود',
  promotion_source_membership_not_found: 'عضویت صنف مبدا پیدا نشد',
  promotion_target_membership_not_found: 'عضویت صنف مقصد پیدا نشد',
  promotion_transaction_not_applied: 'این مورد اعمال نشده است'
};

export function rollbackBlockerLabel(code = '') {
  return ROLLBACK_BLOCKER_LABELS[code] || code;
}

export function outcomeLabel(value) {
  return OUTCOME_LABELS[value] || value || '---';
}

export function resultStatusLabel(value) {
  return RESULT_STATUS_LABELS[value] || value || '---';
}

export function issueLabel(code = '') {
  if (!code) return '';
  if (String(code).startsWith('override_')) return 'صنف انتخاب‌شده برای این شاگرد مجاز نیست';
  return ISSUE_LABELS[code] || code;
}

export function classLabel(item) {
  if (!item) return '---';
  const title = item.title || '---';
  return item.code ? `${title} — ${item.code}` : title;
}

export function yearLabel(item) {
  return item?.title || item?.code || '---';
}

function yearNumber(year) {
  const digits = String(year?.title || year?.code || '').replace(/[۰-۹]/g, (char) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(char)));
  const match = digits.match(/\d{4}/);
  return match ? Number(match[0]) : null;
}

// Same comparison the server makes (start date, then sequence, then the year
// in the title): 'after' | 'before' | 'same' | 'unknown'. Used to offer only
// later years as the target; the server refuses anything else anyway.
export function academicYearOrder(source, target) {
  if (!source || !target) return 'unknown';
  if (source.id && source.id === target.id) return 'same';
  const sourceStart = source.startDate ? new Date(source.startDate).getTime() : NaN;
  const targetStart = target.startDate ? new Date(target.startDate).getTime() : NaN;
  if (Number.isFinite(sourceStart) && Number.isFinite(targetStart) && sourceStart !== targetStart) {
    return targetStart > sourceStart ? 'after' : 'before';
  }
  const sourceSequence = Number(source.sequence || 0);
  const targetSequence = Number(target.sequence || 0);
  if (sourceSequence && targetSequence && sourceSequence !== targetSequence) {
    return targetSequence > sourceSequence ? 'after' : 'before';
  }
  const sourceNumber = yearNumber(source);
  const targetNumber = yearNumber(target);
  if (sourceNumber && targetNumber && sourceNumber !== targetNumber) {
    return targetNumber > sourceNumber ? 'after' : 'before';
  }
  return 'unknown';
}

export function formatAmount(value) {
  return `${(Number(value) || 0).toLocaleString('fa-AF')} افغانی`;
}
