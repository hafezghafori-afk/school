const mongoose = require('mongoose');
require('dotenv').config();

const User = require('../models/User');
const { serializeUserIdentity } = require('../utils/userRole');

const args = new Set(process.argv.slice(2));
const showHelp = args.has('--help') || args.has('-h');

const getMongoUri = () => process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/school_db';

function printHelp() {
  console.log('Usage: node ./scripts/checkRoleIntegrity.js');
  console.log('');
  console.log('Checks whether stored user role fields already match the canonical model in MongoDB.');
}

function normalize(value) {
  return String(value || '').trim();
}

function pushIssue(list, counters, code, user, detail = '') {
  list.push({
    code,
    userId: String(user._id),
    email: user.email || '',
    detail
  });
  counters.set(code, (counters.get(code) || 0) + 1);
}

async function run() {
  if (showHelp) {
    printHelp();
    return;
  }

  await mongoose.connect(getMongoUri());

  try {
    const cursor = User.collection.find({}, {
      projection: {
        email: 1,
        role: 1,
        orgRole: 1,
        adminLevel: 1,
        status: 1,
        permissions: 1,
        createdAt: 1
      },
      sort: { createdAt: 1 }
    });

    let scanned = 0;
    const issues = [];
    const warnings = [];
    const issueCounts = new Map();
    const warningCounts = new Map();

    while (await cursor.hasNext()) {
      const user = await cursor.next();
      if (!user) continue;
      scanned += 1;
      const identity = serializeUserIdentity(user);

      if (normalize(user.role) !== identity.role) {
        pushIssue(issues, issueCounts, 'role_mismatch', user, `stored=${normalize(user.role)} expected=${identity.role}`);
      }
      if (normalize(user.orgRole) !== identity.orgRole) {
        pushIssue(issues, issueCounts, 'org_role_mismatch', user, `stored=${normalize(user.orgRole)} expected=${identity.orgRole}`);
      }
      if (normalize(user.adminLevel) !== identity.adminLevel) {
        pushIssue(issues, issueCounts, 'admin_level_mismatch', user, `stored=${normalize(user.adminLevel)} expected=${identity.adminLevel}`);
      }
      if (normalize(user.status) !== identity.status) {
        pushIssue(issues, issueCounts, 'status_mismatch', user, `stored=${normalize(user.status)} expected=${identity.status}`);
      }

      const permissionCount = Array.isArray(user.permissions) ? user.permissions.length : 0;
      if ((identity.orgRole === 'finance_manager' || identity.orgRole === 'finance_lead') && permissionCount > 0) {
        pushIssue(
          warnings,
          warningCounts,
          'locked_finance_permissions_present',
          user,
          `storedPermissions=${permissionCount}`
        );
      }
    }

    console.log(`[check:role-integrity] scanned=${scanned} issues=${issues.length} warnings=${warnings.length}`);

    if (issueCounts.size) {
      console.log('[check:role-integrity] issue summary:');
      Array.from(issueCounts.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .forEach(([code, count]) => {
          console.log(` - ${code}: ${count}`);
        });
    }

    if (warningCounts.size) {
      console.log('[check:role-integrity] warning summary:');
      Array.from(warningCounts.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .forEach(([code, count]) => {
          console.log(` - ${code}: ${count}`);
        });
    }

    if (issues.length) {
      console.log('[check:role-integrity] first issues:');
      issues.slice(0, 20).forEach((item) => {
        console.log(` - ${item.code} ${item.email || item.userId}: ${item.detail}`);
      });
      process.exitCode = 1;
      return;
    }

    if (warnings.length) {
      console.log('[check:role-integrity] first warnings:');
      warnings.slice(0, 20).forEach((item) => {
        console.log(` - ${item.code} ${item.email || item.userId}: ${item.detail}`);
      });
    }

    console.log('[check:role-integrity] ok');
  } finally {
    await mongoose.disconnect();
  }
}

run().catch((error) => {
  console.error('[check:role-integrity] failed:', error);
  process.exit(1);
});
