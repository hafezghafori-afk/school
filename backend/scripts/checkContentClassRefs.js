require('dotenv').config();
const mongoose = require('mongoose');

const Course = require('../models/Course');
const SchoolClass = require('../models/SchoolClass');
const Quiz = require('../models/Quiz');
const StudentMembership = require('../models/StudentMembership');
const VirtualRecording = require('../models/VirtualRecording');

function normalize(value) {
  return String(value || '').trim().toLowerCase();
}

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

function getRowLabel(type, row) {
  if (type === 'quizzes') return String(row.subject || '').trim();
  return String(row.title || '').trim();
}

async function run() {
  await mongoose.connect(getMongoUri());

  try {
    const [courses, schoolClasses, quizzes, recordings] = await Promise.all([
      Course.find({}).select('_id kind schoolClassRef title').lean(),
      SchoolClass.find({}).select('_id legacyCourseId title code').lean(),
      Quiz.find({}).select('course classId subject createdAt').lean(),
      VirtualRecording.find({}).select('course classId title createdAt').lean()
    ]);
    const currentMemberships = await StudentMembership.find({
      isCurrent: true,
      status: { $in: ['active', 'pending', 'suspended', 'transferred_in'] }
    }).select('student course classId status').lean();

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

    const rows = [
      ...quizzes.map((item) => ({ ...item, type: 'quizzes', label: getRowLabel('quizzes', item) })),
      ...recordings.map((item) => ({ ...item, type: 'recordings', label: getRowLabel('recordings', item) }))
    ];

    const issues = [];
    const warnings = [];

    for (const row of rows) {
      const course = row.course ? courseById.get(String(row.course)) || null : null;
      const currentClass = row.classId ? classById.get(String(row.classId)) || null : null;
      const mappedClassId = (
        currentClass?._id
        || (row.course ? classIdByCourseId.get(String(row.course)) : '')
        || (course?.schoolClassRef ? String(course.schoolClassRef) : '')
      );
      const resolvedClass = mappedClassId ? classById.get(String(mappedClassId)) || null : null;
      const expectsClassRef = !!row.classId || normalize(course?.kind) === 'academic_class';
      const compatCourseId = resolvedClass ? compatCourseIdByClassId.get(String(resolvedClass._id)) || '' : '';

      if (!row.classId && !row.course) {
        push(issues, 'content_missing_refs', row, 'row has neither classId nor course');
        continue;
      }

      if (row.course && !course) {
        push(issues, 'content_course_missing', row, `course=${String(row.course)}`);
      }

      if (!expectsClassRef) {
        continue;
      }

      if (!row.classId) {
        push(issues, 'content_missing_class_id', row, `course=${String(row.course || '')}`);
      }

      if (row.classId && !currentClass) {
        push(issues, 'content_class_missing', row, `classId=${String(row.classId)}`);
      }

      if (!resolvedClass) {
        push(issues, 'content_unresolved_class_mapping', row, `course=${String(row.course || '')}`);
        continue;
      }

      if (row.classId && !idsEqual(row.classId, resolvedClass._id)) {
        push(issues, 'content_class_mismatch', row, `stored=${String(row.classId)} expected=${String(resolvedClass._id)}`);
      }

      if (compatCourseId && row.course && !idsEqual(row.course, compatCourseId)) {
        push(issues, 'content_compat_course_mismatch', row, `stored=${String(row.course)} expected=${compatCourseId}`);
      }

      if (compatCourseId && !row.course) {
        push(warnings, 'content_missing_compat_course', row, `expected=${compatCourseId}`);
      }
    }

    for (const row of currentMemberships) {
      if (!row.classId) {
        push(issues, 'current_membership_missing_class_id', {
          type: 'memberships',
          _id: row._id,
          label: String(row.student || '')
        }, `course=${String(row.course || '')}`);
      }
    }

    const summary = {
      currentMemberships: currentMemberships.length,
      quizzes: quizzes.length,
      recordings: recordings.length,
      issues: issues.length,
      warnings: warnings.length
    };

    console.log(`[check:content-class-refs] ${JSON.stringify(summary)}`);

    if (issues.length) {
      console.log('[check:content-class-refs] first issues:');
      issues.slice(0, 20).forEach((item) => {
        console.log(` - ${item.code}: ${item.type}:${item.id} ${item.label} ${item.detail}`.trim());
      });
      process.exitCode = 1;
      return;
    }

    if (warnings.length) {
      console.log('[check:content-class-refs] first warnings:');
      warnings.slice(0, 20).forEach((item) => {
        console.log(` - ${item.code}: ${item.type}:${item.id} ${item.label} ${item.detail}`.trim());
      });
    }

    console.log('[check:content-class-refs] ok');
  } finally {
    await mongoose.disconnect();
  }
}

run().catch((error) => {
  console.error('[check:content-class-refs] failed:', error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
