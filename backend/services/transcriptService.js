const mongoose = require('mongoose');
const StudentAcademicTranscript = require('../models/StudentAcademicTranscript');
const AfghanStudent = require('../models/AfghanStudent');
const AfghanSchool = require('../models/AfghanSchool');
const AcademicYear = require('../models/AcademicYear');
const SchoolClass = require('../models/SchoolClass');
const StudentMembership = require('../models/StudentMembership');
const ExamResult = require('../models/ExamResult');
const Attendance = require('../models/Attendance');
const { resolveSubjectKey, SAWANEH_SUBJECT_MAP } = require('../constants/sawanehSubjects');
const {
  EXAM_TYPE_CODES,
  computeAnnualMark,
  isSubjectPassed,
  resultTierFromAverage,
  promotionStatusFromFailedCount,
  summarizeAttendance
} = require('../constants/sawanehGrading');

const toObjectId = (value) => {
  if (!value) return null;
  if (value instanceof mongoose.Types.ObjectId) return value;
  return mongoose.Types.ObjectId.isValid(String(value)) ? new mongoose.Types.ObjectId(String(value)) : null;
};

const gradeNumber = (value) => {
  const match = String(value == null ? '' : value).match(/\d+/);
  if (!match) return null;
  const num = Number(match[0]);
  return num >= 1 && num <= 12 ? num : null;
};

const round2 = (value) => Math.round((Number(value) || 0) * 100) / 100;

const categoryFor = (subjectKey, subjectCategory) => {
  if (subjectKey && subjectKey !== 'other' && SAWANEH_SUBJECT_MAP[subjectKey]) {
    return SAWANEH_SUBJECT_MAP[subjectKey].category;
  }
  return String(subjectCategory || '').toLowerCase() === 'religious' ? 'religious' : 'general';
};

const orderFor = (subjectKey, resultOrder) => {
  if (Number.isFinite(Number(resultOrder)) && Number(resultOrder) > 0) return Number(resultOrder);
  if (subjectKey && SAWANEH_SUBJECT_MAP[subjectKey]) return SAWANEH_SUBJECT_MAP[subjectKey].order;
  return 999;
};

// همهٔ عضویت‌های همان شاگردِ افغان در همان سال تحصیلی
const findMemberships = async (studentId, academicYearId) => {
  const sid = toObjectId(studentId);
  const yid = toObjectId(academicYearId);
  return StudentMembership.find({
    afghanStudentId: sid,
    $or: [{ academicYear: yid }, { academicYearId: yid }]
  }).select('_id classId student enrolledAt endedAt').lean();
};

const resolveContext = async (student, memberships, academicYearId) => {
  const academic = student.academicInfo || {};
  let classId = memberships.find((m) => m.classId)?.classId
    || academic.currentClassId
    || academic.classId
    || null;

  let grade = gradeNumber(academic.currentGrade);
  let schoolClass = null;
  if (classId) {
    schoolClass = await SchoolClass.findById(classId).select('gradeLevel title titleDari schoolId').lean();
    if (schoolClass && Number.isFinite(schoolClass.gradeLevel)) grade = schoolClass.gradeLevel;
  }

  const schoolId = toObjectId(academic.currentSchool);
  const year = await AcademicYear.findById(academicYearId).select('title startDate endDate').lean();
  let schoolNameSnapshot = '';
  if (schoolId) {
    const school = await AfghanSchool.findById(schoolId).select('nameDari name').lean();
    schoolNameSnapshot = String(school?.nameDari || school?.name || '').trim();
  }

  return {
    classId: toObjectId(classId),
    grade,
    schoolId,
    yearLabel: String(year?.title || '').trim(),
    yearStart: year?.startDate || null,
    yearEnd: year?.endDate || null,
    schoolNameSnapshot
  };
};

const plainRow = (row) => (row && typeof row.toObject === 'function' ? row.toObject() : { ...row });

const buildRows = (results, existingRows = []) => {
  const manualByKey = new Map(
    (existingRows || [])
      .map(plainRow)
      .filter((row) => row.isManual)
      .map((row) => [row.subjectKey, row])
  );

  // گروه‌بندی نتایج بر اساس مضمون
  const bySubject = new Map();
  results.forEach((result) => {
    const subject = result.subjectId;
    if (!subject) return;
    const sid = String(subject._id);
    if (!bySubject.has(sid)) bySubject.set(sid, { subject, marks: {} });
    const code = String(result.examTypeId?.code || '').toUpperCase();
    const obtained = Number(result.obtainedMark);
    const value = Number.isFinite(obtained) ? obtained : null;
    if (code === EXAM_TYPE_CODES.sawiya) bySubject.get(sid).marks.sawiya = { value, id: result._id };
    else if (code === EXAM_TYPE_CODES.midYear) bySubject.get(sid).marks.midYear = { value, id: result._id };
    else if (code === EXAM_TYPE_CODES.final) bySubject.get(sid).marks.final = { value, id: result._id };
  });

  const rows = [];
  bySubject.forEach(({ subject, marks }) => {
    const subjectKey = resolveSubjectKey(subject);
    const manual = manualByKey.get(subjectKey);

    if (manual) {
      rows.push({ ...manual });
      manualByKey.delete(subjectKey);
      return;
    }

    const midYearMark = marks.midYear ? marks.midYear.value : null;
    const finalMark = marks.final ? marks.final.value : null;
    const sawiyaMark = marks.sawiya ? marks.sawiya.value : null;
    const annualMark = computeAnnualMark(midYearMark, finalMark);

    rows.push({
      subjectId: subject._id,
      subjectKey,
      subjectLabel: String(subject.nameDari || subject.name || subjectKey).trim(),
      order: orderFor(subjectKey, subject.resultOrder),
      category: categoryFor(subjectKey, subject.category),
      sawiyaMark,
      midYearMark,
      finalMark,
      annualMark,
      maxMark: 100,
      subjectPassed: isSubjectPassed(annualMark),
      isManual: false,
      sourceResultIds: [marks.sawiya?.id, marks.midYear?.id, marks.final?.id].filter(Boolean)
    });
  });

  // ردیف‌های دستی که مضمونشان دیگر نتیجه ندارد را نگه دار
  manualByKey.forEach((row) => rows.push({ ...row }));

  rows.sort((a, b) => (a.order - b.order) || String(a.subjectLabel).localeCompare(String(b.subjectLabel), 'fa'));
  return rows;
};

const summarize = (rows) => {
  const graded = rows.filter((row) => row.annualMark !== null && row.annualMark !== undefined);
  const totalObtained = graded.reduce((sum, row) => sum + Number(row.annualMark || 0), 0);
  const subjectCount = graded.length;
  const average = subjectCount ? round2(totalObtained / subjectCount) : 0;
  const failedSubjectCount = graded.filter((row) => Number(row.annualMark) < 55).length;
  return {
    totalObtained: round2(totalObtained),
    subjectCount,
    average,
    failedSubjectCount,
    resultTier: resultTierFromAverage(average, subjectCount),
    promotionStatus: promotionStatusFromFailedCount(failedSubjectCount, subjectCount)
  };
};

const gatherAttendance = async (membershipIds, yearStart, yearEnd) => {
  if (!membershipIds.length) return summarizeAttendance([]);
  const query = { studentMembershipId: { $in: membershipIds } };
  if (yearStart || yearEnd) {
    query.date = {};
    if (yearStart) query.date.$gte = new Date(yearStart);
    if (yearEnd) query.date.$lte = new Date(yearEnd);
  }
  const records = await Attendance.find(query).select('status').lean();
  return summarizeAttendance(records);
};

/**
 * سوانح تعلیمیِ یک شاگرد در یک سال تحصیلی را از ExamResult بازتولید می‌کند.
 * ترانسکریپتِ locked دست‌نخورده می‌ماند (فقط diff گزارش می‌شود).
 * @returns {Promise<{ transcript: object|null, changed: boolean, locked: boolean, warning?: string }>}
 */
const rebuild = async (studentId, academicYearId, opts = {}) => {
  const sid = toObjectId(studentId);
  const yid = toObjectId(academicYearId);
  if (!sid || !yid) throw new Error('transcript_invalid_ids');

  const student = await AfghanStudent.findById(sid).select('academicInfo').lean();
  if (!student) throw new Error('transcript_student_not_found');

  const memberships = await findMemberships(sid, yid);
  const membershipIds = memberships.map((m) => m._id);
  const ctx = await resolveContext(student, memberships, yid);

  if (!ctx.grade) {
    return { transcript: null, changed: false, locked: false, warning: 'transcript_grade_unresolved' };
  }
  if (!ctx.schoolId) {
    return { transcript: null, changed: false, locked: false, warning: 'transcript_school_unresolved' };
  }

  const existing = await StudentAcademicTranscript.findOne({
    studentId: sid, academicYearId: yid, grade: ctx.grade
  });

  if (existing && existing.state === 'locked') {
    return { transcript: existing, changed: false, locked: true };
  }

  const results = membershipIds.length
    ? await ExamResult.find({ studentMembershipId: { $in: membershipIds }, academicYearId: yid })
      .populate('subjectId', 'nameDari name namePashto code ministryCode sawanehKey resultOrder category')
      .populate('examTypeId', 'code title')
      .lean()
    : [];

  const rows = buildRows(results, existing?.rows || []);
  const totals = summarize(rows);
  const attendance = await gatherAttendance(membershipIds, ctx.yearStart, ctx.yearEnd);

  const patch = {
    schoolId: ctx.schoolId,
    academicYearId: yid,
    yearLabel: ctx.yearLabel,
    grade: ctx.grade,
    classId: ctx.classId,
    schoolNameSnapshot: ctx.schoolNameSnapshot,
    rows,
    ...totals,
    attendance,
    generatedAt: new Date(),
    lastUpdatedBy: toObjectId(opts.actorId) || null
  };

  let transcript;
  let changed = true;
  if (existing) {
    Object.assign(existing, patch);
    await existing.save();
    transcript = existing;
  } else {
    transcript = await StudentAcademicTranscript.create({
      ...patch,
      studentId: sid,
      state: 'draft',
      createdBy: toObjectId(opts.actorId) || null
    });
  }

  // رتبه را برای کل هم‌صنفی‌ها بازمحاسبه کن
  await recomputeRanks(
    { classId: ctx.classId, schoolId: ctx.schoolId, grade: ctx.grade },
    yid
  );
  transcript = await StudentAcademicTranscript.findById(transcript._id);

  return { transcript, changed, locked: false };
};

/**
 * سوانح تعلیمیِ همهٔ شاگردانِ یک صنف را در یک سال بازتولید می‌کند.
 */
const rebuildClass = async (classId, academicYearId, opts = {}) => {
  const cid = toObjectId(classId);
  const yid = toObjectId(academicYearId);
  if (!cid || !yid) throw new Error('transcript_invalid_ids');

  const memberships = await StudentMembership.find({
    classId: cid,
    afghanStudentId: { $ne: null },
    $or: [{ academicYear: yid }, { academicYearId: yid }]
  }).select('afghanStudentId').lean();

  const studentIds = [...new Set(memberships.map((m) => String(m.afghanStudentId)))];
  const outcomes = [];
  for (const studentId of studentIds) {
    try {
      const result = await rebuild(studentId, yid, opts);
      outcomes.push({ studentId, ok: true, locked: result.locked, warning: result.warning || null });
    } catch (error) {
      outcomes.push({ studentId, ok: false, error: error.message });
    }
  }
  await recomputeRanks({ classId: cid }, yid);
  return { count: studentIds.length, outcomes };
};

/**
 * رتبهٔ همهٔ ترانسکریپت‌های یک صنف/سال را بر اساس اوسط بازمحاسبه می‌کند (رقابتی، هم‌رتبه مجاز).
 */
const recomputeRanks = async (scope = {}, academicYearId) => {
  const yid = toObjectId(academicYearId);
  const filter = { academicYearId: yid };
  const cid = toObjectId(scope.classId);
  if (cid) {
    filter.classId = cid;
  } else if (scope.schoolId && scope.grade) {
    filter.schoolId = toObjectId(scope.schoolId);
    filter.grade = Number(scope.grade);
  } else {
    return { ranked: 0 };
  }

  const transcripts = await StudentAcademicTranscript.find(filter).select('average state rank classSize rankProvisional');
  if (!transcripts.length) return { ranked: 0 };

  const sorted = [...transcripts].sort((a, b) => (b.average || 0) - (a.average || 0));
  const classSize = sorted.length;
  const anyDraft = sorted.some((t) => t.state === 'draft');

  let lastAverage = null;
  let lastRank = 0;
  const ops = [];
  sorted.forEach((transcript, index) => {
    let rank;
    if (transcript.average === lastAverage) {
      rank = lastRank;
    } else {
      rank = index + 1;
      lastRank = rank;
      lastAverage = transcript.average;
    }
    ops.push({
      updateOne: {
        filter: { _id: transcript._id },
        update: { $set: { rank: transcript.subjectCount === 0 ? null : rank, classSize, rankProvisional: anyDraft } }
      }
    });
  });
  if (ops.length) await StudentAcademicTranscript.bulkWrite(ops);
  return { ranked: ops.length, classSize };
};

const _findByKey = (studentId, academicYearId, grade) => StudentAcademicTranscript.findOne({
  studentId: toObjectId(studentId),
  academicYearId: toObjectId(academicYearId),
  ...(grade ? { grade: Number(grade) } : {})
});

const finalize = async (studentId, academicYearId, grade, opts = {}) => {
  const transcript = await _findByKey(studentId, academicYearId, grade);
  if (!transcript) throw new Error('transcript_not_found');
  if (transcript.state === 'locked') throw new Error('transcript_locked');
  transcript.state = 'finalized';
  transcript.finalizedAt = new Date();
  transcript.finalizedBy = toObjectId(opts.actorId) || null;
  transcript.lastUpdatedBy = toObjectId(opts.actorId) || null;
  await transcript.save();
  if (transcript.classId) await recomputeRanks({ classId: transcript.classId }, academicYearId);
  return StudentAcademicTranscript.findById(transcript._id);
};

const reopen = async (studentId, academicYearId, grade, opts = {}) => {
  const transcript = await _findByKey(studentId, academicYearId, grade);
  if (!transcript) throw new Error('transcript_not_found');
  if (transcript.state === 'locked') throw new Error('transcript_locked');
  transcript.state = 'draft';
  transcript.finalizedAt = null;
  transcript.finalizedBy = null;
  transcript.lastUpdatedBy = toObjectId(opts.actorId) || null;
  await transcript.save();
  return StudentAcademicTranscript.findById(transcript._id);
};

const lock = async (studentId, academicYearId, grade, opts = {}) => {
  const transcript = await _findByKey(studentId, academicYearId, grade);
  if (!transcript) throw new Error('transcript_not_found');
  transcript.state = 'locked';
  transcript.lockedAt = new Date();
  transcript.lockedBy = toObjectId(opts.actorId) || null;
  transcript.sealApplied = true;
  if (opts.supervisorSignedBy) transcript.supervisorSignedBy = toObjectId(opts.supervisorSignedBy);
  if (opts.teacherSignedBy) transcript.teacherSignedBy = toObjectId(opts.teacherSignedBy);
  transcript.lastUpdatedBy = toObjectId(opts.actorId) || null;
  await transcript.save();
  return StudentAcademicTranscript.findById(transcript._id);
};

module.exports = {
  rebuild,
  rebuildClass,
  recomputeRanks,
  finalize,
  reopen,
  lock,
  _internals: { gradeNumber, buildRows, summarize, toObjectId }
};
