const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {
  classifyAutoMonthlyFeeOrder,
  isAutoMonthlyFeeOrder
} = require('../services/autoMonthlyFeeOrderRepairService');

const autoOrder = {
  _id: '507f191e810c19729de86001',
  orderNumber: 'AUTO-FEE-140601-29DE86001',
  issuanceKey: 'auto-monthly-tuition:507f191e810c19729de86099:1406-01',
  source: 'system',
  note: 'plan:standard | auto:monthly-arrears-backfill',
  status: 'overdue',
  amountPaid: 0,
  paymentBreakdown: {},
  lineItems: [{ feeType: 'tuition', paidAmount: 0 }]
};

assert.strictEqual(isAutoMonthlyFeeOrder(autoOrder), true);
assert.strictEqual(classifyAutoMonthlyFeeOrder({ order: autoOrder }), 'voidable_auto_order');
assert.strictEqual(classifyAutoMonthlyFeeOrder({ order: { ...autoOrder, sourceBillId: 'bill-1' } }), 'official_source_linked');
assert.strictEqual(classifyAutoMonthlyFeeOrder({ order: { ...autoOrder, amountPaid: 100 } }), 'payment_linked');
assert.strictEqual(classifyAutoMonthlyFeeOrder({ order: autoOrder, hasLinkedPayment: true }), 'payment_linked');
assert.strictEqual(classifyAutoMonthlyFeeOrder({ order: { ...autoOrder, status: 'void' } }), 'already_void');
assert.strictEqual(classifyAutoMonthlyFeeOrder({ order: { ...autoOrder, issuanceKey: 'grouped-billing:abc' } }), 'out_of_scope');

const read = (file) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const accountRoute = read('routes/studentAccountByStudentRoutes.js');
assert.doesNotMatch(accountRoute, /syncStudentMonthlyArrears/);
assert.match(accountRoute, /requirePermission\('manage_finance'\)/);
assert.match(accountRoute, /mode: 'read_only'/);

const mainEntry = read('../frontend/src/main.jsx');
assert.doesNotMatch(mainEntry, /studentFinanceAccountDirect/);

const financePage = read('../frontend/src/pages/AdminFinance.jsx');
assert.doesNotMatch(financePage, /window\.fetch\s*=/);
assert.match(financePage, /safeLeft - safeRight/);

console.log('check:auto-monthly-fee-order-repair PASS');
