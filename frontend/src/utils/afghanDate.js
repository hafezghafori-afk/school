export const AFGHAN_DATE_LOCALE = 'fa-AF-u-ca-persian';
export const AFGHAN_NUMBER_LOCALE = 'fa-AF';
export const AFGHAN_SOLAR_MONTHS = ['حمل', 'ثور', 'جوزا', 'سرطان', 'اسد', 'سنبله', 'میزان', 'عقرب', 'قوس', 'جدی', 'دلو', 'حوت'];
export const IRANIAN_TO_AFGHAN_SOLAR_MONTHS = {
  فروردین: 'حمل',
  اردیبهشت: 'ثور',
  خرداد: 'جوزا',
  تیر: 'سرطان',
  مرداد: 'اسد',
  شهریور: 'سنبله',
  مهر: 'میزان',
  آبان: 'عقرب',
  آذر: 'قوس',
  دی: 'جدی',
  بهمن: 'دلو',
  اسفند: 'حوت'
};

const MONTH_TOKEN_BOUNDARY = '[\\s\\u200c\\-_/،,:;()\\[\\]{}]+';

function escapeRegex(value = '') {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildMonthTokenRegex(token = '') {
  const escapedToken = escapeRegex(token);
  return new RegExp(`(^|${MONTH_TOKEN_BOUNDARY})(${escapedToken})(?=$|${MONTH_TOKEN_BOUNDARY})`, 'g');
}

export function replaceIranianSolarMonthNames(value = '') {
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
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const text = String(value || '').trim();
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (dateOnly) {
    const date = new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]));
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function tryFormatDate(date, locale, options = {}) {
  const formatter = new Intl.DateTimeFormat(locale, options);
  const parts = formatter.formatToParts(date);
  const part = (type) => normalizeAfghanSolarText(parts.find((item) => item.type === type)?.value || '');
  const year = part('year');
  const month = part('month');
  const day = part('day');
  const hour = part('hour');
  const minute = part('minute');
  const dayPeriod = part('dayPeriod');

  if (year || month || day) {
    const dateText = [year, month, day].filter(Boolean).join(' ');
    const timeText = [hour, minute].filter(Boolean).join(':');
    return normalizeAfghanSolarText([dateText, timeText, dayPeriod].filter(Boolean).join(' '));
  }

  return normalizeAfghanSolarText(formatter.format(date));
}

export function formatAfghanDate(value, options = {}) {
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
        return String(value);
      }
    }
  }
}

export function formatAfghanDateTime(value, options = {}) {
  return formatAfghanDate(value, options);
}

export function formatAfghanTime(value, options = {}) {
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

export function formatAfghanStoredDateLabel(value) {
  return formatAfghanDate(value, {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
}

export function formatAfghanMonthYearLabel(value, options = {}) {
  return formatAfghanDate(value, {
    year: 'numeric',
    month: 'long',
    ...options
  });
}

export function toGregorianDateInputValue(value) {
  const date = asDate(value);
  if (!date) return '';
  const local = new Date(date.getTime() - (date.getTimezoneOffset() * 60 * 1000));
  return local.toISOString().slice(0, 10);
}

export function toGregorianDateTimeInputValue(value) {
  const date = asDate(value);
  if (!date) return '';
  const local = new Date(date.getTime() - (date.getTimezoneOffset() * 60 * 1000));
  return local.toISOString().slice(0, 16);
}

export function toGregorianEquivalentLabel(value) {
  return toGregorianDateInputValue(value);
}

function div(a, b) {
  return ~~(a / b);
}

function gregorianToDayNumber(gy, gm, gd) {
  let d = div((gy + div(gm - 8, 6) + 100100) * 1461, 4)
    + div(153 * ((gm + 9) % 12) + 2, 5)
    + gd - 34840408;
  d = d - div(div(gy + 100100 + div(gm - 8, 6), 100) * 3, 4) + 752;
  return d;
}

function dayNumberToGregorian(jdn) {
  let j = 4 * jdn + 139361631;
  j = j + div(div(4 * jdn + 183187720, 146097) * 3, 4) * 4 - 3908;
  const i = div((j % 1461), 4) * 5 + 308;
  const gd = div((i % 153), 5) + 1;
  const gm = ((div(i, 153) % 12) + 1);
  const gy = div(j, 1461) - 100100 + div(8 - gm, 6);
  return { gy, gm, gd };
}

function jalaliCalendar(jy) {
  const breaks = [-61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181, 1210, 1635, 2060, 2097, 2192, 2262, 2324, 2394, 2456, 3178];
  const gy = jy + 621;
  let leapJ = -14;
  let jp = breaks[0];
  let jm = 0;
  let jump = 0;

  for (let i = 1; i < breaks.length; i += 1) {
    jm = breaks[i];
    jump = jm - jp;
    if (jy < jm) break;
    leapJ = leapJ + div(jump, 33) * 8 + div((jump % 33), 4);
    jp = jm;
  }

  let n = jy - jp;
  leapJ = leapJ + div(n, 33) * 8 + div(((n % 33) + 3), 4);
  if ((jump % 33) === 4 && jump - n === 4) leapJ += 1;
  const leapG = div(gy, 4) - div((div(gy, 100) + 1) * 3, 4) - 150;
  const march = 20 + leapJ - leapG;

  if (jump - n < 6) n = n - jump + div(jump + 4, 33) * 33;
  let leap = (((n + 1) % 33) - 1) % 4;
  if (leap === -1) leap = 4;
  return { leap, gy, march };
}

function jalaliToDayNumber(jy, jm, jd) {
  const r = jalaliCalendar(jy);
  return gregorianToDayNumber(r.gy, 3, r.march) + (jm - 1) * 31 - div(jm, 7) * (jm - 7) + jd - 1;
}

function dayNumberToJalali(jdn) {
  const gy = dayNumberToGregorian(jdn).gy;
  let jy = gy - 621;
  const r = jalaliCalendar(jy);
  const jdn1f = gregorianToDayNumber(gy, 3, r.march);
  let k = jdn - jdn1f;

  if (k >= 0) {
    if (k <= 185) {
      return { jy, jm: 1 + div(k, 31), jd: (k % 31) + 1 };
    }
    k -= 186;
  } else {
    jy -= 1;
    k += 179;
    if (r.leap === 1) k += 1;
  }

  return { jy, jm: 7 + div(k, 30), jd: (k % 30) + 1 };
}

export function toAsciiDigits(value = '') {
  return String(value || '')
    .replace(/[۰-۹]/g, (digit) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)))
    .replace(/[٠-٩]/g, (digit) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)));
}

export function gregorianToAfghanSolar(value) {
  const date = asDate(value);
  if (!date) return null;
  return dayNumberToJalali(gregorianToDayNumber(date.getFullYear(), date.getMonth() + 1, date.getDate()));
}

export function afghanSolarToGregorianInput(year, month, day) {
  const jy = Number(toAsciiDigits(year));
  const jm = Number(toAsciiDigits(month));
  const jd = Number(toAsciiDigits(day));
  if (!Number.isInteger(jy) || !Number.isInteger(jm) || !Number.isInteger(jd)) return '';
  if (jy < 1 || jm < 1 || jm > 12 || jd < 1 || jd > 31) return '';
  if (jm > 6 && jd > 30) return '';
  if (jm === 12 && jd > 30) return '';
  const { gy, gm, gd } = dayNumberToGregorian(jalaliToDayNumber(jy, jm, jd));
  return `${gy}-${String(gm).padStart(2, '0')}-${String(gd).padStart(2, '0')}`;
}
