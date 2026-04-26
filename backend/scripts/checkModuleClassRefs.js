require('dotenv').config();
const mongoose = require('mongoose');

const Course = require('../models/Course');
const ModuleModel = require('../models/Module');
const SchoolClass = require('../models/SchoolClass');

function idsEqual(left, right) {
  return String(left || '') === String(right || '');
}

function getMongoUri() {
  return process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/school_db';
}

function push(bucket, code, row, detail) {
  bucket.push({
    code,
    id: String(row._id || ''),
    label: String(row.title || ''),
    detail: detail || ''
  });
}

async function run() {
  await mongoose.connect(getMongoUri());

  try {
    const [courses, schoolClasses, modules] = await Promise.all([
      Course.find({}).select('_id schoolClassRef title').lean(),
      SchoolClass.find({}).select('_id legacyCourseId title code').lean(),
      ModuleModel.find({}).select('course classId title createdAt').lean()
    ]);

    const courseById = new Map();
    const classById = new Map();
    const classIdByCourseId = new Map();
    const compatCourseIdByClassId = new Map();

    courses.forEach((item) => {
      courseById.set(String(item._id), item);
      if (item.schoolClassRef) {
        classIdByCourseId.set(String(item._id), String(item.schoolClassRef));
        if (!compatCourseIdByClassId.has(String(item.schoolClassRef))) {
          compatCourseIdByClassId.set(String(item.schoolClassRef), String(item._id));
        }
      }
    });

    schoolClasses.forEach((item) => {
      classById.set(String(item._id), item);
      if (item.legacyCourseId) {
        classIdByCourseId.set(String(item.legacyCourseId), String(item._id));
        compatCourseIdByClassId.set(String(item._id), String(item.legacyCourseId));
      }
    });

    const issues = [];
    const warnings = [];

    for (const row of modules) {
      const currentClass = row.classId ? classById.get(String(row.classId)) || null : null;
      const currentCourse = row.course ? courseById.get(String(row.course)) || null : null;
      const mappedClassId = currentClass?._id || classIdByCourseId.get(String(row.course || '')) || '';
      const resolvedClass = mappedClassId ? classById.get(String(mappedClassId)) || null : null;
      const compatCourseId = resolvedClass ? compatCourseIdByClassId.get(String(resolvedClass._id)) || '' : '';

      if (!row.classId) {
        push(issues, 'module_missing_class_id', row, `course=${String(row.course || '')}`);
      }
      if (row.classId && !currentClass) {
        push(issues, 'module_class_missing', row, `classId=${String(row.classId)}`);
      }
      if (row.course && !currentCourse) {
        push(issues, 'module_course_missing', row, `course=${String(row.course)}`);
      }
      if (!resolvedClass) {
        push(issues, 'module_unresolved_class_mapping', row, `course=${String(row.course || '')}`);
        continue;
      }
      if (row.classId && !idsEqual(row.classId, resolvedClass._id)) {
        push(issues, 'module_class_mismatch', row, `stored=${String(row.classId)} expected=${String(resolvedClass._id)}`);
      }
      if (compatCourseId && row.course && !idsEqual(row.course, compatCourseId)) {
        push(issues, 'module_compat_course_mismatch', row, `stored=${String(row.course)} expected=${compatCourseId}`);
      }
      if (resolvedClass && !compatCourseId) {
        push(warnings, 'module_missing_compat_course_mapping', row, `classId=${String(resolvedClass._id)}`);
      }
    }

    const summary = {
      modules: modules.length,
      issues: issues.length,
      warnings: warnings.length
    };

    console.log(`[check:module-class-refs] ${JSON.stringify(summary)}`);

    if (issues.length) {
      console.log('[check:module-class-refs] first issues:');
      issues.slice(0, 20).forEach((item) => {
        console.log(` - ${item.code}: module:${item.id} ${item.label} ${item.detail}`.trim());
      });
      process.exitCode = 1;
      return;
    }

    if (warnings.length) {
      console.log('[check:module-class-refs] first warnings:');
      warnings.slice(0, 20).forEach((item) => {
        console.log(` - ${item.code}: module:${item.id} ${item.label} ${item.detail}`.trim());
      });
    }

    console.log('[check:module-class-refs] ok');
  } finally {
    await mongoose.disconnect();
  }
}

run().catch((error) => {
  console.error('[check:module-class-refs] failed:', error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
