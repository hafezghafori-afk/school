// Pure rules for finance month close (no database access), shared by the
// period guard, the month-close routes and the checks.
//
// A month close is keyed by Afghan solar month ("1405-06") and covers that
// month's days, clipped to its financial year. Records made before month close
// moved to the solar calendar are keyed by Gregorian month ("2026-09"); they
// keep protecting exactly the days they covered. Either way the days a close
// covers are stored on the record as closeWindow, and the guard only reads that.
const crypto = require('crypto');
const {
  afghanMonthKeyBounds,
  formatAfghanMonthKeyLabel,
  formatAfghanStoredDateLabel,
  normalizeAfghanMonthKey,
  shiftAfghanMonthKey,
  toAfghanMonthKey
} = require('./afghanDate');

const GREGORIAN_MONTH_KEY = /^(\d{4})-(0[1-9]|1[0-2])$/;
const MIN_REOPEN_DAYS = 1;
const MAX_REOPEN_DAYS = 7;
const DEFAULT_REOPEN_DAYS = 3;

function toDate(value) {
  if (!value) return null;
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function startOfDay(value) {
  const date = toDate(value);
  return date ? new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0) : null;
}

function endOfDay(value) {
  const date = toDate(value);
  return date ? new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999) : null;
}

function resolveMonthCloseCalendar(monthKey = '') {
  const text = String(monthKey || '').trim();
  if (text && normalizeAfghanMonthKey(text) === text) return 'shamsi';
  if (GREGORIAN_MONTH_KEY.test(text)) return 'gregorian';
  return '';
}

// [startAt, endAt] a close covers. A solar month is clipped to its financial
// year, so a year that does not start on 1 Hamal closes only its own days of
// its first and last month. Returns null for a month outside the year.
function resolveMonthCloseWindow(monthKey = '', financialYear = null) {
  const key = String(monthKey || '').trim();
  const calendar = resolveMonthCloseCalendar(key);
  if (calendar === 'gregorian') {
    const [year, month] = key.split('-').map(Number);
    return {
      calendar,
      monthKey: key,
      startAt: new Date(year, month - 1, 1, 0, 0, 0, 0),
      endAt: new Date(year, month, 0, 23, 59, 59, 999)
    };
  }
  if (calendar !== 'shamsi') return null;
  const bounds = afghanMonthKeyBounds(key);
  if (!bounds) return null;
  let startAt = bounds.start;
  let endAt = bounds.end;
  const yearStart = startOfDay(financialYear?.startDate);
  const yearEnd = endOfDay(financialYear?.endDate);
  if (yearStart && yearStart.getTime() > startAt.getTime()) startAt = yearStart;
  if (yearEnd && yearEnd.getTime() < endAt.getTime()) endAt = yearEnd;
  if (endAt.getTime() < startAt.getTime()) return null;
  return { calendar, monthKey: key, startAt, endAt };
}

// The solar months a financial year touches, first to last.
function listFinancialYearMonthKeys(financialYear = null) {
  const firstKey = toAfghanMonthKey(financialYear?.startDate);
  const lastKey = toAfghanMonthKey(financialYear?.endDate);
  if (!firstKey || !lastKey || firstKey > lastKey) return [];
  const keys = [];
  for (let key = firstKey; key && key <= lastKey && keys.length < 24; key = shiftAfghanMonthKey(key, 1)) {
    keys.push(key);
  }
  return keys;
}

function readCloseWindow(record = {}) {
  const startAt = toDate(record?.closeWindow?.startAt);
  const endAt = toDate(record?.closeWindow?.endAt);
  if (startAt && endAt) return { startAt, endAt };
  return resolveMonthCloseWindow(record?.monthKey || '');
}

// True when [window.startAt, window.endAt] is covered with no gap by the given
// windows - how the year-close check counts a solar month as closed even when
// older Gregorian closes cover it.
function isWindowCovered(window = null, windows = []) {
  const target = window && { startAt: toDate(window.startAt), endAt: toDate(window.endAt) };
  if (!target?.startAt || !target?.endAt) return false;
  const sorted = (Array.isArray(windows) ? windows : [])
    .map((item) => ({ startAt: toDate(item?.startAt), endAt: toDate(item?.endAt) }))
    .filter((item) => item.startAt && item.endAt)
    .sort((left, right) => left.startAt.getTime() - right.startAt.getTime());
  let cursor = target.startAt.getTime();
  for (const item of sorted) {
    if (item.endAt.getTime() < cursor) continue;
    // Consecutive days meet at 23:59:59.999 -> 00:00:00.000.
    if (item.startAt.getTime() > cursor + 1000) break;
    cursor = Math.max(cursor, item.endAt.getTime() + 1);
    if (cursor > target.endAt.getTime()) return true;
  }
  return cursor > target.endAt.getTime();
}

// Whether a record blocks writes dated inside its window, and why. A month is
// locked once its close is requested (so reviewers approve figures that cannot
// move under them), while closed, and when a reopen window has run out.
function resolveMonthCloseLock(record = {}, now = new Date()) {
  const status = String(record?.status || '').trim();
  if (status === 'closed') return { locked: true, reason: 'closed' };
  if (status === 'pending_review') return { locked: true, reason: 'in_review' };
  if (status === 'reopened') {
    const deadline = toDate(record?.reopenDeadline);
    if (deadline && deadline.getTime() <= toDate(now).getTime()) return { locked: true, reason: 'reopen_expired' };
  }
  return { locked: false, reason: '' };
}

function formatMonthCloseLabel(record = {}) {
  const monthKey = String(record?.monthKey || '').trim();
  if (resolveMonthCloseCalendar(monthKey) === 'shamsi') return formatAfghanMonthKeyLabel(monthKey);
  const window = readCloseWindow(record);
  if (!window) return monthKey;
  return `${monthKey} میلادی (${formatAfghanStoredDateLabel(window.startAt)} تا ${formatAfghanStoredDateLabel(window.endAt)})`;
}

function buildMonthCloseLockMessage(record = {}, reason = '') {
  const label = formatMonthCloseLabel(record);
  if (reason === 'in_review') {
    return `ماه ${label} در جریان تایید بستن است و ثبت یا تغییر سند مالی در آن قفل است. برای اصلاح، درخواست بستن را برگشت دهید.`;
  }
  if (reason === 'reopen_expired') {
    return `مهلت بازگشایی ماه ${label} تمام شده و ماه دوباره قفل است. درخواست بستن دوباره را ثبت کنید یا ریاست عمومی مهلت را تمدید کند.`;
  }
  return `ماه ${label} بسته شده است و ثبت یا تغییر سند مالی در آن مجاز نیست. برای اصلاح، ریاست عمومی باید این ماه را بازگشایی کند.`;
}

function normalizeReopenDays(value) {
  const days = Math.round(Number(value));
  if (!Number.isFinite(days) || days <= 0) return DEFAULT_REOPEN_DAYS;
  return Math.max(MIN_REOPEN_DAYS, Math.min(MAX_REOPEN_DAYS, days));
}

// The figures a closed month commits to: its own bills, and the money that
// moved inside it. Standing balances are left out on purpose - they keep
// changing as arrears are collected after the close, which is allowed.
const FINGERPRINT_FIELDS = [
  ['ordersIssuedCount', 'تعداد بل‌های ماه'],
  ['ordersIssuedAmount', 'مبلغ بل‌های ماه'],
  ['approvedPaymentCount', 'تعداد پرداخت‌های تاییدشده'],
  ['approvedPaymentAmount', 'مبلغ پرداخت‌های تاییدشده'],
  ['pendingPaymentCount', 'تعداد پرداخت‌های در انتظار'],
  ['pendingPaymentAmount', 'مبلغ پرداخت‌های در انتظار'],
  ['refundCount', 'تعداد بازپرداخت‌ها'],
  ['refundAmount', 'مبلغ بازپرداخت‌ها'],
  ['approvedExpenseCount', 'تعداد مصارف تاییدشده'],
  ['approvedExpenseAmount', 'مبلغ مصارف تاییدشده'],
  ['pendingExpenseCount', 'تعداد مصارف در انتظار'],
  ['pendingExpenseAmount', 'مبلغ مصارف در انتظار'],
  ['treasuryInflowAmount', 'ورودی خزانه'],
  ['treasuryOutflowAmount', 'خروجی خزانه']
];
const DIFF_FIELDS = [
  ...FINGERPRINT_FIELDS,
  ['netCashAmount', 'خالص نقدی'],
  ['standingOutstandingAmount', 'مانده ایستای پایان ماه']
];

function roundMoney(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function pickFingerprintTotals(totals = {}) {
  return FINGERPRINT_FIELDS.reduce((result, [key]) => {
    result[key] = roundMoney(totals?.[key]);
    return result;
  }, {});
}

function buildMonthCloseFingerprint(totals = {}) {
  return crypto.createHash('sha1').update(JSON.stringify(pickFingerprintTotals(totals))).digest('hex');
}

// What changed between two versions of a month's totals, one row per figure.
function diffMonthCloseTotals(before = {}, after = {}) {
  return DIFF_FIELDS
    .map(([key, label]) => {
      const previous = roundMoney(before?.[key]);
      const next = roundMoney(after?.[key]);
      return { key, label, before: previous, after: next, delta: roundMoney(next - previous) };
    })
    .filter((row) => row.delta !== 0);
}

module.exports = {
  DEFAULT_REOPEN_DAYS,
  MAX_REOPEN_DAYS,
  MIN_REOPEN_DAYS,
  buildMonthCloseFingerprint,
  buildMonthCloseLockMessage,
  diffMonthCloseTotals,
  formatMonthCloseLabel,
  isWindowCovered,
  listFinancialYearMonthKeys,
  normalizeReopenDays,
  pickFingerprintTotals,
  readCloseWindow,
  resolveMonthCloseCalendar,
  resolveMonthCloseLock,
  resolveMonthCloseWindow
};
