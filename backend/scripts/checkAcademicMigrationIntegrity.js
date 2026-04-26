const mongoose = require('mongoose');
require('dotenv').config();

const User = require('../models/User');
const Order = require('../models/Order');
const Course = require('../models/Course');
const StudentMembership = require('../models/StudentMembership');
const { serializeUserIdentity } = require('../utils/userRole');

const args = new Set(process.argv.slice(2));
const showHelp = args.has('--help') || args.has('-h');

const getMongoUri = () => process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/school_db';

function printHelp() {
  console.log('Usage: node ./scripts/checkAcademicMigrationIntegrity.js');
  console.log('');
  console.log('Checks orgRole cutover plus academic membership migration integrity.');
}

function normalize(value) {
  return String(value || '').trim();
}

function buildPairKey(studentId, courseId) {
  return `${String(studentId)}:${String(courseId)}`;
}

async function run() {
  if (showHelp) {
    printHelp();
    return;
  }

  await mongoose.connect(getMongoUri());

  try {
    const [users, orders, memberships, courses] = await Promise.all([
      User.collection.find({}, { projection: { email: 1, role: 1, orgRole: 1, adminLevel: 1, status: 1, createdAt: 1 } }).toArray(),
      Order.find({ status: 'approved' }).select('user course status paymentMethod createdAt').lean(),
      StudentMembership.find({}).select('student course status isCurrent source legacyOrder academicYear joinedAt leftAt createdAt').lean(),
      Course.find({}).select('kind').lean()
    ]);

    const issues = [];
    const warnings = [];
    const issueCounts = new Map();
    const warningCounts = new Map();

    const push = (bucket, counters, code, detail) => {
      bucket.push({ code, ...detail });
      counters.set(code, (counters.get(code) || 0) + 1);
    };

    const courseKindById = new Map(courses.map((course) => [String(course._id), normalize(course.kind)]));

    for (const user of users) {
      const identity = serializeUserIdentity(user);
      if (normalize(user.role) !== identity.role) {
        push(issues, issueCounts, 'role_mismatch', { email: user.email || '', detail: `stored=${normalize(user.role)} expected=${identity.role}` });
      }
      if (normalize(user.orgRole) !== identity.orgRole) {
        push(issues, issueCounts, 'org_role_mismatch', { email: user.email || '', detail: `stored=${normalize(user.orgRole)} expected=${identity.orgRole}` });
      }
      if (normalize(user.adminLevel) !== identity.adminLevel) {
        push(issues, issueCounts, 'admin_level_mismatch', { email: user.email || '', detail: `stored=${normalize(user.adminLevel)} expected=${identity.adminLevel}` });
      }
      if (normalize(user.status) !== identity.status) {
        push(issues, issueCounts, 'status_mismatch', { email: user.email || '', detail: `stored=${normalize(user.status)} expected=${identity.status}` });
      }
    }

    const approvedOrderPairs = new Map();
    for (const order of orders) {
      if (!order?.user || !order?.course) {
        push(warnings, warningCounts, 'approved_order_missing_refs', { orderId: String(order?._id || ''), detail: 'approved order is missing user or course' });
        continue;
      }
      approvedOrderPairs.set(buildPairKey(order.user, order.course), order);
    }

    const currentMembershipPairs = new Map();
    for (const membership of memberships) {
      if (!membership?.student || !membership?.course) {
        push(issues, issueCounts, 'membership_missing_refs', { membershipId: String(membership?._id || ''), detail: 'membership is missing student or course reference' });
        continue;
      }

      const pairKey = buildPairKey(membership.student, membership.course);
      if (membership.isCurrent) {
        if (currentMembershipPairs.has(pairKey)) {
          push(issues, issueCounts, 'duplicate_current_membership_pair', {
            membershipId: String(membership._id),
            detail: `pair=${pairKey}`
          });
        } else {
          currentMembershipPairs.set(pairKey, membership);
        }
      }

      if (membership.isCurrent && normalize(membership.status) !== 'active' && normalize(membership.status) !== 'pending') {
        push(issues, issueCounts, 'current_membership_invalid_status', {
          membershipId: String(membership._id),
          detail: `status=${normalize(membership.status)}`
        });
      }

      const courseKind = courseKindById.get(String(membership.course));
      if (!courseKind) {
        push(issues, issueCounts, 'membership_course_missing', {
          membershipId: String(membership._id),
          detail: `course=${String(membership.course)}`
        });
      } else if (membership.isCurrent && courseKind !== 'academic_class') {
        push(issues, issueCounts, 'membership_on_non_academic_course', {
          membershipId: String(membership._id),
          detail: `courseKind=${courseKind}`
        });
      }
    }

    for (const [pairKey, order] of approvedOrderPairs.entries()) {
      if (!currentMembershipPairs.has(pairKey)) {
        push(issues, issueCounts, 'approved_order_missing_membership', {
          orderId: String(order._id),
          detail: pairKey
        });
      }
    }

    const activeStudents = users.filter((user) => normalize(user.role) === 'student' && normalize(user.status) === 'active');
    const studentsWithCurrentMembership = new Set(
      memberships.filter((membership) => membership.isCurrent && membership.student).map((membership) => String(membership.student))
    );

    for (const student of activeStudents) {
      if (!studentsWithCurrentMembership.has(String(student._id))) {
        push(warnings, warningCounts, 'active_student_without_current_membership', {
          email: student.email || '',
          detail: `userId=${String(student._id)}`
        });
      }
    }

    const summary = {
      users: users.length,
      approvedOrders: orders.length,
      approvedOrderPairs: approvedOrderPairs.size,
      memberships: memberships.length,
      currentMembershipPairs: currentMembershipPairs.size,
      activeStudents: activeStudents.length,
      issues: issues.length,
      warnings: warnings.length
    };

    console.log(`[check:academic-migration] ${JSON.stringify(summary)}`);

    if (issueCounts.size) {
      console.log('[check:academic-migration] issue summary:');
      Array.from(issueCounts.entries()).sort((a, b) => a[0].localeCompare(b[0])).forEach(([code, count]) => {
        console.log(` - ${code}: ${count}`);
      });
    }

    if (warningCounts.size) {
      console.log('[check:academic-migration] warning summary:');
      Array.from(warningCounts.entries()).sort((a, b) => a[0].localeCompare(b[0])).forEach(([code, count]) => {
        console.log(` - ${code}: ${count}`);
      });
    }

    if (issues.length) {
      console.log('[check:academic-migration] first issues:');
      issues.slice(0, 20).forEach((item) => console.log(` - ${item.code}: ${item.email || item.orderId || item.membershipId || ''} ${item.detail || ''}`));
      process.exitCode = 1;
      return;
    }

    if (warnings.length) {
      console.log('[check:academic-migration] first warnings:');
      warnings.slice(0, 20).forEach((item) => console.log(` - ${item.code}: ${item.email || item.orderId || item.membershipId || ''} ${item.detail || ''}`));
    }

    console.log('[check:academic-migration] ok');
  } finally {
    await mongoose.disconnect();
  }
}

run().catch((error) => {
  console.error('[check:academic-migration] failed:', error);
  process.exit(1);
});
