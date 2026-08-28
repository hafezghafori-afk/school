const mongoose = require('mongoose');
const ExcelJS = require('exceljs');
const AfghanStudent = require('../models/AfghanStudent');
const StudentSawanehCard = require('../models/StudentSawanehCard');
const StudentAcademicTranscript = require('../models/StudentAcademicTranscript');
const SchoolClass = require('../models/SchoolClass');
const { TIER_LABELS, PROMOTION_LABELS } = require('../constants/sawanehGrading');
const { formatAfghanStoredDateLabel } = require('../utils/afghanDate');

const toObjectId = (value) => {
  if (!value) return null;
  if (value instanceof mongoose.Types.ObjectId) return value;
  return mongoose.Types.ObjectId.isValid(String(value)) ? new mongoose.Types.ObjectId(String(value)) : null;
};

const gradeNumber = (value) => {
  const match = String(value == null ? '' : value).match(/\d+/);
  const n = match ? Number(match[0]) : null;
  return n >= 1 && n <= 12 ? n : null;
};

const studentName = (s = {}) => {
  const p = s.personalInfo || {};
  return [p.firstNameDari, p.lastNameDari].filter(Boolean).join(' ').trim()
    || [p.firstName, p.lastName].filter(Boolean).join(' ').trim()
    || 'بدون نام';
};

const dateLocal = (value) => {
  if (!value) return '';
  try { return formatAfghanStoredDateLabel(value) || ''; } catch (err) { return ''; }
};

const studentMap = async (ids) => {
  const uniq = [...new Set(ids.map(String))].map(toObjectId).filter(Boolean);
  if (!uniq.length) return new Map();
  const docs = await AfghanStudent.find({ _id: { $in: uniq } })
    .select('personalInfo asasNumber academicInfo.currentGrade')
    .lean();
  return new Map(docs.map((d) => [String(d._id), d]));
};

/**
 * گزارشِ ترکیبیِ سوانح (حجم داده کوچک است، همه در یک فراخوان).
 * @param {{ schoolId?, academicYearId?, grade? }} filter
 */
const getOverview = async (filter = {}) => {
  const schoolId = toObjectId(filter.schoolId);
  const yearId = toObjectId(filter.academicYearId);
  const grade = gradeNumber(filter.grade);

  // --- کارت‌های ناقص ---
  const studentQuery = { status: 'active' };
  if (schoolId) studentQuery['academicInfo.currentSchool'] = schoolId;
  if (grade) studentQuery['academicInfo.currentGrade'] = `grade${grade}`;
  const students = await AfghanStudent.find(studentQuery)
    .select('personalInfo asasNumber academicInfo.currentGrade')
    .lean();
  const cards = await StudentSawanehCard.find({ studentId: { $in: students.map((s) => s._id) } })
    .select('studentId status supervisorRemarks')
    .lean();
  const cardByStudent = new Map(cards.map((c) => [String(c.studentId), c]));

  const incompleteCards = [];
  students.forEach((s) => {
    const card = cardByStudent.get(String(s._id));
    const g = gradeNumber(s.academicInfo?.currentGrade);
    let reason = '';
    if (!card) reason = 'no_card';
    else if (card.status !== 'active') reason = 'draft_card';
    else if (g && !(card.supervisorRemarks || []).some((r) => Number(r.grade) === g)) reason = 'missing_remark';
    if (reason) {
      incompleteCards.push({
        studentId: String(s._id),
        name: studentName(s),
        asasNumber: s.asasNumber || '',
        grade: g,
        reason
      });
    }
  });

  // --- وضعیت ترانسکریپت + آمار نتیجهٔ سالانه ---
  const transcriptQuery = {};
  if (schoolId) transcriptQuery.schoolId = schoolId;
  if (yearId) transcriptQuery.academicYearId = yearId;
  if (grade) transcriptQuery.grade = grade;
  const transcripts = await StudentAcademicTranscript.find(transcriptQuery)
    .select('studentId grade state resultTier promotionStatus average failedSubjectCount rank classSize')
    .lean();

  const byGrade = new Map();
  transcripts.forEach((t) => {
    if (!byGrade.has(t.grade)) {
      byGrade.set(t.grade, {
        grade: t.grade, total: 0, draft: 0, finalized: 0, locked: 0,
        tiers: { aali: 0, ali: 0, motawaset: 0, nakam: 0, pending: 0 },
        promotion: { kamyab: 0, kamyab_makeup: 0, mashroot: 0, nakam_senf: 0, pending: 0 },
        averageSum: 0, averageCount: 0
      });
    }
    const row = byGrade.get(t.grade);
    row.total += 1;
    row[t.state] = (row[t.state] || 0) + 1;
    row.tiers[t.resultTier] = (row.tiers[t.resultTier] || 0) + 1;
    row.promotion[t.promotionStatus] = (row.promotion[t.promotionStatus] || 0) + 1;
    if (t.average) { row.averageSum += t.average; row.averageCount += 1; }
  });

  const transcriptStatus = [...byGrade.values()]
    .sort((a, b) => a.grade - b.grade)
    .map((row) => ({
      grade: row.grade,
      total: row.total,
      draft: row.draft || 0,
      finalized: row.finalized || 0,
      locked: row.locked || 0,
      classAverage: row.averageCount ? Math.round((row.averageSum / row.averageCount) * 100) / 100 : 0,
      tiers: row.tiers,
      promotion: row.promotion
    }));

  const unfinalizedList = [];
  const draftTranscripts = transcripts.filter((t) => t.state === 'draft');
  if (draftTranscripts.length) {
    const sm = await studentMap(draftTranscripts.map((t) => t.studentId));
    draftTranscripts.forEach((t) => {
      const s = sm.get(String(t.studentId));
      unfinalizedList.push({
        studentId: String(t.studentId),
        name: s ? studentName(s) : '—',
        asasNumber: s?.asasNumber || '',
        grade: t.grade
      });
    });
  }

  // --- منفک‌شده‌ها با جریمهٔ پرداخت‌نشده ---
  const penaltyQuery = {
    'separation.isSeparated': true,
    'separation.penaltyAmount': { $gt: 0 },
    'separation.penaltyPaid': false
  };
  if (schoolId) penaltyQuery.schoolId = schoolId;
  const penaltyCards = await StudentSawanehCard.find(penaltyQuery)
    .select('studentId separation')
    .lean();
  const penaltySm = await studentMap(penaltyCards.map((c) => c.studentId));
  const unpaidPenalties = penaltyCards.map((c) => {
    const s = penaltySm.get(String(c.studentId));
    return {
      studentId: String(c.studentId),
      name: s ? studentName(s) : '—',
      asasNumber: s?.asasNumber || '',
      amount: c.separation?.penaltyAmount || 0,
      reason: c.separation?.reason || '',
      grade: c.separation?.grade || null,
      dateLocal: c.separation?.dateLocal || dateLocal(c.separation?.date)
    };
  });

  return {
    counts: {
      incompleteCards: incompleteCards.length,
      unfinalizedTranscripts: unfinalizedList.length,
      unpaidPenalties: unpaidPenalties.length,
      unpaidPenaltyTotal: unpaidPenalties.reduce((sum, p) => sum + Number(p.amount || 0), 0)
    },
    incompleteCards,
    transcriptStatus,
    unfinalizedTranscripts: unfinalizedList,
    unpaidPenalties,
    labels: { tiers: TIER_LABELS, promotion: PROMOTION_LABELS }
  };
};

/**
 * جدول رتبهٔ یک صنف در یک سال (برای تقدیرنامه).
 */
const getClassRanks = async ({ classId, academicYearId, top = 0 }) => {
  const cid = toObjectId(classId);
  const yid = toObjectId(academicYearId);
  if (!cid || !yid) throw new Error('sawaneh_report_invalid_ids');

  let query = StudentAcademicTranscript.find({ classId: cid, academicYearId: yid })
    .select('studentId grade average rank classSize resultTier promotionStatus totalObtained')
    .sort({ rank: 1, average: -1 });
  if (Number(top) > 0) query = query.limit(Number(top));
  const transcripts = await query.lean();

  const sm = await studentMap(transcripts.map((t) => t.studentId));
  const schoolClass = await SchoolClass.findById(cid).select('title titleDari gradeLevel section').lean();

  return {
    class: schoolClass
      ? { id: String(schoolClass._id), title: schoolClass.titleDari || schoolClass.title, grade: schoolClass.gradeLevel, section: schoolClass.section }
      : null,
    rows: transcripts.map((t) => {
      const s = sm.get(String(t.studentId));
      return {
        studentId: String(t.studentId),
        name: s ? studentName(s) : '—',
        asasNumber: s?.asasNumber || '',
        rank: t.rank,
        average: t.average,
        totalObtained: t.totalObtained,
        resultTier: t.resultTier,
        promotionStatus: t.promotionStatus
      };
    })
  };
};

/**
 * ورک‌بوکِ اکسلِ «لست اساس» (نام، نام پدر، نمبر اساس، صنف، تاریخ شمولیت).
 * @returns {Promise<Buffer>}
 */
const buildAsasListWorkbook = async ({ schoolId, grade } = {}) => {
  const sid = toObjectId(schoolId);
  const g = gradeNumber(grade);

  const query = { status: 'active' };
  if (sid) query['academicInfo.currentSchool'] = sid;
  if (g) query['academicInfo.currentGrade'] = `grade${g}`;

  const students = await AfghanStudent.find(query)
    .select('personalInfo asasNumber academicInfo.currentGrade academicInfo.enrollmentDate')
    .sort({ 'academicInfo.currentGrade': 1, 'personalInfo.lastNameDari': 1 })
    .lean();

  const cards = await StudentSawanehCard.find({ studentId: { $in: students.map((s) => s._id) } })
    .select('studentId enrollmentHistory')
    .lean();
  const cardByStudent = new Map(cards.map((c) => [String(c.studentId), c]));

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Sawaneh';
  const sheet = workbook.addWorksheet('لست اساس', { views: [{ rightToLeft: true }] });
  sheet.columns = [
    { header: 'شماره', key: 'idx', width: 8 },
    { header: 'نام', key: 'name', width: 24 },
    { header: 'نام پدر', key: 'father', width: 20 },
    { header: 'نمبر اساس', key: 'asas', width: 18 },
    { header: 'صنف', key: 'grade', width: 10 },
    { header: 'تاریخ شمولیت', key: 'date', width: 18 }
  ];
  sheet.getRow(1).font = { bold: true };

  students.forEach((s, index) => {
    const card = cardByStudent.get(String(s._id));
    const initial = (card?.enrollmentHistory || []).find((r) => r.kind === 'initial')
      || (card?.enrollmentHistory || [])[0];
    sheet.addRow({
      idx: index + 1,
      name: studentName(s),
      father: s.personalInfo?.fatherName || '',
      asas: s.asasNumber || '',
      grade: gradeNumber(s.academicInfo?.currentGrade) || '',
      date: initial?.dateLocal || dateLocal(s.academicInfo?.enrollmentDate)
    });
  });

  return workbook.xlsx.writeBuffer();
};

module.exports = {
  getOverview,
  getClassRanks,
  buildAsasListWorkbook
};
