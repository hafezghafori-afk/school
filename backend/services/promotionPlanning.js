// Pure rules of a class-promotion batch: which class of the target year a
// student moves into, whether a class an operator picked is a legal
// destination, the order of two academic years and the dates a promotion
// takes effect on. Nothing here touches the database, so
// check:promotion-planning tests it directly.

const PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';
const TERMINAL_GRADE = 12;

// Outcomes that move a student (or hold them for the second-chance exam).
// 'blocked' and 'skipped' never leave a transaction behind any more, so they
// can't make a student look "already promoted" once their marks are fixed.
const ACTIONABLE_OUTCOMES = Object.freeze(['promoted', 'repeated', 'conditional', 'graduated']);
const LIVE_TRANSACTION_STATUSES = Object.freeze(['applied', 'held']);

const PLAN_ISSUE_MESSAGES = Object.freeze({
  source_year_not_found: 'سال تعلیمی مبدا پیدا نشد.',
  source_class_not_found: 'صنف مبدا پیدا نشد.',
  target_year_not_resolved: 'سال تعلیمی مقصد پیدا نشد؛ اول سال مقصد را بسازید یا انتخاب کنید.',
  target_year_same_as_source: 'سال تعلیمی مقصد نمی‌تواند همان سال مبدا باشد.',
  target_year_before_source: 'سال تعلیمی مقصد باید بعد از سال مبدا باشد.',
  target_year_order_unknown: 'ترتیب سال مبدا و مقصد معلوم نیست (تاریخ شروع یا ترتیب سال ثبت نشده)؛ مطمئن شوید سال مقصد درست است.',
  target_class_not_found: 'صنف انتخاب‌شده پیدا نشد.',
  target_class_wrong_year: 'صنف انتخاب‌شده متعلق به سال تعلیمی مقصد نیست.',
  target_class_archived: 'صنف انتخاب‌شده بایگانی شده است.',
  target_class_grade_mismatch_promoted: 'صنف مقصد کامیاب‌ها باید یک پایه بالاتر از صنف مبدا باشد.',
  target_class_grade_mismatch_repeated: 'صنف تکرار باید همان پایهٔ صنف مبدا باشد.',
  target_class_gender_mismatch: 'جنسیت صنف مقصد (ذکور/اناث) با صنف مبدا یکی نیست.',
  promoted_class_not_resolved: 'صنف پایهٔ بعدی در سال مقصد پیدا نشد؛ صنف مقصد را انتخاب کنید یا صنف‌های سال مقصد را بسازید.',
  repeat_class_not_resolved: 'صنف هم‌پایه برای شاگردان تکراری در سال مقصد پیدا نشد؛ صنف تکرار را انتخاب کنید.',
  promoted_class_ambiguous: 'چند صنف پایهٔ بعدی با شرایط برابر وجود دارد؛ صنف مقصد را خودتان انتخاب کنید.',
  repeat_class_ambiguous: 'چند صنف هم‌پایه با شرایط برابر وجود دارد؛ صنف تکرار را خودتان انتخاب کنید.',
  target_start_before_source_end: 'تاریخ شروع در صنف مقصد پیش از تاریخ ختم عضویت در صنف مبدا است.',
  target_class_over_capacity: 'تعداد شاگردان صنف مقصد بعد از ارتقا از ظرفیت آن بیشتر می‌شود.'
});

const FIELD_LABELS = Object.freeze({
  source: 'مبدا',
  target_year: 'سال مقصد',
  promoted_class: 'صنف مقصد کامیاب‌ها',
  repeat_class: 'صنف تکرار',
  dates: 'تاریخ‌ها',
  capacity: 'ظرفیت'
});

function idOf(value) {
  return String(value?._id || value || '').trim();
}

function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function toDate(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function normalizeDigits(value) {
  return String(value ?? '')
    .replace(/[۰-۹]/g, (char) => String(PERSIAN_DIGITS.indexOf(char)))
    .replace(/[٠-٩]/g, (char) => String(ARABIC_DIGITS.indexOf(char)));
}

function extractSequenceValue(value) {
  const match = normalizeDigits(value).match(/(\d+)/);
  return match ? Number(match[1]) : null;
}

// gradeLevel is a required 1-12 Number on SchoolClass and the authoritative
// grade; the title/code are only read for rows that somehow lack it.
function gradeOf(schoolClass) {
  if (!schoolClass) return null;
  const grade = Number(schoolClass.gradeLevel);
  if (Number.isInteger(grade) && grade >= 1 && grade <= TERMINAL_GRADE) return grade;
  return extractSequenceValue(schoolClass.title) ?? extractSequenceValue(schoolClass.code);
}

function isTerminalClass(schoolClass) {
  const grade = gradeOf(schoolClass);
  return grade != null && grade >= TERMINAL_GRADE;
}

function requiredGrade(sourceClass, mode) {
  const grade = gradeOf(sourceClass);
  if (grade == null) return null;
  return mode === 'promoted' ? grade + 1 : grade;
}

// A mixed class may feed (or take) either; two single-gender classes must agree.
function gendersCompatible(left, right) {
  const a = text(left) || 'mixed';
  const b = text(right) || 'mixed';
  return a === 'mixed' || b === 'mixed' || a === b;
}

function shiftKey(schoolClass) {
  return idOf(schoolClass?.shiftId) || text(schoolClass?.shift);
}

// Every reason the class can't take this source class's students in `mode`.
function classTargetIssues({ sourceClass = null, targetClass = null, mode = 'promoted', targetAcademicYearId = '' } = {}) {
  if (!targetClass) return ['target_class_not_found'];
  const issues = [];
  if (idOf(targetAcademicYearId) && idOf(targetClass.academicYearId) !== idOf(targetAcademicYearId)) {
    issues.push('target_class_wrong_year');
  }
  if (text(targetClass.status) === 'archived') issues.push('target_class_archived');
  const expected = requiredGrade(sourceClass, mode);
  const actual = gradeOf(targetClass);
  if (expected != null && actual != null && expected !== actual) issues.push('target_class_grade_mismatch');
  if (sourceClass && !gendersCompatible(sourceClass.genderType, targetClass.genderType)) {
    issues.push('target_class_gender_mismatch');
  }
  return issues;
}

function scoreCandidate(candidate, sourceClass) {
  let score = 0;
  if (text(candidate.section) && text(candidate.section) === text(sourceClass.section)) score += 30;
  if (text(candidate.genderType) && text(candidate.genderType) === text(sourceClass.genderType)) score += 20;
  if (shiftKey(candidate) && shiftKey(candidate) === shiftKey(sourceClass)) score += 15;
  if (text(candidate.status) === 'active') score += 1;
  return score;
}

// Legal destinations only (right grade, right year, compatible gender, not
// archived), best first: same section, then same gender, then same shift.
// A class of the wrong grade is never offered - the old matcher fell back to a
// same-named class of the SAME grade when the next grade didn't exist yet, so
// a "promoted" student silently repeated.
function rankTargetClasses({ candidates = [], sourceClass = null, mode = 'promoted', targetAcademicYearId = '' } = {}) {
  if (!sourceClass || requiredGrade(sourceClass, mode) == null) return [];
  return (Array.isArray(candidates) ? candidates : [])
    .filter((candidate) => gradeOf(candidate) != null)
    .filter((candidate) => classTargetIssues({ sourceClass, targetClass: candidate, mode, targetAcademicYearId }).length === 0)
    .map((candidate) => ({ candidate, score: scoreCandidate(candidate, sourceClass) }))
    .sort((left, right) => right.score - left.score
      || text(left.candidate.title).localeCompare(text(right.candidate.title))
      || idOf(left.candidate).localeCompare(idOf(right.candidate)));
}

function selectTargetClass(options = {}) {
  const ranked = rankTargetClasses(options);
  return {
    targetClass: ranked[0]?.candidate || null,
    ambiguous: ranked.length > 1 && ranked[0].score === ranked[1].score,
    candidates: ranked.map((entry) => entry.candidate)
  };
}

function yearNumber(year) {
  const value = extractSequenceValue(year?.title) ?? extractSequenceValue(year?.code);
  return value != null && value >= 1000 ? value : null;
}

// 'after' | 'before' | 'same' | 'unknown' - is `target` later than `source`?
function academicYearOrder(source, target) {
  if (!source || !target) return 'unknown';
  if (idOf(source) && idOf(source) === idOf(target)) return 'same';
  const sourceStart = toDate(source.startDate);
  const targetStart = toDate(target.startDate);
  if (sourceStart && targetStart && sourceStart.getTime() !== targetStart.getTime()) {
    return targetStart > sourceStart ? 'after' : 'before';
  }
  const sourceSequence = Number(source.sequence) || 0;
  const targetSequence = Number(target.sequence) || 0;
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

// Two dates instead of the old single «تاریخ اثر»: the student leaves the
// source class at the end of the source year and joins the target class when
// the target year starts. A legacy `effectiveAt` still drives both.
function resolvePromotionDates({ payload = {}, sourceAcademicYear = null, targetAcademicYear = null, now = new Date() } = {}) {
  const legacy = toDate(payload.effectiveAt);
  const sourceEndAt = toDate(payload.sourceEndAt) || legacy || toDate(sourceAcademicYear?.endDate) || now;
  const targetStartAt = toDate(payload.targetStartAt) || legacy || toDate(targetAcademicYear?.startDate) || sourceEndAt;
  const warnings = targetStartAt < sourceEndAt ? ['target_start_before_source_end'] : [];
  return { sourceEndAt, targetStartAt, warnings };
}

function normalizeStudentOverrides(list = []) {
  const overrides = new Map();
  (Array.isArray(list) ? list : []).forEach((entry) => {
    const membershipId = idOf(entry?.membershipId || entry?.studentMembershipId);
    if (!membershipId) return;
    overrides.set(membershipId, {
      targetClassId: idOf(entry?.targetClassId),
      exclude: entry?.exclude === true,
      reason: text(entry?.reason)
    });
  });
  return overrides;
}

// A class-12 pass is a graduation whatever the rule says - the default rule
// isn't terminal, which used to send grade-12 students hunting for a grade 13.
function finalizeOutcome({ computedOutcome = '', sourceClass = null, rule = null } = {}) {
  if (computedOutcome === 'promoted' && (rule?.isTerminalClass || isTerminalClass(sourceClass))) return 'graduated';
  return computedOutcome;
}

function targetModeForOutcome(outcome) {
  if (outcome === 'promoted') return 'promoted';
  if (outcome === 'repeated') return 'repeated';
  return '';
}

function summarizeTargetCapacity({ targetClasses = [], incomingByClassId = new Map(), currentByClassId = new Map() } = {}) {
  return (Array.isArray(targetClasses) ? targetClasses : [])
    .filter((item) => incomingByClassId.has(idOf(item)))
    .map((item) => {
      const classId = idOf(item);
      const capacity = Number(item.capacity) || 0;
      const currentStudents = currentByClassId.has(classId)
        ? Number(currentByClassId.get(classId)) || 0
        : Number(item.currentStudents) || 0;
      const incoming = Number(incomingByClassId.get(classId)) || 0;
      const projected = currentStudents + incoming;
      return {
        classId,
        title: text(item.title),
        code: text(item.code),
        capacity,
        currentStudents,
        incoming,
        projected,
        overCapacity: capacity > 0 && projected > capacity
      };
    });
}

function planIssueMessage(code = '', { mode = '' } = {}) {
  if (code === 'target_class_grade_mismatch') {
    return PLAN_ISSUE_MESSAGES[`target_class_grade_mismatch_${mode === 'repeated' ? 'repeated' : 'promoted'}`];
  }
  return PLAN_ISSUE_MESSAGES[code] || code;
}

function buildPlanIssue(code, field = '', { mode = '' } = {}) {
  const label = FIELD_LABELS[field] || '';
  const message = planIssueMessage(code, { mode });
  return { code, field, message: label ? `${label}: ${message}` : message };
}

module.exports = {
  ACTIONABLE_OUTCOMES,
  LIVE_TRANSACTION_STATUSES,
  PLAN_ISSUE_MESSAGES,
  TERMINAL_GRADE,
  academicYearOrder,
  buildPlanIssue,
  classTargetIssues,
  extractSequenceValue,
  finalizeOutcome,
  gendersCompatible,
  gradeOf,
  idOf,
  isTerminalClass,
  normalizeDigits,
  normalizeStudentOverrides,
  planIssueMessage,
  rankTargetClasses,
  requiredGrade,
  resolvePromotionDates,
  selectTargetClass,
  summarizeTargetCapacity,
  targetModeForOutcome
};
