import { formatAfghanDate } from '../../utils/afghanDate';

// Mirrors backend/utils/homeworkLateness.js: the due date is a calendar day
// stored as its UTC midnight, and the deadline is the end of that day in
// Kabul (UTC+4:30). Keep the two in step.
const DAY_MS = 24 * 60 * 60 * 1000;
const KABUL_OFFSET_MS = 4.5 * 60 * 60 * 1000;

export const MAX_SCORE_LIMIT = 1000;
export const ATTACHMENT_LIMIT_BYTES = 10 * 1024 * 1024;
export const MAX_SCORE_PRESETS = [10, 20, 50, 100];
export const FEEDBACK_PRESETS = ['عالی، آفرین!', 'خوب بود', 'کامل و منظم', 'نیاز به تلاش بیشتر', 'پاسخ‌ها ناقص است'];

export const faNumber = (value) => (
  value === null || value === undefined || value === '' ? '' : Number(value).toLocaleString('fa-AF')
);

export const formatDate = (value) => formatAfghanDate(value, { year: 'numeric', month: 'long', day: 'numeric' });

export const getDeadline = (dueDate) => {
  if (!dueDate) return null;
  const due = new Date(dueDate);
  if (Number.isNaN(due.getTime())) return null;
  const dayStartUtc = Date.UTC(due.getUTCFullYear(), due.getUTCMonth(), due.getUTCDate());
  return new Date(dayStartUtc + DAY_MS - KABUL_OFFSET_MS);
};

/** Where a homework stands against its due date, for the card badge and filters. */
export const getDueState = (dueDate, now = new Date()) => {
  const deadline = getDeadline(dueDate);
  if (!deadline) return { key: 'none', label: 'بدون موعد', tone: 'neutral', daysLeft: null };
  const diff = deadline.getTime() - now.getTime();
  if (diff < 0) return { key: 'overdue', label: 'موعد گذشته', tone: 'muted', daysLeft: 0 };
  const daysLeft = Math.ceil(diff / DAY_MS);
  if (daysLeft <= 1) return { key: 'soon', label: 'موعد: امروز', tone: 'warning', daysLeft };
  if (daysLeft <= 3) return { key: 'soon', label: `${faNumber(daysLeft)} روز تا موعد`, tone: 'warning', daysLeft };
  return { key: 'open', label: `${faNumber(daysLeft)} روز تا موعد`, tone: 'success', daysLeft };
};

/** "YYYY-MM-DD" for today + offset days, in the browser's local calendar. */
export const dateInputFromToday = (offsetDays = 0) => {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  const local = new Date(date.getTime() - (date.getTimezoneOffset() * 60 * 1000));
  return local.toISOString().slice(0, 10);
};

export const STATE_META = Object.freeze({
  submitted: { label: 'در انتظار بررسی', tone: 'info', icon: 'fa-hourglass-half' },
  graded: { label: 'نمره داده شد', tone: 'success', icon: 'fa-check' },
  revision_requested: { label: 'برگشت برای اصلاح', tone: 'purple', icon: 'fa-rotate-left' },
  missing: { label: 'هنوز تحویل نداده', tone: 'neutral', icon: 'fa-circle' },
  missing_overdue: { label: 'تحویل نداده', tone: 'danger', icon: 'fa-circle-exclamation' }
});

export const lateLabel = (lateDays) => (
  Number(lateDays) > 0 ? `${faNumber(lateDays)} روز دیر` : 'دیر'
);

/** For sentences that already say "after the due date": «۲ روز». */
export const lateDaysText = (lateDays) => `${faNumber(Math.max(1, Number(lateDays) || 1))} روز`;

export const formatFileSize = (bytes = 0) => {
  if (bytes >= 1024 * 1024) return `${faNumber(Math.round((bytes / (1024 * 1024)) * 10) / 10)} MB`;
  return `${faNumber(Math.max(1, Math.round(bytes / 1024)))} KB`;
};

export const fileKind = (path = '') => {
  const ext = String(path).split('?')[0].split('.').pop().toLowerCase();
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'].includes(ext)) return 'image';
  if (ext === 'pdf') return 'pdf';
  return 'file';
};

export const fileName = (path = '') => {
  const base = String(path).split('/').pop() || '';
  // Uploads are stored as "<timestamp>-<original name>".
  return base.replace(/^\d{10,}-/, '');
};

export const validateMaxScore = (raw) => {
  const value = Number(raw);
  if (String(raw).trim() === '' || !Number.isFinite(value) || value < 1 || value > MAX_SCORE_LIMIT) {
    return `حداکثر نمره باید عددی بین ۱ و ${faNumber(MAX_SCORE_LIMIT)} باشد.`;
  }
  return '';
};

export const validateScore = (raw, maxScore) => {
  if (String(raw ?? '').trim() === '') return 'نمره را بنویسید.';
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) return 'نمره معتبر نیست.';
  if (value > Number(maxScore)) return `نمره نمی‌تواند از ${faNumber(maxScore)} بیشتر باشد.`;
  return '';
};
