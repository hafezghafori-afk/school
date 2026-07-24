require('dotenv').config();
const mongoose = require('mongoose');
require('../models/SchoolClass');
require('../models/AcademicYear');
const {
  auditAndVoidAutoMonthlyFeeOrders
} = require('../services/autoMonthlyFeeOrderRepairService');

mongoose.set('autoIndex', false);
mongoose.set('autoCreate', false);

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const allSchools = args.includes('--all-schools');
const readArg = (name) => {
  const prefix = `${name}=`;
  return String(args.find((item) => item.startsWith(prefix)) || '').slice(prefix.length).trim();
};
const schoolId = readArg('--school-id');
const actorId = readArg('--actor-id') || String(process.env.REPAIR_ACTOR_ID || '').trim();
const confirmation = readArg('--confirm');
const limit = Number(readArg('--limit') || 50000);

function validateApplyArguments() {
  if (!apply) return;
  if (!schoolId && !allSchools) {
    throw new Error('Apply requires --school-id=<id> or the explicit --all-schools flag.');
  }
  if (!mongoose.Types.ObjectId.isValid(actorId)) {
    throw new Error('Apply requires a valid --actor-id=<finance-lead-user-id>.');
  }
  if (confirmation !== 'AUTO_MONTHLY_FEE_VOID') {
    throw new Error('Apply requires --confirm=AUTO_MONTHLY_FEE_VOID.');
  }
}

async function run() {
  validateApplyArguments();
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/school_db', {
    autoIndex: false,
    autoCreate: false
  });
  try {
    const summary = await auditAndVoidAutoMonthlyFeeOrders({
      apply,
      schoolId,
      actorId: apply ? actorId : '',
      limit
    });
    console.log(`[repair:auto-monthly-fee-orders] ${JSON.stringify(summary)}`);
  } finally {
    await mongoose.disconnect();
  }
}

run().catch((error) => {
  console.error('[repair:auto-monthly-fee-orders] failed:', error?.stack || error);
  process.exitCode = 1;
});
