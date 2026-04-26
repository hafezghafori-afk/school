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

function getHomeworkLabel(row) {
  return String(row.title || '').trim();
}

async function run() {
  const dryRun = process.argv.includes('--dry-run');
  await mongoose.connect(getMongoUri());

  try {
    const [courses, schoolClasses] = await Promise.all([
      Course.find({}).select('_id schoolClassRef title').lean(),
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

    const homeworkRows = await Homework.find({}).sort({ createdAt: 1, _id: 1 });
    const homeworkMap = new Map(homeworkRows.map((item) => [String(item._id), item]));

    const summary = {
      dryRun,
      scanned: {
        homeworks: homeworkRows.length,
        submissions: 0
      },
      updated: {
        homeworks: 0,
        submissions: 0
      },
      classIdBackfilled: {
        homeworks: 0,
        submissions: 0
      },
      courseSynced: {
        homeworks: 0,
        submissions: 0
      },
      unresolved: [],
      unresolvedCount: 0
    };

    for (const row of homeworkRows) {
      const storedClass = row.classId ? classById.get(String(row.classId)) || null : null;
      const mappedClassId = storedClass?._id || classIdByCourseId.get(String(row.course || '')) || '';
      const resolvedClass = mappedClassId ? classById.get(String(mappedClassId)) || null : null;

      if (!resolvedClass) {
        summary.unresolvedCount += 1;
        if (summary.unresolved.length < 25) {
          summary.unresolved.push({
            type: 'homeworks',
            id: String(row._id),
            label: getHomeworkLabel(row),
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
        summary.classIdBackfilled.homeworks += 1;
        changed = true;
      }

      if (compatCourseId && !idsEqual(row.course, compatCourseId)) {
        row.course = compatCourseId;
        summary.courseSynced.homeworks += 1;
        changed = true;
      }

      if (changed) {
        summary.updated.homeworks += 1;
        if (!dryRun) {
          await row.save();
        }
      }
    }

    const submissionRows = await HomeworkSubmission.find({}).sort({ createdAt: 1, _id: 1 });
    summary.scanned.submissions = submissionRows.length;

    for (const row of submissionRows) {
      const linkedHomework = homeworkMap.get(String(row.homework || '')) || null;
      const storedClass = row.classId ? classById.get(String(row.classId)) || null : null;
      const homeworkClass = linkedHomework?.classId ? classById.get(String(linkedHomework.classId)) || null : null;
      const mappedClassId = (
        homeworkClass?._id
        || storedClass?._id
        || classIdByCourseId.get(String(row.course || ''))
        || classIdByCourseId.get(String(linkedHomework?.course || ''))
        || ''
      );
      const resolvedClass = mappedClassId ? classById.get(String(mappedClassId)) || null : null;

      if (!resolvedClass) {
        summary.unresolvedCount += 1;
        if (summary.unresolved.length < 25) {
          summary.unresolved.push({
            type: 'submissions',
            id: String(row._id),
            label: String(row.student || ''),
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
        summary.classIdBackfilled.submissions += 1;
        changed = true;
      }

      const preferredCourseId = linkedHomework?.course || compatCourseId || '';
      if (preferredCourseId && !idsEqual(row.course, preferredCourseId)) {
        row.course = preferredCourseId;
        summary.courseSynced.submissions += 1;
        changed = true;
      }

      if (changed) {
        summary.updated.submissions += 1;
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
