require('../models/AcademicYear');
require('../models/AcademicTerm');
require('../models/SchoolClass');
require('../models/Subject');
require('../models/StudentMembership');
require('../models/User');

const SiteSettings = require('../models/SiteSettings');
const School = require('../models/School');
const TableTemplate = require('../models/TableTemplate');
const TableConfig = require('../models/TableConfig');
const ResultTable = require('../models/ResultTable');
const ResultTableRow = require('../models/ResultTableRow');
const ExamSession = require('../models/ExamSession');
const ExamResult = require('../models/ExamResult');
const AcademicYear = require('../models/AcademicYear');
const SchoolClass = require('../models/SchoolClass');
const StudentCore = require('../models/StudentCore');
const {
  buildClassAggregateRows,
  getClassAggregateReadiness
} = require('./classAggregateResultService');
const { OFFICIAL_RESULT_POLICY_VERSION, getMembershipLifecycleLabel } = require('../utils/officialResultPolicy');

function toPlain(doc) {
  if (!doc) return null;
  if (typeof doc.toObject === 'function') {
    return doc.toObject({ virtuals: false });
  }
  return { ...doc };
}

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function nullableNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function formatTemplate(doc) {
  const item = toPlain(doc);
  if (!item) return null;
  return {
    id: String(item._id),
    title: normalizeText(item.title),
    code: normalizeText(item.code),
    templateType: normalizeText(item.templateType),
    rowMode: normalizeText(item.rowMode),
    statusFilters: Array.isArray(item.statusFilters) ? item.statusFilters.map((entry) => normalizeText(entry)).filter(Boolean) : [],
    visibleColumns: Array.isArray(item.visibleColumns) ? item.visibleColumns.map((entry) => normalizeText(entry)).filter(Boolean) : [],
    sortMode: normalizeText(item.sortMode),
    defaultOrientation: normalizeText(item.defaultOrientation),
    supportsRows: Boolean(item.supportsRows),
    supportsSummary: Boolean(item.supportsSummary),
    isActive: Boolean(item.isActive),
    note: normalizeText(item.note)
  };
}

function formatConfig(doc) {
  const item = toPlain(doc);
  if (!item) return null;
  return {
    id: String(item._id),
    name: normalizeText(item.name),
    code: normalizeText(item.code),
    fontFamily: normalizeText(item.fontFamily),
    fontSize: Number(item.fontSize || 0),
    orientation: normalizeText(item.orientation),
    logoMode: normalizeText(item.logoMode),
    logoUrl: normalizeText(item.logoUrl),
    secondaryLogoUrl: normalizeText(item.secondaryLogoUrl),
    ministryTitle: normalizeText(item.ministryTitle),
    directorateTitle: normalizeText(item.directorateTitle),
    districtTitle: normalizeText(item.districtTitle),
    schoolTitle: normalizeText(item.schoolTitle),
    studentsPerPage: Number(item.studentsPerPage || 3),
    signatureLabels: Array.isArray(item.signatureLabels) ? item.signatureLabels.map(normalizeText).filter(Boolean) : [],
    headerText: normalizeText(item.headerText),
    footerText: normalizeText(item.footerText),
    showHeader: Boolean(item.showHeader),
    showFooter: Boolean(item.showFooter),
    showLogo: Boolean(item.showLogo),
    showPageNumber: Boolean(item.showPageNumber),
    showGeneratedAt: Boolean(item.showGeneratedAt),
    margins: item.margins || { top: 24, right: 24, bottom: 24, left: 24 },
    isDefault: Boolean(item.isDefault),
    isActive: Boolean(item.isActive),
    note: normalizeText(item.note)
  };
}

function formatSession(doc) {
  const item = toPlain(doc);
  if (!item) return null;
  return {
    id: String(item._id),
    title: normalizeText(item.title),
    code: normalizeText(item.code),
    status: normalizeText(item.status),
    examType: item.examTypeId ? { id: String(item.examTypeId._id || item.examTypeId), title: normalizeText(item.examTypeId.title), code: normalizeText(item.examTypeId.code) } : null,
    academicYear: item.academicYearId ? { id: String(item.academicYearId._id || item.academicYearId), title: normalizeText(item.academicYearId.title), code: normalizeText(item.academicYearId.code) } : null,
    assessmentPeriod: item.assessmentPeriodId ? { id: String(item.assessmentPeriodId._id || item.assessmentPeriodId), title: normalizeText(item.assessmentPeriodId.title), code: normalizeText(item.assessmentPeriodId.code) } : null,
    schoolClass: item.classId ? { id: String(item.classId._id || item.classId), title: normalizeText(item.classId.title), code: normalizeText(item.classId.code) } : null,
    subject: item.subjectId ? { id: String(item.subjectId._id || item.subjectId), name: normalizeText(item.subjectId.name), code: normalizeText(item.subjectId.code) } : null,
    heldAt: item.heldAt || null,
    publishedAt: item.publishedAt || null
  };
}

function formatRow(doc) {
  const item = toPlain(doc);
  if (!item) return null;
  return {
    id: String(item._id),
    serialNo: Number(item.serialNo || 0),
    rowType: normalizeText(item.rowType),
    displayName: normalizeText(item.displayName),
    membershipStatus: normalizeText(item.membershipStatus),
    membershipStatusLabel: normalizeText(item.membershipStatusLabel),
    resultStatus: normalizeText(item.resultStatus),
    groupLabel: normalizeText(item.groupLabel),
    rank: item.rank == null ? null : Number(item.rank),
    obtainedMark: nullableNumber(item.obtainedMark),
    totalMark: nullableNumber(item.totalMark),
    percentage: nullableNumber(item.percentage),
    averageMark: nullableNumber(item.averageMark),
    cells: item.cells || {},
    note: normalizeText(item.note)
  };
}

function formatTable(doc, rows = []) {
  const item = toPlain(doc);
  if (!item) return null;
  return {
    id: String(item._id),
    title: normalizeText(item.title),
    code: normalizeText(item.code),
    scopeType: normalizeText(item.scopeType) || 'session',
    policyVersion: normalizeText(item.policyVersion),
    version: Number(item.version || 1),
    sourceSessionIds: Array.isArray(item.sourceSessionIds) ? item.sourceSessionIds.map((entry) => String(entry?._id || entry)) : [],
    templateType: normalizeText(item.templateType),
    orientation: normalizeText(item.orientation),
    status: normalizeText(item.status),
    rowCount: Number(item.rowCount || 0),
    stats: item.stats || {},
    metadata: item.metadata || {},
    headerText: normalizeText(item.headerText),
    footerText: normalizeText(item.footerText),
    logoUrl: normalizeText(item.logoUrl),
    generatedAt: item.generatedAt || null,
    publishedAt: item.publishedAt || null,
    template: formatTemplate(item.templateId),
    config: formatConfig(item.configId),
    session: formatSession(item.sessionId),
    academicYear: item.academicYearId ? {
      id: String(item.academicYearId?._id || item.academicYearId),
      title: normalizeText(item.academicYearId?.title),
      code: normalizeText(item.academicYearId?.code)
    } : null,
    schoolClass: item.classId ? {
      id: String(item.classId?._id || item.classId),
      title: normalizeText(item.classId?.title),
      code: normalizeText(item.classId?.code)
    } : null,
    rows: rows.map(formatRow).filter(Boolean)
  };
}
function buildTemplateSeedData() {
  return [
    {
      title: 'جدول رسمی نتایج عمومی صنف',
      code: 'RESULTS_CLASS_OFFICIAL',
      templateType: 'results',
      rowMode: 'full_results',
      visibleColumns: ['serialNo', 'identity', 'subjects', 'stageTotals', 'attendance', 'resultStatus', 'rank', 'membershipStatusLabel'],
      sortMode: 'rank',
      defaultOrientation: 'landscape',
      note: 'قالب رسمی نتیجهٔ عمومی با نمرات چهارنیم‌ماهه، سالانه و مجموع.'
    },
    {
      title: 'جدول نتایج',
      code: 'RESULTS_MAIN',
      templateType: 'results',
      rowMode: 'full_results',
      visibleColumns: ['serialNo', 'fullName', 'obtainedMark', 'totalMark', 'percentage', 'resultStatus', 'groupLabel', 'rank'],
      sortMode: 'rank',
      defaultOrientation: 'landscape'
    },
    {
      title: 'جدول موقت',
      code: 'RESULTS_TEMPORARY',
      templateType: 'temporary',
      rowMode: 'status_filtered',
      statusFilters: ['temporary'],
      visibleColumns: ['serialNo', 'fullName', 'percentage', 'resultStatus', 'rank'],
      sortMode: 'percentage',
      defaultOrientation: 'portrait'
    },
    {
      title: 'جدول لیاقت',
      code: 'RESULTS_DISTINCTION',
      templateType: 'distinction',
      rowMode: 'status_filtered',
      statusFilters: ['distinction'],
      visibleColumns: ['serialNo', 'fullName', 'obtainedMark', 'percentage', 'groupLabel', 'rank'],
      sortMode: 'rank',
      defaultOrientation: 'portrait'
    },
    {
      title: 'جدول مشروطی',
      code: 'RESULTS_CONDITIONAL',
      templateType: 'conditional',
      rowMode: 'status_filtered',
      statusFilters: ['conditional'],
      visibleColumns: ['serialNo', 'fullName', 'obtainedMark', 'percentage', 'resultStatus'],
      sortMode: 'percentage',
      defaultOrientation: 'portrait'
    },
    {
      title: 'جدول سویه',
      code: 'RESULTS_PLACEMENT',
      templateType: 'placement',
      rowMode: 'status_filtered',
      statusFilters: ['placement'],
      visibleColumns: ['serialNo', 'fullName', 'obtainedMark', 'percentage', 'resultStatus', 'rank'],
      sortMode: 'rank',
      defaultOrientation: 'portrait'
    },
    {
      title: 'جدول خلاص نتایج',
      code: 'RESULTS_SUMMARY',
      templateType: 'summary',
      rowMode: 'summary',
      supportsRows: true,
      visibleColumns: ['label', 'value'],
      sortMode: 'custom',
      defaultOrientation: 'portrait'
    },
    {
      title: 'فهرست جدول‌ها',
      code: 'RESULTS_INDEX',
      templateType: 'index',
      rowMode: 'generated_index',
      visibleColumns: ['serialNo', 'title', 'templateType', 'rowCount', 'generatedAt'],
      sortMode: 'custom',
      defaultOrientation: 'portrait'
    },
    {
      title: 'پوش جدول',
      code: 'RESULTS_COVER',
      templateType: 'cover',
      rowMode: 'cover',
      supportsRows: false,
      supportsSummary: false,
      visibleColumns: [],
      sortMode: 'custom',
      defaultOrientation: 'portrait'
    }
  ];
}

function buildDefaultConfigSeed() {
  return {
    name: 'تنظیم رسمی جدول نتایج',
    code: 'DEFAULT-RESULT-TABLE',
    fontFamily: 'Tahoma',
    fontSize: 10,
    orientation: 'landscape',
    logoMode: 'site',
    headerText: 'جدول نتایج عمومی شاگردان',
    footerText: 'این جدول از شقه‌های تأییدشدهٔ چهارنیم‌ماهه و سالانه ساخته شده است.',
    ministryTitle: 'وزارت معارف',
    directorateTitle: 'ریاست معارف شهر کابل',
    districtTitle: '',
    schoolTitle: '',
    studentsPerPage: 3,
    signatureLabels: [
      'تأیید مکتب',
      'تأیید آمریت حوزه/ولسوالی',
      'عضو مسلکی نتایج',
      'تأیید مدیریت عمومی نتایج',
      'تأیید ریاست معارف'
    ],
    showHeader: true,
    showFooter: true,
    showLogo: true,
    showPageNumber: true,
    showGeneratedAt: true,
    isDefault: true,
    isActive: true
  };
}

async function ensureResultTableReferenceData() {
  const summary = {
    templatesCreated: 0,
    configsCreated: 0
  };

  for (const payload of buildTemplateSeedData()) {
    const result = await TableTemplate.updateOne(
      { code: payload.code },
      { $setOnInsert: { ...payload, isActive: true } },
      { upsert: true, setDefaultsOnInsert: true }
    );
    summary.templatesCreated += Number(result.upsertedCount || 0);
  }

  const configPayload = buildDefaultConfigSeed();
  const hasDefaultConfig = await TableConfig.exists({ isDefault: true });
  const configResult = await TableConfig.updateOne(
    { code: configPayload.code },
    { $setOnInsert: { ...configPayload, isDefault: !hasDefaultConfig } },
    { upsert: true, setDefaultsOnInsert: true }
  );
  summary.configsCreated += Number(configResult.upsertedCount || 0);

  return summary;
}

async function seedResultTableReferenceData({ dryRun = false } = {}) {
  const summary = {
    templatesCreated: 0,
    templatesUpdated: 0,
    configsCreated: 0,
    configsUpdated: 0
  };

  for (const payload of buildTemplateSeedData()) {
    const existing = await TableTemplate.findOne({ code: payload.code });
    if (!existing) {
      summary.templatesCreated += 1;
      if (!dryRun) await TableTemplate.create(payload);
      continue;
    }

    const changed =
      normalizeText(existing.title) !== payload.title ||
      normalizeText(existing.templateType) !== payload.templateType ||
      normalizeText(existing.rowMode) !== payload.rowMode ||
      JSON.stringify(existing.visibleColumns || []) !== JSON.stringify(payload.visibleColumns || []) ||
      JSON.stringify(existing.statusFilters || []) !== JSON.stringify(payload.statusFilters || []) ||
      normalizeText(existing.sortMode) !== normalizeText(payload.sortMode || 'rank') ||
      normalizeText(existing.defaultOrientation) !== normalizeText(payload.defaultOrientation || 'landscape');

    if (changed) {
      summary.templatesUpdated += 1;
      if (!dryRun) {
        Object.assign(existing, payload);
        await existing.save();
      }
    }
  }

  const payload = buildDefaultConfigSeed();
  const existingConfig = await TableConfig.findOne({ code: payload.code });
  if (!existingConfig) {
    summary.configsCreated += 1;
    if (!dryRun) await TableConfig.create(payload);
  } else {
    const changed =
      normalizeText(existingConfig.name) !== payload.name ||
      normalizeText(existingConfig.fontFamily) !== payload.fontFamily ||
      Number(existingConfig.fontSize || 0) !== Number(payload.fontSize || 0) ||
      normalizeText(existingConfig.orientation) !== payload.orientation ||
      normalizeText(existingConfig.logoMode) !== payload.logoMode ||
      normalizeText(existingConfig.headerText) !== payload.headerText ||
      normalizeText(existingConfig.footerText) !== payload.footerText ||
      normalizeText(existingConfig.ministryTitle) !== payload.ministryTitle ||
      normalizeText(existingConfig.directorateTitle) !== payload.directorateTitle ||
      normalizeText(existingConfig.districtTitle) !== payload.districtTitle ||
      normalizeText(existingConfig.schoolTitle) !== payload.schoolTitle ||
      Number(existingConfig.studentsPerPage || 0) !== Number(payload.studentsPerPage || 0) ||
      JSON.stringify(existingConfig.signatureLabels || []) !== JSON.stringify(payload.signatureLabels || []) ||
      Boolean(existingConfig.isDefault) !== Boolean(payload.isDefault);

    if (changed) {
      summary.configsUpdated += 1;
      if (!dryRun) {
        Object.assign(existingConfig, payload);
        await existingConfig.save();
      }
    }
  }

  return summary;
}

async function getEffectiveLogoUrl(configDoc) {
  const config = toPlain(configDoc);
  if (!config || config.logoMode === 'none' || config.showLogo === false) return '';
  if (config.logoMode === 'custom' && normalizeText(config.logoUrl)) return normalizeText(config.logoUrl);
  const settings = await SiteSettings.findOne({}).select('logoUrl schoolLogoUrl').lean();
  return normalizeText(settings?.schoolLogoUrl) || normalizeText(settings?.logoUrl);
}

function buildStageStatistics(rows = [], stage = 'general') {
  const studentRows = rows.filter((row) => row.rowType === 'student');
  const stageKey = stage === 'fourHalf' ? 'fourHalf' : stage === 'annual' ? 'annual' : 'general';
  const scoreKey = stage === 'fourHalf' ? 'fourHalf' : stage === 'annual' ? 'annual' : 'total';
  const passKey = stage === 'fourHalf' ? 'fourHalfPassed' : stage === 'annual' ? 'annualPassed' : 'passed';
  const statusKey = stage === 'fourHalf' ? 'fourHalfStatus' : 'annualStatus';
  const participated = studentRows.filter((row) => Number(row.cells?.stageTotals?.[stageKey]?.recordedSubjects || 0) > 0);
  const passed = participated.filter((row) => {
    const subjects = (row.cells?.subjects || []).filter((item) => item.applicable && Number.isFinite(Number(item[scoreKey])));
    return subjects.length > 0 && subjects.every((item) => item[passKey] === true);
  });
  const conditional = stage === 'general'
    ? studentRows.filter((row) => row.resultStatus === 'conditional')
    : [];
  const absent = studentRows.filter((row) => (row.cells?.subjects || []).some((item) => item[statusKey] === 'absent'));
  const excused = studentRows.filter((row) => (row.cells?.subjects || []).some((item) => item[statusKey] === 'excused'));
  const deprived = studentRows.filter((row) => row.membershipStatus === 'suspended');
  return {
    enrolled: studentRows.length,
    participated: participated.length,
    passed: passed.length,
    failed: Math.max(0, participated.length - passed.length - conditional.length),
    conditional: conditional.length,
    absent: absent.length,
    excused: excused.length,
    deprived: deprived.length
  };
}

async function buildOfficialSnapshotMetadata({ config, readiness, rows }) {
  const configItem = toPlain(config) || {};
  const schoolId = readiness?.schoolClass?.schoolId || null;
  const [settings, school] = await Promise.all([
    SiteSettings.findOne({}).select('logoUrl schoolLogoUrl ministryLogoUrl brandName').lean(),
    schoolId ? School.findById(schoolId).lean() : null
  ]);
  const logoDisabled = configItem.logoMode === 'none' || configItem.showLogo === false;
  const schoolLogoUrl = logoDisabled ? '' : (
    configItem.logoMode === 'custom' && normalizeText(configItem.logoUrl)
      ? normalizeText(configItem.logoUrl)
      : normalizeText(settings?.schoolLogoUrl) || normalizeText(settings?.logoUrl)
  );
  const ministryLogoUrl = logoDisabled ? '' : (
    normalizeText(configItem.secondaryLogoUrl) || normalizeText(settings?.ministryLogoUrl)
  );
  const schoolName = normalizeText(configItem.schoolTitle)
    || normalizeText(school?.nameDari)
    || normalizeText(school?.name)
    || normalizeText(settings?.brandName)
    || 'مکتب';

  return {
    layoutKind: 'official_class_results',
    studentsPerPage: 3,
    officialHeader: {
      countryTitle: 'امارت اسلامی افغانستان',
      ministryTitle: normalizeText(configItem.ministryTitle) || 'وزارت معارف',
      directorateTitle: normalizeText(configItem.directorateTitle) || 'ریاست معارف شهر کابل',
      districtTitle: normalizeText(configItem.districtTitle) || normalizeText(school?.district),
      schoolTitle: schoolName,
      schoolCode: normalizeText(school?.schoolCode) || normalizeText(school?.ministryCode),
      schoolLogoUrl,
      ministryLogoUrl
    },
    signatures: Array.isArray(configItem.signatureLabels) && configItem.signatureLabels.length
      ? configItem.signatureLabels.map(normalizeText).filter(Boolean)
      : [
          'تأیید مکتب',
          'تأیید آمریت حوزه/ولسوالی',
          'عضو مسلکی نتایج',
          'تأیید مدیریت عمومی نتایج',
          'تأیید ریاست معارف'
        ],
    academicYear: readiness?.academicYear || null,
    schoolClass: readiness?.schoolClass || null,
    observerName: normalizeText(readiness?.schoolClass?.homeroomTeacher?.name),
    subjects: (readiness?.subjects || []).map((subject) => ({
      id: subject.id,
      code: subject.code,
      name: subject.name,
      teacherAssignments: subject.teacherAssignments || []
    })),
    sourceSessionIds: readiness?.sourceSessionIds || [],
    readinessProgress: readiness?.progress || {},
    stageStatistics: {
      fourHalf: buildStageStatistics(rows, 'fourHalf'),
      annual: buildStageStatistics(rows, 'annual'),
      general: buildStageStatistics(rows, 'general')
    },
    policy: {
      version: OFFICIAL_RESULT_POLICY_VERSION,
      fourHalfPassMark: 16,
      fourHalfTotalMark: 40,
      annualPassMark: 40,
      annualTotalMark: 60,
      generalPassMark: 55,
      generalTotalMark: 100
    }
  };
}

function buildResultStats(results = []) {
  const stats = {
    totalRows: results.length,
    passed: 0,
    failed: 0,
    conditional: 0,
    distinction: 0,
    temporary: 0,
    placement: 0,
    excused: 0,
    absent: 0,
    pending: 0,
    notApplicable: 0,
    averagePercentage: 0
  };

  const recorded = [];
  results.forEach((result) => {
    const status = normalizeText(result.resultStatus);
    if (status === 'not_applicable') {
      stats.notApplicable += 1;
    } else if (Object.prototype.hasOwnProperty.call(stats, status)) {
      stats[status] += 1;
    }
    if (typeof result.percentage === 'number' && !Number.isNaN(result.percentage)) {
      recorded.push(Number(result.percentage));
    }
  });

  if (recorded.length) {
    stats.averagePercentage = Number((recorded.reduce((sum, value) => sum + value, 0) / recorded.length).toFixed(2));
  }

  return stats;
}

function buildDisplayName(resultDoc) {
  const result = toPlain(resultDoc) || {};
  return normalizeText(result.studentId?.fullName)
    || normalizeText(result.student?.name)
    || normalizeText(result.studentMembershipId?.studentId?.fullName)
    || normalizeText(result.studentMembershipId?.student?.name)
    || '---';
}

function sortResults(items, sortMode) {
  const list = [...items];
  if (sortMode === 'name') {
    list.sort((left, right) => buildDisplayName(left).localeCompare(buildDisplayName(right), 'en', { sensitivity: 'base' }));
    return list;
  }
  if (sortMode === 'percentage') {
    list.sort((left, right) => Number(right.percentage || 0) - Number(left.percentage || 0));
    return list;
  }
  if (sortMode === 'status') {
    list.sort((left, right) => normalizeText(left.resultStatus).localeCompare(normalizeText(right.resultStatus)));
    return list;
  }
  list.sort((left, right) => {
    const leftRank = left.rank == null ? Number.MAX_SAFE_INTEGER : Number(left.rank);
    const rightRank = right.rank == null ? Number.MAX_SAFE_INTEGER : Number(right.rank);
    if (leftRank !== rightRank) return leftRank - rightRank;
    return Number(right.percentage || 0) - Number(left.percentage || 0);
  });
  return list;
}
async function listResultTableReferenceData() {
  const [templates, configs, sessions, academicYears, classes] = await Promise.all([
    TableTemplate.find({ isActive: true }).sort({ createdAt: 1 }),
    TableConfig.find({ isActive: true }).sort({ isDefault: -1, createdAt: 1 }),
    ExamSession.find({ status: { $in: ['approved', 'closed', 'published'] } })
      .populate('examTypeId', 'title code')
      .populate('academicYearId', 'title code')
      .populate('assessmentPeriodId', 'title code')
      .populate('classId', 'title code')
      .populate('subjectId', 'name code')
      .sort({ heldAt: -1, createdAt: -1 }),
    AcademicYear.find({}).sort({ isActive: -1, sequence: 1, createdAt: 1 }),
    SchoolClass.find({ status: { $ne: 'archived' } }).populate('academicYearId', 'title code').sort({ gradeLevel: 1, section: 1, title: 1 })
  ]);

  return {
    templates: templates.map(formatTemplate),
    configs: configs.map(formatConfig),
    sessions: sessions.map(formatSession),
    academicYears: academicYears.map((item) => ({
      id: String(item._id),
      title: normalizeText(item.title),
      code: normalizeText(item.code),
      isActive: Boolean(item.isActive)
    })),
    classes: classes.map((item) => ({
      id: String(item._id),
      title: normalizeText(item.title),
      code: normalizeText(item.code),
      gradeLevel: item.gradeLevel,
      academicYearId: String(item.academicYearId?._id || item.academicYearId || '')
    })),
    policyVersion: OFFICIAL_RESULT_POLICY_VERSION
  };
}

async function listTableTemplates() {
  const items = await TableTemplate.find({}).sort({ isActive: -1, createdAt: 1 });
  return items.map(formatTemplate);
}

async function listTableConfigs() {
  const items = await TableConfig.find({}).sort({ isDefault: -1, createdAt: 1 });
  return items.map(formatConfig);
}

async function createTableConfig(payload = {}) {
  const item = await TableConfig.create({
    name: normalizeText(payload.name),
    code: normalizeText(payload.code).toUpperCase(),
    fontFamily: normalizeText(payload.fontFamily) || 'Tahoma',
    fontSize: Number(payload.fontSize || 12),
    orientation: normalizeText(payload.orientation) === 'portrait' ? 'portrait' : 'landscape',
    logoMode: ['site', 'custom', 'none'].includes(normalizeText(payload.logoMode)) ? normalizeText(payload.logoMode) : 'site',
    logoUrl: normalizeText(payload.logoUrl),
    secondaryLogoUrl: normalizeText(payload.secondaryLogoUrl),
    ministryTitle: normalizeText(payload.ministryTitle) || 'وزارت معارف',
    directorateTitle: normalizeText(payload.directorateTitle) || 'ریاست معارف شهر کابل',
    districtTitle: normalizeText(payload.districtTitle),
    schoolTitle: normalizeText(payload.schoolTitle),
    studentsPerPage: Math.min(10, Math.max(1, Number(payload.studentsPerPage || 3))),
    signatureLabels: Array.isArray(payload.signatureLabels)
      ? payload.signatureLabels.map(normalizeText).filter(Boolean)
      : ['امضای مدیر مکتب', 'امضای سرمعلم', 'امضای عضو علمی و مسلکی'],
    headerText: normalizeText(payload.headerText),
    footerText: normalizeText(payload.footerText),
    showHeader: payload.showHeader !== false,
    showFooter: payload.showFooter !== false,
    showLogo: payload.showLogo !== false,
    showPageNumber: payload.showPageNumber !== false,
    showGeneratedAt: payload.showGeneratedAt !== false,
    isDefault: payload.isDefault === true,
    isActive: payload.isActive !== false,
    note: normalizeText(payload.note)
  });
  return formatConfig(item);
}

async function resolveGenerationContext({ templateId, configId, sessionId, scopeType = 'session' }) {
  const [template, config, session] = await Promise.all([
    TableTemplate.findById(templateId),
    configId ? TableConfig.findById(configId) : TableConfig.findOne({ isDefault: true }),
    sessionId
      ? ExamSession.findById(sessionId)
          .populate('examTypeId', 'title code')
          .populate('academicYearId', 'title code')
          .populate('assessmentPeriodId', 'title code')
          .populate('classId', 'title code')
          .populate('subjectId', 'name code')
      : null
  ]);

  if (!template) throw new Error('result_table_template_not_found');
  if (!config) throw new Error('result_table_config_not_found');
  if (scopeType !== 'class_aggregate' && template.rowMode !== 'cover' && !session) throw new Error('result_table_session_required');
  return { template, config, session };
}

async function loadSessionResults(sessionId) {
  if (!sessionId) return [];
  return ExamResult.find({ sessionId })
    .populate('student', 'name email')
    .populate('studentId', 'fullName admissionNo')
    .populate({ path: 'studentMembershipId', populate: [{ path: 'student', select: 'name email' }, { path: 'studentId', select: 'fullName admissionNo' }] })
    .sort({ rank: 1, percentage: -1, createdAt: 1 });
}

function buildStudentRows(results, template) {
  const ordered = sortResults(results, normalizeText(template.sortMode));
  return ordered.map((result, index) => {
    const displayName = buildDisplayName(result);
    const membershipState = result.membershipSnapshot?.status
      ? result.membershipSnapshot
      : (result.studentMembershipId || {});
    const membershipStatus = normalizeText(membershipState.status);
    const membershipStatusLabel = normalizeText(membershipState.statusLabel)
      || getMembershipLifecycleLabel(membershipState);
    return {
      serialNo: index + 1,
      rowType: 'student',
      examResultId: result._id,
      studentMembershipId: result.studentMembershipId?._id || result.studentMembershipId || null,
      studentId: result.studentId?._id || result.studentId || null,
      student: result.student?._id || result.student || null,
      displayName,
      membershipStatus,
      membershipStatusLabel,
      resultStatus: normalizeText(result.resultStatus),
      groupLabel: normalizeText(result.groupLabel),
      rank: result.rank == null ? null : Number(result.rank),
      obtainedMark: Number(result.obtainedMark || 0),
      totalMark: Number(result.totalMark || 0),
      percentage: Number(result.percentage || 0),
      averageMark: Number(result.averageMark || 0),
      cells: {
        serialNo: index + 1,
        fullName: displayName,
        membershipStatus,
        membershipStatusLabel,
        obtainedMark: Number(result.obtainedMark || 0),
        totalMark: Number(result.totalMark || 0),
        percentage: Number(result.percentage || 0),
        averageMark: Number(result.averageMark || 0),
        resultStatus: normalizeText(result.resultStatus),
        groupLabel: normalizeText(result.groupLabel),
        rank: result.rank == null ? '' : Number(result.rank)
      },
      note: membershipStatusLabel
    };
  });
}

function buildSummaryRows(results, session) {
  const stats = buildResultStats(results);
  const rows = [
    ['جمع کل', stats.totalRows],
    ['کامیاب', stats.passed],
    ['ناکام', stats.failed],
    ['مشروط', stats.conditional],
    ['لیاقت', stats.distinction],
    ['موقت', stats.temporary],
    ['سویه', stats.placement],
    ['معذرتی', stats.excused],
    ['غایب', stats.absent],
    ['اوسط فیصدی', stats.averagePercentage]
  ];

  return rows.map((entry, index) => ({
    serialNo: index + 1,
    rowType: 'summary',
    displayName: String(entry[0]),
    cells: {
      label: String(entry[0]),
      value: entry[1],
      sessionTitle: normalizeText(session?.title)
    }
  }));
}
async function buildIndexRows(sessionId) {
  const tables = await ResultTable.find({ sessionId }).populate('templateId').sort({ generatedAt: -1, createdAt: -1 });
  return tables.map((table, index) => ({
    serialNo: index + 1,
    rowType: 'meta',
    displayName: normalizeText(table.title),
    cells: {
      serialNo: index + 1,
      title: normalizeText(table.title),
      templateType: normalizeText(table.templateType || table.templateId?.templateType),
      rowCount: Number(table.rowCount || 0),
      generatedAt: table.generatedAt || table.createdAt || null
    }
  }));
}

function buildTableCode(template, session) {
  const parts = [
    normalizeText(template.code),
    normalizeText(session?.code),
    Date.now().toString(36).toUpperCase()
  ].filter(Boolean);
  return parts.join('-');
}

async function buildGeneratedRows({ template, session }) {
  if (template.rowMode === 'cover') return [];
  if (template.rowMode === 'generated_index') {
    return buildIndexRows(session?._id || null);
  }

  const results = await loadSessionResults(session?._id || null);
  if (template.rowMode === 'summary') {
    return buildSummaryRows(results, session);
  }

  const filtered = template.rowMode === 'status_filtered'
    ? results.filter((item) => (template.statusFilters || []).includes(normalizeText(item.resultStatus)))
    : results;
  return buildStudentRows(filtered, template);
}

async function buildAggregateGeneratedRows({ template, academicYearId, classId }) {
  if (template.rowMode === 'cover') {
    const readiness = await getClassAggregateReadiness({ academicYearId, classId });
    if (!readiness.ready) throw new Error('result_table_aggregate_not_ready');
    return { readiness, rows: [] };
  }
  const bundle = await buildClassAggregateRows({ academicYearId, classId });
  if (template.rowMode === 'summary') {
    return { ...bundle, rows: buildSummaryRows(bundle.rows, { title: bundle.readiness.schoolClass.title }) };
  }
  const rows = template.rowMode === 'status_filtered'
    ? bundle.rows.filter((item) => (template.statusFilters || []).includes(normalizeText(item.resultStatus)))
    : bundle.rows;
  rows.forEach((row, index) => {
    row.serialNo = index + 1;
    row.cells = { ...(row.cells || {}), serialNo: index + 1 };
  });
  return { ...bundle, rows };
}

async function generateResultTable({
  templateId,
  configId = null,
  sessionId = null,
  scopeType = 'session',
  academicYearId = null,
  classId = null,
  note = ''
} = {}, actorUserId = null) {
  const normalizedScope = normalizeText(scopeType) === 'class_aggregate' ? 'class_aggregate' : 'session';
  const effectiveSessionId = normalizedScope === 'session' ? sessionId : null;
  const { template, config, session } = await resolveGenerationContext({
    templateId,
    configId,
    sessionId: effectiveSessionId,
    scopeType: normalizedScope
  });
  if (normalizedScope === 'session' && session && !['approved', 'published'].includes(normalizeText(session.status))) {
    throw new Error('result_table_session_not_approved');
  }
  const aggregate = normalizedScope === 'class_aggregate'
    ? await buildAggregateGeneratedRows({ template, academicYearId, classId })
    : null;
  const rows = aggregate?.rows || await buildGeneratedRows({ template, session });
  const statsSource = rows.filter((item) => item.rowType === 'student').map((item) => ({ resultStatus: item.resultStatus, percentage: item.percentage }));
  const metadata = aggregate
    ? await buildOfficialSnapshotMetadata({ config, readiness: aggregate.readiness, rows })
    : {};
  const logoUrl = normalizeText(metadata?.officialHeader?.schoolLogoUrl) || await getEffectiveLogoUrl(config);
  const tableVersionFilter = normalizedScope === 'class_aggregate'
    ? {
        scopeType: 'class_aggregate',
        academicYearId,
        classId,
        templateId: template._id
      }
    : {
        scopeType: 'session',
        sessionId: session?._id,
        templateId: template._id
      };
  const tableVersion = Number(await ResultTable.countDocuments(tableVersionFilter)) + 1;
  const aggregateTitle = aggregate
    ? `${template.title} - ${aggregate.readiness.schoolClass.title} - ${aggregate.readiness.academicYear.title}`
    : '';

  const table = await ResultTable.create({
    title: aggregateTitle || (session ? `${template.title} - ${session.title}` : template.title),
    code: buildTableCode(template, session),
    templateId: template._id,
    configId: config?._id || null,
    sessionId: session?._id || null,
    sourceSessionIds: aggregate?.readiness?.sourceSessionIds || [],
    scopeType: normalizedScope,
    policyVersion: aggregate ? OFFICIAL_RESULT_POLICY_VERSION : '',
    version: tableVersion,
    examTypeId: session?.examTypeId?._id || session?.examTypeId || null,
    academicYearId: aggregate?.readiness?.academicYear?.id || session?.academicYearId?._id || session?.academicYearId || null,
    assessmentPeriodId: session?.assessmentPeriodId?._id || session?.assessmentPeriodId || null,
    classId: aggregate?.readiness?.schoolClass?.id || session?.classId?._id || session?.classId || null,
    subjectId: session?.subjectId?._id || session?.subjectId || null,
    templateType: template.templateType,
    orientation: config?.orientation || template.defaultOrientation || 'landscape',
    status: 'generated',
    rowCount: rows.length,
    stats: buildResultStats(statsSource),
    metadata,
    headerText: config?.headerText || '',
    footerText: config?.footerText || '',
    logoUrl,
    generatedBy: actorUserId || null,
    note: normalizeText(note)
  });

  if (rows.length) {
    await ResultTableRow.insertMany(rows.map((row) => ({ ...row, tableId: table._id })));
  }

  return getResultTable(table._id);
}

async function publishResultTable(tableId) {
  const table = await ResultTable.findById(tableId);
  if (!table) {
    throw new Error('result_table_not_found');
  }
  if (normalizeText(table.status) === 'archived') {
    throw new Error('result_table_archived');
  }
  if (normalizeText(table.status) !== 'published') {
    table.status = 'published';
    table.publishedAt = new Date();
    await table.save();
  }
  return getResultTable(table._id);
}

async function listResultTables(filters = {}) {
  const query = {};
  if (filters.sessionId) query.sessionId = filters.sessionId;
  if (filters.templateId) query.templateId = filters.templateId;
  if (filters.classId) query.classId = filters.classId;
  if (filters.academicYearId) query.academicYearId = filters.academicYearId;
  if (filters.scopeType) query.scopeType = normalizeText(filters.scopeType);
  if (filters.assessmentPeriodId) query.assessmentPeriodId = filters.assessmentPeriodId;
  if (filters.status) query.status = normalizeText(filters.status);

  const items = await ResultTable.find(query)
    .populate('templateId')
    .populate('configId')
    .populate('academicYearId', 'title code')
    .populate('classId', 'title code')
    .populate({ path: 'sessionId', populate: ['examTypeId', 'academicYearId', 'assessmentPeriodId', 'classId', 'subjectId'] })
    .sort({ generatedAt: -1, createdAt: -1 });

  return items.map((item) => formatTable(item));
}

async function getResultTable(tableId) {
  const table = await ResultTable.findById(tableId)
    .populate('templateId')
    .populate('configId')
    .populate('academicYearId', 'title code')
    .populate('classId', 'title code')
    .populate({ path: 'sessionId', populate: ['examTypeId', 'academicYearId', 'assessmentPeriodId', 'classId', 'subjectId'] });
  if (!table) return null;

  const rows = await ResultTableRow.find({ tableId }).sort({ serialNo: 1, createdAt: 1 });
  return formatTable(table, rows);
}

async function listMyPublishedResultTables(userId) {
  const normalizedUserId = normalizeText(userId);
  if (!normalizedUserId) return [];
  const studentCore = await StudentCore.findOne({ userId: normalizedUserId }).select('_id').lean();
  const identityFilters = [{ student: normalizedUserId }];
  if (studentCore?._id) identityFilters.push({ studentId: studentCore._id });
  const rows = await ResultTableRow.find({ rowType: 'student', $or: identityFilters })
    .populate({
      path: 'tableId',
      match: { status: 'published', scopeType: 'class_aggregate' },
      populate: [
        { path: 'academicYearId', select: 'title code' },
        { path: 'classId', select: 'title titleDari code gradeLevel section' }
      ]
    })
    .sort({ createdAt: -1 })
    .lean();

  return rows.filter((row) => row.tableId).map((row) => ({
    id: String(row.tableId._id),
    title: normalizeText(row.tableId.title),
    code: normalizeText(row.tableId.code),
    version: Number(row.tableId.version || 1),
    publishedAt: row.tableId.publishedAt || null,
    academicYear: row.tableId.academicYearId ? {
      id: String(row.tableId.academicYearId._id || row.tableId.academicYearId),
      title: normalizeText(row.tableId.academicYearId.title),
      code: normalizeText(row.tableId.academicYearId.code)
    } : null,
    schoolClass: row.tableId.classId ? {
      id: String(row.tableId.classId._id || row.tableId.classId),
      title: normalizeText(row.tableId.classId.titleDari) || normalizeText(row.tableId.classId.title),
      code: normalizeText(row.tableId.classId.code)
    } : null,
    resultStatus: normalizeText(row.resultStatus),
    rank: row.rank == null ? null : Number(row.rank),
    totalObtained: nullableNumber(row.cells?.totalObtained),
    totalPossible: nullableNumber(row.cells?.totalPossible),
    average: nullableNumber(row.cells?.average),
    percentage: nullableNumber(row.cells?.percentage ?? row.cells?.stageTotals?.general?.percentage ?? row.cells?.average),
    failedSubjects: nullableNumber(row.cells?.failedSubjects),
    membershipStatus: normalizeText(row.membershipStatus),
    membershipStatusLabel: normalizeText(row.membershipStatusLabel),
    subjects: Array.isArray(row.cells?.subjects) ? row.cells.subjects : [],
    stageTotals: row.cells?.stageTotals || {},
    attendance: row.cells?.attendance || {}
  }));
}

module.exports = {
  createTableConfig,
  generateResultTable,
  getResultTable,
  getClassAggregateReadiness,
  listResultTableReferenceData,
  listResultTables,
  listMyPublishedResultTables,
  listTableConfigs,
  listTableTemplates,
  publishResultTable,
  ensureResultTableReferenceData,
  seedResultTableReferenceData
};
