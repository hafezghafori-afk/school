const assert = require('assert');
const { canonicalStringify } = require('../utils/canonicalJson');
const {
  GOVERNMENT_SNAPSHOT_DIGEST_ALGO,
  computeGovernmentSnapshotDigest,
  collectOfficialSnapshotGate
} = require('../services/governmentSnapshotIntegrity');

// Phase 1 of the مرکز مالی دولت review — official-record integrity (P7, P8).

// ---------------------------------------------------------------------------
// 1. canonicalStringify is order-independent and stable across Date/ObjectId.
// ---------------------------------------------------------------------------
assert.strictEqual(
  canonicalStringify({ b: 1, a: { d: 4, c: 3 } }),
  canonicalStringify({ a: { c: 3, d: 4 }, b: 1 }),
  'key insertion order must not change the canonical string'
);
assert.strictEqual(
  canonicalStringify({ at: new Date('2026-03-21T00:00:00.000Z') }),
  '{"at":"2026-03-21T00:00:00.000Z"}',
  'Date serializes to a stable ISO string'
);
assert.strictEqual(
  canonicalStringify([{ z: 1, a: 2 }, { a: 3, z: 4 }]),
  '[{"a":2,"z":1},{"a":3,"z":4}]',
  'array element objects are each key-sorted, array order preserved'
);

// ---------------------------------------------------------------------------
// 2. Digest: reproducible, content-sensitive, chain-linked.
// ---------------------------------------------------------------------------
const baseContent = {
  reportKey: 'government_finance_quarterly',
  filters: { schoolId: 's1', financialYearId: 'fy1' },
  columns: [{ key: 'classTitle', label: 'صنف' }],
  summary: { totalIncome: 1000, balance: 250 },
  rows: [{ classId: 'c1', balance: 250 }],
  pack: { generatedAt: '2026-03-21T00:00:00.000Z', treasuryAnalytics: { summary: { bookBalance: 900 } } }
};

const digA = computeGovernmentSnapshotDigest({ previousDigest: '', ...baseContent });
const digAReordered = computeGovernmentSnapshotDigest({
  pack: baseContent.pack,
  rows: baseContent.rows,
  summary: { balance: 250, totalIncome: 1000 },
  columns: baseContent.columns,
  filters: { financialYearId: 'fy1', schoolId: 's1' },
  reportKey: baseContent.reportKey,
  previousDigest: ''
});
assert.strictEqual(digA, digAReordered, 'same content in any key order yields the same digest');
assert.strictEqual(digA.length, 64, 'sha256 hex digest is 64 chars');

const digChained = computeGovernmentSnapshotDigest({ previousDigest: digA, ...baseContent });
assert.notStrictEqual(digA, digChained, 'linking to a previousDigest changes the digest');

const digMutated = computeGovernmentSnapshotDigest({
  previousDigest: '',
  ...baseContent,
  summary: { ...baseContent.summary, balance: 999 }
});
assert.notStrictEqual(digA, digMutated, 'mutating stored content changes the digest');

// Simulate a two-version chain and verify it the way the verify-chain route does.
const v1Digest = computeGovernmentSnapshotDigest({ previousDigest: '', ...baseContent });
const v2Content = { ...baseContent, summary: { totalIncome: 1200, balance: 400 } };
const v2Digest = computeGovernmentSnapshotDigest({ previousDigest: v1Digest, ...v2Content });
const chain = [
  { previousDigest: '', sourceDigest: v1Digest, digestAlgo: GOVERNMENT_SNAPSHOT_DIGEST_ALGO, content: baseContent },
  { previousDigest: v1Digest, sourceDigest: v2Digest, digestAlgo: GOVERNMENT_SNAPSHOT_DIGEST_ALGO, content: v2Content }
];
let prev = '';
chain.forEach((row, index) => {
  const recomputed = computeGovernmentSnapshotDigest({ previousDigest: row.previousDigest, ...row.content });
  assert.strictEqual(recomputed, row.sourceDigest, `chain row ${index} digest recomputes`);
  assert.strictEqual(row.previousDigest, prev, `chain row ${index} links to the prior version`);
  prev = row.sourceDigest;
});

// A tampered stored row is caught.
const tamperedChain = [{ ...chain[0], content: { ...baseContent, summary: { totalIncome: 5, balance: 5 } } }];
assert.notStrictEqual(
  computeGovernmentSnapshotDigest({ previousDigest: tamperedChain[0].previousDigest, ...tamperedChain[0].content }),
  tamperedChain[0].sourceDigest,
  'a tampered row fails digest recomputation'
);

// ---------------------------------------------------------------------------
// 3. collectOfficialSnapshotGate — operational blockers always; year/treasury
//    conditions only hard-block the annual record.
// ---------------------------------------------------------------------------
const cleanReadiness = {
  canClose: true,
  counts: {
    pendingPayments: 0,
    actionableAnomalies: 0,
    expenses: { draft: 0, pendingReview: 0, rejected: 0 },
    procurements: { draft: 0, pendingReview: 0, rejected: 0, unsettledApproved: 0 },
    unreconciledTreasuryAccounts: 0,
    reconciliationVariances: 0,
    openOrders: 0
  }
};
assert.deepStrictEqual(
  collectOfficialSnapshotGate(cleanReadiness, 'quarterly'),
  { blockers: [], warnings: [] },
  'a clean book has no blockers or warnings'
);

const pendingPaymentsGate = collectOfficialSnapshotGate(
  { ...cleanReadiness, counts: { ...cleanReadiness.counts, pendingPayments: 3 } },
  'quarterly'
);
assert.ok(pendingPaymentsGate.blockers.some((b) => b.key === 'pending_payments'), 'pending payments block any official snapshot');

const notCloseReady = { ...cleanReadiness, canClose: false };
assert.ok(
  collectOfficialSnapshotGate(notCloseReady, 'annual').blockers.some((b) => b.key === 'year_not_close_ready'),
  'annual official snapshot is blocked when the year is not close-ready'
);
assert.ok(
  !collectOfficialSnapshotGate(notCloseReady, 'quarterly').blockers.some((b) => b.key === 'year_not_close_ready'),
  'quarterly official snapshot is NOT blocked by year close-readiness'
);

const unreconciled = {
  ...cleanReadiness,
  counts: { ...cleanReadiness.counts, unreconciledTreasuryAccounts: 2 }
};
assert.ok(
  collectOfficialSnapshotGate(unreconciled, 'annual').blockers.some((b) => b.key === 'treasury_unreconciled'),
  'annual: unreconciled treasury is a blocker'
);
const unreconciledQuarterly = collectOfficialSnapshotGate(unreconciled, 'quarterly');
assert.ok(
  !unreconciledQuarterly.blockers.some((b) => b.key === 'treasury_unreconciled'),
  'quarterly: unreconciled treasury is not a blocker'
);
assert.ok(
  unreconciledQuarterly.warnings.some((b) => b.key === 'treasury_unreconciled'),
  'quarterly: unreconciled treasury is surfaced as a warning'
);

assert.deepStrictEqual(collectOfficialSnapshotGate(null, 'annual'), { blockers: [], warnings: [] }, 'null readiness is safe');

console.log('[check:government-finance-integrity] ok');
