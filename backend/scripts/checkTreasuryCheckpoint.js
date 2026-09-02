const assert = require('assert');
const { accumulateAccountMetrics, emptyBucket } = require('../services/treasuryMetricsFold');

// Phase 3 of the مرکز مالی دولت review (P9) — a treasury balance checkpoint must
// be exactly "fold the history through a cut-off, then fold the tail on top".
// This pins that the seeded fold equals a full recompute.

const account = { _id: 'acc-1', openingBalance: 100 };

const allTransactions = [
  { accountId: 'acc-1', amount: 500, transactionType: 'deposit', direction: 'in', transactionDate: '2026-04-05' },
  { accountId: 'acc-1', amount: 120, transactionType: 'withdrawal', direction: 'out', transactionDate: '2026-04-20' },
  { accountId: 'acc-1', amount: 300, transactionType: 'transfer_in', direction: 'in', transactionDate: '2026-05-10' },
  { accountId: 'acc-1', amount: 80, transactionType: 'transfer_out', direction: 'out', transactionDate: '2026-06-01' },
  { accountId: 'acc-1', amount: 45, transactionType: 'withdrawal', direction: 'out', transactionDate: '2026-06-25' }
];
const allExpenses = [
  { treasuryAccountId: 'acc-1', amount: 60, expenseDate: '2026-04-15' },
  { treasuryAccountId: 'acc-1', amount: 200, expenseDate: '2026-05-20', procurementCommitmentId: 'pc-1' }, // skipped by the fold
  { treasuryAccountId: 'acc-1', amount: 35, expenseDate: '2026-06-10' }
];

const CUTOFF = new Date('2026-05-15T23:59:59.999Z');
const beforeCut = (d) => new Date(d) <= CUTOFF;

const full = accumulateAccountMetrics({ accounts: [account], transactions: allTransactions, expenses: allExpenses }).get('acc-1');

const checkpoint = accumulateAccountMetrics({
  accounts: [account],
  transactions: allTransactions.filter((t) => beforeCut(t.transactionDate)),
  expenses: allExpenses.filter((e) => beforeCut(e.expenseDate))
}).get('acc-1');

const seeded = accumulateAccountMetrics({
  accounts: [account],
  transactions: allTransactions.filter((t) => !beforeCut(t.transactionDate)),
  expenses: allExpenses.filter((e) => !beforeCut(e.expenseDate)),
  seedByAccountId: new Map([['acc-1', checkpoint]])
}).get('acc-1');

assert.deepStrictEqual(seeded, full, 'checkpoint seed + tail fold must equal a full recompute');

// Spot-check the numbers so a wrong fold can't accidentally "match" a wrong seed.
// 100 + 500 - 120 + 300 - 80 - 45 - (60 + 35)  (procurement expense excluded)
assert.strictEqual(full.bookBalance, 560, 'book balance folds opening + all non-void tx and non-procurement expense');
assert.strictEqual(full.manualInflow, 500);
assert.strictEqual(full.manualOutflow, 165);
assert.strictEqual(full.transferIn, 300);
assert.strictEqual(full.transferOut, 80);
assert.strictEqual(full.expenseOutflow, 95);
assert.strictEqual(full.expenseCount, 2);
assert.strictEqual(full.transferCount, 2);

// Without a seed the fold starts from openingBalance (regression guard for the
// extraction out of treasuryGovernanceService).
const noSeed = accumulateAccountMetrics({ accounts: [account], transactions: [], expenses: [] }).get('acc-1');
assert.strictEqual(noSeed.bookBalance, 100, 'no seed -> starts at openingBalance');
assert.deepStrictEqual(emptyBucket(0), {
  manualInflow: 0, manualOutflow: 0, transferIn: 0, transferOut: 0,
  expenseOutflow: 0, transferCount: 0, expenseCount: 0, bookBalance: 0, lastTransactionAt: null
});

// A stale seed (wrong balance) propagates — this is why the read path re-verifies
// the checkpoint's row counts before trusting it.
const staleSeed = accumulateAccountMetrics({
  accounts: [account],
  transactions: [],
  expenses: [],
  seedByAccountId: new Map([['acc-1', { ...checkpoint, bookBalance: checkpoint.bookBalance + 999 }]])
}).get('acc-1');
assert.strictEqual(staleSeed.bookBalance, Number((checkpoint.bookBalance + 999).toFixed(2)), 'seed is trusted verbatim by the fold');

console.log('[check:treasury-checkpoint] ok');
