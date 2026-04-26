require('dotenv').config();
const mongoose = require('mongoose');
const SchoolClass = require('../models/SchoolClass');
const InstructorSubject = require('../models/InstructorSubject');

function idsEqual(left, right) {
  return String(left || '') === String(right || '');
}

async function run() {
  const dryRun = process.argv.includes('--dry-run');
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/school_db');

  const schoolClasses = await SchoolClass.find()
    .select('_id legacyCourseId academicYearId title code')
    .lean();
  const classById = new Map();
  const classByCourseId = new Map();
  schoolClasses.forEach((item) => {
    classById.set(String(item._id), item);
    if (item.legacyCourseId) classByCourseId.set(String(item.legacyCourseId), item);
  });

  const mappings = await InstructorSubject.find().sort({ createdAt: 1, _id: 1 });
  const summary = {
    dryRun,
    scanned: mappings.length,
    updated: 0,
    classIdBackfilled: 0,
    courseSynced: 0,
    academicYearBackfilled: 0,
    unresolved: 0,
    unresolvedItems: []
  };

  for (const item of mappings) {
    let changed = false;
    let schoolClass = null;

    if (item.classId) {
      schoolClass = classById.get(String(item.classId)) || null;
    }
    if (!schoolClass && item.course) {
      schoolClass = classByCourseId.get(String(item.course)) || null;
    }

    if (!schoolClass) {
      summary.unresolved += 1;
      if (summary.unresolvedItems.length < 20) {
        summary.unresolvedItems.push({
          id: String(item._id),
          instructor: String(item.instructor || ''),
          subject: String(item.subject || ''),
          classId: String(item.classId || ''),
          course: String(item.course || '')
        });
      }
      continue;
    }

    if (!idsEqual(item.classId, schoolClass._id)) {
      item.classId = schoolClass._id;
      summary.classIdBackfilled += 1;
      changed = true;
    }

    if (schoolClass.legacyCourseId && !idsEqual(item.course, schoolClass.legacyCourseId)) {
      item.course = schoolClass.legacyCourseId;
      summary.courseSynced += 1;
      changed = true;
    }

    if (schoolClass.academicYearId && !idsEqual(item.academicYear, schoolClass.academicYearId)) {
      item.academicYear = schoolClass.academicYearId;
      summary.academicYearBackfilled += 1;
      changed = true;
    }

    if (changed) {
      summary.updated += 1;
      if (!dryRun) await item.save();
    }
  }

  console.log(JSON.stringify(summary, null, 2));
}

run()
  .catch((error) => {
    console.error(error && error.stack ? error.stack : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });