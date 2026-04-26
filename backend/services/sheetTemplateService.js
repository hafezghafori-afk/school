const SheetTemplate = require('../models/SheetTemplate');
const { runReport } = require('./reportEngineService');
const { buildSessionSheetReport } = require('./examEngineService');

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeNullableId(value) {
  const text = normalizeText(value);
  return text || null;
}

function normalizeTemplateCode(value) {
  const code = normalizeText(value).toUpperCase();
  return code || undefined;
}

function normalizeTemplateFilters(filters = {}) {
  return {
    termId: normalizeNullableId(filters.termId),
    examId: normalizeNullableId(filters.examId),
    month: normalizeText(filters.month),
    dateFrom: normalizeText(filters.dateFrom),
    dateTo: normalizeText(filters.dateTo)
  };
}

const PREPARED_TEMPLATE_LAYOUTS = {
  attendance: { fontFamily: 'B Zar', fontSize: 11, orientation: 'landscape', showHeader: true, showFooter: true, showLogo: true },
  attendance_summary: { fontFamily: 'B Zar', fontSize: 11, orientation: 'landscape', showHeader: true, showFooter: true, showLogo: true },
  subjects: { fontFamily: 'B Mitra', fontSize: 11, orientation: 'portrait', showHeader: true, showFooter: true, showLogo: true },
  exam: { fontFamily: 'B Zar', fontSize: 11, orientation: 'portrait', showHeader: true, showFooter: true, showLogo: true },
  finance: { fontFamily: 'B Zar', fontSize: 11, orientation: 'landscape', showHeader: true, showFooter: true, showLogo: true }
};

function toPlain(doc) {
  if (!doc) return null;
  if (typeof doc.toObject === 'function') return doc.toObject({ virtuals: false });
  return { ...doc };
}

function formatTemplate(doc) {
  const item = toPlain(doc);
  if (!item) return null;

  return {
    id: String(item._id),
    title: normalizeText(item.title),
    code: normalizeText(item.code),
    type: normalizeText(item.type),
    version: Number(item.version || 1),
    scope: item.scope || {},
    layout: item.layout || {},
    columns: Array.isArray(item.columns) ? item.columns : [],
    filters: item.filters || {},
    options: item.options || {},
    ownership: item.ownership || {},
    isActive: Boolean(item.isActive),
    note: normalizeText(item.note),
    createdAt: item.createdAt || null,
    updatedAt: item.updatedAt || null
  };
}

function buildAttendanceDefaultColumns() {
  return [
    { key: 'date', label: 'تاریخ', width: 16, visible: true, order: 0 },
    { key: 'studentName', label: 'متعلم', width: 24, visible: true, order: 1 },
    { key: 'classTitle', label: 'صنف', width: 18, visible: true, order: 2 },
    { key: 'academicYear', label: 'سال', width: 18, visible: true, order: 3 },
    { key: 'status', label: 'وضعیت', width: 14, visible: true, order: 4 },
    { key: 'note', label: 'ملاحظه', width: 24, visible: true, order: 5 }
  ];
}

function buildAttendanceSummaryDefaultColumns() {
  return [
    { key: 'serialNo', label: 'شماره', width: 10, visible: true, order: 0 },
    { key: 'studentName', label: 'متعلم', width: 24, visible: true, order: 1 },
    { key: 'admissionNo', label: 'نمبر اساس', width: 16, visible: true, order: 2 },
    { key: 'classTitle', label: 'صنف', width: 18, visible: true, order: 3 },
    { key: 'presentDays', label: 'حاضر', width: 12, visible: true, order: 4 },
    { key: 'absentDays', label: 'غایب', width: 12, visible: true, order: 5 },
    { key: 'sickDays', label: 'مریض', width: 12, visible: true, order: 6 },
    { key: 'leaveDays', label: 'رخصتی', width: 12, visible: true, order: 7 },
    { key: 'totalDays', label: 'مجموع روزها', width: 14, visible: true, order: 8 },
    { key: 'attendanceRate', label: 'فیصدی حضور', width: 14, visible: true, order: 9 }
  ];
}

function buildSubjectsDefaultColumns() {
  return [
    { key: 'serialNo', label: 'شماره', width: 10, visible: true, order: 0 },
    { key: 'subjectName', label: 'مضمون', width: 24, visible: true, order: 1 },
    { key: 'teacherName', label: 'استاد', width: 22, visible: true, order: 2 },
    { key: 'classTitle', label: 'صنف', width: 16, visible: true, order: 3 },
    { key: 'term', label: 'ترم', width: 14, visible: true, order: 4 },
    { key: 'weeklyPeriods', label: 'ساعات درسی', width: 14, visible: true, order: 5 },
    { key: 'assignmentType', label: 'نوع تعیین', width: 14, visible: true, order: 6 },
    { key: 'status', label: 'وضعیت', width: 12, visible: true, order: 7 },
    { key: 'note', label: 'ملاحظه', width: 18, visible: true, order: 8 }
  ];
}

function buildExamDefaultColumns() {
  return [
    { key: 'number', label: 'شماره', width: 7, visible: true, order: 0 },
    { key: 'studentName', label: 'نام', width: 15, visible: true, order: 1, group: 'شهرت متعلمین' },
    { key: 'fatherName', label: 'نام پدر', width: 15, visible: true, order: 2, group: 'شهرت متعلمین' },
    { key: 'writtenScore', label: 'تحریری', width: 9, visible: true, order: 3 },
    { key: 'oralScore', label: 'تقریری', width: 9, visible: true, order: 4 },
    { key: 'classActivityScore', label: 'فعالیت صنفی', width: 10, visible: true, order: 5 },
    { key: 'homeworkScore', label: 'کارخانگی', width: 10, visible: true, order: 6 },
    { key: 'obtainedMark', label: 'به عدد', width: 10, visible: true, order: 7, group: 'مجموعه نمره' },
    { key: 'totalInWords', label: 'به حروف', width: 14, visible: true, order: 8, group: 'مجموعه نمره' },
    { key: 'note', label: 'ملاحظات', width: 12, visible: true, order: 9 }
  ];
}

function buildFinanceDefaultColumns() {
  return [
    { key: 'orderNumber', label: 'شماره سفارش', width: 20, visible: true, order: 0 },
    { key: 'studentName', label: 'متعلم', width: 24, visible: true, order: 1 },
    { key: 'classTitle', label: 'صنف', width: 18, visible: true, order: 2 },
    { key: 'term', label: 'ترم', width: 16, visible: true, order: 3 },
    { key: 'amountDue', label: 'مبلغ قابل پرداخت', width: 16, visible: true, order: 4 },
    { key: 'amountPaid', label: 'پرداخت‌شده', width: 16, visible: true, order: 5 },
    { key: 'outstandingAmount', label: 'باقی‌مانده', width: 16, visible: true, order: 6 },
    { key: 'status', label: 'وضعیت', width: 14, visible: true, order: 7 }
  ];
}

function getDefaultColumnsForType(type = '') {
  if (type === 'attendance') {
    return [
      { key: 'date', label: 'تاریخ', width: 16, visible: true, order: 0 },
      { key: 'studentName', label: 'متعلم', width: 24, visible: true, order: 1 },
      { key: 'classTitle', label: 'صنف', width: 18, visible: true, order: 2 },
      { key: 'academicYear', label: 'سال تعلیمی', width: 18, visible: true, order: 3 },
      { key: 'status', label: 'وضعیت', width: 14, visible: true, order: 4 },
      { key: 'note', label: 'ملاحظه', width: 24, visible: true, order: 5 }
    ];
  }

  if (type === 'attendance_summary') {
    return [
      { key: 'serialNo', label: 'شماره', width: 10, visible: true, order: 0 },
      { key: 'studentName', label: 'متعلم', width: 24, visible: true, order: 1 },
      { key: 'admissionNo', label: 'نمبر اساس', width: 16, visible: true, order: 2 },
      { key: 'classTitle', label: 'صنف', width: 18, visible: true, order: 3 },
      { key: 'presentDays', label: 'حاضر', width: 12, visible: true, order: 4 },
      { key: 'absentDays', label: 'غایب', width: 12, visible: true, order: 5 },
      { key: 'sickDays', label: 'مریض', width: 12, visible: true, order: 6 },
      { key: 'leaveDays', label: 'رخصتی', width: 12, visible: true, order: 7 },
      { key: 'totalDays', label: 'مجموع روزها', width: 14, visible: true, order: 8 },
      { key: 'attendanceRate', label: 'فیصدی حضور', width: 14, visible: true, order: 9 }
    ];
  }

  if (type === 'subjects') {
    return [
      { key: 'serialNo', label: 'شماره', width: 10, visible: true, order: 0 },
      { key: 'subjectName', label: 'مضمون', width: 24, visible: true, order: 1 },
      { key: 'teacherName', label: 'استاد', width: 22, visible: true, order: 2 },
      { key: 'classTitle', label: 'صنف', width: 16, visible: true, order: 3 },
      { key: 'term', label: 'ترم', width: 14, visible: true, order: 4 },
      { key: 'weeklyPeriods', label: 'ساعات درسی', width: 14, visible: true, order: 5 },
      { key: 'assignmentType', label: 'نوع تعیین', width: 14, visible: true, order: 6 },
      { key: 'status', label: 'وضعیت', width: 12, visible: true, order: 7 },
      { key: 'note', label: 'ملاحظه', width: 18, visible: true, order: 8 }
    ];
  }

  if (type === 'exam') {
    return [
      { key: 'number', label: 'شماره', width: 7, visible: true, order: 0 },
      { key: 'studentName', label: 'نام', width: 15, visible: true, order: 1, group: 'شهرت متعلمین' },
      { key: 'fatherName', label: 'نام پدر', width: 15, visible: true, order: 2, group: 'شهرت متعلمین' },
      { key: 'writtenScore', label: 'تحریری', width: 9, visible: true, order: 3 },
      { key: 'oralScore', label: 'تقریری', width: 9, visible: true, order: 4 },
      { key: 'classActivityScore', label: 'فعالیت صنفی', width: 10, visible: true, order: 5 },
      { key: 'homeworkScore', label: 'کارخانگی', width: 10, visible: true, order: 6 },
      { key: 'obtainedMark', label: 'به عدد', width: 10, visible: true, order: 7, group: 'مجموعه نمره' },
      { key: 'totalInWords', label: 'به حروف', width: 14, visible: true, order: 8, group: 'مجموعه نمره' },
      { key: 'note', label: 'ملاحظات', width: 12, visible: true, order: 9 }
    ];
  }

  if (type === 'finance') {
    return [
      { key: 'orderNumber', label: 'شماره سفارش', width: 20, visible: true, order: 0 },
      { key: 'studentName', label: 'متعلم', width: 24, visible: true, order: 1 },
      { key: 'classTitle', label: 'صنف', width: 18, visible: true, order: 2 },
      { key: 'term', label: 'ترم', width: 16, visible: true, order: 3 },
      { key: 'amountDue', label: 'مبلغ قابل پرداخت', width: 16, visible: true, order: 4 },
      { key: 'amountPaid', label: 'پرداخت‌شده', width: 16, visible: true, order: 5 },
      { key: 'outstandingAmount', label: 'باقی‌مانده', width: 16, visible: true, order: 6 },
      { key: 'status', label: 'وضعیت', width: 14, visible: true, order: 7 }
    ];
  }

  return getDefaultColumnsForType('attendance');
}

function getPreparedSheetTemplateSeeds() {
  return [
    {
      title: 'شقه حاضری روزانه',
      code: 'ATTENDANCE-DAILY-READY',
      type: 'attendance',
      note: 'قالب آماده حاضری روزانه شاگردان'
    },
    {
      title: 'شقه خلاصه حاضری ماهوار',
      code: 'ATTENDANCE-MONTHLY-READY',
      type: 'attendance_summary',
      note: 'قالب آماده خلاصه حاضری ماهوار شاگردان'
    },
    {
      title: 'شقه مضامین صنف',
      code: 'SUBJECTS-CLASS-READY',
      type: 'subjects',
      note: 'قالب آماده مضامین و استادان صنف'
    },
    {
      title: 'شقه امتحان ماهوار',
      code: 'EXAM-MONTHLY-READY',
      type: 'exam',
      note: 'قالب رسمی آماده برای شقه امتحان ماهوار'
    },
    {
      title: 'شقه مالی شاگردان',
      code: 'FINANCE-STUDENT-READY',
      type: 'finance',
      note: 'قالب آماده گزارش مالی شاگردان'
    }
  ].map((item) => ({
    ...item,
    version: 1,
    layout: PREPARED_TEMPLATE_LAYOUTS[item.type] || PREPARED_TEMPLATE_LAYOUTS.attendance,
    columns: getDefaultColumnsForType(item.type),
    filters: {},
    options: {
      showTotal: true,
      showAverage: item.type !== 'exam',
      showNotes: true,
      showStudentCode: ['attendance_summary', 'exam'].includes(item.type)
    },
    ownership: { isDefault: true, isPublic: true },
    isActive: true
  }));
}

async function ensurePreparedSheetTemplates() {
  const seeds = getPreparedSheetTemplateSeeds();
  await Promise.all(seeds.map((payload) => SheetTemplate.findOneAndUpdate(
    { code: payload.code },
    { $set: payload },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  )));
}

function applyTemplateColumns(report = {}, template = {}) {
  const fallbackColumns = Array.isArray(report.columns) ? report.columns : [];
  const configuredColumns = Array.isArray(template.columns) && template.columns.length
    ? template.columns
    : fallbackColumns;

  const visibleColumns = configuredColumns
    .filter((column) => column?.visible !== false)
    .sort((left, right) => Number(left?.order || 0) - Number(right?.order || 0))
    .map((column) => ({
      key: normalizeText(column?.key),
      label: normalizeText(column?.label) || normalizeText(column?.key),
      group: normalizeText(column?.group),
      width: Number(column?.width || 16)
    }))
    .filter((column) => column.key);

  const rows = Array.isArray(report.rows) ? report.rows : [];
  const shapedRows = rows.map((row) => {
    const next = {};
    visibleColumns.forEach((column) => {
      next[column.key] = row?.[column.key] ?? '';
    });
    return next;
  });

  return {
    ...report,
    columns: visibleColumns,
    rows: shapedRows
  };
}

function mergePreviewFilters(template = {}, filters = {}) {
  const base = template.filters && typeof template.filters === 'object' ? template.filters : {};
  const merged = {
    academicYearId: normalizeNullableId(filters.academicYearId) || normalizeNullableId(template?.scope?.academicYearId),
    classId: normalizeNullableId(filters.classId) || normalizeNullableId(template?.scope?.classId),
    termId: normalizeNullableId(filters.termId) || normalizeNullableId(base.termId),
    examId: normalizeNullableId(filters.examId) || normalizeNullableId(base.examId),
    month: normalizeText(filters.month) || normalizeText(base.month),
    dateFrom: normalizeText(filters.dateFrom) || normalizeText(base.dateFrom),
    dateTo: normalizeText(filters.dateTo) || normalizeText(base.dateTo),
    studentId: normalizeNullableId(filters.studentId)
  };

  return Object.entries(merged).reduce((acc, [key, value]) => {
    if (value == null || value === '') return acc;
    acc[key] = value;
    return acc;
  }, {});
}

async function listSheetTemplates(query = {}) {
  await ensurePreparedSheetTemplates();

  const filter = {};
  if (normalizeText(query.type)) filter.type = normalizeText(query.type);
  if (query.isActive !== undefined && query.isActive !== '') {
    filter.isActive = String(query.isActive) === 'true';
  }
  if (normalizeText(query.createdBy)) {
    filter['ownership.createdBy'] = normalizeText(query.createdBy);
  }

  const items = await SheetTemplate.find(filter).sort({ isActive: -1, 'ownership.isDefault': -1, type: 1, createdAt: -1 });
  return items.map(formatTemplate);
}

async function getSheetTemplateById(templateId) {
  const item = await SheetTemplate.findById(templateId);
  return formatTemplate(item);
}

async function createSheetTemplate(payload = {}, actorUserId = null) {
  const type = normalizeText(payload.type);
  const code = normalizeTemplateCode(payload.code);
  const item = await SheetTemplate.create({
    title: normalizeText(payload.title),
    code,
    type,
    version: Number(payload.version || 1),
    scope: {
      academicYearId: normalizeNullableId(payload?.scope?.academicYearId),
      gradeId: normalizeNullableId(payload?.scope?.gradeId),
      sectionId: normalizeNullableId(payload?.scope?.sectionId),
      classId: normalizeNullableId(payload?.scope?.classId)
    },
    layout: payload.layout || {},
    columns: Array.isArray(payload.columns) && payload.columns.length
      ? payload.columns
      : getDefaultColumnsForType(type),
    filters: normalizeTemplateFilters(payload.filters || {}),
    options: payload.options || {},
    ownership: {
      createdBy: actorUserId || normalizeNullableId(payload?.ownership?.createdBy),
      isDefault: payload?.ownership?.isDefault === true,
      isPublic: payload?.ownership?.isPublic === true
    },
    isActive: payload.isActive !== false,
    note: normalizeText(payload.note)
  });

  return formatTemplate(item);
}

async function updateSheetTemplate(templateId, payload = {}) {
  const item = await SheetTemplate.findById(templateId);
  if (!item) throw new Error('sheet_template_not_found');

  if (payload.title !== undefined) item.title = normalizeText(payload.title);
  if (payload.code !== undefined) item.code = normalizeTemplateCode(payload.code);
  if (payload.type !== undefined) item.type = normalizeText(payload.type);
  if (payload.version !== undefined) item.version = Number(payload.version || 1);
  if (payload.scope && typeof payload.scope === 'object') {
    item.scope = {
      ...item.scope,
      academicYearId: normalizeNullableId(payload.scope.academicYearId !== undefined ? payload.scope.academicYearId : item.scope?.academicYearId),
      gradeId: normalizeNullableId(payload.scope.gradeId !== undefined ? payload.scope.gradeId : item.scope?.gradeId),
      sectionId: normalizeNullableId(payload.scope.sectionId !== undefined ? payload.scope.sectionId : item.scope?.sectionId),
      classId: normalizeNullableId(payload.scope.classId !== undefined ? payload.scope.classId : item.scope?.classId)
    };
  }
  if (payload.layout && typeof payload.layout === 'object') item.layout = { ...item.layout, ...payload.layout };
  if (Array.isArray(payload.columns)) item.columns = payload.columns;
  if (payload.filters && typeof payload.filters === 'object') {
    item.filters = { ...item.filters, ...normalizeTemplateFilters(payload.filters) };
  }
  if (payload.options && typeof payload.options === 'object') item.options = { ...item.options, ...payload.options };
  if (payload.ownership && typeof payload.ownership === 'object') {
    item.ownership = {
      ...item.ownership,
      isDefault: payload.ownership.isDefault !== undefined ? payload.ownership.isDefault === true : item.ownership?.isDefault,
      isPublic: payload.ownership.isPublic !== undefined ? payload.ownership.isPublic === true : item.ownership?.isPublic
    };
  }
  if (payload.isActive !== undefined) item.isActive = payload.isActive === true;
  if (payload.note !== undefined) item.note = normalizeText(payload.note);

  await item.save();
  return formatTemplate(item);
}

function resolveReportKeyByType(type = '') {
  if (type === 'attendance') return 'attendance_overview';
  if (type === 'attendance_summary') return 'attendance_summary_overview';
  if (type === 'exam') return 'exam_outcomes';
  if (type === 'finance') return 'finance_overview';
  if (type === 'subjects') return 'subjects_overview';
  throw new Error('sheet_template_unsupported_type');
}

function buildEmptyPreparedPreview(template = {}, filters = {}, message = '') {
  const type = normalizeText(template.type);
  return {
    report: {
      key: resolveReportKeyByType(type),
      title: normalizeText(template.title),
      description: normalizeText(template.note)
    },
    generatedAt: new Date().toISOString(),
    filters,
    columns: getDefaultColumnsForType(type).map((column) => ({
      key: column.key,
      label: column.label,
      width: column.width
    })),
    rows: [],
    summary: {},
    meta: {
      totalRows: 0,
      message: normalizeText(message)
    }
  };
}

async function previewSheetTemplate(templateId, filters = {}) {
  const template = await SheetTemplate.findById(templateId);
  if (!template) throw new Error('sheet_template_not_found');
  if (!template.isActive) throw new Error('sheet_template_inactive');

  const previewFilters = mergePreviewFilters(template, filters);
  if (normalizeText(template.type) === 'exam') {
    if (!previewFilters.examId) {
      return {
        template: formatTemplate(template),
        preview: buildEmptyPreparedPreview(template, previewFilters, 'برای شقه امتحان، ابتدا جلسه امتحان را انتخاب کنید.')
      };
    }

    const { report } = await buildSessionSheetReport(previewFilters.examId);
    return {
      template: formatTemplate(template),
      preview: applyTemplateColumns(report, template)
    };
  }

  const reportKey = resolveReportKeyByType(normalizeText(template.type));
  const report = await runReport(reportKey, previewFilters);

  return {
    template: formatTemplate(template),
    preview: applyTemplateColumns(report, template)
  };
}

async function applyTemplateToReport(templateId, report = {}) {
  const normalizedTemplateId = normalizeNullableId(templateId);
  if (!normalizedTemplateId) {
    return { template: null, report };
  }

  const template = await SheetTemplate.findById(normalizedTemplateId);
  if (!template) throw new Error('sheet_template_not_found');
  if (!template.isActive) throw new Error('sheet_template_inactive');

  return {
    template: formatTemplate(template),
    report: applyTemplateColumns(report, template)
  };
}

async function deleteSheetTemplate(templateId) {
  const normalizedId = normalizeNullableId(templateId);
  if (!normalizedId) throw new Error('invalid_template_id');

  const template = await SheetTemplate.findByIdAndDelete(normalizedId);
  if (!template) throw new Error('sheet_template_not_found');

  return {
    success: true,
    deletedId: String(template._id)
  };
}

module.exports = {
  applyTemplateToReport,
  createSheetTemplate,
  deleteSheetTemplate,
  ensurePreparedSheetTemplates,
  getDefaultColumnsForType,
  getPreparedSheetTemplateSeeds,
  getSheetTemplateById,
  listSheetTemplates,
  previewSheetTemplate,
  updateSheetTemplate
};
