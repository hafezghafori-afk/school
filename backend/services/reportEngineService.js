require('../models/AcademicYear');
require('../models/AcademicTerm');
require('../models/SchoolClass');
require('../models/Subject');
require('../models/StudentCore');
require('../models/StudentMembership');
require('../models/User');
require('../models/FeeOrder');
require('../models/FeePayment');
require('../models/Discount');
require('../models/FeeExemption');
require('../models/FinanceRelief');
require('../models/FinancialYear');
require('../models/ExpenseEntry');
require('../models/Attendance');
require('../models/ExamSession');
require('../models/ExamType');
require('../models/ExamResult');
require('../models/TeacherAssignment');
require('../models/Timetable');
require('../models/TimetableConfig');
require('../models/EducationPlanAnnual');
require('../models/EducationPlanWeekly');
require('../models/PromotionTransaction');

const AcademicYear = require('../models/AcademicYear');
const AcademicTerm = require('../models/AcademicTerm');
const SchoolClass = require('../models/SchoolClass');
const Subject = require('../models/Subject');
const StudentCore = require('../models/StudentCore');
const StudentMembership = require('../models/StudentMembership');
const User = require('../models/User');
const FeeOrder = require('../models/FeeOrder');
const FeePayment = require('../models/FeePayment');
const Discount = require('../models/Discount');
const FeeExemption = require('../models/FeeExemption');
const FinanceRelief = require('../models/FinanceRelief');
const FinancialYear = require('../models/FinancialYear');
const Attendance = require('../models/Attendance');
const ExamSession = require('../models/ExamSession');
const ExamResult = require('../models/ExamResult');
const TeacherAssignment = require('../models/TeacherAssignment');
const Timetable = require('../models/Timetable');
const TimetableConfig = require('../models/TimetableConfig');
const EducationPlanAnnual = require('../models/EducationPlanAnnual');
const EducationPlanWeekly = require('../models/EducationPlanWeekly');
const PromotionTransaction = require('../models/PromotionTransaction');
const {
  buildAnnualGovernmentFinanceReport,
  buildQuarterlyGovernmentFinanceReport
} = require('./governmentFinanceReportService');

const REPORT_DEFINITIONS = Object.freeze([
  {
    key: 'finance_overview',
    title: 'گزارش مالی عمومی',
    category: 'finance',
    requiredPermissions: ['manage_finance'],
    supportedFilters: ['academicYearId', 'termId', 'classId', 'studentId', 'userId', 'dateFrom', 'dateTo'],
    description: 'خلاصه مالی و تعهدات مبتنی بر عضویت'
  },
  {
    key: 'fee_debtors_overview',
    title: 'گزارش بدهکاران فیس',
    category: 'finance',
    requiredPermissions: ['manage_finance'],
    supportedFilters: ['academicYearId', 'classId', 'studentId', 'studentMembershipId', 'userId', 'dateFrom', 'dateTo'],
    description: 'لیست بدهکاران فیس بر پایه سفارش‌ها و عضویت'
  },
  {
    key: 'fee_discount_exemption_overview',
    title: 'گزارش تخفیف و معافیت',
    category: 'finance',
    requiredPermissions: ['manage_finance'],
    supportedFilters: ['academicYearId', 'classId', 'studentId', 'studentMembershipId', 'userId', 'dateFrom', 'dateTo'],
    description: 'خلاصه تخفیف‌ها، معافیت‌ها و متعلمین رایگان در لایه مالی'
  },
  {
    key: 'fee_collection_by_class',
    title: 'گزارش وصول فیس بر اساس صنف',
    category: 'finance',
    requiredPermissions: ['manage_finance'],
    supportedFilters: ['academicYearId', 'classId', 'dateFrom', 'dateTo'],
    description: 'تحلیل وصول، پرداخت‌های در انتظار و باقی‌مانده فیس در سطح صنف'
  },
  {
    key: 'exam_outcomes',
    title: 'گزارش نتایج امتحانات',
    category: 'exam',
    requiredPermissions: ['manage_content'],
    supportedFilters: ['academicYearId', 'termId', 'classId', 'studentId', 'userId', 'teacherId', 'examId', 'month', 'dateFrom', 'dateTo'],
    description: 'خلاصه امتحانات بر پایه جلسه و عضویت'
  },
  {
    key: 'attendance_overview',
    title: 'گزارش حضور',
    category: 'attendance',
    requiredPermissions: ['manage_content'],
    supportedFilters: ['academicYearId', 'classId', 'studentId', 'userId', 'dateFrom', 'dateTo'],
    description: 'خلاصه حضور و غیاب بر پایه membership'
  },
  {
    key: 'attendance_summary_overview',
    title: 'گزارش خلاصه حاضری',
    category: 'attendance',
    requiredPermissions: ['manage_content'],
    supportedFilters: ['academicYearId', 'classId', 'studentId', 'userId', 'month', 'dateFrom', 'dateTo'],
    description: 'خلاصه تجمیعی حضور و غیاب بر اساس membership'
  },
  {
    key: 'class_overview',
    title: 'گزارش صنفی',
    category: 'academic',
    requiredPermissions: ['manage_content'],
    supportedFilters: ['academicYearId', 'classId', 'studentId', 'userId', 'teacherId', 'dateFrom', 'dateTo'],
    description: 'خلاصه عضویت‌ها و وضعیت صنف‌ها'
  },
  {
    key: 'subjects_overview',
    title: 'گزارش مضامین',
    category: 'academic',
    requiredPermissions: ['manage_content'],
    supportedFilters: ['academicYearId', 'termId', 'classId', 'teacherId', 'dateFrom', 'dateTo'],
    description: 'لیست مضامین، استادان و ساعات درسی بر اساس teacher assignment'
  },
  {
    key: 'timetable_overview',
    title: 'گزارش تقسیم اوقات و پلان',
    category: 'timetable',
    requiredPermissions: ['manage_schedule', 'manage_content'],
    supportedFilters: ['academicYearId', 'termId', 'classId', 'teacherId', 'dateFrom', 'dateTo'],
    description: 'تحلیل تقسیم اوقات و پلان تعلیمی'
  },
  {
    key: 'promotion_overview',
    title: 'گزارش ارتقا',
    category: 'promotion',
    requiredPermissions: ['manage_content'],
    supportedFilters: ['academicYearId', 'termId', 'classId', 'studentId', 'userId', 'dateFrom', 'dateTo'],
    description: 'خلاصه preview/apply تراکنش‌های ارتقا'
  },
  {
    key: 'government_finance_quarterly',
    title: 'گزارش مالی دولت - ربعوار',
    category: 'finance',
    requiredPermissions: ['manage_finance'],
    supportedFilters: ['financialYearId', 'academicYearId', 'quarter', 'classId', 'dateFrom', 'dateTo'],
    description: 'خلاصه مالی رسمی دولت در سطح ربع مالی'
  },
  {
    key: 'government_finance_annual',
    title: 'گزارش مالی دولت - سالانه',
    category: 'finance',
    requiredPermissions: ['manage_finance'],
    supportedFilters: ['financialYearId', 'academicYearId', 'classId', 'dateFrom', 'dateTo'],
    description: 'خلاصه سالانه مالی دولت'
  }
]);

function toPlain(doc) {
  if (!doc) return null;
  if (typeof doc.toObject === 'function') return doc.toObject({ virtuals: false });
  return { ...doc };
}

function toRawText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function repairDisplayText(value) {
  const text = toRawText(value);
  if (!text || !/[ØÙÚÛÂâ€]/.test(text)) return text;
  try {
    const repaired = Buffer.from(text, 'latin1').toString('utf8').trim();
    return repaired || text;
  } catch {
    return text;
  }
}

function normalizeText(value) {
  return repairDisplayText(value);
}

function normalizeNullableId(value) {
  const text = normalizeText(value);
  return text || null;
}

function normalizeDateKey(value) {
  if (!value) return '';
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  const text = normalizeText(value);
  return text;
}

function normalizeFilters(input = {}) {
  return {
    financialYearId: normalizeNullableId(input.financialYearId || input.yearId),
    academicYearId: normalizeNullableId(input.academicYearId || input.year || input.academicYear),
    termId: normalizeNullableId(input.termId || input.term || input.assessmentPeriodId),
    examId: normalizeNullableId(input.examId || input.sessionId),
    month: normalizeText(input.month || input.monthLabel || input.periodLabel),
    quarter: Math.max(0, Math.min(4, Number(input.quarter) || 0)) || null,
    classId: normalizeNullableId(input.classId || input.schoolClassId),
    studentId: normalizeNullableId(input.studentId),
    studentMembershipId: normalizeNullableId(input.studentMembershipId),
    userId: normalizeNullableId(input.userId || input.studentUserId),
    teacherId: normalizeNullableId(input.teacherId || input.teacherUserId),
    dateFrom: normalizeDateKey(input.dateFrom || input.from),
    dateTo: normalizeDateKey(input.dateTo || input.to)
  };
}

function buildDateRangeFilter(field, filters = {}) {
  const range = {};
  if (filters.dateFrom) range.$gte = new Date(`${filters.dateFrom}T00:00:00.000Z`);
  if (filters.dateTo) range.$lte = new Date(`${filters.dateTo}T23:59:59.999Z`);
  return Object.keys(range).length ? { [field]: range } : {};
}

function buildStringDateRangeFilter(field, filters = {}) {
  const range = {};
  if (filters.dateFrom) range.$gte = filters.dateFrom;
  if (filters.dateTo) range.$lte = filters.dateTo;
  return Object.keys(range).length ? { [field]: range } : {};
}

function buildFinanceReliefFilter(filters = {}, { activeOnly = false, dateField = 'createdAt' } = {}) {
  const query = {};
  if (filters.academicYearId) query.academicYearId = filters.academicYearId;
  if (filters.classId) query.classId = filters.classId;
  if (filters.studentMembershipId) query.studentMembershipId = filters.studentMembershipId;
  if (filters.studentId) query.studentId = filters.studentId;
  if (filters.userId) query.student = filters.userId;
  if (activeOnly) query.status = 'active';
  Object.assign(query, buildDateRangeFilter(dateField, filters));
  return query;
}

function buildReliefSummary(reliefs = []) {
  const items = Array.isArray(reliefs) ? reliefs : [];
  return {
    totalReliefs: items.length,
    activeReliefs: items.filter((item) => normalizeText(item.status) === 'active').length,
    totalFixedReliefAmount: Number(items.reduce((sum, item) => (
      normalizeText(item.coverageMode) === 'fixed' ? sum + Number(item.amount || 0) : sum
    ), 0).toFixed(2)),
    percentReliefCount: items.filter((item) => normalizeText(item.coverageMode) === 'percent').length,
    fullReliefCount: items.filter((item) => normalizeText(item.coverageMode) === 'full').length,
    activeScholarships: items.filter((item) => normalizeText(item.reliefType).startsWith('scholarship_')).length,
    charitySupports: items.filter((item) => normalizeText(item.reliefType) === 'charity_support').length
  };
}

function formatAcademicYear(doc) {
  const item = toPlain(doc);
  if (!item) return null;
  return { id: String(item._id), title: normalizeText(item.title), code: normalizeText(item.code), isActive: Boolean(item.isActive) };
}

function formatFinancialYear(doc) {
  const item = toPlain(doc);
  if (!item) return null;
  return {
    id: String(item._id),
    title: normalizeText(item.title),
    code: normalizeText(item.code),
    academicYearId: item.academicYearId?._id ? String(item.academicYearId._id) : normalizeText(item.academicYearId),
    startDate: item.startDate ? new Date(item.startDate).toISOString() : '',
    endDate: item.endDate ? new Date(item.endDate).toISOString() : '',
    status: normalizeText(item.status),
    isActive: Boolean(item.isActive),
    isClosed: Boolean(item.isClosed)
  };
}

function formatAcademicTerm(doc) {
  const item = toPlain(doc);
  if (!item) return null;
  return { id: String(item._id), title: normalizeText(item.title), code: normalizeText(item.code), termType: normalizeText(item.termType), sequence: Number(item.sequence || 0) };
}

function formatClass(doc) {
  const item = toPlain(doc);
  if (!item) return null;
  return { id: String(item._id), title: normalizeText(item.title), code: normalizeText(item.code), gradeLevel: normalizeText(item.gradeLevel), section: normalizeText(item.section), shift: normalizeText(item.shift) };
}

function formatTeacher(doc) {
  const item = toPlain(doc);
  if (!item) return null;
  return { id: String(item._id), name: normalizeText(item.name), email: normalizeText(item.email), orgRole: normalizeText(item.orgRole || item.role) };
}

function formatExamSession(doc) {
  const item = toPlain(doc);
  if (!item) return null;
  return {
    id: String(item._id),
    title: normalizeText(item.title),
    code: normalizeText(item.code),
    academicYearId: item.academicYearId?._id ? String(item.academicYearId._id) : normalizeText(item.academicYearId),
    termId: item.assessmentPeriodId?._id ? String(item.assessmentPeriodId._id) : normalizeText(item.assessmentPeriodId),
    classId: item.classId?._id ? String(item.classId._id) : normalizeText(item.classId),
    subject: normalizeText(item.subjectId?.name),
    heldAt: toIsoOrEmpty(item.heldAt),
    status: normalizeText(item.status)
  };
}

function formatStudentRef(doc) {
  const item = toPlain(doc);
  if (!item) return null;
  return { id: String(item._id), fullName: normalizeText(item.fullName), admissionNo: normalizeText(item.admissionNo), email: normalizeText(item.email) };
}

function getStudentName({ studentUser = null, studentCore = null, membership = null } = {}) {
  const core = toPlain(studentCore);
  const user = toPlain(studentUser);
  const mem = toPlain(membership);
  return normalizeText(core?.fullName || user?.name || mem?.student?.name || '');
}

function getClassTitle(doc) {
  const item = toPlain(doc);
  return normalizeText(item?.title || item?.code || '');
}

function getAcademicYearTitle(doc) {
  const item = toPlain(doc);
  return normalizeText(item?.title || item?.code || '');
}

function getReferenceId(value) {
  const item = toPlain(value);
  const raw = item?._id || item?.id || value;
  return normalizeText(raw);
}

function normalizeAttendanceReportStatus(value = '') {
  const status = normalizeText(value).toLowerCase();
  if (status === 'late') return 'sick';
  if (status === 'excused') return 'leave';
  if (['present', 'absent', 'sick', 'leave'].includes(status)) return status;
  return '';
}

function getAttendanceStatusLabel(value = '') {
  const status = normalizeAttendanceReportStatus(value);
  if (status === 'present') return 'حاضر';
  if (status === 'absent') return 'غیرحاضر';
  if (status === 'sick') return 'مریض';
  if (status === 'leave') return 'رخصتی';
  return normalizeText(value);
}

function toIsoOrEmpty(value) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString();
}

function buildBaseReport(definition, filters, extras = {}) {
  return {
    report: {
      key: definition.key,
      title: repairDisplayText(definition.title),
      category: definition.category,
      description: repairDisplayText(definition.description)
    },
    filters,
    generatedAt: new Date().toISOString(),
    columns: Array.isArray(extras.columns)
      ? extras.columns.map((column) => ({
          ...column,
          label: repairDisplayText(column?.label || '')
        }))
      : [],
    rows: extras.rows || [],
    summary: extras.summary || {},
    meta: extras.meta || { totalRows: Array.isArray(extras.rows) ? extras.rows.length : 0 }
  };
}

async function listReportReferenceData() {
  const [academicYears, financialYears, academicTerms, classes, students, teachers, examSessions] = await Promise.all([
    AcademicYear.find({}).sort({ createdAt: -1 }),
    FinancialYear.find({ status: { $ne: 'archived' } }).populate('academicYearId', 'title code').sort({ isActive: -1, createdAt: -1 }),
    AcademicTerm.find({}).sort({ academicYearId: 1, sequence: 1 }),
    SchoolClass.find({ status: { $ne: 'archived' } }).sort({ gradeLevel: 1, section: 1, title: 1 }),
    StudentCore.find({ status: { $ne: 'archived' } }).sort({ fullName: 1 }).limit(500),
    User.find({ role: { $in: ['admin', 'instructor'] } }).select('name email role orgRole').sort({ name: 1 }).limit(300),
    ExamSession.find({ status: { $ne: 'archived' } })
      .populate('academicYearId', 'title code')
      .populate('assessmentPeriodId', 'title code')
      .populate('classId', 'title code gradeLevel section')
      .populate('subjectId', 'name code')
      .sort({ heldAt: -1, createdAt: -1 })
      .limit(300)
  ]);

  return {
    academicYears: academicYears.map(formatAcademicYear),
    financialYears: financialYears.map(formatFinancialYear),
    academicTerms: academicTerms.map(formatAcademicTerm),
    classes: classes.map(formatClass),
    students: students.map(formatStudentRef),
    teachers: teachers.map(formatTeacher),
    examSessions: examSessions.map(formatExamSession)
  };
}

function listReportCatalog({ permissions = null } = {}) {
  const permissionSet = Array.isArray(permissions) ? new Set(permissions) : null;
  return REPORT_DEFINITIONS
    .filter((item) => !permissionSet || item.requiredPermissions.some((permission) => permissionSet.has(permission)))
    .map((item) => ({
      key: item.key,
      title: repairDisplayText(item.title),
      category: item.category,
      description: repairDisplayText(item.description),
      supportedFilters: item.supportedFilters,
      requiredPermissions: item.requiredPermissions
    }));
}

function getReportDefinition(reportKey) {
  return REPORT_DEFINITIONS.find((item) => item.key === normalizeText(reportKey));
}
async function buildFinanceOverviewReport(filters) {
  const definition = getReportDefinition('finance_overview');
  const orderFilter = {};
  const paymentFilter = {};
  if (filters.academicYearId) {
    orderFilter.academicYearId = filters.academicYearId;
    paymentFilter.academicYearId = filters.academicYearId;
  }
  if (filters.termId) orderFilter.assessmentPeriodId = filters.termId;
  if (filters.classId) {
    orderFilter.classId = filters.classId;
    paymentFilter.classId = filters.classId;
  }
  if (filters.studentMembershipId) {
    orderFilter.studentMembershipId = filters.studentMembershipId;
    paymentFilter.studentMembershipId = filters.studentMembershipId;
  }
  if (filters.studentId) {
    orderFilter.studentId = filters.studentId;
    paymentFilter.studentId = filters.studentId;
  }
  if (filters.userId) {
    orderFilter.student = filters.userId;
    paymentFilter.student = filters.userId;
  }
  Object.assign(orderFilter, buildDateRangeFilter('issuedAt', filters));
  Object.assign(paymentFilter, buildDateRangeFilter('paidAt', filters));

  const [orders, payments] = await Promise.all([
    FeeOrder.find(orderFilter).populate('student', 'name email grade').populate('studentId').populate('classId').populate('academicYearId').populate('assessmentPeriodId').sort({ issuedAt: -1, createdAt: -1 }),
    FeePayment.find(paymentFilter).populate('student', 'name email grade').populate('studentId').populate('classId').populate('academicYearId').populate('feeOrderId', 'orderNumber title').sort({ paidAt: -1, createdAt: -1 })
  ]);

  const summary = {
    totalOrders: orders.length,
    totalPayments: payments.length,
    totalDue: Number(orders.reduce((sum, item) => sum + Number(item.amountDue || 0), 0).toFixed(2)),
    totalPaidOnOrders: Number(orders.reduce((sum, item) => sum + Number(item.amountPaid || 0), 0).toFixed(2)),
    totalOutstanding: Number(orders.reduce((sum, item) => sum + Number(item.outstandingAmount || 0), 0).toFixed(2)),
    totalPaymentAmount: Number(payments.reduce((sum, item) => sum + Number(item.amount || 0), 0).toFixed(2)),
    paidOrders: orders.filter((item) => item.status === 'paid').length,
    overdueOrders: orders.filter((item) => item.status === 'overdue').length,
    partialOrders: orders.filter((item) => item.status === 'partial').length
  };

  const rows = orders.map((item, index) => ({
    serialNo: index + 1,
    orderNumber: normalizeText(item.orderNumber),
    title: normalizeText(item.title),
    studentName: getStudentName({ studentUser: item.student, studentCore: item.studentId }),
    classTitle: getClassTitle(item.classId),
    academicYear: normalizeText(item.academicYearId?.title),
    term: normalizeText(item.assessmentPeriodId?.title),
    status: normalizeText(item.status),
    amountDue: Number(item.amountDue || 0),
    amountPaid: Number(item.amountPaid || 0),
    outstandingAmount: Number(item.outstandingAmount || 0),
    issuedAt: item.issuedAt ? new Date(item.issuedAt).toISOString() : '',
    dueDate: item.dueDate ? new Date(item.dueDate).toISOString() : ''
  }));

  return buildBaseReport(definition, filters, {
    columns: [
      { key: 'orderNumber', label: 'شماره سفارش' },
      { key: 'title', label: 'عنوان' },
      { key: 'serialNo', label: 'شماره' },
      { key: 'studentName', label: 'متعلم' },
      { key: 'classTitle', label: 'صنف' },
      { key: 'academicYear', label: 'سال' },
      { key: 'term', label: 'ترم' },
      { key: 'status', label: 'وضعیت' },
      { key: 'amountDue', label: 'مبلغ قابل پرداخت' },
      { key: 'amountPaid', label: 'پرداخت‌شده' },
      { key: 'outstandingAmount', label: 'باقی‌مانده' },
      { key: 'issuedAt', label: 'تاریخ صدور' },
      { key: 'dueDate', label: 'سررسید' }
    ],
    rows,
    summary,
    meta: { totalRows: rows.length, paymentRows: payments.length }
  });
}

async function buildFeeDebtorsOverviewReport(filters) {
  const definition = getReportDefinition('fee_debtors_overview');
  const orderFilter = { status: { $ne: 'void' } };
  if (filters.academicYearId) orderFilter.academicYearId = filters.academicYearId;
  if (filters.classId) orderFilter.classId = filters.classId;
  if (filters.studentMembershipId) orderFilter.studentMembershipId = filters.studentMembershipId;
  if (filters.studentId) orderFilter.studentId = filters.studentId;
  if (filters.userId) orderFilter.student = filters.userId;
  Object.assign(orderFilter, buildDateRangeFilter('issuedAt', filters));

  const [orders, reliefs] = await Promise.all([
    FeeOrder.find(orderFilter)
      .populate('student', 'name email')
      .populate('studentId', 'fullName admissionNo')
      .populate('studentMembershipId', 'status isCurrent')
      .populate('classId', 'title code gradeLevel section')
      .populate('academicYearId', 'title code')
      .sort({ dueDate: 1, issuedAt: -1, createdAt: -1 }),
    FinanceRelief.find(buildFinanceReliefFilter(filters, { activeOnly: true }))
      .populate('student', 'name email')
      .populate('studentId', 'fullName admissionNo')
      .populate('studentMembershipId', 'status isCurrent')
      .populate('classId', 'title code gradeLevel section')
      .populate('academicYearId', 'title code')
      .sort({ createdAt: -1, startDate: -1 })
  ]);

  const reliefGrouped = new Map();
  for (const item of reliefs) {
    const groupKey = [
      getReferenceId(item.studentMembershipId),
      getReferenceId(item.studentId),
      getReferenceId(item.student)
    ].find(Boolean) || normalizeText(item.sourceKey) || String(item._id);
    const current = reliefGrouped.get(groupKey) || {
      reliefCount: 0,
      fixedReliefAmount: 0,
      percentReliefCount: 0,
      fullReliefCount: 0
    };
    current.reliefCount += 1;
    if (normalizeText(item.coverageMode) === 'fixed') current.fixedReliefAmount += Number(item.amount || 0);
    else if (normalizeText(item.coverageMode) === 'percent') current.percentReliefCount += 1;
    else if (normalizeText(item.coverageMode) === 'full') current.fullReliefCount += 1;
    reliefGrouped.set(groupKey, current);
  }

  const grouped = new Map();
  for (const item of orders) {
    const outstandingAmount = Number(item.outstandingAmount || 0);
    if (outstandingAmount <= 0) continue;

    const groupKey = [
      getReferenceId(item.studentMembershipId),
      getReferenceId(item.studentId),
      getReferenceId(item.student)
    ].find(Boolean) || normalizeText(item.orderNumber) || String(item._id);

    const current = grouped.get(groupKey) || {
      studentName: getStudentName({ studentUser: item.student, studentCore: item.studentId, membership: item.studentMembershipId }),
      classTitle: getClassTitle(item.classId),
      academicYear: getAcademicYearTitle(item.academicYearId),
      orderCount: 0,
      totalDue: 0,
      totalPaid: 0,
      totalOutstanding: 0,
      overdueOrders: 0,
      partialOrders: 0,
      newOrders: 0,
      lastDueDate: '',
      debtorStatus: 'new',
      reliefCount: 0,
      fixedReliefAmount: 0,
      percentReliefCount: 0,
      fullReliefCount: 0
    };

    current.orderCount += 1;
    current.totalDue += Number(item.amountDue || 0);
    current.totalPaid += Number(item.amountPaid || 0);
    current.totalOutstanding += outstandingAmount;
    if (item.status === 'overdue') current.overdueOrders += 1;
    if (item.status === 'partial') current.partialOrders += 1;
    if (item.status === 'new') current.newOrders += 1;

    const dueIso = toIsoOrEmpty(item.dueDate);
    if (dueIso && (!current.lastDueDate || dueIso > current.lastDueDate)) current.lastDueDate = dueIso;

    if (current.overdueOrders > 0) current.debtorStatus = 'overdue';
    else if (current.partialOrders > 0) current.debtorStatus = 'partial';
    else current.debtorStatus = 'new';

    const reliefSummary = reliefGrouped.get(groupKey);
    if (reliefSummary) {
      current.reliefCount = Number(reliefSummary.reliefCount || 0);
      current.fixedReliefAmount = Number(reliefSummary.fixedReliefAmount || 0);
      current.percentReliefCount = Number(reliefSummary.percentReliefCount || 0);
      current.fullReliefCount = Number(reliefSummary.fullReliefCount || 0);
    }

    grouped.set(groupKey, current);
  }

  const rows = Array.from(grouped.values())
    .map((item) => ({
      ...item,
      totalDue: Number(item.totalDue.toFixed(2)),
      totalPaid: Number(item.totalPaid.toFixed(2)),
      totalOutstanding: Number(item.totalOutstanding.toFixed(2)),
      fixedReliefAmount: Number(item.fixedReliefAmount.toFixed(2))
    }))
    .sort((left, right) => right.totalOutstanding - left.totalOutstanding);

  const summary = {
    totalDebtors: rows.length,
    totalOrders: rows.reduce((sum, item) => sum + Number(item.orderCount || 0), 0),
    totalOutstanding: Number(rows.reduce((sum, item) => sum + Number(item.totalOutstanding || 0), 0).toFixed(2)),
    overdueDebtors: rows.filter((item) => Number(item.overdueOrders || 0) > 0).length,
    partialDebtors: rows.filter((item) => Number(item.partialOrders || 0) > 0).length,
    debtorsWithRelief: rows.filter((item) => Number(item.reliefCount || 0) > 0).length,
    totalReliefs: rows.reduce((sum, item) => sum + Number(item.reliefCount || 0), 0),
    totalFixedReliefAmount: Number(rows.reduce((sum, item) => sum + Number(item.fixedReliefAmount || 0), 0).toFixed(2)),
    fullReliefCount: rows.reduce((sum, item) => sum + Number(item.fullReliefCount || 0), 0),
    percentReliefCount: rows.reduce((sum, item) => sum + Number(item.percentReliefCount || 0), 0)
  };

  return buildBaseReport(definition, filters, {
    columns: [
      { key: 'studentName', label: 'متعلم' },
      { key: 'classTitle', label: 'صنف' },
      { key: 'academicYear', label: 'سال تعلیمی' },
      { key: 'orderCount', label: 'تعداد بل‌ها' },
      { key: 'totalDue', label: 'مبلغ کل' },
      { key: 'totalPaid', label: 'پرداخت‌شده' },
      { key: 'totalOutstanding', label: 'باقی‌مانده' },
      { key: 'overdueOrders', label: 'بل‌های سررسیدشده' },
      { key: 'partialOrders', label: 'بل‌های نیمه‌پرداخت' },
      { key: 'reliefCount', label: 'تعداد تسهیلات فعال' },
      { key: 'fixedReliefAmount', label: 'مبلغ تسهیلات ثابت' },
      { key: 'fullReliefCount', label: 'معافیت‌های کامل' },
      { key: 'lastDueDate', label: 'آخرین سررسید' },
      { key: 'debtorStatus', label: 'وضعیت بدهکاری' }
    ],
    rows,
    summary,
    meta: { totalRows: rows.length }
  });
}

async function buildFeeDiscountExemptionOverviewReport(filters) {
  const definition = getReportDefinition('fee_discount_exemption_overview');
  const reliefDocs = await FinanceRelief.find(buildFinanceReliefFilter(filters, { dateField: 'createdAt' }))
    .populate('student', 'name email')
    .populate('studentId', 'fullName admissionNo')
    .populate('studentMembershipId', 'status isCurrent')
    .populate('classId', 'title code gradeLevel section')
    .populate('academicYearId', 'title code')
    .sort({ createdAt: -1, startDate: -1 });

  let rows = [];
  let summary = {};

  if (reliefDocs.length) {
    rows = reliefDocs.map((item) => ({
      studentName: getStudentName({ studentUser: item.student, studentCore: item.studentId, membership: item.studentMembershipId }),
      classTitle: getClassTitle(item.classId),
      academicYear: getAcademicYearTitle(item.academicYearId),
      recordType: normalizeText(item.sourceModel || 'relief'),
      benefitType: normalizeText(item.reliefType),
      scope: normalizeText(item.scope),
      coverageMode: normalizeText(item.coverageMode),
      amount: Number(item.amount || 0),
      percentage: Number(item.percentage || 0),
      sponsorName: normalizeText(item.sponsorName),
      status: normalizeText(item.status),
      reason: normalizeText(item.reason || item.note),
      createdAt: toIsoOrEmpty(item.createdAt),
      startDate: toIsoOrEmpty(item.startDate),
      endDate: toIsoOrEmpty(item.endDate)
    }));

    const reliefSummary = buildReliefSummary(reliefDocs);
    summary = {
      totalEntries: rows.length,
      activeDiscounts: reliefDocs.filter((item) => (
        normalizeText(item.status) === 'active'
        && ['discount', 'sibling_discount', 'manual'].includes(normalizeText(item.reliefType))
      )).length,
      activeExemptions: reliefDocs.filter((item) => (
        normalizeText(item.status) === 'active'
        && ['waiver', 'free_student', 'scholarship_partial', 'scholarship_full', 'charity_support'].includes(normalizeText(item.reliefType))
      )).length,
      totalDiscountAmount: Number(reliefDocs.reduce((sum, item) => (
        normalizeText(item.coverageMode) === 'fixed' ? sum + Number(item.amount || 0) : sum
      ), 0).toFixed(2)),
      fullWaivers: reliefDocs.filter((item) => normalizeText(item.coverageMode) === 'full').length,
      partialWaivers: reliefDocs.filter((item) => normalizeText(item.coverageMode) === 'percent').length,
      ...reliefSummary
    };
  } else {
    const discountFilter = {};
    const exemptionFilter = {};

    if (filters.academicYearId) {
      discountFilter.academicYearId = filters.academicYearId;
      exemptionFilter.academicYearId = filters.academicYearId;
    }
    if (filters.classId) {
      discountFilter.classId = filters.classId;
      exemptionFilter.classId = filters.classId;
    }
    if (filters.studentMembershipId) {
      discountFilter.studentMembershipId = filters.studentMembershipId;
      exemptionFilter.studentMembershipId = filters.studentMembershipId;
    }
    if (filters.studentId) {
      discountFilter.studentId = filters.studentId;
      exemptionFilter.studentId = filters.studentId;
    }
    if (filters.userId) {
      discountFilter.student = filters.userId;
      exemptionFilter.student = filters.userId;
    }
    Object.assign(discountFilter, buildDateRangeFilter('createdAt', filters));
    Object.assign(exemptionFilter, buildDateRangeFilter('createdAt', filters));

    const [discounts, exemptions] = await Promise.all([
      Discount.find(discountFilter)
        .populate('student', 'name email')
        .populate('studentId', 'fullName admissionNo')
        .populate('classId', 'title code gradeLevel section')
        .populate('academicYearId', 'title code')
        .populate('feeOrderId', 'title orderType')
        .sort({ createdAt: -1 }),
      FeeExemption.find(exemptionFilter)
        .populate('student', 'name email')
        .populate('studentId', 'fullName admissionNo')
        .populate('classId', 'title code gradeLevel section')
        .populate('academicYearId', 'title code')
        .sort({ createdAt: -1 })
    ]);

    const discountRows = discounts.map((item) => ({
      studentName: getStudentName({ studentUser: item.student, studentCore: item.studentId }),
      classTitle: getClassTitle(item.classId),
      academicYear: getAcademicYearTitle(item.academicYearId),
      recordType: 'discount',
      benefitType: normalizeText(item.discountType),
      scope: normalizeText(item.feeOrderId?.orderType || 'general'),
      coverageMode: 'fixed',
      amount: Number(item.amount || 0),
      percentage: '',
      sponsorName: '',
      status: normalizeText(item.status),
      reason: normalizeText(item.reason),
      createdAt: toIsoOrEmpty(item.createdAt),
      startDate: '',
      endDate: ''
    }));

    const exemptionRows = exemptions.map((item) => ({
      studentName: getStudentName({ studentUser: item.student, studentCore: item.studentId }),
      classTitle: getClassTitle(item.classId),
      academicYear: getAcademicYearTitle(item.academicYearId),
      recordType: 'exemption',
      benefitType: normalizeText(item.exemptionType),
      scope: normalizeText(item.scope),
      coverageMode: normalizeText(item.exemptionType) === 'full' ? 'full' : 'percent',
      amount: Number(item.amount || 0),
      percentage: Number(item.percentage || 0),
      sponsorName: '',
      status: normalizeText(item.status),
      reason: normalizeText(item.reason || item.note),
      createdAt: toIsoOrEmpty(item.createdAt),
      startDate: '',
      endDate: ''
    }));

    rows = [...discountRows, ...exemptionRows];
    const activeDiscounts = discounts.filter((item) => item.status === 'active');
    const activeExemptions = exemptions.filter((item) => item.status === 'active');
    summary = {
      totalEntries: rows.length,
      activeDiscounts: activeDiscounts.length,
      activeExemptions: activeExemptions.length,
      totalDiscountAmount: Number(activeDiscounts.reduce((sum, item) => sum + Number(item.amount || 0), 0).toFixed(2)),
      fullWaivers: activeExemptions.filter((item) => item.exemptionType === 'full').length,
      partialWaivers: activeExemptions.filter((item) => item.exemptionType === 'partial').length,
      totalReliefs: rows.length,
      activeReliefs: activeDiscounts.length + activeExemptions.length,
      totalFixedReliefAmount: Number(activeDiscounts.reduce((sum, item) => sum + Number(item.amount || 0), 0).toFixed(2)),
      percentReliefCount: activeExemptions.filter((item) => item.exemptionType === 'partial').length,
      fullReliefCount: activeExemptions.filter((item) => item.exemptionType === 'full').length,
      activeScholarships: 0,
      charitySupports: 0
    };
  }

  rows = rows.sort((left, right) => String(right.createdAt).localeCompare(String(left.createdAt)));

  return buildBaseReport(definition, filters, {
    columns: [
      { key: 'studentName', label: 'متعلم' },
      { key: 'classTitle', label: 'صنف' },
      { key: 'academicYear', label: 'سال تعلیمی' },
      { key: 'recordType', label: 'نوع ثبت' },
      { key: 'benefitType', label: 'نوع امتیاز' },
      { key: 'scope', label: 'ساحه' },
      { key: 'coverageMode', label: 'نوع پوشش' },
      { key: 'amount', label: 'مبلغ' },
      { key: 'percentage', label: 'فیصدی' },
      { key: 'sponsorName', label: 'تمویل‌کننده' },
      { key: 'status', label: 'وضعیت' },
      { key: 'reason', label: 'دلیل' },
      { key: 'createdAt', label: 'زمان ثبت' },
      { key: 'startDate', label: 'شروع' },
      { key: 'endDate', label: 'ختم' }
    ],
    rows,
    summary,
    meta: { totalRows: rows.length }
  });
}

async function buildFeeCollectionByClassReport(filters) {
  const definition = getReportDefinition('fee_collection_by_class');
  const orderFilter = { status: { $ne: 'void' } };
  const paymentFilter = {};

  if (filters.academicYearId) {
    orderFilter.academicYearId = filters.academicYearId;
    paymentFilter.academicYearId = filters.academicYearId;
  }
  if (filters.classId) {
    orderFilter.classId = filters.classId;
    paymentFilter.classId = filters.classId;
  }

  Object.assign(orderFilter, buildDateRangeFilter('issuedAt', filters));
  Object.assign(paymentFilter, buildDateRangeFilter('paidAt', filters));

  const [orders, payments, reliefs] = await Promise.all([
    FeeOrder.find(orderFilter).populate('classId', 'title code gradeLevel section').sort({ issuedAt: -1, createdAt: -1 }),
    FeePayment.find(paymentFilter).populate('classId', 'title code gradeLevel section').populate({ path: 'feeOrderId', populate: { path: 'classId', select: 'title code gradeLevel section' } }).sort({ paidAt: -1, createdAt: -1 }),
    FinanceRelief.find(buildFinanceReliefFilter(filters, { activeOnly: true }))
      .populate('classId', 'title code gradeLevel section')
      .sort({ createdAt: -1, startDate: -1 })
  ]);

  const grouped = new Map();
  const ensureGroup = (classDoc) => {
    const classId = getReferenceId(classDoc) || 'unassigned';
    const existing = grouped.get(classId) || {
      classTitle: getClassTitle(classDoc) || 'بدون صنف',
      orderCount: 0,
      paymentCount: 0,
      approvedPaymentCount: 0,
      pendingPaymentCount: 0,
      totalDue: 0,
      totalOutstanding: 0,
      approvedAmount: 0,
      pendingAmount: 0,
      collectionRate: 0,
      reliefCount: 0,
      fixedReliefAmount: 0,
      fullReliefCount: 0,
      percentReliefCount: 0
    };
    grouped.set(classId, existing);
    return existing;
  };

  for (const item of orders) {
    const current = ensureGroup(item.classId);
    current.orderCount += 1;
    current.totalDue += Number(item.amountDue || 0);
    current.totalOutstanding += Number(item.outstandingAmount || 0);
  }

  for (const item of payments) {
    const current = ensureGroup(item.classId || item.feeOrderId?.classId);
    current.paymentCount += 1;
    if (item.status === 'approved') {
      current.approvedPaymentCount += 1;
      current.approvedAmount += Number(item.amount || 0);
    } else if (item.status === 'pending') {
      current.pendingPaymentCount += 1;
      current.pendingAmount += Number(item.amount || 0);
    }
  }

  for (const item of reliefs) {
    const current = ensureGroup(item.classId);
    current.reliefCount += 1;
    if (normalizeText(item.coverageMode) === 'fixed') current.fixedReliefAmount += Number(item.amount || 0);
    else if (normalizeText(item.coverageMode) === 'full') current.fullReliefCount += 1;
    else if (normalizeText(item.coverageMode) === 'percent') current.percentReliefCount += 1;
  }

  const rows = Array.from(grouped.values())
    .map((item) => ({
      ...item,
      totalDue: Number(item.totalDue.toFixed(2)),
      totalOutstanding: Number(item.totalOutstanding.toFixed(2)),
      approvedAmount: Number(item.approvedAmount.toFixed(2)),
      pendingAmount: Number(item.pendingAmount.toFixed(2)),
      fixedReliefAmount: Number(item.fixedReliefAmount.toFixed(2)),
      collectionRate: item.totalDue > 0 ? Number(((item.approvedAmount / item.totalDue) * 100).toFixed(2)) : 0
    }))
    .sort((left, right) => right.approvedAmount - left.approvedAmount);

  const summary = {
    totalClasses: rows.length,
    totalDue: Number(rows.reduce((sum, item) => sum + Number(item.totalDue || 0), 0).toFixed(2)),
    totalOutstanding: Number(rows.reduce((sum, item) => sum + Number(item.totalOutstanding || 0), 0).toFixed(2)),
    approvedCollection: Number(rows.reduce((sum, item) => sum + Number(item.approvedAmount || 0), 0).toFixed(2)),
    pendingCollection: Number(rows.reduce((sum, item) => sum + Number(item.pendingAmount || 0), 0).toFixed(2)),
    totalPayments: rows.reduce((sum, item) => sum + Number(item.paymentCount || 0), 0),
    totalReliefs: rows.reduce((sum, item) => sum + Number(item.reliefCount || 0), 0),
    totalFixedReliefAmount: Number(rows.reduce((sum, item) => sum + Number(item.fixedReliefAmount || 0), 0).toFixed(2)),
    fullReliefCount: rows.reduce((sum, item) => sum + Number(item.fullReliefCount || 0), 0),
    percentReliefCount: rows.reduce((sum, item) => sum + Number(item.percentReliefCount || 0), 0)
  };

  return buildBaseReport(definition, filters, {
    columns: [
      { key: 'classTitle', label: 'صنف' },
      { key: 'orderCount', label: 'تعداد بل‌ها' },
      { key: 'paymentCount', label: 'تعداد پرداخت‌ها' },
      { key: 'approvedPaymentCount', label: 'پرداخت‌های تاییدشده' },
      { key: 'pendingPaymentCount', label: 'پرداخت‌های در انتظار' },
      { key: 'totalDue', label: 'مبلغ کل' },
      { key: 'approvedAmount', label: 'وصول تاییدشده' },
      { key: 'pendingAmount', label: 'وصول در انتظار' },
      { key: 'totalOutstanding', label: 'باقی‌مانده' },
      { key: 'reliefCount', label: 'تعداد تسهیلات' },
      { key: 'fixedReliefAmount', label: 'مبلغ تسهیلات ثابت' },
      { key: 'fullReliefCount', label: 'معافیت‌های کامل' },
      { key: 'collectionRate', label: 'فیصدی وصول' }
    ],
    rows,
    summary,
    meta: { totalRows: rows.length }
  });
}

async function buildExamOutcomesReport(filters) {
  const definition = getReportDefinition('exam_outcomes');
  const resultFilter = {};
  if (filters.academicYearId) resultFilter.academicYearId = filters.academicYearId;
  if (filters.termId) resultFilter.assessmentPeriodId = filters.termId;
  if (filters.examId) resultFilter.sessionId = filters.examId;
  if (filters.classId) resultFilter.classId = filters.classId;
  if (filters.studentMembershipId) resultFilter.studentMembershipId = filters.studentMembershipId;
  if (filters.studentId) resultFilter.studentId = filters.studentId;
  if (filters.userId) resultFilter.student = filters.userId;
  Object.assign(resultFilter, buildDateRangeFilter('computedAt', filters));

  if (filters.teacherId) {
    const assignmentIds = await TeacherAssignment.find({ teacherUserId: filters.teacherId }).distinct('_id');
    if (!assignmentIds.length) {
      return buildBaseReport(definition, filters, { columns: [], rows: [], summary: { totalResults: 0, matchedTeacherAssignments: 0 }, meta: { totalRows: 0 } });
    }
    const sessionIds = await ExamSession.find({ teacherAssignmentId: { $in: assignmentIds } }).distinct('_id');
    const matchedSessionIds = filters.examId
      ? sessionIds.filter((item) => String(item) === String(filters.examId))
      : sessionIds;
    if (!matchedSessionIds.length) {
      return buildBaseReport(definition, filters, { columns: [], rows: [], summary: { totalResults: 0, matchedTeacherAssignments: assignmentIds.length }, meta: { totalRows: 0 } });
    }
    resultFilter.sessionId = filters.examId ? filters.examId : { $in: matchedSessionIds };
  }

  const results = await ExamResult.find(resultFilter)
    .populate({
      path: 'sessionId',
      select: 'title code heldAt teacherAssignmentId',
      populate: {
        path: 'teacherAssignmentId',
        populate: { path: 'teacherUserId', select: 'name email' }
      }
    })
    .populate('examTypeId', 'title code')
    .populate('academicYearId', 'title code')
    .populate('assessmentPeriodId', 'title code')
    .populate('classId', 'title code gradeLevel section')
    .populate('subjectId', 'name code')
    .populate('studentMembershipId')
    .populate('student', 'name email grade')
    .populate('studentId', 'fullName admissionNo')
    .sort({ rank: 1, percentage: -1, computedAt: -1 });

  const summary = {
    totalResults: results.length,
    passed: results.filter((item) => item.resultStatus === 'passed').length,
    failed: results.filter((item) => item.resultStatus === 'failed').length,
    conditional: results.filter((item) => item.resultStatus === 'conditional').length,
    distinction: results.filter((item) => item.resultStatus === 'distinction').length,
    temporary: results.filter((item) => item.resultStatus === 'temporary').length,
    placement: results.filter((item) => item.resultStatus === 'placement').length,
    excused: results.filter((item) => item.resultStatus === 'excused').length,
    absent: results.filter((item) => item.resultStatus === 'absent').length,
    averagePercentage: results.length ? Number((results.reduce((sum, item) => sum + Number(item.percentage || 0), 0) / results.length).toFixed(2)) : 0
  };

  const rows = results.map((item, index) => ({
    serialNo: index + 1,
    studentName: getStudentName({ studentUser: item.student, studentCore: item.studentId, membership: item.studentMembershipId }),
    admissionNo: normalizeText(item.studentId?.admissionNo),
    classTitle: getClassTitle(item.classId),
    sessionTitle: normalizeText(item.sessionId?.title),
    examType: normalizeText(item.examTypeId?.title),
    term: normalizeText(item.assessmentPeriodId?.title),
    subject: normalizeText(item.subjectId?.name),
    teacherName: normalizeText(item.sessionId?.teacherAssignmentId?.teacherUserId?.name),
    heldAt: toIsoOrEmpty(item.sessionId?.heldAt),
    resultStatus: normalizeText(item.resultStatus),
    markStatus: normalizeText(item.markStatus),
    obtainedMark: Number(item.obtainedMark || 0),
    totalMark: Number(item.totalMark || 0),
    percentage: Number(item.percentage || 0),
    rank: item.rank == null ? '' : Number(item.rank),
    note: normalizeText(item.note)
  }));

  return buildBaseReport(definition, filters, {
    columns: [
      { key: 'serialNo', label: 'شماره' },
      { key: 'studentName', label: 'متعلم' },
      { key: 'admissionNo', label: 'نمبر اساس' },
      { key: 'classTitle', label: 'صنف' },
      { key: 'sessionTitle', label: 'جلسه امتحان' },
      { key: 'examType', label: 'نوع امتحان' },
      { key: 'term', label: 'ترم' },
      { key: 'subject', label: 'مضمون' },
      { key: 'teacherName', label: 'استاد' },
      { key: 'heldAt', label: 'تاریخ' },
      { key: 'resultStatus', label: 'نتیجه' },
      { key: 'markStatus', label: 'وضعیت نمره' },
      { key: 'obtainedMark', label: 'نمره' },
      { key: 'totalMark', label: 'نمره کل' },
      { key: 'percentage', label: 'فیصدی' },
      { key: 'rank', label: 'رتبه' },
      { key: 'note', label: 'ملاحظه' }
    ],
    rows,
    summary,
    meta: { totalRows: rows.length }
  });
}

async function buildAttendanceOverviewReport(filters) {
  const definition = getReportDefinition('attendance_overview');
  const attendanceFilter = {};
  if (filters.academicYearId) attendanceFilter.academicYearId = filters.academicYearId;
  if (filters.classId) attendanceFilter.classId = filters.classId;
  if (filters.studentMembershipId) attendanceFilter.studentMembershipId = filters.studentMembershipId;
  if (filters.studentId) attendanceFilter.studentId = filters.studentId;
  if (filters.userId) attendanceFilter.student = filters.userId;
  Object.assign(attendanceFilter, buildDateRangeFilter('date', filters));

  const items = await Attendance.find(attendanceFilter)
    .populate('student', 'name email grade')
    .populate('studentId', 'fullName admissionNo')
    .populate('classId', 'title code gradeLevel section')
    .populate('academicYearId', 'title code')
    .sort({ date: -1, createdAt: -1 });

  const total = items.length;
  const present = items.filter((item) => normalizeAttendanceReportStatus(item.status) === 'present').length;
  const absent = items.filter((item) => normalizeAttendanceReportStatus(item.status) === 'absent').length;
  const sick = items.filter((item) => normalizeAttendanceReportStatus(item.status) === 'sick').length;
  const leave = items.filter((item) => normalizeAttendanceReportStatus(item.status) === 'leave').length;
  const summary = {
    totalRecords: total,
    present,
    absent,
    sick,
    leave,
    attendanceRate: total ? Number(((present / total) * 100).toFixed(2)) : 0
  };

  const rows = items.map((item) => ({
    date: item.date ? new Date(item.date).toISOString() : '',
    studentName: getStudentName({ studentUser: item.student, studentCore: item.studentId }),
    classTitle: getClassTitle(item.classId),
    academicYear: normalizeText(item.academicYearId?.title),
    status: getAttendanceStatusLabel(item.status),
    statusCode: normalizeAttendanceReportStatus(item.status),
    note: normalizeText(item.note)
  }));

  return buildBaseReport(definition, filters, {
    columns: [
      { key: 'date', label: 'تاریخ' },
      { key: 'studentName', label: 'متعلم' },
      { key: 'classTitle', label: 'صنف' },
      { key: 'academicYear', label: 'سال' },
      { key: 'status', label: 'وضعیت' },
      { key: 'note', label: 'ملاحظه' }
    ],
    rows,
    summary,
    meta: { totalRows: rows.length }
  });
}

async function buildAttendanceSummaryOverviewReport(filters) {
  const definition = getReportDefinition('attendance_summary_overview');
  const attendanceFilter = {};
  if (filters.academicYearId) attendanceFilter.academicYearId = filters.academicYearId;
  if (filters.classId) attendanceFilter.classId = filters.classId;
  if (filters.studentMembershipId) attendanceFilter.studentMembershipId = filters.studentMembershipId;
  if (filters.studentId) attendanceFilter.studentId = filters.studentId;
  if (filters.userId) attendanceFilter.student = filters.userId;
  Object.assign(attendanceFilter, buildDateRangeFilter('date', filters));

  const items = await Attendance.find(attendanceFilter)
    .populate('student', 'name email grade')
    .populate('studentId', 'fullName admissionNo')
    .populate('studentMembershipId')
    .populate('classId', 'title code gradeLevel section')
    .populate('academicYearId', 'title code')
    .sort({ date: 1, createdAt: 1 });

  const grouped = new Map();
  const membershipLookup = new Map();

  const membershipFilter = { isCurrent: true };
  if (filters.academicYearId) membershipFilter.academicYearId = filters.academicYearId;
  if (filters.classId) membershipFilter.classId = filters.classId;
  if (filters.studentMembershipId) membershipFilter._id = filters.studentMembershipId;
  if (filters.studentId) membershipFilter.studentId = filters.studentId;
  if (filters.userId) membershipFilter.student = filters.userId;

  const memberships = await StudentMembership.find(membershipFilter)
    .populate('student', 'name email grade')
    .populate('studentId', 'fullName admissionNo')
    .populate('classId', 'title code gradeLevel section')
    .populate('academicYearId', 'title code')
    .sort({ classId: 1, createdAt: 1 });

  memberships.forEach((membership) => {
    const membershipId = getReferenceId(membership);
    if (!membershipId) return;

    const studentId = getReferenceId(membership.studentId);
    const userId = getReferenceId(membership.student);
    const classId = getReferenceId(membership.classId);
    const lookupKeys = [
      membershipId,
      studentId && classId ? `${studentId}:${classId}` : '',
      userId && classId ? `${userId}:${classId}` : '',
      studentId,
      userId
    ].filter(Boolean);

    lookupKeys.forEach((key) => membershipLookup.set(key, membershipId));

    grouped.set(membershipId, {
      serialNo: 0,
      studentName: getStudentName({ studentUser: membership.student, studentCore: membership.studentId, membership }),
      admissionNo: normalizeText(membership.studentId?.admissionNo),
      classTitle: getClassTitle(membership.classId),
      academicYear: normalizeText(membership.academicYearId?.title),
      presentDays: 0,
      absentDays: 0,
      sickDays: 0,
      leaveDays: 0,
      lateDays: 0,
      excusedDays: 0,
      totalDays: 0,
      attendanceRate: 0,
      notesCount: 0,
      lastStatus: '',
      lastSeenAt: ''
    });
  });

  items.forEach((item) => {
    const directMembershipId = getReferenceId(item.studentMembershipId);
    const studentId = getReferenceId(item.studentId) || getReferenceId(item.student);
    const classId = getReferenceId(item.classId);
    const studentClassKey = studentId && classId ? `${studentId}:${classId}` : '';
    const bucketKey = membershipLookup.get(directMembershipId)
      || membershipLookup.get(studentClassKey)
      || membershipLookup.get(studentId)
      || directMembershipId
      || studentId
      || `${classId}:${getStudentName({ studentUser: item.student, studentCore: item.studentId })}`;
    const current = grouped.get(bucketKey) || {
      serialNo: 0,
      studentName: getStudentName({ studentUser: item.student, studentCore: item.studentId, membership: item.studentMembershipId }),
      admissionNo: normalizeText(item.studentId?.admissionNo),
      classTitle: getClassTitle(item.classId),
      academicYear: normalizeText(item.academicYearId?.title),
      presentDays: 0,
      absentDays: 0,
      sickDays: 0,
      leaveDays: 0,
      lateDays: 0,
      excusedDays: 0,
      totalDays: 0,
      attendanceRate: 0,
      notesCount: 0,
      lastStatus: '',
      lastSeenAt: ''
    };

    const status = normalizeAttendanceReportStatus(item.status);
    if (status === 'present') current.presentDays += 1;
    if (status === 'absent') current.absentDays += 1;
    if (status === 'sick') current.sickDays += 1;
    if (status === 'leave') current.leaveDays += 1;
    current.lateDays = current.sickDays;
    current.excusedDays = current.leaveDays;
    current.totalDays += 1;
    if (normalizeText(item.note)) current.notesCount += 1;
    current.lastStatus = getAttendanceStatusLabel(item.status);
    current.lastSeenAt = item.date ? new Date(item.date).toISOString() : current.lastSeenAt;
    grouped.set(bucketKey, current);
  });

  const rows = Array.from(grouped.values())
    .sort((left, right) => String(left.studentName || '').localeCompare(String(right.studentName || '')))
    .map((item, index) => ({
      ...item,
      serialNo: index + 1,
      attendanceRate: item.totalDays ? Number(((item.presentDays / item.totalDays) * 100).toFixed(2)) : 0
    }));

  const summary = {
    totalStudents: rows.length,
    totalRecords: items.length,
    totalPresentDays: rows.reduce((sum, item) => sum + Number(item.presentDays || 0), 0),
    totalAbsentDays: rows.reduce((sum, item) => sum + Number(item.absentDays || 0), 0),
    totalSickDays: rows.reduce((sum, item) => sum + Number(item.sickDays || 0), 0),
    totalLeaveDays: rows.reduce((sum, item) => sum + Number(item.leaveDays || 0), 0),
    totalLateDays: rows.reduce((sum, item) => sum + Number(item.lateDays || 0), 0),
    totalExcusedDays: rows.reduce((sum, item) => sum + Number(item.excusedDays || 0), 0),
    averageAttendanceRate: rows.length
      ? Number((rows.reduce((sum, item) => sum + Number(item.attendanceRate || 0), 0) / rows.length).toFixed(2))
      : 0
  };

  return buildBaseReport(definition, filters, {
    columns: [
      { key: 'serialNo', label: 'شماره' },
      { key: 'studentName', label: 'متعلم' },
      { key: 'admissionNo', label: 'نمبر اساس' },
      { key: 'classTitle', label: 'صنف' },
      { key: 'academicYear', label: 'سال' },
      { key: 'presentDays', label: 'حاضر' },
      { key: 'absentDays', label: 'غایب' },
      { key: 'sickDays', label: 'مریض' },
      { key: 'leaveDays', label: 'رخصتی' },
      { key: 'totalDays', label: 'مجموع روزها' },
      { key: 'attendanceRate', label: 'فیصدی حضور' },
      { key: 'notesCount', label: 'ملاحظات' },
      { key: 'lastSeenAt', label: 'آخرین ثبت' }
    ],
    rows,
    summary,
    meta: { totalRows: rows.length }
  });
}

async function buildClassOverviewReport(filters) {
  const definition = getReportDefinition('class_overview');
  const membershipFilter = {};
  if (filters.academicYearId) membershipFilter.academicYearId = filters.academicYearId;
  if (filters.classId) membershipFilter.classId = filters.classId;
  if (filters.studentMembershipId) membershipFilter._id = filters.studentMembershipId;
  if (filters.studentId) membershipFilter.studentId = filters.studentId;
  if (filters.userId) membershipFilter.student = filters.userId;
  Object.assign(membershipFilter, buildDateRangeFilter('enrolledAt', filters));

  if (filters.teacherId) {
    const classIds = await TeacherAssignment.find({ teacherUserId: filters.teacherId, status: 'active' }).distinct('classId');
    if (!classIds.length) {
      return buildBaseReport(definition, filters, { columns: [], rows: [], summary: { totalMemberships: 0, active: 0, pending: 0, ended: 0 }, meta: { totalRows: 0 } });
    }
    membershipFilter.classId = membershipFilter.classId ? membershipFilter.classId : { $in: classIds };
  }

  const items = await StudentMembership.find(membershipFilter)
    .populate('student', 'name email grade')
    .populate('studentId', 'fullName admissionNo')
    .populate('classId', 'title code gradeLevel section')
    .populate('academicYearId', 'title code')
    .sort({ createdAt: -1 });

  const summary = {
    totalMemberships: items.length,
    active: items.filter((item) => item.status === 'active').length,
    pending: items.filter((item) => item.status === 'pending').length,
    suspended: items.filter((item) => item.status === 'suspended').length,
    ended: items.filter((item) => !item.isCurrent).length,
    current: items.filter((item) => item.isCurrent).length
  };

  const rows = items.map((item) => ({
    studentName: getStudentName({ studentUser: item.student, studentCore: item.studentId }),
    classTitle: getClassTitle(item.classId),
    academicYear: normalizeText(item.academicYearId?.title),
    status: normalizeText(item.status),
    source: normalizeText(item.source),
    isCurrent: item.isCurrent ? 'yes' : 'no',
    enrolledAt: item.enrolledAt ? new Date(item.enrolledAt).toISOString() : '',
    endedAt: item.endedAt ? new Date(item.endedAt).toISOString() : '',
    endedReason: normalizeText(item.endedReason)
  }));

  return buildBaseReport(definition, filters, {
    columns: [
      { key: 'studentName', label: 'متعلم' },
      { key: 'classTitle', label: 'صنف' },
      { key: 'academicYear', label: 'سال' },
      { key: 'status', label: 'وضعیت' },
      { key: 'source', label: 'منبع' },
      { key: 'isCurrent', label: 'جاری' },
      { key: 'enrolledAt', label: 'شمول' },
      { key: 'endedAt', label: 'ختم' },
      { key: 'endedReason', label: 'دلیل ختم' }
    ],
    rows,
    summary,
    meta: { totalRows: rows.length }
  });
}

async function buildSubjectsOverviewReport(filters) {
  const definition = getReportDefinition('subjects_overview');
  const assignmentFilter = {};
  if (filters.academicYearId) assignmentFilter.academicYearId = filters.academicYearId;
  if (filters.termId) assignmentFilter.termId = filters.termId;
  if (filters.classId) assignmentFilter.classId = filters.classId;
  if (filters.teacherId) assignmentFilter.teacherUserId = filters.teacherId;
  Object.assign(assignmentFilter, buildDateRangeFilter('effectiveDate', filters));

  const items = await TeacherAssignment.find(assignmentFilter)
    .populate('teacherUserId', 'name email')
    .populate('academicYearId', 'title code')
    .populate('termId', 'title code')
    .populate('classId', 'title code gradeLevel section')
    .populate('subjectId', 'name code weeklyHours')
    .sort({ classId: 1, subjectId: 1, createdAt: -1 });

  const subjectIds = new Set();
  const teacherIds = new Set();

  const rows = items.map((item, index) => {
    if (item.subjectId?._id) subjectIds.add(String(item.subjectId._id));
    if (item.teacherUserId?._id) teacherIds.add(String(item.teacherUserId._id));

    return {
      serialNo: index + 1,
      subjectName: normalizeText(item.subjectId?.name),
      subjectCode: normalizeText(item.subjectId?.code),
      teacherName: normalizeText(item.teacherUserId?.name),
      classTitle: getClassTitle(item.classId),
      academicYear: normalizeText(item.academicYearId?.title),
      term: normalizeText(item.termId?.title),
      weeklyPeriods: Number(item.weeklyPeriods || item.subjectId?.weeklyHours || 0),
      assignmentType: normalizeText(item.assignmentType),
      status: normalizeText(item.status),
      isMainTeacher: item.isMainTeacher ? 'yes' : 'no',
      effectiveDate: toIsoOrEmpty(item.effectiveDate),
      note: normalizeText(item.note)
    };
  });

  const summary = {
    totalAssignments: items.length,
    uniqueSubjects: subjectIds.size,
    uniqueTeachers: teacherIds.size,
    activeAssignments: items.filter((item) => item.status === 'active').length,
    totalWeeklyPeriods: items.reduce((sum, item) => sum + Number(item.weeklyPeriods || item.subjectId?.weeklyHours || 0), 0)
  };

  return buildBaseReport(definition, filters, {
    columns: [
      { key: 'serialNo', label: 'شماره' },
      { key: 'subjectName', label: 'مضمون' },
      { key: 'subjectCode', label: 'کد مضمون' },
      { key: 'teacherName', label: 'استاد' },
      { key: 'classTitle', label: 'صنف' },
      { key: 'academicYear', label: 'سال' },
      { key: 'term', label: 'ترم' },
      { key: 'weeklyPeriods', label: 'ساعات درسی' },
      { key: 'assignmentType', label: 'نوع تعیین' },
      { key: 'status', label: 'وضعیت' },
      { key: 'isMainTeacher', label: 'استاد اصلی' },
      { key: 'effectiveDate', label: 'تاریخ اجرا' },
      { key: 'note', label: 'ملاحظه' }
    ],
    rows,
    summary,
    meta: { totalRows: rows.length }
  });
}

async function buildTimetableOverviewReport(filters) {
  const definition = getReportDefinition('timetable_overview');
  const timetableFilter = {};
  const annualPlanFilter = {};
  const weeklyPlanFilter = {};
  const configFilter = {};
  if (filters.academicYearId) {
    timetableFilter.academicYearId = filters.academicYearId;
    annualPlanFilter.academicYearId = filters.academicYearId;
    weeklyPlanFilter.academicYearId = filters.academicYearId;
    configFilter.academicYearId = filters.academicYearId;
  }
  if (filters.termId) {
    timetableFilter.termId = filters.termId;
    annualPlanFilter.termId = filters.termId;
    weeklyPlanFilter.termId = filters.termId;
    configFilter.termId = filters.termId;
  }
  if (filters.classId) {
    timetableFilter.classId = filters.classId;
    annualPlanFilter.classId = filters.classId;
    weeklyPlanFilter.classId = filters.classId;
    configFilter.classId = filters.classId;
  }
  Object.assign(timetableFilter, buildStringDateRangeFilter('occurrenceDate', filters));
  Object.assign(weeklyPlanFilter, buildStringDateRangeFilter('weekStartDate', filters));

  if (filters.teacherId) {
    const assignmentIds = await TeacherAssignment.find({ teacherUserId: filters.teacherId, status: 'active' }).distinct('_id');
    if (!assignmentIds.length) {
      return buildBaseReport(definition, filters, { columns: [], rows: [], summary: { timetableEntries: 0, configs: 0, annualPlans: 0, weeklyPlans: 0 }, meta: { totalRows: 0 } });
    }
    timetableFilter.teacherAssignmentId = { $in: assignmentIds };
    annualPlanFilter.teacherAssignmentId = { $in: assignmentIds };
    weeklyPlanFilter.teacherAssignmentId = { $in: assignmentIds };
  }

  const [entries, configs, annualPlans, weeklyPlans] = await Promise.all([
    Timetable.find(timetableFilter).populate('classId', 'title code gradeLevel section').populate('subjectId', 'name code').populate({ path: 'teacherAssignmentId', populate: [{ path: 'teacherUserId', select: 'name email' }] }).sort({ occurrenceDate: 1, startTime: 1 }),
    TimetableConfig.find(configFilter).populate('classId', 'title code gradeLevel section').sort({ isDefault: -1, createdAt: -1 }),
    EducationPlanAnnual.find(annualPlanFilter).populate('classId', 'title code gradeLevel section').populate('subjectId', 'name code').sort({ createdAt: -1 }),
    EducationPlanWeekly.find(weeklyPlanFilter).populate('classId', 'title code gradeLevel section').populate('subjectId', 'name code').sort({ weekStartDate: -1, lessonNumber: 1 })
  ]);

  const summary = {
    timetableEntries: entries.length,
    publishedEntries: entries.filter((item) => item.status === 'published').length,
    draftEntries: entries.filter((item) => item.status === 'draft').length,
    configs: configs.length,
    annualPlans: annualPlans.length,
    weeklyPlans: weeklyPlans.length
  };

  const rows = entries.map((item) => ({
    occurrenceDate: normalizeText(item.occurrenceDate),
    dayOfWeek: normalizeText(item.dayOfWeek),
    classTitle: getClassTitle(item.classId),
    subject: normalizeText(item.subjectId?.name),
    teacherName: normalizeText(item.teacherAssignmentId?.teacherUserId?.name),
    startTime: normalizeText(item.startTime),
    endTime: normalizeText(item.endTime),
    room: normalizeText(item.room),
    status: normalizeText(item.status)
  }));

  return buildBaseReport(definition, filters, {
    columns: [
      { key: 'occurrenceDate', label: 'تاریخ' },
      { key: 'dayOfWeek', label: 'روز' },
      { key: 'classTitle', label: 'صنف' },
      { key: 'subject', label: 'مضمون' },
      { key: 'teacherName', label: 'استاد' },
      { key: 'startTime', label: 'شروع' },
      { key: 'endTime', label: 'ختم' },
      { key: 'room', label: 'اطاق' },
      { key: 'status', label: 'وضعیت' }
    ],
    rows,
    summary,
    meta: { totalRows: rows.length, configRows: configs.length, annualPlanRows: annualPlans.length, weeklyPlanRows: weeklyPlans.length }
  });
}

async function buildPromotionOverviewReport(filters) {
  const definition = getReportDefinition('promotion_overview');
  const txFilter = {};
  if (filters.academicYearId) txFilter.academicYearId = filters.academicYearId;
  if (filters.termId) txFilter.assessmentPeriodId = filters.termId;
  if (filters.classId) txFilter.classId = filters.classId;
  if (filters.studentMembershipId) txFilter.studentMembershipId = filters.studentMembershipId;
  if (filters.studentId) txFilter.studentId = filters.studentId;
  if (filters.userId) txFilter.student = filters.userId;
  Object.assign(txFilter, buildDateRangeFilter('decidedAt', filters));

  const items = await PromotionTransaction.find(txFilter)
    .populate('academicYearId', 'title code')
    .populate('targetAcademicYearId', 'title code')
    .populate('classId', 'title code gradeLevel section')
    .populate('targetClassId', 'title code gradeLevel section')
    .populate('student', 'name email grade')
    .populate('studentId', 'fullName admissionNo')
    .sort({ decidedAt: -1, createdAt: -1 });

  const summary = {
    totalTransactions: items.length,
    promoted: items.filter((item) => item.promotionOutcome === 'promoted').length,
    repeated: items.filter((item) => item.promotionOutcome === 'repeated').length,
    conditional: items.filter((item) => item.promotionOutcome === 'conditional').length,
    graduated: items.filter((item) => item.promotionOutcome === 'graduated').length,
    blocked: items.filter((item) => item.promotionOutcome === 'blocked').length,
    applied: items.filter((item) => item.transactionStatus === 'applied').length,
    preview: items.filter((item) => item.transactionStatus === 'preview').length
  };

  const rows = items.map((item) => ({
    studentName: getStudentName({ studentUser: item.student, studentCore: item.studentId }),
    classTitle: getClassTitle(item.classId),
    academicYear: normalizeText(item.academicYearId?.title),
    sourceResultStatus: normalizeText(item.sourceResultStatus),
    promotionOutcome: normalizeText(item.promotionOutcome),
    transactionStatus: normalizeText(item.transactionStatus),
    targetClassTitle: getClassTitle(item.targetClassId),
    targetAcademicYear: normalizeText(item.targetAcademicYearId?.title),
    decidedAt: item.decidedAt ? new Date(item.decidedAt).toISOString() : ''
  }));

  return buildBaseReport(definition, filters, {
    columns: [
      { key: 'studentName', label: 'متعلم' },
      { key: 'classTitle', label: 'صنف مبدا' },
      { key: 'academicYear', label: 'سال مبدا' },
      { key: 'sourceResultStatus', label: 'نتیجه مبنا' },
      { key: 'promotionOutcome', label: 'نتیجه ارتقا' },
      { key: 'transactionStatus', label: 'وضعیت تراکنش' },
      { key: 'targetClassTitle', label: 'صنف مقصد' },
      { key: 'targetAcademicYear', label: 'سال مقصد' },
      { key: 'decidedAt', label: 'زمان تصمیم' }
    ],
    rows,
    summary,
    meta: { totalRows: rows.length }
  });
}

async function buildGovernmentFinanceQuarterlyReport(filters) {
  const definition = getReportDefinition('government_finance_quarterly');
  const payload = await buildQuarterlyGovernmentFinanceReport(filters);
  const rows = (payload.rows || []).map((item) => ({
    classTitle: normalizeText(item.classTitle),
    totalIncome: Number(item.totalIncome || 0),
    totalExpense: Number(item.totalExpense || 0),
    balance: Number(item.balance || 0),
    paymentCount: Number(item.paymentCount || 0),
    expenseCount: Number(item.expenseCount || 0)
  }));

  return buildBaseReport(definition, filters, {
    columns: [
      { key: 'classTitle', label: 'صنف' },
      { key: 'totalIncome', label: 'عواید' },
      { key: 'totalExpense', label: 'مصارف' },
      { key: 'balance', label: 'بیلانس' },
      { key: 'paymentCount', label: 'تعداد پرداخت‌ها' },
      { key: 'expenseCount', label: 'تعداد مصارف' }
    ],
    rows,
    summary: payload.summary || {},
    meta: {
      totalRows: rows.length,
      ...(payload.meta || {}),
      rangeStart: payload.range?.startDate ? new Date(payload.range.startDate).toISOString() : '',
      rangeEnd: payload.range?.endDate ? new Date(payload.range.endDate).toISOString() : ''
    }
  });
}

async function buildGovernmentFinanceAnnualReport(filters) {
  const definition = getReportDefinition('government_finance_annual');
  const payload = await buildAnnualGovernmentFinanceReport(filters);
  const rows = (payload.rows || []).map((item) => ({
    quarterLabel: normalizeText(item.quarterLabel || `ربع ${item.quarter || ''}`),
    totalIncome: Number(item.totalIncome || 0),
    totalExpense: Number(item.totalExpense || 0),
    balance: Number(item.balance || 0),
    classCount: Number(item.classCount || 0)
  }));

  return buildBaseReport(definition, filters, {
    columns: [
      { key: 'quarterLabel', label: 'ربع' },
      { key: 'totalIncome', label: 'عواید' },
      { key: 'totalExpense', label: 'مصارف' },
      { key: 'balance', label: 'بیلانس' },
      { key: 'classCount', label: 'تعداد صنف‌ها' }
    ],
    rows,
    summary: payload.summary || {},
    meta: {
      totalRows: rows.length,
      ...(payload.meta || {}),
      rangeStart: payload.range?.startDate ? new Date(payload.range.startDate).toISOString() : '',
      rangeEnd: payload.range?.endDate ? new Date(payload.range.endDate).toISOString() : ''
    }
  });
}

function sanitizeCsv(value) {
  const text = value == null ? '' : String(value);
  const escaped = text.replace(/"/g, '""');
  return `"${escaped}"`;
}

function reportToCsv(report) {
  const columns = Array.isArray(report?.columns) ? report.columns : [];
  const rows = Array.isArray(report?.rows) ? report.rows : [];
  const header = columns.map((column) => sanitizeCsv(column.label || column.key || '')).join(',');
  const body = rows.map((row) => columns.map((column) => sanitizeCsv(row?.[column.key] ?? '')).join(',')).join('\n');
  return [header, body].filter(Boolean).join('\n');
}

async function runReport(reportKey, rawFilters = {}) {
  const definition = getReportDefinition(reportKey);
  if (!definition) throw new Error('report_invalid_key');
  const filters = normalizeFilters(rawFilters);

  switch (definition.key) {
    case 'finance_overview':
      return buildFinanceOverviewReport(filters);
    case 'fee_debtors_overview':
      return buildFeeDebtorsOverviewReport(filters);
    case 'fee_discount_exemption_overview':
      return buildFeeDiscountExemptionOverviewReport(filters);
    case 'fee_collection_by_class':
      return buildFeeCollectionByClassReport(filters);
    case 'exam_outcomes':
      return buildExamOutcomesReport(filters);
    case 'attendance_overview':
      return buildAttendanceOverviewReport(filters);
    case 'attendance_summary_overview':
      return buildAttendanceSummaryOverviewReport(filters);
    case 'class_overview':
      return buildClassOverviewReport(filters);
    case 'subjects_overview':
      return buildSubjectsOverviewReport(filters);
    case 'timetable_overview':
      return buildTimetableOverviewReport(filters);
    case 'promotion_overview':
      return buildPromotionOverviewReport(filters);
    case 'government_finance_quarterly':
      return buildGovernmentFinanceQuarterlyReport(filters);
    case 'government_finance_annual':
      return buildGovernmentFinanceAnnualReport(filters);
    default:
      throw new Error('report_not_implemented');
  }
}

module.exports = {
  getReportDefinition,
  listReportCatalog,
  listReportReferenceData,
  reportToCsv,
  runReport
};
