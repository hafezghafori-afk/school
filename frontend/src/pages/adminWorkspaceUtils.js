import { API_BASE } from '../config/api';
import { formatAfghanDateTime } from '../utils/afghanDate';

export const DEFAULT_SCHOOL_ID = 'default-school-id';
export const LEGACY_SINGLE_SCHOOL_ID = '000000000000000000000001';

export function isValidObjectId(value = '') {
  return /^[a-f\d]{24}$/i.test(String(value || '').trim());
}

export function readStoredSchoolId() {
  if (typeof localStorage === 'undefined') return '';
  return [
    localStorage.getItem('schoolId'),
    localStorage.getItem('school_id'),
    localStorage.getItem('selectedSchoolId')
  ].map((item) => String(item || '').trim()).find((item) => (
    isValidObjectId(item) && item !== LEGACY_SINGLE_SCHOOL_ID
  )) || '';
}

export function persistActiveSchoolId(schoolId = '') {
  if (typeof localStorage === 'undefined' || !isValidObjectId(schoolId)) return '';
  localStorage.setItem('schoolId', schoolId);
  localStorage.setItem('school_id', schoolId);
  localStorage.setItem('selectedSchoolId', schoolId);
  return schoolId;
}

export function getAuthHeaders() {
  const token = localStorage.getItem('token');
  const schoolId = readStoredSchoolId();
  return {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(schoolId ? { 'X-School-Id': schoolId } : {})
  };
}

export function buildApiUrl(path = '') {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${API_BASE}${normalizedPath}`;
}

async function parseJsonSafe(response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

const ERROR_MESSAGE_MAP = {
  sheet_template_duplicate_code: 'این کد شقه قبلاً استفاده شده است. برای شقه جدید کد متفاوت بنویسید یا فیلد کد را خالی بگذارید.',
  timetable_invalid_academic_year: 'سال تعلیمی انتخاب‌شده معتبر نیست.',
  timetable_invalid_term: 'ترم انتخاب‌شده معتبر نیست.',
  timetable_invalid_class: 'صنف انتخاب‌شده معتبر نیست.',
  timetable_invalid_subject: 'مضمون انتخاب‌شده معتبر نیست.',
  timetable_invalid_teacher_assignment: 'تخصیص استاد معتبر نیست.',
  timetable_invalid_config: 'تنظیم تقسیم اوقات معتبر نیست.',
  timetable_not_found: 'خانه تقسیم اوقات پیدا نشد.',
  timetable_assignment_class_mismatch: 'تخصیص انتخاب‌شده با صنف این خانه برابر نیست. assignment را دوباره انتخاب کنید.',
  timetable_assignment_subject_mismatch: 'تخصیص انتخاب‌شده با مضمون این خانه برابر نیست.',
  timetable_assignment_year_mismatch: 'تخصیص انتخاب‌شده با سال تعلیمی این خانه برابر نیست.',
  timetable_year_class_mismatch: 'سال تعلیمی و صنف باهم برابر نیستند.',
  timetable_year_term_mismatch: 'سال تعلیمی و ترم باهم برابر نیستند.',
  timetable_config_class_mismatch: 'تنظیم انتخاب‌شده مربوط این صنف نیست.',
  timetable_class_required: 'برای ثبت خانه، انتخاب صنف الزامی است.',
  timetable_subject_required: 'برای ثبت خانه، انتخاب مضمون الزامی است.',
  timetable_teacher_assignment_required: 'برای ثبت خانه، انتخاب تخصیص استاد الزامی است.',
  timetable_invalid_time_range: 'بازه زمانی خانه معتبر نیست.',
  timetable_day_not_allowed: 'روز انتخاب‌شده در تنظیم تقسیم اوقات فعال نیست.',
  timetable_before_config_window: 'زمان شروع قبل از بازه مجاز تنظیم تقسیم اوقات است.',
  timetable_after_config_window: 'زمان پایان بعد از بازه مجاز تنظیم تقسیم اوقات است.',
  timetable_class_conflict: 'در این وقت برای صنف تداخل وجود دارد.',
  timetable_teacher_conflict: 'در این وقت برای استاد تداخل وجود دارد.',
  education_plan_class_required: 'برای پلان تعلیمی، انتخاب صنف الزامی است.',
  education_plan_subject_required: 'برای پلان تعلیمی، انتخاب مضمون الزامی است.',
  education_plan_annual_required: 'برای پلان هفته‌وار، انتخاب پلان سالانه الزامی است.',
  education_plan_invalid_annual: 'پلان سالانه انتخاب‌شده معتبر نیست.',
  education_plan_week_start_required: 'تاریخ شروع هفته الزامی است.',
  education_plan_lesson_title_required: 'عنوان درس الزامی است.'
};

const WINDOWS_1252_BYTE_MAP = {
  0x20ac: 0x80,
  0x201a: 0x82,
  0x0192: 0x83,
  0x201e: 0x84,
  0x2026: 0x85,
  0x2020: 0x86,
  0x2021: 0x87,
  0x02c6: 0x88,
  0x2030: 0x89,
  0x0160: 0x8a,
  0x2039: 0x8b,
  0x0152: 0x8c,
  0x017d: 0x8e,
  0x2018: 0x91,
  0x2019: 0x92,
  0x201c: 0x93,
  0x201d: 0x94,
  0x2022: 0x95,
  0x2013: 0x96,
  0x2014: 0x97,
  0x02dc: 0x98,
  0x2122: 0x99,
  0x0161: 0x9a,
  0x203a: 0x9b,
  0x0153: 0x9c,
  0x017e: 0x9e,
  0x0178: 0x9f
};

export function repairDisplayText(value) {
  const text = String(value ?? '').trim();
  if (!text || !/[ØÙÚÛÂÃâ€]/.test(text)) return text;
  try {
    const bytes = Array.from(text).map((char) => {
      const code = char.charCodeAt(0);
      return code <= 0xff ? code : WINDOWS_1252_BYTE_MAP[code];
    });
    if (bytes.some((item) => item == null)) return text;
    const repaired = new TextDecoder('utf-8').decode(Uint8Array.from(bytes)).trim();
    return repaired && !repaired.includes('�') ? repaired : text;
  } catch {
    return text;
  }
}

function extractErrorMessage(response, data) {
  const code = data?.message || '';
  return repairDisplayText(ERROR_MESSAGE_MAP[code] || code || `Request failed (${response.status})`);
}

export async function fetchJson(path, options = {}) {
  const response = await fetch(buildApiUrl(path), {
    ...options,
    headers: {
      ...(options.headers || {}),
      ...getAuthHeaders()
    }
  });
  const data = await parseJsonSafe(response);
  if (!response.ok || data?.success === false) {
    const error = new Error(extractErrorMessage(response, data));
    error.status = response.status;
    error.data = data;
    throw error;
  }
  return data;
}

export async function resolveActiveSchoolContext(options = {}) {
  const storedSchoolId = readStoredSchoolId();
  const query = storedSchoolId ? `?schoolId=${encodeURIComponent(storedSchoolId)}` : '';
  const data = await fetchJson(`/api/afghan-schools/active${query}`, options);
  const context = data?.data || {};
  if (context.schoolId) persistActiveSchoolId(context.schoolId);
  return context;
}

export async function postJson(path, body = {}, options = {}) {
  return fetchJson(path, {
    method: 'POST',
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    },
    body: JSON.stringify(body || {})
  });
}

function readFilename(disposition = '', fallback = 'download.bin') {
  const match = /filename\*?=(?:UTF-8''|\")?([^\";]+)/i.exec(disposition || '');
  if (!match?.[1]) return fallback;
  return decodeURIComponent(match[1].replace(/\"/g, '').trim());
}

export async function fetchBlob(path, body = {}, options = {}) {
  const method = String(options.method || 'POST').toUpperCase();
  const headers = {
    ...(method === 'GET' || method === 'HEAD' ? {} : { 'Content-Type': 'application/json' }),
    ...(options.headers || {}),
    ...getAuthHeaders()
  };
  const response = await fetch(buildApiUrl(path), {
    method,
    ...options,
    headers,
    ...(method === 'GET' || method === 'HEAD' ? {} : { body: JSON.stringify(body || {}) })
  });

  if (!response.ok) {
    const data = await parseJsonSafe(response);
    const error = new Error(extractErrorMessage(response, data));
    error.status = response.status;
    error.data = data;
    throw error;
  }

  return {
    blob: await response.blob(),
    filename: readFilename(response.headers.get('content-disposition') || '', 'download.bin'),
    contentType: response.headers.get('content-type') || ''
  };
}

export async function fetchText(path, body = {}, options = {}) {
  const method = String(options.method || 'POST').toUpperCase();
  const headers = {
    ...(method === 'GET' || method === 'HEAD' ? {} : { 'Content-Type': 'application/json' }),
    ...(options.headers || {}),
    ...getAuthHeaders()
  };
  const response = await fetch(buildApiUrl(path), {
    method,
    ...options,
    headers,
    ...(method === 'GET' || method === 'HEAD' ? {} : { body: JSON.stringify(body || {}) })
  });

  if (!response.ok) {
    const data = await parseJsonSafe(response);
    const error = new Error(extractErrorMessage(response, data));
    error.status = response.status;
    error.data = data;
    throw error;
  }

  return {
    text: await response.text(),
    filename: readFilename(response.headers.get('content-disposition') || '', 'report.html'),
    contentType: response.headers.get('content-type') || 'text/html; charset=utf-8'
  };
}

export function downloadBlob(blob, filename = 'download.bin') {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 500);
}

export function openHtmlDocument(html, title = 'Report preview') {
  const popup = window.open('', '_blank', 'noopener,noreferrer');
  if (!popup) return false;
  popup.document.open();
  popup.document.write(html || `<title>${title}</title>`);
  popup.document.close();
  popup.focus();
  return true;
}

export function toLocaleDateTime(value) {
  return formatAfghanDateTime(value, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }) || '-';
}

export function formatNumber(value) {
  return Number(value || 0).toLocaleString('fa-AF-u-ca-persian');
}

export function normalizeOptions(items = [], labelKeys = []) {
  return Array.isArray(items)
    ? items.map((item) => ({
        ...item,
        uiLabel: labelKeys.map((key) => item?.[key]).find(Boolean) || item?.label || item?.title || item?.name || item?.code || item?.id || '---'
      }))
    : [];
}

export function errorMessage(error, fallback = 'عملیات ناموفق بود.') {
  return repairDisplayText(error?.message || fallback);
}
