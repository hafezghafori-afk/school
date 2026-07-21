const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { accumulateAccountMetrics } = require('../services/treasuryGovernanceService');

function read(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
}

function run() {
  const accountId = '507f1f77bcf86cd799439011';
  const metrics = accumulateAccountMetrics({
    accounts: [{ _id: accountId, openingBalance: 1000 }],
    transactions: [{
      accountId,
      transactionType: 'withdrawal',
      direction: 'out',
      sourceType: 'procurement_settlement',
      amount: 500,
      transactionDate: new Date('2026-01-10')
    }],
    expenses: [{
      treasuryAccountId: accountId,
      procurementCommitmentId: '507f1f77bcf86cd799439012',
      amount: 500,
      expenseDate: new Date('2026-01-09')
    }]
  });
  assert.strictEqual(metrics.get(accountId).bookBalance, 500, 'procurement cash outflow must be counted once');
  assert.strictEqual(metrics.get(accountId).expenseOutflow, 0, 'procurement-linked expense must not debit treasury');

  const monthCloseModel = read('models/FinanceMonthClose.js');
  assert.match(monthCloseModel, /schoolId: 1, financialYearId: 1, monthKey: 1/);
  const reportEngine = read('services/reportEngineService.js');
  assert.match(reportEngine, /const paymentFilter = \{ status: 'approved' \}/);
  const adminActions = read('services/financeAdminActionService.js');
  assert.match(adminActions, /session\.startTransaction\(\)/);
  const governmentReports = read('services/governmentFinanceReportService.js');
  assert.match(governmentReports, /report_school_scope_required/);
  assert.match(governmentReports, /feeTypeBreakdown/);
  const monthCloseService = read('services/financeCloseService.js');
  assert.match(monthCloseService, /approved_payments_missing_treasury/);
  const financeRoutes = read('routes/financeRoutes.js');
  assert.match(financeRoutes, /ExpenseEntry\.findOne\(\{ _id: req\.params\.id, schoolId: schoolContext\.schoolId \}\)/);
  const treasuryService = read('services/treasuryGovernanceService.js');
  assert.match(treasuryService, /manual:\$\{rawIdempotencyKey\}/);
  assert.match(treasuryService, /transfer:\$\{rawIdempotencyKey\}/);

  console.log('check:finance-integrity-guards PASS');
}

try {
  run();
} catch (error) {
  console.error('check:finance-integrity-guards FAIL');
  console.error(error);
  process.exitCode = 1;
}
