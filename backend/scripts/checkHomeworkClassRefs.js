require('dotenv').config();
const mongoose = require('mongoose');

const Course = require('../models/Course');
const Homework = require('../models/Homework');
const HomeworkSubmission = require('../models/HomeworkSubmission');
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
    type: row.type,
    id: String(row._id || ''),
    label: String(row.label || ''),
    detail: detail || ''
  });
}

async function run() {
  await mongoose.connect(getMongoUri());

  try {
    const [courses, schoolClasses, homeworks, submissions] = await Promise.all([
      Course.find({}).select('_id schoolClassRef title').lean(),
      SchoolClass.find({}).select('_id legacyCourseId title code').lean(),
      Homework.find({}).select('course classId title createdAt').lean(),
      HomeworkSubmission.find({}).select('homework course classId student createdAt').lean()
    ]);

    const courseById = new Map();
    const classById = new Map();
    const classIdByCourseId = new Map();
    const compatCourseIdByClassId = new Map();
    const homeworkById = new Map(homeworks.map((item) => [String(item._id), item]));

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

    for (const row of homeworks) {
      const currentClass = row.classId ? classById.get(String(row.classId)) || null : null;
      const course = row.course ? courseById.get(String(row.course)) || null : null;
      const mappedClassId = currentClass?._id || classIdByCourseId.get(String(row.course || '')) || '';
      const resolvedClass = mappedClassId ? classById.get(String(mappedClassId)) || null : null;
      const compatCourseId = resolvedClass ? compatCourseIdByClassId.get(String(resolvedClass._id)) || '' : '';
      const descriptor = { ...row, type: 'homeworks', label: String(row.title || '') };

      if (!row.classId) {
        push(issues, 'homework_missing_class_id', descriptor, `course=${String(row.course || '')}`);
      }
      if (row.classId && !currentClass) {
        push(issues, 'homework_class_missing', descriptor, `classId=${String(row.classId)}`);
      }
      if (row.course && !course) {
        push(issues, 'homework_course_missing', descriptor, `course=${String(row.course)}`);
      }
      if (!resolvedClass) {
        push(issues, 'homework_unresolved_class_mapping', descriptor, `course=${String(row.course || '')}`);
        continue;
      }
      if (row.classId && !idsEqual(row.classId, resolvedClass._id)) {
        push(issues, 'homework_class_mismatch', descriptor, `stored=${String(row.classId)} expected=${String(resolvedClass._id)}`);
      }
      if (compatCourseId && row.course && !idsEqual(row.course, compatCourseId)) {
        push(issues, 'homework_compat_course_mismatch', descriptor, `stored=${String(row.course)} expected=${compatCourseId}`);
      }
      if (compatCourseId && !row.course) {
        push(warnings, 'homework_missing_compat_course', descriptor, `expected=${compatCourseId}`);
      }
    }

    for (const row of submissions) {
      const linkedHomework = homeworkById.get(String(row.homework || '')) || null;
      const currentClass = row.classId ? classById.get(String(row.classId)) || null : null;
      const mappedClassId = (
        linkedHomework?.classId
        || currentClass?._id
        || classIdByCourseId.get(String(row.course || ''))
        || classIdByCourseId.get(String(linkedHomework?.course || ''))
        || ''
      );
      const resolvedClass = mappedClassId ? classById.get(String(mappedClassId)) || null : null;
      const compatCourseId = resolvedClass ? compatCourseIdByClassId.get(String(resolvedClass._id)) || '' : '';
      const descriptor = { ...row, type: 'submissions', label: String(row.student || '') };

      if (!linkedHomework) {
        push(issues, 'submission_homework_missing', descriptor, `homework=${String(row.homework || '')}`);
      }
      if (!row.classId) {
        push(issues, 'submission_missing_class_id', descriptor, `course=${String(row.course || '')}`);
      }
      if (row.classId && !currentClass) {
        push(issues, 'submission_class_missing', descriptor, `classId=${String(row.classId)}`);
      }
      if (!resolvedClass) {
        push(issues, 'submission_unresolved_class_mapping', descriptor, `course=${String(row.course || '')}`);
        continue;
      }
      if (row.classId && !idsEqual(row.classId, resolvedClass._id)) {
        push(issues, 'submission_class_mismatch', descriptor, `stored=${String(row.classId)} expected=${String(resolvedClass._id)}`);
      }
      if (compatCourseId && row.course && !idsEqual(row.course, compatCourseId) && !idsEqual(row.course, linkedHomework?.course)) {
        push(issues, 'submission_compat_course_mismatch', descriptor, `stored=${String(row.course)} expected=${compatCourseId}`);
      }
      if (compatCourseId && !row.course) {
        push(warnings, 'submission_missing_compat_course', descriptor, `expected=${compatCourseId}`);
      }
    }

    const summary = {
      homeworks: homeworks.length,
      submissions: submissions.length,
      issues: issues.length,
      warnings: warnings.length
    };

    console.log(`[check:homework-class-refs] ${JSON.stringify(summary)}`);

    if (issues.length) {
      console.log('[check:homework-class-refs] first issues:');
      issues.slice(0, 20).forEach((item) => {
        console.log(` - ${item.code}: ${item.type}:${item.id} ${item.label} ${item.detail}`.trim());
      });
      process.exitCode = 1;
      return;
    }

    if (warnings.length) {
      console.log('[check:homework-class-refs] first warnings:');
      warnings.slice(0, 20).forEach((item) => {
        console.log(` - ${item.code}: ${item.type}:${item.id} ${item.label} ${item.detail}`.trim());
      });
    }

    console.log('[check:homework-class-refs] ok');
  } finally {
    await mongoose.disconnect();
  }
}

run().catch((error) => {
  console.error('[check:homework-class-refs] failed:', error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
