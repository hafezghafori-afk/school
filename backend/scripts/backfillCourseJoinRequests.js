const mongoose = require('mongoose');
require('dotenv').config();

const Order = require('../models/Order');
const Course = require('../models/Course');
const CourseJoinRequest = require('../models/CourseJoinRequest');

const args = new Set(process.argv.slice(2));
const isDryRun = args.has('--dry-run');
const showHelp = args.has('--help') || args.has('-h');

const getMongoUri = () => process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/school_db';

function printHelp() {
  console.log('Usage: node ./scripts/backfillCourseJoinRequests.js [--dry-run]');
  console.log('');
  console.log('Options:');
  console.log('  --dry-run   Preview updates without writing to MongoDB');
  console.log('  --help      Show this help message');
}

function normalizeStatus(value = '') {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'approved') return 'approved';
  if (normalized === 'rejected') return 'rejected';
  return 'pending';
}

function asString(value) {
  return String(value || '').trim();
}

async function run() {
  if (showHelp) {
    printHelp();
    return;
  }

  await mongoose.connect(getMongoUri());

  try {
    const academicYearCache = new Map();
    const getAcademicYear = async (courseId) => {
      const key = String(courseId || '');
      if (!key) return null;
      if (academicYearCache.has(key)) return academicYearCache.get(key);
      const course = await Course.findById(courseId).select('academicYearRef');
      const value = course?.academicYearRef || null;
      academicYearCache.set(key, value);
      return value;
    };

    const cursor = Order.find({ paymentMethod: 'join_request' })
      .select('user course status note rejectedReason reviewedBy reviewedAt createdAt updatedAt')
      .sort({ createdAt: 1 })
      .cursor();

    let scanned = 0;
    let changed = 0;
    let created = 0;
    let updated = 0;
    let skipped = 0;
    const samples = [];

    for await (const order of cursor) {
      scanned += 1;
      if (!order?.user || !order?.course) {
        skipped += 1;
        continue;
      }

      const status = normalizeStatus(order.status);
      const academicYear = await getAcademicYear(order.course);
      let item = await CourseJoinRequest.findOne({ legacyOrder: order._id });
      let mode = 'update';

      if (!item && status === 'pending') {
        item = await CourseJoinRequest.findOne({
          student: order.user,
          course: order.course,
          status: 'pending'
        }).sort({ createdAt: -1 });
      }

      if (!item) {
        item = new CourseJoinRequest({
          student: order.user,
          course: order.course,
          createdAt: order.createdAt || new Date()
        });
        mode = 'create';
      }

      const nextRejectedReason = status === 'rejected' ? asString(order.rejectedReason) : '';
      const nextReviewedAt = order.reviewedAt || (status !== 'pending' ? (order.updatedAt || order.createdAt || new Date()) : null);
      const needsChange = mode === 'create'
        || String(item.student || '') !== String(order.user || '')
        || String(item.course || '') !== String(order.course || '')
        || String(item.academicYear || '') !== String(academicYear || '')
        || String(item.status || '') !== status
        || String(item.source || '') !== 'migration'
        || asString(item.note) !== asString(order.note)
        || asString(item.rejectedReason) !== nextRejectedReason
        || String(item.createdBy || '') !== String(order.user || '')
        || String(item.reviewedBy || '') !== String(order.reviewedBy || '')
        || String(item.legacyOrder || '') !== String(order._id || '')
        || String(item.reviewedAt || '') !== String(nextReviewedAt || '');

      if (!needsChange) continue;

      changed += 1;
      if (mode === 'create') created += 1;
      else updated += 1;

      if (samples.length < 20) {
        samples.push({
          orderId: String(order._id),
          requestId: item._id ? String(item._id) : '(new)',
          studentId: String(order.user),
          courseId: String(order.course),
          status,
          mode
        });
      }

      if (isDryRun) continue;

      item.student = order.user;
      item.course = order.course;
      item.academicYear = academicYear || null;
      item.status = status;
      item.source = 'migration';
      item.note = asString(order.note);
      item.rejectedReason = nextRejectedReason;
      item.createdBy = order.user;
      item.reviewedBy = order.reviewedBy || null;
      item.reviewedAt = nextReviewedAt;
      item.legacyOrder = order._id;
      if (!item.createdAt) item.createdAt = order.createdAt || new Date();
      await item.save();
    }

    console.log(
      '[backfill:course-join-requests] scanned='
      + scanned
      + ' changed='
      + changed
      + ' created='
      + created
      + ' updated='
      + updated
      + ' skipped='
      + skipped
      + ' dryRun='
      + isDryRun
    );

    if (samples.length) {
      console.log('[backfill:course-join-requests] sample updates:');
      samples.forEach((sample) => {
        console.log(' - ' + JSON.stringify(sample));
      });
    }
  } finally {
    await mongoose.disconnect();
  }
}

run().catch((error) => {
  console.error('[backfill:course-join-requests] failed:', error);
  process.exit(1);
});
