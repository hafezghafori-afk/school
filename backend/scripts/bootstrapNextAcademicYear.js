require('dotenv').config();
const mongoose = require('mongoose');

const AcademicYear = require('../models/AcademicYear');
const SchoolClass = require('../models/SchoolClass');
const Course = require('../models/Course');

function parseArgs(argv = []) {
  const options = {
    apply: false,
    sourceYear: '',
    targetCode: '',
    targetTitle: '',
    targetSequence: null
  };

  for (const raw of argv) {
    const arg = String(raw || '').trim();
    if (!arg) continue;
    if (arg === '--apply') {
      options.apply = true;
      continue;
    }
    if (!arg.startsWith('--')) continue;
    const eqIndex = arg.indexOf('=');
    const key = eqIndex >= 0 ? arg.slice(2, eqIndex) : arg.slice(2);
    const value = eqIndex >= 0 ? arg.slice(eqIndex + 1) : 'true';

    if (key === 'source-year') options.sourceYear = value;
    else if (key === 'target-code') options.targetCode = value;
    else if (key === 'target-title') options.targetTitle = value;
    else if (key === 'target-sequence') options.targetSequence = Number(value);
  }

  return options;
}

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function inferNextYearLabel(sourceYear) {
  const sourceCode = normalizeText(sourceYear?.code);
  const sourceTitle = normalizeText(sourceYear?.title);
  const numericCode = /^\d+$/.test(sourceCode) ? Number(sourceCode) : null;
  const numericTitle = /^\d+$/.test(sourceTitle) ? Number(sourceTitle) : null;
  const nextValue = numericCode != null ? numericCode + 1 : numericTitle != null ? numericTitle + 1 : null;
  if (nextValue == null) {
    return {
      code: sourceCode ? `${sourceCode}-next` : '',
      title: sourceTitle ? `${sourceTitle} next` : 'Next Academic Year'
    };
  }
  return {
    code: String(nextValue),
    title: String(nextValue)
  };
}

async function resolveSourceYear(selector) {
  const normalized = normalizeText(selector);
  if (!normalized) {
    return AcademicYear.findOne({ isActive: true }).sort({ sequence: -1, createdAt: -1 });
  }

  if (mongoose.isValidObjectId(normalized)) {
    const byId = await AcademicYear.findById(normalized);
    if (byId) return byId;
  }

  const years = await AcademicYear.find({}).sort({ isActive: -1, sequence: 1, createdAt: 1 });
  return years.find((item) => normalizeText(item.code) === normalized || normalizeText(item.title) === normalized) || null;
}

async function buildPlan(options) {
  const sourceYear = await resolveSourceYear(options.sourceYear);
  if (!sourceYear) throw new Error('academic_year_source_not_found');

  const inferred = inferNextYearLabel(sourceYear);
  const targetCode = normalizeText(options.targetCode) || inferred.code;
  const targetTitle = normalizeText(options.targetTitle) || inferred.title;
  const years = await AcademicYear.find({}).sort({ sequence: -1, createdAt: -1 });
  const maxSequence = years.reduce((max, item) => Math.max(max, Number(item.sequence || 0)), 0);
  const targetSequence = Number.isFinite(options.targetSequence) ? options.targetSequence : Math.max(Number(sourceYear.sequence || 0), maxSequence) + 1;

  const existingTargetYear = await AcademicYear.findOne({
    $or: [{ code: targetCode }, { title: targetTitle }]
  });

  const sourceClasses = await SchoolClass.find({
    academicYearId: sourceYear._id,
    status: { $ne: 'archived' }
  }).sort({ title: 1, createdAt: 1 });

  const sourceCourses = await Course.find({
    academicYearRef: sourceYear._id,
    kind: 'academic_class'
  }).sort({ title: 1, createdAt: 1 });

  const courseByClassId = new Map();
  sourceCourses.forEach((course) => {
    const classId = String(course.schoolClassRef || '');
    if (classId) courseByClassId.set(classId, course);
  });

  const classPlans = [];
  for (const sourceClass of sourceClasses) {
    const existingTargetClass = existingTargetYear
      ? await SchoolClass.findOne({
          academicYearId: existingTargetYear._id,
          title: sourceClass.title,
          gradeLevel: sourceClass.gradeLevel,
          section: sourceClass.section
        }).sort({ createdAt: 1 })
      : null;
    const sourceCourse = courseByClassId.get(String(sourceClass._id)) || null;
    const existingTargetCourse = existingTargetClass
      ? await Course.findOne({ schoolClassRef: existingTargetClass._id, kind: 'academic_class' }).sort({ createdAt: 1 })
      : null;

    classPlans.push({
      sourceClass,
      sourceCourse,
      existingTargetClass,
      existingTargetCourse
    });
  }

  return {
    sourceYear,
    targetYear: existingTargetYear || {
      _id: null,
      code: targetCode,
      title: targetTitle,
      sequence: targetSequence,
      status: 'planning',
      isActive: false
    },
    targetYearExists: !!existingTargetYear,
    classPlans
  };
}

function serializePlan(plan) {
  return {
    sourceYear: {
      id: String(plan.sourceYear._id),
      code: normalizeText(plan.sourceYear.code),
      title: normalizeText(plan.sourceYear.title),
      sequence: Number(plan.sourceYear.sequence || 0),
      status: normalizeText(plan.sourceYear.status),
      isActive: !!plan.sourceYear.isActive
    },
    targetYear: {
      id: plan.targetYear?._id ? String(plan.targetYear._id) : '',
      code: normalizeText(plan.targetYear.code),
      title: normalizeText(plan.targetYear.title),
      sequence: Number(plan.targetYear.sequence || 0),
      status: normalizeText(plan.targetYear.status),
      isActive: !!plan.targetYear.isActive,
      exists: !!plan.targetYearExists
    },
    summary: {
      sourceClasses: plan.classPlans.length,
      sourceCourses: plan.classPlans.filter((item) => !!item.sourceCourse).length,
      targetClassesExisting: plan.classPlans.filter((item) => !!item.existingTargetClass).length,
      targetCoursesExisting: plan.classPlans.filter((item) => !!item.existingTargetCourse).length,
      targetClassesToCreate: plan.classPlans.filter((item) => !item.existingTargetClass).length,
      targetCoursesToCreate: plan.classPlans.filter((item) => !item.existingTargetCourse).length
    },
    items: plan.classPlans.map((item) => ({
      sourceClass: {
        id: String(item.sourceClass._id),
        title: normalizeText(item.sourceClass.title),
        gradeLevel: normalizeText(item.sourceClass.gradeLevel),
        section: normalizeText(item.sourceClass.section),
        status: normalizeText(item.sourceClass.status)
      },
      sourceCourse: item.sourceCourse ? {
        id: String(item.sourceCourse._id),
        title: normalizeText(item.sourceCourse.title),
        isActive: !!item.sourceCourse.isActive
      } : null,
      targetClass: item.existingTargetClass ? {
        id: String(item.existingTargetClass._id),
        title: normalizeText(item.existingTargetClass.title),
        status: normalizeText(item.existingTargetClass.status),
        exists: true
      } : {
        id: '',
        title: normalizeText(item.sourceClass.title),
        status: 'draft',
        exists: false
      },
      targetCourse: item.existingTargetCourse ? {
        id: String(item.existingTargetCourse._id),
        title: normalizeText(item.existingTargetCourse.title),
        isActive: !!item.existingTargetCourse.isActive,
        exists: true
      } : {
        id: '',
        title: normalizeText(item.sourceCourse?.title || item.sourceClass.title),
        isActive: false,
        exists: false
      }
    }))
  };
}

async function applyPlan(plan) {
  let targetYear = plan.targetYearExists
    ? await AcademicYear.findById(plan.targetYear._id)
    : null;

  if (!targetYear) {
    targetYear = await AcademicYear.create({
      code: normalizeText(plan.targetYear.code),
      title: normalizeText(plan.targetYear.title),
      sequence: Number(plan.targetYear.sequence || 0),
      status: 'planning',
      isActive: false,
      note: `Bootstrapped from ${normalizeText(plan.sourceYear.title) || normalizeText(plan.sourceYear.code)}`
    });
  }

  const applied = {
    targetYearId: String(targetYear._id),
    createdClasses: 0,
    reusedClasses: 0,
    createdCourses: 0,
    reusedCourses: 0,
    items: []
  };

  for (const item of plan.classPlans) {
    let targetClass = item.existingTargetClass
      ? await SchoolClass.findById(item.existingTargetClass._id)
      : null;

    if (!targetClass) {
      targetClass = await SchoolClass.create({
        title: item.sourceClass.title,
        code: item.sourceClass.code,
        academicYearId: targetYear._id,
        legacyCourseId: null,
        gradeLevel: item.sourceClass.gradeLevel,
        section: item.sourceClass.section,
        shift: item.sourceClass.shift,
        room: item.sourceClass.room,
        status: 'draft',
        homeroomTeacherUserId: item.sourceClass.homeroomTeacherUserId || null,
        note: `Bootstrapped from ${item.sourceClass.title} (${normalizeText(plan.sourceYear.title)})`
      });
      applied.createdClasses += 1;
    } else {
      applied.reusedClasses += 1;
    }

    let targetCourse = item.existingTargetCourse
      ? await Course.findById(item.existingTargetCourse._id)
      : null;

    if (!targetCourse) {
      targetCourse = await Course.create({
        title: item.sourceCourse?.title || item.sourceClass.title,
        description: item.sourceCourse?.description || '',
        price: Number(item.sourceCourse?.price || 0),
        category: item.sourceCourse?.category || item.sourceClass.gradeLevel || '',
        level: item.sourceCourse?.level || '',
        tags: Array.isArray(item.sourceCourse?.tags) ? item.sourceCourse.tags : [],
        kind: 'academic_class',
        academicYearRef: targetYear._id,
        schoolClassRef: targetClass._id,
        gradeLevel: item.sourceCourse?.gradeLevel || item.sourceClass.gradeLevel || '',
        section: item.sourceCourse?.section || item.sourceClass.section || '',
        homeroomInstructor: item.sourceCourse?.homeroomInstructor || item.sourceClass.homeroomTeacherUserId || null,
        isActive: false,
        videoUrl: item.sourceCourse?.videoUrl || '',
        pdfUrl: item.sourceCourse?.pdfUrl || ''
      });
      applied.createdCourses += 1;
    } else {
      applied.reusedCourses += 1;
    }

    if (!targetClass.legacyCourseId || String(targetClass.legacyCourseId) !== String(targetCourse._id)) {
      targetClass.legacyCourseId = targetCourse._id;
      await targetClass.save();
    }

    applied.items.push({
      sourceClassId: String(item.sourceClass._id),
      targetClassId: String(targetClass._id),
      targetCourseId: String(targetCourse._id)
    });
  }

  return applied;
}

async function run() {
  const options = parseArgs(process.argv.slice(2));
  const mongoUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/school_db';
  await mongoose.connect(mongoUri);

  const plan = await buildPlan(options);
  const response = {
    mode: options.apply ? 'apply' : 'preview',
    plan: serializePlan(plan)
  };

  if (options.apply) {
    response.applied = await applyPlan(plan);
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
