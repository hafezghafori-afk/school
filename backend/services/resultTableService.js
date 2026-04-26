require('../models/AcademicYear');
require('../models/AcademicTerm');
require('../models/SchoolClass');
require('../models/Subject');
require('../models/StudentMembership');
require('../models/User');

const SiteSettings = require('../models/SiteSettings');
const TableTemplate = require('../models/TableTemplate');
const TableConfig = require('../models/TableConfig');
const ResultTable = require('../models/ResultTable');
const ResultTableRow = require('../models/ResultTableRow');
const ExamSession = require('../models/ExamSession');
const ExamResult = require('../models/ExamResult');

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
    resultStatus: normalizeText(item.resultStatus),
    groupLabel: normalizeText(item.groupLabel),
    rank: item.rank == null ? null : Number(item.rank),
    obtainedMark: Number(item.obtainedMark || 0),
    totalMark: Number(item.totalMark || 0),
    percentage: Number(item.percentage || 0),
    averageMark: Number(item.averageMark || 0),
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
    templateType: normalizeText(item.templateType),
    orientation: normalizeText(item.orientation),
    status: normalizeText(item.status),
    rowCount: Number(item.rowCount || 0),
    stats: item.stats || {},
    headerText: normalizeText(item.headerText),
    footerText: normalizeText(item.footerText),
    logoUrl: normalizeText(item.logoUrl),
    generatedAt: item.generatedAt || null,
    publishedAt: item.publishedAt || null,
    template: formatTemplate(item.templateId),
    config: formatConfig(item.configId),
    session: formatSession(item.sessionId),
    rows: rows.map(formatRow).filter(Boolean)
  };
}
function buildTemplateSeedData() {
  return [
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
    name: 'Default Result Table Config',
    code: 'DEFAULT-RESULT-TABLE',
    fontFamily: 'Tahoma',
    fontSize: 12,
    orientation: 'landscape',
    logoMode: 'site',
    headerText: 'مکتب - سیستم نتایج',
    footerText: 'این جدول از موتور مشترک نتایج تولید شده است.',
    showHeader: true,
    showFooter: true,
    showLogo: true,
    showPageNumber: true,
    showGeneratedAt: true,
    isDefault: true,
    isActive: true
  };
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
  const settings = await SiteSettings.findOne({}).select('logoUrl').lean();
  return normalizeText(settings?.logoUrl);
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
    averagePercentage: 0
  };

  const recorded = [];
  results.forEach((result) => {
    const status = normalizeText(result.resultStatus);
    if (Object.prototype.hasOwnProperty.call(stats, status)) {
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
  const [templates, configs, sessions] = await Promise.all([
    TableTemplate.find({ isActive: true }).sort({ createdAt: 1 }),
    TableConfig.find({ isActive: true }).sort({ isDefault: -1, createdAt: 1 }),
    ExamSession.find({ status: { $in: ['active', 'closed', 'published'] } })
      .populate('examTypeId', 'title code')
      .populate('academicYearId', 'title code')
      .populate('assessmentPeriodId', 'title code')
      .populate('classId', 'title code')
      .populate('subjectId', 'name code')
      .sort({ heldAt: -1, createdAt: -1 })
  ]);

  return {
    templates: templates.map(formatTemplate),
    configs: configs.map(formatConfig),
    sessions: sessions.map(formatSession)
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

async function resolveGenerationContext({ templateId, configId, sessionId }) {
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
  if (template.rowMode !== 'cover' && !session) throw new Error('result_table_session_required');
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
    return {
      serialNo: index + 1,
      rowType: 'student',
      examResultId: result._id,
      studentMembershipId: result.studentMembershipId?._id || result.studentMembershipId || null,
      studentId: result.studentId?._id || result.studentId || null,
      student: result.student?._id || result.student || null,
      displayName,
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
        obtainedMark: Number(result.obtainedMark || 0),
        totalMark: Number(result.totalMark || 0),
        percentage: Number(result.percentage || 0),
        averageMark: Number(result.averageMark || 0),
        resultStatus: normalizeText(result.resultStatus),
        groupLabel: normalizeText(result.groupLabel),
        rank: result.rank == null ? '' : Number(result.rank)
      }
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

async function generateResultTable({ templateId, configId = null, sessionId = null, note = '' } = {}, actorUserId = null) {
  const { template, config, session } = await resolveGenerationContext({ templateId, configId, sessionId });
  const rows = await buildGeneratedRows({ template, session });
  const statsSource = rows.filter((item) => item.rowType === 'student').map((item) => ({ resultStatus: item.resultStatus, percentage: item.percentage }));
  const logoUrl = await getEffectiveLogoUrl(config);

  const table = await ResultTable.create({
    title: session ? `${template.title} - ${session.title}` : template.title,
    code: buildTableCode(template, session),
    templateId: template._id,
    configId: config?._id || null,
    sessionId: session?._id || null,
    examTypeId: session?.examTypeId?._id || session?.examTypeId || null,
    academicYearId: session?.academicYearId?._id || session?.academicYearId || null,
    assessmentPeriodId: session?.assessmentPeriodId?._id || session?.assessmentPeriodId || null,
    classId: session?.classId?._id || session?.classId || null,
    subjectId: session?.subjectId?._id || session?.subjectId || null,
    templateType: template.templateType,
    orientation: config?.orientation || template.defaultOrientation || 'landscape',
    status: 'generated',
    rowCount: rows.length,
    stats: buildResultStats(statsSource),
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
  if (filters.assessmentPeriodId) query.assessmentPeriodId = filters.assessmentPeriodId;
  if (filters.status) query.status = normalizeText(filters.status);

  const items = await ResultTable.find(query)
    .populate('templateId')
    .populate('configId')
    .populate({ path: 'sessionId', populate: ['examTypeId', 'academicYearId', 'assessmentPeriodId', 'classId', 'subjectId'] })
    .sort({ generatedAt: -1, createdAt: -1 });

  return items.map((item) => formatTable(item));
}

async function getResultTable(tableId) {
  const table = await ResultTable.findById(tableId)
    .populate('templateId')
    .populate('configId')
    .populate({ path: 'sessionId', populate: ['examTypeId', 'academicYearId', 'assessmentPeriodId', 'classId', 'subjectId'] });
  if (!table) return null;

  const rows = await ResultTableRow.find({ tableId }).sort({ serialNo: 1, createdAt: 1 });
  return formatTable(table, rows);
}

module.exports = {
  createTableConfig,
  generateResultTable,
  getResultTable,
  listResultTableReferenceData,
  listResultTables,
  listTableConfigs,
  listTableTemplates,
  publishResultTable,
  seedResultTableReferenceData
};
