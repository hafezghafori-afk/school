const mongoose = require('mongoose');
require('dotenv').config();

const Course = require('../models/Course');
const Order = require('../models/Order');
const StudentMembership = require('../models/StudentMembership');

const args = new Set(process.argv.slice(2));
const isDryRun = args.has('--dry-run');
const showHelp = args.has('--help') || args.has('-h');

function printHelp() {
  console.log('Usage: node ./scripts/backfillCourseAcademicFields.js [--dry-run]');
  console.log('');
  console.log('Adds academic/public course defaults to legacy Course documents.');
}

function toTrimmedString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

async function buildAcademicCourseIds() {
  const [membershipRefs, approvedOrderRefs] = await Promise.all([
    StudentMembership.distinct('course'),
    Order.distinct('course', { status: 'approved' })
  ]);

  return new Set(
    [...membershipRefs, ...approvedOrderRefs]
      .filter(Boolean)
      .map((value) => String(value))
  );
}

function deriveKind(course, academicCourseIds) {
  const currentKind = toTrimmedString(course.kind);
  if (currentKind === 'academic_class' || currentKind === 'public_course') return currentKind;

  const hasAcademicSignals = Boolean(
    academicCourseIds.has(String(course._id))
    || toTrimmedString(course.gradeLevel)
    || toTrimmedString(course.category)
    || toTrimmedString(course.section)
    || course.academicYearRef
    || course.homeroomInstructor
  );

  return hasAcademicSignals ? 'academic_class' : 'public_course';
}

async function run() {
  if (showHelp) {
    printHelp();
    return;
  }

  await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/school_db');

  try {
    const academicCourseIds = await buildAcademicCourseIds();
    const cursor = Course.collection.find({});
    let scanned = 0;
    let changed = 0;
    const samples = [];

    while (await cursor.hasNext()) {
      const course = await cursor.next();
      if (!course) continue;
      scanned += 1;

      const gradeLevel = toTrimmedString(course.gradeLevel) || toTrimmedString(course.category);
      const kind = deriveKind(course, academicCourseIds);
      const next = {
        kind,
        gradeLevel,
        category: toTrimmedString(course.category) || gradeLevel,
        section: kind === 'academic_class' ? toTrimmedString(course.section) : '',
        academicYearRef: kind === 'academic_class' ? (course.academicYearRef || null) : null,
        homeroomInstructor: kind === 'academic_class' ? (course.homeroomInstructor || null) : null,
        isActive: typeof course.isActive === 'boolean' ? course.isActive : true
      };

      const needsChange = toTrimmedString(course.kind) !== next.kind
        || toTrimmedString(course.gradeLevel) !== next.gradeLevel
        || toTrimmedString(course.category) !== next.category
        || toTrimmedString(course.section) !== next.section
        || String(course.academicYearRef || '') !== String(next.academicYearRef || '')
        || String(course.homeroomInstructor || '') !== String(next.homeroomInstructor || '')
        || course.isActive !== next.isActive;

      if (!needsChange) continue;
      changed += 1;
      if (samples.length < 20) {
        samples.push({
          id: String(course._id),
          title: course.title,
          kind: next.kind,
          gradeLevel: next.gradeLevel,
          category: next.category
        });
      }

      if (!isDryRun) {
        await Course.collection.updateOne(
          { _id: course._id },
          {
            $set: next
          }
        );
      }
    }

    console.log('[backfill:course-academic] scanned=' + scanned + ' changed=' + changed + ' dryRun=' + isDryRun);
    if (samples.length) {
      console.log('[backfill:course-academic] sample updates:');
      samples.forEach((sample) => console.log(' - ' + JSON.stringify(sample)));
    }
  } finally {
    await mongoose.disconnect();
  }
}

run().catch((error) => {
  console.error('[backfill:course-academic] failed:', error);
  process.exit(1);
});
