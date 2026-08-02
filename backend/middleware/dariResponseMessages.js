const EXACT_MESSAGES = Object.freeze({
  'Canonical fee payment fully approved': 'پرداخت فیس به‌صورت نهایی تأیید شد.',
  'Canonical fee payment rejected': 'پرداخت فیس رد شد.',
  'Unauthorized access.': 'دسترسی مجاز نیست.',
  'Unauthorized': 'دسترسی مجاز نیست.',
  'Forbidden': 'دسترسی مجاز نیست.'
});

const hasDariText = (value = '') => /[\u0600-\u06ff]/.test(String(value || ''));
const hasLatinText = (value = '') => /[A-Za-z]/.test(String(value || ''));

function translateEnglishSystemMessage(value = '') {
  const original = String(value || '').trim();
  if (!original || hasDariText(original) || !hasLatinText(original)) return original;
  if (EXACT_MESSAGES[original]) return EXACT_MESSAGES[original];

  const normalized = original.toLowerCase();
  if (/unauthori[sz]ed|forbidden|access denied|does not have access|permission/.test(normalized)) {
    return 'دسترسی مجاز نیست.';
  }
  if (/not found|was not found|no .+ found/.test(normalized)) {
    return 'مورد درخواستی پیدا نشد.';
  }
  if (/already exists|duplicate|conflict|already (has|scheduled)/.test(normalized)) {
    return 'این مورد قبلاً ثبت شده یا با معلومات موجود در تضاد است.';
  }
  if (/required|must |invalid|do not match|does not match|not valid/.test(normalized)) {
    return 'معلومات واردشده کامل یا معتبر نیست.';
  }
  if (/success|created|updated|deleted|saved|approved|published|activated|closed|reset/.test(normalized)) {
    return 'عملیات با موفقیت انجام شد.';
  }
  if (/failed|error|unable|cannot|could not/.test(normalized)) {
    return 'انجام عملیات ناموفق بود؛ لطفاً دوباره تلاش کنید.';
  }
  return 'پیام سیستم به فارسی دری نمایش داده شد؛ برای جزئیات با مدیریت سیستم تماس بگیرید.';
}

function localizeResponsePayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return payload;
  const localized = { ...payload };
  if (typeof localized.message === 'string') localized.message = translateEnglishSystemMessage(localized.message);
  if (typeof localized.error === 'string') localized.error = translateEnglishSystemMessage(localized.error);
  return localized;
}

function dariResponseMessages(_req, res, next) {
  const sendJson = res.json.bind(res);
  res.json = (payload) => sendJson(localizeResponsePayload(payload));
  next();
}

module.exports = {
  dariResponseMessages,
  localizeResponsePayload,
  translateEnglishSystemMessage
};
