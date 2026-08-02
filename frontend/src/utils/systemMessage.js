const EXACT_DARI_MESSAGES = Object.freeze({
  'Canonical fee payment fully approved': 'پرداخت فیس به‌صورت نهایی تأیید شد.',
  'Canonical fee payment rejected': 'پرداخت فیس رد شد.',
  'Canonical payment follow-up updated': 'پیگیری پرداخت فیس به‌روزرسانی شد.',
  'Canonical fee order adjustment saved': 'تعدیل بل مالی ثبت شد.',
  'Canonical fee order installments saved': 'قسط‌بندی بل مالی ثبت شد.',
  'Canonical fee order voided successfully': 'بل مالی با موفقیت باطل شد.',
  'Receipt fully approved': 'رسید پرداخت به‌صورت نهایی تأیید شد.',
  'Receipt rejected': 'رسید پرداخت رد شد.',
  'Receipt follow-up updated': 'پیگیری رسید مالی به‌روزرسانی شد.',
  'Canonical payment approved': 'پرداخت فیس تأیید شد.',
  'Payment receipt approved': 'رسید پرداخت تأیید شد.',
  'Payment receipt rejected': 'رسید پرداخت رد شد.',
  'Fee order voided': 'بل مالی باطل شد.'
});

const MESSAGE_PATTERNS = Object.freeze([
  {
    pattern: /^Your payment\s+(.+?)\s+was approved\.?$/i,
    build: (match) => `پرداخت شماره ${match[1]} تأیید شد.`
  },
  {
    pattern: /^Your payment\s+(.+?)\s+was rejected\.\s*Reason:\s*(.+)$/i,
    build: (match) => `پرداخت شماره ${match[1]} رد شد. دلیل: ${match[2]}`
  },
  {
    pattern: /^Your receipt for bill\s+(.+?)\s+was approved\.?$/i,
    build: (match) => `رسید پرداخت بل شماره ${match[1]} تأیید شد.`
  },
  {
    pattern: /^Your receipt was rejected\.\s*Reason:\s*(.+)$/i,
    build: (match) => `رسید پرداخت رد شد. دلیل: ${match[1]}`
  }
]);

export function localizeSystemMessage(value = '') {
  const text = String(value ?? '').trim();
  if (!text) return '';
  if (EXACT_DARI_MESSAGES[text]) return EXACT_DARI_MESSAGES[text];
  for (const item of MESSAGE_PATTERNS) {
    const match = text.match(item.pattern);
    if (match) return item.build(match);
  }
  if (/[\u0600-\u06ff]/.test(text) || !/[A-Za-z]/.test(text)) return text;
  const normalized = text.toLowerCase();
  if (/unauthori[sz]ed|forbidden|access denied|does not have access|permission/.test(normalized)) return 'دسترسی مجاز نیست.';
  if (/not found|was not found|no .+ found/.test(normalized)) return 'مورد درخواستی پیدا نشد.';
  if (/already exists|duplicate|conflict|already (has|scheduled)/.test(normalized)) return 'این مورد قبلاً ثبت شده یا با معلومات موجود در تضاد است.';
  if (/required|must |invalid|do not match|does not match|not valid/.test(normalized)) return 'معلومات واردشده کامل یا معتبر نیست.';
  if (/success|created|updated|deleted|saved|approved|published|activated|closed|reset/.test(normalized)) return 'عملیات با موفقیت انجام شد.';
  if (/failed|error|unable|cannot|could not/.test(normalized)) return 'انجام عملیات ناموفق بود؛ لطفاً دوباره تلاش کنید.';
  return 'پیام سیستم به فارسی دری نمایش داده شد؛ برای جزئیات با مدیریت سیستم تماس بگیرید.';
}

export default localizeSystemMessage;
