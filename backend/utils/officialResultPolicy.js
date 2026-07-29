const OFFICIAL_RESULT_POLICY_VERSION = 'af-school-results-v1';

const OFFICIAL_EXAM_CODES = Object.freeze({
  FOUR_HALF: 'FOUR_HALF_MONTH',
  ANNUAL: 'ANNUAL'
});

const EXAM_CODE_ALIASES = Object.freeze({
  FOUR_HALF_MONTH: OFFICIAL_EXAM_CODES.FOUR_HALF,
  FOUR_HALF: OFFICIAL_EXAM_CODES.FOUR_HALF,
  FOUR_HALF_MONTHLY: OFFICIAL_EXAM_CODES.FOUR_HALF,
  FOUR_AND_HALF_MONTH: OFFICIAL_EXAM_CODES.FOUR_HALF,
  ANNUAL: OFFICIAL_EXAM_CODES.ANNUAL,
  YEARLY: OFFICIAL_EXAM_CODES.ANNUAL,
  FINAL: OFFICIAL_EXAM_CODES.ANNUAL
});

const OFFICIAL_EXAM_POLICIES = Object.freeze({
  [OFFICIAL_EXAM_CODES.FOUR_HALF]: Object.freeze({
    code: OFFICIAL_EXAM_CODES.FOUR_HALF,
    title: 'چهارونیم‌ماهه',
    totalMark: 40,
    passMark: 16,
    conditionalMark: 16,
    scoreComponents: Object.freeze({
      attendanceMax: 5,
      homeworkMax: 5,
      oralMax: 10,
      writtenMax: 20,
      classActivityMax: 0
    })
  }),
  [OFFICIAL_EXAM_CODES.ANNUAL]: Object.freeze({
    code: OFFICIAL_EXAM_CODES.ANNUAL,
    title: 'سالانه',
    totalMark: 60,
    passMark: 40,
    conditionalMark: 40,
    scoreComponents: Object.freeze({
      attendanceMax: 5,
      homeworkMax: 5,
      oralMax: 10,
      writtenMax: 40,
      classActivityMax: 0
    })
  })
});

const GENERAL_RESULT_POLICY = Object.freeze({
  totalMark: 100,
  passMark: 55,
  conditionalMaxFailedSubjects: 2,
  rankMode: 'competition',
  policyVersion: OFFICIAL_RESULT_POLICY_VERSION
});

const MEMBERSHIP_STATUS_LABELS = Object.freeze({
  active: 'فعال',
  pending: 'در انتظار',
  transferred: 'تبدیل شده',
  transferred_in: 'تبدیلی آمده',
  transferred_out: 'تبدیل شده',
  graduated: 'فارغ شده',
  dropped: 'ترک تحصیل',
  expelled: 'منفک شده (اخراج رسمی)',
  suspended: 'محروم',
  inactive: 'غیرفعال',
  rejected: 'رد شده'
});

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeExamTypeCode(value = '') {
  const raw = typeof value === 'object' && value
    ? value.code || value.title || ''
    : value;
  const normalized = normalizeText(raw).toUpperCase().replace(/[\s-]+/g, '_');
  return EXAM_CODE_ALIASES[normalized] || normalized;
}

function getOfficialExamPolicy(examType = '') {
  return OFFICIAL_EXAM_POLICIES[normalizeExamTypeCode(examType)] || null;
}

function getMembershipLifecycleLabel(membership = {}) {
  const status = normalizeText(membership?.status).toLowerCase();
  const reason = normalizeText(membership?.endedReason).toLowerCase();
  if (status === 'dropped') {
    if (/ترک|dropout|left|withdraw/.test(reason)) return 'ترک تحصیل';
    if (/منفک|اخراج|dismiss|separat|expuls/.test(reason)) return 'منفک شده (ثبت قدیمی)';
  }
  return MEMBERSHIP_STATUS_LABELS[status] || status || 'نامشخص';
}

function toValidDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isMembershipEffectiveAt(membership = {}, atDate = null) {
  const target = toValidDate(atDate);
  const joinedAt = toValidDate(membership.enrolledAt || membership.joinedAt || membership.createdAt);
  const endedAt = toValidDate(membership.endedAt || membership.leftAt);

  if (!target) {
    return membership.isCurrent === true
      || ['active', 'pending', 'transferred_in', 'suspended'].includes(normalizeText(membership.status));
  }
  if (joinedAt && joinedAt.getTime() > target.getTime()) return false;
  // Membership validity is half-open: enrolledAt <= date < endedAt.
  if (endedAt && endedAt.getTime() <= target.getTime()) return false;
  return true;
}

function getInitialMarkStatus(membership = {}, heldAt = null) {
  if (!isMembershipEffectiveAt(membership, heldAt)) return 'not_applicable';
  if (normalizeText(membership.status) === 'suspended') return 'excused';
  return 'pending';
}

function computeCompetitionRanks(items = [], getScore = (item) => item?.score, isEligible = () => true) {
  const eligible = items
    .map((item, index) => ({ item, index, score: Number(getScore(item)) }))
    .filter((entry) => isEligible(entry.item) && Number.isFinite(entry.score))
    .sort((left, right) => right.score - left.score || left.index - right.index);

  const ranks = new Map();
  let previousScore = null;
  let previousRank = null;
  eligible.forEach((entry, index) => {
    const rank = previousScore !== null && entry.score === previousScore
      ? previousRank
      : index + 1;
    ranks.set(entry.item, rank);
    previousScore = entry.score;
    previousRank = rank;
  });
  return ranks;
}

function combineOfficialSubjectScores({ fourHalf = null, annual = null } = {}) {
  if (fourHalf === null || fourHalf === undefined || fourHalf === ''
    || annual === null || annual === undefined || annual === '') {
    return {
      obtainedMark: null,
      totalMark: GENERAL_RESULT_POLICY.totalMark,
      percentage: null,
      passed: null,
      complete: false
    };
  }
  const fourHalfScore = Number(fourHalf);
  const annualScore = Number(annual);
  if (!Number.isFinite(fourHalfScore) || !Number.isFinite(annualScore)) {
    return {
      obtainedMark: null,
      totalMark: GENERAL_RESULT_POLICY.totalMark,
      percentage: null,
      passed: null,
      complete: false
    };
  }
  const obtainedMark = Number((fourHalfScore + annualScore).toFixed(2));
  return {
    obtainedMark,
    totalMark: GENERAL_RESULT_POLICY.totalMark,
    percentage: obtainedMark,
    passed: obtainedMark >= GENERAL_RESULT_POLICY.passMark,
    complete: true
  };
}

function computeGeneralResult(subjectResults = []) {
  const evaluable = subjectResults.filter((item) => item?.complete && Number.isFinite(Number(item.obtainedMark)));
  if (!evaluable.length || evaluable.length !== subjectResults.length) {
    return {
      totalObtained: null,
      totalPossible: subjectResults.length * GENERAL_RESULT_POLICY.totalMark,
      average: null,
      failedSubjects: null,
      resultStatus: 'pending',
      rankEligible: false
    };
  }

  const totalObtained = Number(evaluable.reduce((sum, item) => sum + Number(item.obtainedMark), 0).toFixed(2));
  const totalPossible = evaluable.length * GENERAL_RESULT_POLICY.totalMark;
  const average = Number((totalObtained / evaluable.length).toFixed(2));
  const failedSubjects = evaluable.filter((item) => item.passed === false).length;
  let resultStatus = 'failed';
  if (average >= GENERAL_RESULT_POLICY.passMark && failedSubjects === 0) {
    resultStatus = 'passed';
  } else if (average >= GENERAL_RESULT_POLICY.passMark && failedSubjects <= GENERAL_RESULT_POLICY.conditionalMaxFailedSubjects) {
    resultStatus = 'conditional';
  }

  return {
    totalObtained,
    totalPossible,
    average,
    failedSubjects,
    resultStatus,
    rankEligible: true
  };
}

module.exports = {
  GENERAL_RESULT_POLICY,
  MEMBERSHIP_STATUS_LABELS,
  OFFICIAL_EXAM_CODES,
  OFFICIAL_EXAM_POLICIES,
  OFFICIAL_RESULT_POLICY_VERSION,
  combineOfficialSubjectScores,
  computeCompetitionRanks,
  computeGeneralResult,
  getInitialMarkStatus,
  getMembershipLifecycleLabel,
  getOfficialExamPolicy,
  isMembershipEffectiveAt,
  normalizeExamTypeCode
};
