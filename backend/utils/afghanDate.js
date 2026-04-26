const AFGHAN_DATE_LOCALE = 'fa-AF-u-ca-persian';
const AFGHAN_NUMBER_LOCALE = 'fa-AF';
const AFGHAN_SOLAR_MONTHS = ['حمل', 'ثور', 'جوزا', 'سرطان', 'اسد', 'سنبله', 'میزان', 'عقرب', 'قوس', 'جدی', 'دلو', 'حوت'];
const IRANIAN_TO_AFGHAN_SOLAR_MONTHS = {
  'فروردین': 'حمل',
  'اردیبهشت': 'ثور',
  'خرداد': 'جوزا',
  'تیر': 'سرطان',
  'مرداد': 'اسد',
  'شهریور': 'سنبله',
  'مهر': 'میزان',
  'آبان': 'عقرب',
  'آذر': 'قوس',
  'دی': 'جدی',
  'بهمن': 'دلو',
  'اسفند': 'حوت'
};

const MONTH_TOKEN_BOUNDARY = '[\\s\\u200c\\-_/،,:;()\\[\\]{}]+';

function escapeRegex(value = '') {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildMonthTokenRegex(token = '') {
  const escapedToken = escapeRegex(token);
  return new RegExp(`(^|${MONTH_TOKEN_BOUNDARY})(${escapedToken})(?=$|${MONTH_TOKEN_BOUNDARY})`, 'g');
}

function replaceIranianSolarMonthNames(value = '') {
  let text = String(value || '');
  Object.entries(IRANIAN_TO_AFGHAN_SOLAR_MONTHS).forEach(([iranianMonth, afghanMonth]) => {
    text = text.replace(buildMonthTokenRegex(iranianMonth), (_, prefix = '') => `${prefix}${afghanMonth}`);
  });
  return text;
}

function normalizeAfghanSolarText(value = '') {
  return replaceIranianSolarMonthNames(String(value || '').replace(/[\u200e\u200f]/g, '').trim());
}

function asDate(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function tryFormatDate(date, locale, options = {}) {
  return normalizeAfghanSolarText(new Intl.DateTimeFormat(locale, options).format(date));
}

function formatAfghanDate(value, options = {}) {
  const date = asDate(value);
  if (!date) return '';
  try {
    return tryFormatDate(date, AFGHAN_DATE_LOCALE, options);
  } catch (error) {
    try {
      return tryFormatDate(date, 'fa-u-ca-persian', options);
    } catch (nestedError) {
      try {
        return tryFormatDate(date, 'fa-AF', options);
      } catch (finalError) {
        return date.toISOString().slice(0, 10);
      }
    }
  }
}

function formatAfghanDateTime(value, options = {}) {
  return formatAfghanDate(value, options);
}

function formatAfghanTime(value, options = {}) {
  const date = asDate(value);
  if (!date) return '';
  const timeOptions = {
    hour: '2-digit',
    minute: '2-digit',
    ...options
  };

  try {
    return tryFormatDate(date, AFGHAN_DATE_LOCALE, timeOptions);
  } catch (error) {
    try {
      return tryFormatDate(date, 'fa-u-ca-persian', timeOptions);
    } catch (nestedError) {
      return date.toLocaleTimeString('fa-AF', timeOptions);
    }
  }
}

function formatAfghanStoredDateLabel(value) {
  return formatAfghanDate(value, {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
}

function formatAfghanMonthYearLabel(value, options = {}) {
  return formatAfghanDate(value, {
    year: 'numeric',
    month: 'long',
    ...options
  });
}

module.exports = {
  AFGHAN_DATE_LOCALE,
  AFGHAN_NUMBER_LOCALE,
  AFGHAN_SOLAR_MONTHS,
  IRANIAN_TO_AFGHAN_SOLAR_MONTHS,
  formatAfghanDate,
  formatAfghanDateTime,
  formatAfghanTime,
  formatAfghanStoredDateLabel,
  formatAfghanMonthYearLabel,
  replaceIranianSolarMonthNames
};
