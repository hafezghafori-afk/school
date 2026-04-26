const mongoose = require('mongoose');
require('dotenv').config();

const Order = require('../models/Order');
const StudentMembership = require('../models/StudentMembership');
const { syncStudentMembershipFromOrder } = require('../utils/studentMembershipSync');

const args = new Set(process.argv.slice(2));
const isDryRun = args.has('--dry-run');
const showHelp = args.has('--help') || args.has('-h');

const getMongoUri = () => process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/school_db';

function printHelp() {
  console.log('Usage: node ./scripts/backfillStudentMemberships.js [--dry-run]');
  console.log('');
  console.log('Options:');
  console.log('  --dry-run   Preview updates without writing to MongoDB');
  console.log('  --help      Show this help message');
}

async function run() {
  if (showHelp) {
    printHelp();
    return;
  }

  await mongoose.connect(getMongoUri());

  try {
    const cursor = Order.find({ status: 'approved' })
      .select('user course status paymentMethod createdAt')
      .sort({ createdAt: 1 })
      .cursor();

    let scanned = 0;
    let changed = 0;
    let skipped = 0;
    const seenPairs = new Set();
    const samples = [];

    for await (const order of cursor) {
      scanned += 1;
      if (!order?.user || !order?.course) {
        skipped += 1;
        continue;
      }

      const pairKey = String(order.user) + ':' + String(order.course);
      if (seenPairs.has(pairKey)) continue;
      seenPairs.add(pairKey);

      const current = await StudentMembership.findOne({
        student: order.user,
        course: order.course,
        isCurrent: true
      }).select('status source legacyOrder');

      const expectedSource = String(order.paymentMethod || '') === 'admin_enrollment' ? 'admin' : 'order';
      const needsChange = !current
        || current.status !== 'active'
        || current.source !== expectedSource
        || String(current.legacyOrder || '') !== String(order._id || '');

      if (!needsChange) continue;

      changed += 1;
      if (samples.length < 20) {
        samples.push({
          orderId: String(order._id),
          studentId: String(order.user),
          courseId: String(order.course),
          source: expectedSource
        });
      }

      if (!isDryRun) {
        await syncStudentMembershipFromOrder(order, {
          note: 'backfill_student_membership'
        });
      }
    }

    console.log(
      '[backfill:student-memberships] scanned='
      + scanned
      + ' changed='
      + changed
      + ' skipped='
      + skipped
      + ' dryRun='
      + isDryRun
    );

    if (samples.length) {
      console.log('[backfill:student-memberships] sample updates:');
      samples.forEach((sample) => {
        console.log(' - ' + JSON.stringify(sample));
      });
    }
  } finally {
    await mongoose.disconnect();
  }
}

run().catch((error) => {
  console.error('[backfill:student-memberships] failed:', error);
  process.exit(1);
});
