const assert = require('assert');

const {
  buildClassDiscountGroupKey,
  buildDiscountRepairIdentity,
  buildDiscountRegistryIdentity,
  buildDiscountRegistryKey,
  buildManualDiscountSourceKey,
  groupDuplicateDiscounts,
  groupRepairableDiscounts,
  normalizeId
} = require('../utils/discountRegistryIdentity');

function fakeObjectId(value) {
  return { toString: () => value };
}

const base = {
  studentMembershipId: fakeObjectId('membership-1'),
  classId: fakeObjectId('class-1'),
  academicYearId: fakeObjectId('year-1'),
  discountType: 'discount',
  targetScope: 'class',
  coverageMode: 'fixed',
  amount: 1000,
  percentage: 0,
  durationMode: 'academic_year',
  startDate: '2026-03-21T08:35:00.000Z',
  endDate: '2027-03-20T20:00:00.000Z',
  reason: '  تخفیف   صنفی  '
};

assert.strictEqual(normalizeId(base.studentMembershipId), 'membership-1');
assert.strictEqual(
  buildDiscountRegistryIdentity(base),
  buildDiscountRegistryIdentity({
    ...base,
    sourceKey: 'manual:legacy:123',
    groupKey: 'class:legacy:123',
    createdAt: '2026-03-21T08:35:00.000Z',
    startDate: '2026-03-21T19:55:00.000Z',
    reason: 'تخفیف صنفی'
  }),
  'Retry-only metadata, whitespace, and time-of-day must not change the logical discount identity.'
);

assert.strictEqual(buildDiscountRegistryKey(base), buildDiscountRegistryKey({ ...base }));
assert.strictEqual(buildManualDiscountSourceKey(base), buildManualDiscountSourceKey({ ...base }));
assert.strictEqual(
  buildClassDiscountGroupKey(base),
  buildClassDiscountGroupKey({ ...base, studentMembershipId: fakeObjectId('membership-2') }),
  'Every member of the same class discount must share one stable group key.'
);

assert.notStrictEqual(
  buildDiscountRegistryIdentity(base),
  buildDiscountRegistryIdentity({ ...base, studentMembershipId: fakeObjectId('membership-2') })
);
assert.notStrictEqual(
  buildDiscountRegistryIdentity(base),
  buildDiscountRegistryIdentity({ ...base, amount: 800 })
);
assert.notStrictEqual(
  buildDiscountRegistryIdentity(base),
  buildDiscountRegistryIdentity({ ...base, reason: 'تخفیف دیگری' })
);

assert.strictEqual(
  buildDiscountRepairIdentity(base),
  buildDiscountRepairIdentity({
    ...base,
    reason: 'تخفیف دیگری',
    startDate: '2026-04-10T08:00:00.000Z',
    endDate: '2027-04-09T08:00:00.000Z'
  }),
  'Annual legacy repair must tolerate changed reasons and generated annual dates.'
);
assert.notStrictEqual(
  buildDiscountRepairIdentity(base),
  buildDiscountRepairIdentity({ ...base, amount: 800 }),
  'Different discount amounts must never be merged by repair.'
);

const duplicateGroups = groupDuplicateDiscounts([
  { ...base, _id: 'discount-1', sourceKey: 'manual:old:1', groupKey: 'class:old:1' },
  { ...base, _id: 'discount-2', sourceKey: 'manual:old:2', groupKey: 'class:old:2' },
  { ...base, _id: 'discount-3', studentMembershipId: fakeObjectId('membership-2') }
]);

assert.strictEqual(duplicateGroups.length, 1);
assert.deepStrictEqual(duplicateGroups[0].rows.map((item) => item._id), ['discount-1', 'discount-2']);

const repairableGroups = groupRepairableDiscounts([
  { ...base, _id: 'discount-1', reason: '', startDate: '2026-03-21T08:00:00.000Z' },
  { ...base, _id: 'discount-2', reason: 'Relief (tuition)', startDate: '2026-05-01T08:00:00.000Z' },
  { ...base, _id: 'discount-3', amount: 800 },
  { ...base, _id: 'discount-4', studentMembershipId: fakeObjectId('membership-2') }
]);

assert.strictEqual(repairableGroups.length, 1);
assert.deepStrictEqual(repairableGroups[0].rows.map((item) => item._id), ['discount-1', 'discount-2']);

console.log('Discount registry idempotency and duplicate grouping checks passed.');
