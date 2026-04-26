require('dotenv').config();
const mongoose = require('mongoose');

const Course = require('../models/Course');
const Grade = require('../models/Grade');
const SchoolClass = require('../models/SchoolClass');

function idsEqual(left, right) {
  return String(left || '') === String(right || '');
}

function getMongoUri() {
  return process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/school_db';
}

async function run() {
  const dryRun = process.argv.includes('--dry-run');
  await mongoose.connect(getMongoUri());

  try {
    const [courses, schoolClasses, grades] = await Promise.all([
      Course.find({}).select('_id schoolClassRef title').lean(),
      SchoolClass.find({}).select('_id legacyCourseId title code').lean(),
      Grade.find({}).sort({ createdAt: 1, _id: 1 })
    ]);

    const classById = new Map();
    const classIdByCourseId = new Map();
    const compatCourseIdByClassId = new Map();

    courses.forEach((item) => {
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

    const summary = {
      dryRun,
      scanned: grades.length,
      updated: 0,
      classIdBackfilled: 0,
      courseSynced: 0,
      unresolved: 0,
      unresolvedItems: []
    };

    for (const row of grades) {
      const currentClass = row.classId ? classById.get(String(row.classId)) || null : null;
      const mappedClassId = currentClass?._id || classIdByCourseId.get(String(row.course || '')) || '';
      const resolvedClass = mappedClassId ? classById.get(String(mappedClassId)) || null : null;

      if (!resolvedClass) {
        summary.unresolved += 1;
        if (summary.unresolvedItems.length < 25) {
          summary.unresolvedItems.push({
            id: String(row._id),
            student: String(row.student || ''),
            classId: String(row.classId || ''),
            courseId: String(row.course || '')
          });
        }
        continue;
      }

      const compatCourseId = compatCourseIdByClassId.get(String(resolvedClass._id)) || '';
      let changed = false;

      if (!idsEqual(row.classId, resolvedClass._id)) {
        row.classId = resolvedClass._id;
        summary.classIdBackfilled += 1;
        changed = true;
      }

      if (compatCourseId && !idsEqual(row.course, compatCourseId)) {
        row.course = compatCourseId;
        summary.courseSynced += 1;
        changed = true;
      }

      if (changed) {
        summary.updated += 1;
        if (!dryRun) {
          await row.save();
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
