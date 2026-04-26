require('dotenv').config();
const mongoose = require('mongoose');

const Course = require('../models/Course');
const SchoolClass = require('../models/SchoolClass');
const Quiz = require('../models/Quiz');
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

function getRowLabel(type, row) {
  if (type === 'quizzes') return String(row.subject || '').trim();
  return String(row.title || '').trim();
}

async function run() {
  const dryRun = process.argv.includes('--dry-run');
  await mongoose.connect(getMongoUri());

  try {
    const [courses, schoolClasses] = await Promise.all([
      Course.find({}).select('_id kind schoolClassRef title').lean(),
      SchoolClass.find({}).select('_id legacyCourseId title code').lean()
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

    const collections = [
      { key: 'quizzes', Model: Quiz },
      { key: 'recordings', Model: VirtualRecording }
    ];

    const summary = {
      dryRun,
      scanned: 0,
      updated: 0,
      classIdBackfilled: 0,
      courseSynced: 0,
      skippedPublicCourse: 0,
      unresolved: 0,
      unresolvedItems: [],
      collections: {}
    };

    for (const config of collections) {
      const rows = await config.Model.find({}).sort({ createdAt: 1, _id: 1 });
      summary.collections[config.key] = {
        scanned: rows.length,
        updated: 0,
        classIdBackfilled: 0,
        courseSynced: 0,
        skippedPublicCourse: 0,
        unresolved: 0
      };

      for (const row of rows) {
        summary.scanned += 1;

        const course = row.course ? courseById.get(String(row.course)) || null : null;
        const currentClass = row.classId ? classById.get(String(row.classId)) || null : null;
        const mappedClassId = (
          currentClass?._id
          || (row.course ? classIdByCourseId.get(String(row.course)) : '')
          || (course?.schoolClassRef ? String(course.schoolClassRef) : '')
        );
        const schoolClass = mappedClassId ? classById.get(String(mappedClassId)) || null : null;
        const expectsClassRef = !!row.classId || normalize(course?.kind) === 'academic_class';

        if (!schoolClass) {
          if (!expectsClassRef) {
            summary.skippedPublicCourse += 1;
            summary.collections[config.key].skippedPublicCourse += 1;
            continue;
          }

          summary.unresolved += 1;
          summary.collections[config.key].unresolved += 1;
          if (summary.unresolvedItems.length < 25) {
            summary.unresolvedItems.push({
              type: config.key,
              id: String(row._id),
              label: getRowLabel(config.key, row),
              classId: String(row.classId || ''),
              courseId: String(row.course || '')
            });
          }
          continue;
        }

        const compatCourseId = compatCourseIdByClassId.get(String(schoolClass._id)) || '';
        let changed = false;

        if (!idsEqual(row.classId, schoolClass._id)) {
          row.classId = schoolClass._id;
          summary.classIdBackfilled += 1;
          summary.collections[config.key].classIdBackfilled += 1;
          changed = true;
        }

        if (compatCourseId && !idsEqual(row.course, compatCourseId)) {
          row.course = compatCourseId;
          summary.courseSynced += 1;
          summary.collections[config.key].courseSynced += 1;
          changed = true;
        }

        if (changed) {
          summary.updated += 1;
          summary.collections[config.key].updated += 1;
          if (!dryRun) {
            await row.save();
          }
        }
      }
    }

    console.log(JSON.stringify(summary, null, 2));
  } finally {
    await mongoose.disconnect();
  }
}

run().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
