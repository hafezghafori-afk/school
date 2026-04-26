require('dotenv').config();
const mongoose = require('mongoose');

const AcademicYear = require('../models/AcademicYear');
const AcademicTerm = require('../models/AcademicTerm');
const SchoolClass = require('../models/SchoolClass');
const Subject = require('../models/Subject');
const TeacherAssignment = require('../models/TeacherAssignment');
const ExamType = require('../models/ExamType');
const {
  bootstrapExamSession,
  previewExamSessionBootstrap
} = require('../services/examEngineService');

function parseArgs(argv = []) {
  const options = {
    apply: false,
    initializeRoster: true,
    allowEmptyRoster: false,
    actorUserId: ''
  };

  for (const raw of argv) {
    const arg = String(raw || '').trim();
    if (!arg) continue;
    if (arg === '--apply') {
      options.apply = true;
      continue;
    }
    if (arg === '--skip-roster' || arg === '--no-roster') {
      options.initializeRoster = false;
      continue;
    }
    if (arg === '--allow-empty-roster') {
      options.allowEmptyRoster = true;
      continue;
    }
    if (!arg.startsWith('--')) continue;

    const eqIndex = arg.indexOf('=');
    const key = eqIndex >= 0 ? arg.slice(2, eqIndex) : arg.slice(2);
    const value = eqIndex >= 0 ? arg.slice(eqIndex + 1) : 'true';
    switch (key) {
      case 'year':
      case 'academic-year':
        options.academicYear = value;
        break;
      case 'period':
      case 'term':
      case 'assessment-period':
        options.assessmentPeriod = value;
        break;
      case 'class':
      case 'school-class':
        options.schoolClass = value;
        break;
      case 'subject':
        options.subject = value;
        break;
      case 'teacher-assignment':
        options.teacherAssignment = value;
        break;
      case 'exam-type':
        options.examType = value;
        break;
      case 'ranking-rule':
        options.rankingRule = value;
        break;
      case 'actor':
        options.actorUserId = value;
        break;
      case 'title':
        options.title = value;
        break;
      case 'code':
        options.code = value;
        break;
      case 'status':
        options.status = value;
        break;
      case 'note':
        options.note = value;
        break;
      case 'held-at':
        options.heldAt = value;
        break;
      case 'published-at':
        options.publishedAt = value;
        break;
      case 'total-mark':
        options.totalMark = Number(value);
        break;
      case 'pass-mark':
        options.passMark = Number(value);
        break;
      case 'conditional-mark':
        options.conditionalMark = Number(value);
        break;
      case 'weight':
        options.weight = Number(value);
        break;
      default:
        break;
    }
  }

  return options;
}

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeLower(value) {
  return normalizeText(value).toLowerCase();
}

function isObjectId(value) {
  return mongoose.Types.ObjectId.isValid(value);
}

async function resolveBySelector(model, selector, choices = {}) {
  const normalized = normalizeText(selector);
  const baseQuery = choices.baseQuery || {};
  const sort = choices.sort || null;
  const directFields = Array.isArray(choices.directFields) ? choices.directFields : [];
  const customMatcher = typeof choices.customMatcher === 'function' ? choices.customMatcher : null;

  if (!normalized) {
    let query = model.findOne(baseQuery);
    if (sort) query = query.sort(sort);
    return query;
  }

  if (isObjectId(normalized)) {
    const byId = await model.findOne({ ...baseQuery, _id: normalized });
    if (byId) return byId;
  }

  const docs = await model.find(baseQuery).sort(sort || {}).limit(200);
  const selectorLower = normalizeLower(normalized);
  return docs.find((doc) => {
    if (!doc) return false;
    if (customMatcher && customMatcher(doc, selectorLower, normalized)) return true;
    return directFields.some((field) => normalizeLower(doc[field]) === selectorLower);
  }) || null;
}

function formatRef(doc, fields = []) {
  if (!doc) return null;
  const item = { id: String(doc._id) };
  for (const field of fields) {
    item[field] = doc[field] || '';
  }
  return item;
}

async function resolveBootstrapContext(options) {
  const academicYear = await resolveBySelector(AcademicYear, options.academicYear, {
    baseQuery: {},
    sort: { isActive: -1, sequence: -1, createdAt: -1 },
    directFields: ['code', 'title']
  });
  if (!academicYear) throw new Error('bootstrap_year_not_found');

  const defaultTeacherAssignment = await TeacherAssignment.findOne({
    academicYearId: academicYear._id,
    status: 'active'
  }).sort({ isPrimary: -1, createdAt: 1 });

  const schoolClass = await resolveBySelector(SchoolClass, options.schoolClass, {
    baseQuery: { academicYearId: academicYear._id, status: { $ne: 'archived' } },
    sort: { status: 1, gradeLevel: 1, section: 1, title: 1 },
    directFields: ['code', 'title', 'gradeLevel', 'section'],
    customMatcher: (doc, selectorLower) => {
      const sectionPart = normalizeLower(doc.section);
      const title = normalizeLower(doc.title);
      const composite = `${normalizeLower(doc.gradeLevel)} ${sectionPart}`.trim();
      return title === selectorLower || composite === selectorLower;
    }
  }) || (defaultTeacherAssignment?.classId
    ? await SchoolClass.findById(defaultTeacherAssignment.classId)
    : null);
  if (!schoolClass) throw new Error('bootstrap_class_not_found');

  const examType = await resolveBySelector(ExamType, options.examType, {
    baseQuery: { isActive: true },
    sort: { code: 1, title: 1 },
    directFields: ['code', 'title'],
    customMatcher: (doc, selectorLower) => normalizeLower(doc.category) === selectorLower
  }) || await ExamType.findOne({ isActive: true, code: 'ANNUAL' });
  if (!examType) throw new Error('bootstrap_exam_type_not_found');

  const assessmentPeriod = await resolveBySelector(AcademicTerm, options.assessmentPeriod, {
    baseQuery: { academicYearId: academicYear._id },
    sort: { isActive: -1, sequence: 1, createdAt: 1 },
    directFields: ['code', 'title']
  });
  if (!assessmentPeriod) throw new Error('bootstrap_assessment_period_not_found');

  const teacherAssignment = await resolveBySelector(TeacherAssignment, options.teacherAssignment, {
    baseQuery: {
      academicYearId: academicYear._id,
      classId: schoolClass._id,
      status: 'active'
    },
    sort: { isPrimary: -1, createdAt: 1 },
    directFields: [],
    customMatcher: (doc, selectorLower, selectorRaw) => String(doc._id) === selectorRaw
  }) || defaultTeacherAssignment || null;

  let subject = null;
  if (teacherAssignment?.subjectId) {
    subject = await Subject.findById(teacherAssignment.subjectId);
  }
  if (!subject) {
    subject = await resolveBySelector(Subject, options.subject, {
      baseQuery: { isActive: true },
      sort: { name: 1 },
      directFields: ['code', 'name', 'grade']
    });
  }

  const payload = {
    academicYearId: String(academicYear._id),
    assessmentPeriodId: String(assessmentPeriod._id),
    classId: String(schoolClass._id),
    examTypeId: String(examType._id),
    initializeRoster: options.initializeRoster,
    title: normalizeText(options.title),
    code: normalizeText(options.code),
    status: normalizeText(options.status),
    note: normalizeText(options.note),
    heldAt: normalizeText(options.heldAt),
    publishedAt: normalizeText(options.publishedAt),
    totalMark: Number.isFinite(options.totalMark) ? options.totalMark : undefined,
    passMark: Number.isFinite(options.passMark) ? options.passMark : undefined,
    conditionalMark: Number.isFinite(options.conditionalMark) ? options.conditionalMark : undefined,
    weight: Number.isFinite(options.weight) ? options.weight : undefined
  };

  if (subject?._id) payload.subjectId = String(subject._id);
  if (teacherAssignment?._id) payload.teacherAssignmentId = String(teacherAssignment._id);
  if (options.rankingRule) payload.rankingRuleId = normalizeText(options.rankingRule);

  Object.keys(payload).forEach((key) => {
    if (payload[key] === '' || payload[key] === undefined) delete payload[key];
  });

  return {
    payload,
    selection: {
      academicYear: formatRef(academicYear, ['title', 'code', 'status']),
      assessmentPeriod: formatRef(assessmentPeriod, ['title', 'code', 'termType']),
      schoolClass: formatRef(schoolClass, ['title', 'code', 'gradeLevel', 'section', 'status']),
      examType: formatRef(examType, ['title', 'code', 'category']),
      subject: formatRef(subject, ['name', 'code', 'grade']),
      teacherAssignment: teacherAssignment
        ? {
            id: String(teacherAssignment._id),
            assignmentType: teacherAssignment.assignmentType,
            status: teacherAssignment.status,
            subjectId: teacherAssignment.subjectId ? String(teacherAssignment.subjectId) : '',
            classId: teacherAssignment.classId ? String(teacherAssignment.classId) : ''
          }
        : null
    }
  };
}

async function run() {
  const options = parseArgs(process.argv.slice(2));
  const mongoUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/school_db';

  await mongoose.connect(mongoUri);
  const context = await resolveBootstrapContext(options);
  const preview = await previewExamSessionBootstrap(context.payload);

  const response = {
    mode: options.apply ? 'apply' : 'preview',
    selection: context.selection,
    payload: context.payload,
    preview
  };

  if (options.apply) {
    const allowWithoutRoster = options.allowEmptyRoster || options.initializeRoster === false;
    if (!preview.canBootstrap && !allowWithoutRoster) {
      throw new Error('exam_session_bootstrap_not_ready');
    }
    response.created = await bootstrapExamSession(context.payload, normalizeText(options.actorUserId) || null);
  }

  console.log(JSON.stringify(response, null, 2));
}

run()
  .catch((error) => {
    console.error(error && error.stack ? error.stack : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
