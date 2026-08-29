// قواعد نمره‌دهیِ «سوانح تعلیمی» — توافق‌شده با مدیریت مکتب ایمان.
// امتحانات: سویه (۱۰۰، خارج از محاسبه) · چهارونیم‌ماهه (۴۰) · سالانه (۶۰)
// مجموعِ مضمون = چهارونیم‌ماهه + سالانه (۰–۱۰۰)

const SUBJECT_PASS_MARK = 55;
const SUBJECT_MAX_MARK = 100;

// کدهای ExamType که در فرم B استفاده می‌شوند
const EXAM_TYPE_CODES = Object.freeze({
  sawiya: 'PLACEMENT',        // سویه
  midYear: 'FOUR_HALF_MONTH', // چهارونیم‌ماهه
  final: 'ANNUAL'             // سالانه
});

const num = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

/**
 * نمرهٔ سالانهٔ یک مضمون = چهارونیم‌ماهه + سالانه.
 * اگر هیچ‌کدام ثبت نشده باشد → null؛ اگر یکی ثبت شده، همان (دیگری صفر).
 */
const computeAnnualMark = (midYearMark, finalMark) => {
  const mid = num(midYearMark);
  const fin = num(finalMark);
  if (mid === null && fin === null) return null;
  return Math.max(0, (mid || 0) + (fin || 0));
};

const isSubjectPassed = (annualMark) => {
  const value = num(annualMark);
  return value === null ? null : value >= SUBJECT_PASS_MARK;
};

/**
 * درجه‌بندی کیفی از روی اوسطِ مضامین (۰–۱۰۰):
 * اعلی ۹۰–۱۰۰ · عالی ۸۰–<۹۰ · متوسط ۵۵–<۸۰ · ناکام <۵۵
 */
const resultTierFromAverage = (average, subjectCount) => {
  if (!subjectCount || subjectCount < 1) return 'pending';
  const avg = num(average) || 0;
  if (avg >= 90) return 'aali';
  if (avg >= 80) return 'ali';
  if (avg >= 55) return 'motawaset';
  return 'nakam';
};

/**
 * نتیجهٔ ارتقاء از روی شمار مضامینِ افتاده (مجموع < ۵۵):
 * ۰ → کامیاب · ۱–۲ → کامیاب با حق امتحان چاره‌جویی · ۳ → مشروط · ۴+ → ناکام صنف
 */
const promotionStatusFromFailedCount = (failedCount, subjectCount) => {
  if (!subjectCount || subjectCount < 1) return 'pending';
  const failed = Math.max(0, num(failedCount) || 0);
  if (failed === 0) return 'kamyab';
  if (failed <= 2) return 'kamyab_makeup';
  if (failed === 3) return 'mashroot';
  return 'nakam_senf';
};

// نگاشت Attendance.status → سطلِ فرم B
const ATTENDANCE_BUCKET = Object.freeze({
  present: 'present',
  late: 'present',
  absent: 'absent',
  suspended: 'absent',
  sick: 'sick',
  leave: 'leave',
  excused: 'leave'
});

/**
 * تجمیعِ رکوردهای حاضری به ساختار attendance فرم B.
 * @param {Array<{status:string}>} records
 */
const summarizeAttendance = (records = []) => {
  const out = { schoolDays: 0, present: 0, absent: 0, sick: 0, leave: 0, late: 0 };
  (Array.isArray(records) ? records : []).forEach((rec) => {
    const status = String(rec?.status || '').toLowerCase();
    const bucket = ATTENDANCE_BUCKET[status];
    if (!bucket) return;
    out[bucket] += 1;
    out.schoolDays += 1;
    if (status === 'late') out.late += 1;
  });
  return out;
};

// برچسب‌های فارسی برای نمایش/چاپ
const TIER_LABELS = Object.freeze({
  aali: 'اعلی', ali: 'عالی', motawaset: 'متوسط', nakam: 'ناکام', pending: 'نامشخص'
});
const PROMOTION_LABELS = Object.freeze({
  kamyab: 'کامیاب',
  kamyab_makeup: 'کامیاب (با حق چاره‌جویی)',
  mashroot: 'مشروط',
  nakam_senf: 'ناکام صنف',
  pending: 'نامشخص'
});

module.exports = {
  SUBJECT_PASS_MARK,
  SUBJECT_MAX_MARK,
  EXAM_TYPE_CODES,
  computeAnnualMark,
  isSubjectPassed,
  resultTierFromAverage,
  promotionStatusFromFailedCount,
  ATTENDANCE_BUCKET,
  summarizeAttendance,
  TIER_LABELS,
  PROMOTION_LABELS
};
