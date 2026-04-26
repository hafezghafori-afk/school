const mongoose = require('mongoose');
require('dotenv').config();

const User = require('../models/User');
const { serializeUserIdentity } = require('../utils/userRole');

const args = new Set(process.argv.slice(2));
const isDryRun = args.has('--dry-run');
const shouldClearLockedPermissions = args.has('--clear-locked-permissions');
const showHelp = args.has('--help') || args.has('-h');

const getMongoUri = () => process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/school_db';

function printHelp() {
  console.log('Usage: node ./scripts/backfillOrgRoles.js [--dry-run]');
  console.log('');
  console.log('Options:');
  console.log('  --dry-run   Preview updates without writing to MongoDB');
  console.log('  --clear-locked-permissions   Remove stored manual permissions from finance_manager/finance_lead');
  console.log('  --help      Show this help message');
}

function normalize(value) {
  return String(value || '').trim();
}

function buildRolePatch(user) {
  const identity = serializeUserIdentity(user);
  const patch = {};

  if (normalize(user.role) !== identity.role) patch.role = identity.role;
  if (normalize(user.orgRole) !== identity.orgRole) patch.orgRole = identity.orgRole;
  if (normalize(user.adminLevel) !== identity.adminLevel) patch.adminLevel = identity.adminLevel;
  if (normalize(user.status) !== identity.status) patch.status = identity.status;
  if (
    shouldClearLockedPermissions
    && (identity.orgRole === 'finance_manager' || identity.orgRole === 'finance_lead')
    && Array.isArray(user.permissions)
    && user.permissions.length
  ) {
    patch.permissions = [];
  }

  return { identity, patch };
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
    let changed = 0;
    const byOrgRole = new Map();
    const samples = [];

    while (await cursor.hasNext()) {
      const user = await cursor.next();
      if (!user) continue;
      scanned += 1;

      const { identity, patch } = buildRolePatch(user);
      byOrgRole.set(identity.orgRole, (byOrgRole.get(identity.orgRole) || 0) + 1);

      if (!Object.keys(patch).length) continue;

      changed += 1;
      if (samples.length < 20) {
        samples.push({
          email: user.email || String(user._id),
          patch
        });
      }

      if (!isDryRun) {
        await User.collection.updateOne({ _id: user._id }, { $set: patch });
      }
    }

    console.log(
      `[backfill:org-roles] scanned=${scanned} changed=${changed} dryRun=${isDryRun} clearLockedPermissions=${shouldClearLockedPermissions}`
    );
    console.log('[backfill:org-roles] canonical orgRole distribution:');
    Array.from(byOrgRole.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .forEach(([orgRole, count]) => {
        console.log(` - ${orgRole}: ${count}`);
      });

    if (samples.length) {
      console.log('[backfill:org-roles] sample updates:');
      samples.forEach((sample) => {
        console.log(` - ${sample.email}: ${JSON.stringify(sample.patch)}`);
      });
    }
  } finally {
    await mongoose.disconnect();
  }
}

run().catch((error) => {
  console.error('[backfill:org-roles] failed:', error);
  process.exit(1);
});
