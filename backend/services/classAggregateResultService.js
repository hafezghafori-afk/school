const mongoose = require('mongoose');

const AcademicYear = require('../models/AcademicYear');
const SchoolClass = require('../models/SchoolClass');
const Subject = require('../models/Subject');
const TeacherAssignment = require('../models/TeacherAssignment');
const StudentMembership = require('../models/StudentMembership');
const ExamSession = require('../models/ExamSession');
const ExamMark = require('../models/ExamMark');
const ExamResult = require('../models/ExamResult');
const {
  GENERAL_RESULT_POLICY,
  OFFICIAL_EXAM_CODES,
  OFFICIAL_RESULT_POLICY_VERSION,
  combineOfficialSubjectScores,
  computeCompetitionRanks,
  computeGeneralResult,
  getMembershipLifecycleLabel,
  getOfficialExamPolicy,
  normalizeExamTypeCode
} = require('../utils/officialResultPolicy');

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeId(value) {
  const raw = value?._id || value;
  return raw && mongoose.isValidObjectId(raw) ? raw : null;
}

function idText(value) {
  return String(value?._id || value || '');
}

function displayName(membership = {}) {
  return normalizeText(membership.studentId?.preferredName)
    || normalizeText(membership.studentId?.fullName)
    || normalizeText(membership.student?.name)
    || '---';
}

function formatSubject(subject = {}) {
  return {
    id: idText(subject),
    code: normalizeText(subject.code),
    name: normalizeText(subject.nameDari) || normalizeText(subject.name) || '---',
    resultOrder: Number(subject.resultOrder || 0)
  };
}

function formatSourceSession(session = {}) {
  return {
    id: idText(session),
    title: normalizeText(session.title),
    code: normalizeText(session.code),
    status: normalizeText(session.status),
    heldAt: session.heldAt || null,
    submittedAt: session.submittedAt || null,
    approvedAt: session.approvedAt || null,
    publishedAt: session.publishedAt || null,
    examTypeCode: normalizeExamTypeCode(session.examTypeId),
    subjectId: idText(session.subjectId)
  };
}

function sessionFreezeDate(session = {}) {
  return session.submittedAt || session.approvedAt || session.publishedAt || session.heldAt || session.createdAt || null;
}

function membershipExistedAtFreeze(membership = {}, session = {}) {
  const freezeValue = sessionFreezeDate(session);
  if (!freezeValue) return true;
  const freeze = new Date(freezeValue);
  const joinedValue = membership.enrolledAt || membership.joinedAt || membership.createdAt;
  if (!joinedValue) return true;
  const joined = new Date(joinedValue);
  if (Number.isNaN(freeze.getTime()) || Number.isNaN(joined.getTime())) return true;
  return joined.getTime() <= freeze.getTime();
}

async function loadReadinessSource({ academicYearId, classId }) {
  const yearId = normalizeId(academicYearId);
  const schoolClassId = normalizeId(classId);
  if (!yearId || !schoolClassId) throw new Error('result_table_aggregate_scope_required');

  const [academicYear, schoolClass, assignments, sessions, memberships] = await Promise.all([
    AcademicYear.findById(yearId).lean(),
    SchoolClass.findById(schoolClassId).lean(),
    TeacherAssignment.find({ academicYearId: yearId, classId: schoolClassId, status: 'active', subjectId: { $ne: null } })
      .populate('subjectId')
      .populate('teacherUserId', 'name email')
      .lean(),
    ExamSession.find({
      academicYearId: yearId,
      classId: schoolClassId,
      subjectId: { $ne: null },
      status: { $ne: 'archived' }
    })
      .populate('examTypeId', 'title code defaultTotalMark defaultPassMark')
      .populate('subjectId')
      .populate('defaultMarkId')
      .lean(),
    StudentMembership.find({
      classId: schoolClassId,
      $or: [{ academicYearId: yearId }, { academicYear: yearId }]
    }).lean()
  ]);

  if (!academicYear || !schoolClass) throw new Error('result_table_aggregate_scope_not_found');

  const officialSessions = sessions.filter((session) => (
    [OFFICIAL_EXAM_CODES.FOUR_HALF, OFFICIAL_EXAM_CODES.ANNUAL]
      .includes(normalizeExamTypeCode(session.examTypeId))
  ));
  const subjectIds = new Set([
    ...assignments.map((item) => idText(item.subjectId)),
    ...officialSessions.map((item) => idText(item.subjectId))
  ].filter(Boolean));
  const missingSubjectIds = [...subjectIds].filter((id) => !assignments.some((item) => idText(item.subjectId) === id)
    && !officialSessions.some((item) => idText(item.subjectId) === id && item.subjectId?.name));
  const missingSubjects = missingSubjectIds.length ? await Subject.find({ _id: { $in: missingSubjectIds } }).lean() : [];
  const subjects = [
    ...assignments.map((item) => item.subjectId).filter(Boolean),
    ...officialSessions.map((item) => item.subjectId).filter(Boolean),
    ...missingSubjects
  ].filter((subject, index, list) => list.findIndex((item) => idText(item) === idText(subject)) === index)
    .sort((left, right) => Number(left.resultOrder || 0) - Number(right.resultOrder || 0)
      || normalizeText(left.nameDari || left.name).localeCompare(normalizeText(right.nameDari || right.name), 'fa'));

  return { academicYear, schoolClass, assignments, officialSessions, memberships, subjects };
}

async function getClassAggregateReadiness({ academicYearId, classId } = {}) {
  const source = await loadReadinessSource({ academicYearId, classId });
  const approvedStatuses = new Set(['approved', 'published']);
  const approvedSessions = source.officialSessions.filter((session) => approvedStatuses.has(normalizeText(session.status)));
  const sourceSessionIds = approvedSessions.map((session) => session._id);
  const [marks, results] = await Promise.all([
    sourceSessionIds.length
      ? ExamMark.find({ sessionId: { $in: sourceSessionIds } }).select('sessionId studentMembershipId markStatus').lean()
      : [],
    sourceSessionIds.length
      ? ExamResult.find({ sessionId: { $in: sourceSessionIds } }).select('sessionId studentMembershipId markStatus').lean()
      : []
  ]);
  const marksBySession = new Map();
  marks.forEach((mark) => {
    const key = idText(mark.sessionId);
    if (!marksBySession.has(key)) marksBySession.set(key, []);
    marksBySession.get(key).push(mark);
  });
  const resultIdsBySession = new Map();
  results.forEach((result) => {
    const key = idText(result.sessionId);
    if (!resultIdsBySession.has(key)) resultIdsBySession.set(key, new Set());
    resultIdsBySession.get(key).add(idText(result.studentMembershipId));
  });

  const issues = [];
  const subjects = source.subjects.map((subject) => {
    const subjectId = idText(subject);
    const assignments = source.assignments.filter((item) => idText(item.subjectId) === subjectId);
    const candidates = source.officialSessions.filter((item) => idText(item.subjectId) === subjectId);
    const byCode = (code) => candidates.filter((item) => normalizeExamTypeCode(item.examTypeId) === code);
    const eligibleByCode = (code) => byCode(code).filter((item) => approvedStatuses.has(normalizeText(item.status)));
    const fourHalf = eligibleByCode(OFFICIAL_EXAM_CODES.FOUR_HALF);
    const annual = eligibleByCode(OFFICIAL_EXAM_CODES.ANNUAL);

    if (!assignments.length) issues.push({ code: 'subject_teacher_missing', subjectId });
    if (fourHalf.length === 0) issues.push({ code: 'four_half_missing', subjectId });
    if (annual.length === 0) issues.push({ code: 'annual_missing', subjectId });
    if (fourHalf.length > 1) issues.push({ code: 'four_half_duplicate', subjectId, count: fourHalf.length });
    if (annual.length > 1) issues.push({ code: 'annual_duplicate', subjectId, count: annual.length });

    const selected = [fourHalf[0], annual[0]].filter(Boolean);
    const policyMismatches = selected.filter((session) => {
      const policy = getOfficialExamPolicy(session.examTypeId);
      const configuredTotal = Object.values(session.defaultMarkId?.scoreComponents || {})
        .reduce((sum, value) => sum + Math.max(0, Number(value || 0)), 0);
      return !policy
        || Number(session.defaultMarkId?.totalMark || 0) !== Number(policy.totalMark)
        || Number(session.defaultMarkId?.passMark || 0) !== Number(policy.passMark)
        || configuredTotal !== Number(policy.totalMark);
    });
    policyMismatches.forEach((session) => issues.push({
      code: `${normalizeExamTypeCode(session.examTypeId).toLowerCase()}_policy_mismatch`,
      subjectId,
      sessionId: idText(session)
    }));
    let pendingMarks = 0;
    let excusedMarks = 0;
    let missingRosterRows = 0;
    selected.forEach((session) => {
      const sessionMarks = marksBySession.get(idText(session)) || [];
      pendingMarks += sessionMarks.filter((mark) => normalizeText(mark.markStatus) === 'pending').length;
      excusedMarks += sessionMarks.filter((mark) => normalizeText(mark.markStatus) === 'excused').length;
      const resultIds = resultIdsBySession.get(idText(session)) || new Set();
      missingRosterRows += source.memberships
        .filter((membership) => membershipExistedAtFreeze(membership, session))
        .filter((membership) => !resultIds.has(idText(membership))).length;
    });
    if (pendingMarks > 0) issues.push({ code: 'pending_marks', subjectId, count: pendingMarks });
    if (missingRosterRows > 0) issues.push({ code: 'roster_snapshot_incomplete', subjectId, count: missingRosterRows });

    return {
      ...formatSubject(subject),
      teacherAssignments: assignments.map((item) => ({
        id: idText(item),
        teacherId: idText(item.teacherUserId),
        teacherName: normalizeText(item.teacherUserId?.name)
      })),
      fourHalfSessions: fourHalf.map(formatSourceSession),
      annualSessions: annual.map(formatSourceSession),
      pendingMarks,
      excusedMarks,
      missingRosterRows,
      ready: assignments.length > 0
        && fourHalf.length === 1
        && annual.length === 1
        && pendingMarks === 0
        && missingRosterRows === 0
        && policyMismatches.length === 0
    };
  });

  if (!subjects.length) issues.push({ code: 'subjects_missing' });
  return {
    ready: subjects.length > 0 && subjects.every((item) => item.ready),
    policyVersion: OFFICIAL_RESULT_POLICY_VERSION,
    policy: GENERAL_RESULT_POLICY,
    academicYear: {
      id: idText(source.academicYear),
      title: normalizeText(source.academicYear.title),
      code: normalizeText(source.academicYear.code)
    },
    schoolClass: {
      id: idText(source.schoolClass),
      title: normalizeText(source.schoolClass.title),
      code: normalizeText(source.schoolClass.code)
    },
    membershipCount: source.memberships.length,
    sourceSessionIds: sourceSessionIds.map(idText),
    subjects,
    issues
  };
}

function scoreFromResult(result = null) {
  if (!result) return { score: null, status: 'missing', applicable: true };
  const status = normalizeText(result.markStatus);
  if (status === 'recorded') return { score: Number(result.obtainedMark || 0), status, applicable: true };
  if (status === 'absent') return { score: 0, status, applicable: true };
  if (status === 'not_applicable') return { score: null, status, applicable: false };
  return { score: null, status: status || 'pending', applicable: true };
}

function resultSnapshotDate(result = {}, sessionMap = new Map()) {
  const snapshot = result.membershipSnapshot || {};
  const session = sessionMap.get(idText(result.sessionId)) || {};
  const value = snapshot.effectiveAt
    || snapshot.capturedAt
    || session.heldAt
    || session.rosterFrozenAt
    || session.submittedAt
    || result.computedAt
    || result.createdAt;
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date.getTime() : 0;
}

function selectLatestMembershipSnapshot(results = [], sessionMap = new Map()) {
  return results
    .filter((result) => normalizeText(result?.membershipSnapshot?.status))
    .sort((left, right) => resultSnapshotDate(right, sessionMap) - resultSnapshotDate(left, sessionMap))[0]
    ?.membershipSnapshot || null;
}

async function buildClassAggregateRows({ academicYearId, classId } = {}) {
  const readiness = await getClassAggregateReadiness({ academicYearId, classId });
  if (!readiness.ready) throw new Error('result_table_aggregate_not_ready');

  const [sessions, memberships, results] = await Promise.all([
    ExamSession.find({ _id: { $in: readiness.sourceSessionIds } })
      .populate('examTypeId', 'title code')
      .populate('subjectId')
      .lean(),
    StudentMembership.find({
      classId: normalizeId(classId),
      $or: [{ academicYearId: normalizeId(academicYearId) }, { academicYear: normalizeId(academicYearId) }]
    })
      .populate('studentId')
      .populate('student', 'name email')
      .sort({ enrolledAt: 1, joinedAt: 1, createdAt: 1, _id: 1 }),
    ExamResult.find({ sessionId: { $in: readiness.sourceSessionIds } })
      .populate({ path: 'studentMembershipId', populate: [{ path: 'studentId' }, { path: 'student', select: 'name email' }] })
      .lean()
  ]);

  const membershipMap = new Map(memberships.map((item) => [idText(item), item]));
  results.forEach((result) => {
    const membership = result.studentMembershipId;
    if (membership && !membershipMap.has(idText(membership))) membershipMap.set(idText(membership), membership);
  });
  const sessionMap = new Map(sessions.map((item) => [idText(item), item]));
  const resultMap = new Map(results.map((item) => [
    `${idText(item.sessionId)}:${idText(item.studentMembershipId)}`,
    item
  ]));
  const resultsByMembership = new Map();
  results.forEach((result) => {
    const key = idText(result.studentMembershipId);
    if (!resultsByMembership.has(key)) resultsByMembership.set(key, []);
    resultsByMembership.get(key).push(result);
  });

  const subjectContexts = readiness.subjects.map((subject) => ({
    subject,
    fourHalf: sessionMap.get(subject.fourHalfSessions[0]?.id),
    annual: sessionMap.get(subject.annualSessions[0]?.id)
  }));

  const rows = [...membershipMap.values()].map((membership) => {
    const membershipId = idText(membership);
    const sourceExamResultIds = [];
    const subjects = subjectContexts.map(({ subject, fourHalf, annual }) => {
      const fourResult = resultMap.get(`${idText(fourHalf)}:${membershipId}`) || null;
      const annualResult = resultMap.get(`${idText(annual)}:${membershipId}`) || null;
      if (fourResult?._id) sourceExamResultIds.push(fourResult._id);
      if (annualResult?._id) sourceExamResultIds.push(annualResult._id);
      const four = scoreFromResult(fourResult);
      const annualScore = scoreFromResult(annualResult);
      const combined = combineOfficialSubjectScores({ fourHalf: four.score, annual: annualScore.score });
      const applicable = four.applicable || annualScore.applicable;
      return {
        subjectId: subject.id,
        subjectCode: subject.code,
        subjectName: subject.name,
        fourHalf: four.score,
        fourHalfStatus: four.status,
        annual: annualScore.score,
        annualStatus: annualScore.status,
        total: combined.obtainedMark,
        passed: combined.passed,
        complete: combined.complete,
        applicable
      };
    });

    const applicableSubjects = subjects.filter((item) => item.applicable);
    const general = applicableSubjects.length
      ? computeGeneralResult(applicableSubjects)
      : {
          totalObtained: null,
          totalPossible: 0,
          average: null,
          failedSubjects: null,
          resultStatus: 'not_applicable',
          rankEligible: false
        };
    const membershipSnapshot = selectLatestMembershipSnapshot(
      resultsByMembership.get(membershipId) || [],
      sessionMap
    );
    const membershipState = membershipSnapshot || membership;
    const membershipStatus = normalizeText(membershipState.status);
    const membershipStatusLabel = normalizeText(membershipState.statusLabel)
      || getMembershipLifecycleLabel(membershipState);
    return {
      rowType: 'student',
      sourceExamResultIds,
      studentMembershipId: membership._id,
      studentId: membership.studentId?._id || membership.studentId || null,
      student: membership.student?._id || membership.student || null,
      displayName: displayName(membership),
      membershipStatus,
      membershipStatusLabel,
      resultStatus: general.resultStatus,
      groupLabel: '',
      rank: null,
      obtainedMark: general.totalObtained,
      totalMark: general.totalPossible,
      percentage: general.average,
      averageMark: general.average,
      cells: {
        fullName: displayName(membership),
        admissionNo: normalizeText(membership.studentId?.admissionNo),
        membershipStatus,
        membershipStatusLabel,
        subjects,
        totalObtained: general.totalObtained,
        totalPossible: general.totalPossible,
        average: general.average,
        failedSubjects: general.failedSubjects,
        resultStatus: general.resultStatus
      },
      note: membershipStatusLabel,
      rankEligible: general.rankEligible
    };
  });

  const ranks = computeCompetitionRanks(rows, (row) => row.averageMark, (row) => row.rankEligible);
  rows.sort((left, right) => {
    const leftRank = ranks.get(left) || Number.MAX_SAFE_INTEGER;
    const rightRank = ranks.get(right) || Number.MAX_SAFE_INTEGER;
    if (leftRank !== rightRank) return leftRank - rightRank;
    return left.displayName.localeCompare(right.displayName, 'fa');
  });
  rows.forEach((row, index) => {
    row.serialNo = index + 1;
    row.rank = ranks.get(row) || null;
    row.cells.serialNo = index + 1;
    row.cells.rank = row.rank;
    delete row.rankEligible;
  });

  return { readiness, rows };
}

module.exports = {
  buildClassAggregateRows,
  getClassAggregateReadiness
};
