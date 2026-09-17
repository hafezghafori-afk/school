const assert = require('assert');
const {
  allocateLedger,
  setChargeDiscount,
  setMonthlyDiscountRule,
  monthlyDiscountFor
} = require('../services/academyLedger');

// تخفیف روی ماهِ پرداخت‌شده و برگشتش — هستهٔ خالصِ recomputeRegistration.

const charge = (id, amount, discountAmount = 0) => ({ _id: id, amount, discountAmount });
const applyHealed = (payments, healed) => payments.map((p) => (
  healed.has(String(p._id)) ? { ...p, allocations: healed.get(String(p._id)) } : p
));
const paidOf = (result, id) => result.paidByCharge.get(id) || 0;

function checkPlainAllocation() {
  const charges = [charge('saratan', 2000), charge('asad', 2000)];
  const payments = [{ _id: 'p1', amount: 2000, allocations: [{ chargeId: 'saratan', amount: 2000 }] }];
  const result = allocateLedger(charges, payments);
  assert.strictEqual(paidOf(result, 'saratan'), 2000);
  assert.strictEqual(paidOf(result, 'asad'), 0);
  assert.strictEqual(result.healed.size, 0, 'a fully allocated payment must not be rewritten');
  assert.strictEqual(result.unallocated, 0);
}

function checkDiscountOnPaidMonthMovesSurplusAndBack() {
  const payments = [{ _id: 'p1', amount: 2000, allocations: [{ chargeId: 'saratan', amount: 2000 }] }];

  // تخفیفِ ۵۰۰ روی سرطانِ پرداخت‌شده → ۵۰۰ مازاد روی اسدِ باز
  const discounted = [charge('saratan', 2000, 500), charge('asad', 2000)];
  const afterDiscount = allocateLedger(discounted, payments);
  assert.strictEqual(paidOf(afterDiscount, 'saratan'), 1500);
  assert.strictEqual(paidOf(afterDiscount, 'asad'), 500);
  assert.deepStrictEqual(
    afterDiscount.healed.get('p1').map((a) => [a.chargeId, a.amount]),
    [['saratan', 2000], ['asad', 500]],
    'surplus is appended after the original allocation'
  );

  const persisted = applyHealed(payments, afterDiscount.healed);
  const again = allocateLedger(discounted, persisted);
  assert.strictEqual(again.healed.size, 0, 'recompute stays idempotent after healing');
  assert.strictEqual(paidOf(again, 'asad'), 500);

  // برداشتنِ تخفیف → پول به سرطان برمی‌گردد و دو بار شمرده نمی‌شود
  const restored = allocateLedger([charge('saratan', 2000), charge('asad', 2000)], persisted);
  assert.strictEqual(paidOf(restored, 'saratan'), 2000);
  assert.strictEqual(paidOf(restored, 'asad'), 0, 'stale surplus allocation must not claim the next month');
  assert.strictEqual(restored.totalPaid, 2000, 'one 2000 payment can never pay more than 2000');
}

function checkSurplusWithoutOpenMonthBecomesCredit() {
  const payments = [{ _id: 'p1', amount: 2000, allocations: [{ chargeId: 'saratan', amount: 2000 }] }];
  const result = allocateLedger([charge('saratan', 2000, 300)], payments);
  assert.strictEqual(paidOf(result, 'saratan'), 1700);
  assert.strictEqual(result.unallocated, 300, 'surplus with nothing open stays as credit');
  assert.strictEqual(result.healed.size, 0);
}

function checkFullDiscountAndOrdering() {
  const payments = [
    { _id: 'p1', amount: 2000, allocations: [{ chargeId: 'jawza', amount: 2000 }] },
    { _id: 'p2', amount: 2000, allocations: [{ chargeId: 'saratan', amount: 2000 }] }
  ];
  // تخفیفِ کامل روی جوزا: ۲۰۰۰ِ p1 روی قدیمی‌ترین قلمِ باز (اسد) می‌نشیند؛ p2 سرِ جایش
  const charges = [charge('jawza', 2000, 2000), charge('saratan', 2000), charge('asad', 2000)];
  const result = allocateLedger(charges, payments);
  assert.strictEqual(paidOf(result, 'jawza'), 0);
  assert.strictEqual(paidOf(result, 'saratan'), 2000);
  assert.strictEqual(paidOf(result, 'asad'), 2000);
  assert.strictEqual(result.totalPaid, 4000);
}

function checkSetChargeDiscount() {
  const c = { amount: 2000, discountAmount: 0, discountType: '', discountReason: '', discountHistory: [] };
  assert.strictEqual(setChargeDiscount(c, { amount: 500, discountType: 'sibling', discountReason: 'دو خواهر', by: 'u1', source: 'test' }), true);
  assert.strictEqual(c.discountAmount, 500);
  assert.strictEqual(c.discountType, 'sibling');
  assert.strictEqual(c.discountHistory.length, 1);
  assert.deepStrictEqual([c.discountHistory[0].from, c.discountHistory[0].to], [0, 500]);

  assert.strictEqual(setChargeDiscount(c, { amount: 500, discountType: 'sibling', discountReason: 'دلیلِ دیگر' }), false, 'same amount and type is a no-op');
  assert.strictEqual(c.discountHistory.length, 1);

  assert.strictEqual(setChargeDiscount(c, { amount: 9999, discountType: 'scholarship', discountReason: 'بورسیه' }), true);
  assert.strictEqual(c.discountAmount, 2000, 'discount is clamped to the fee');

  assert.strictEqual(setChargeDiscount(c, { amount: 0, discountType: 'scholarship', discountReason: 'پایانِ بورسیه' }), true);
  assert.strictEqual(c.discountAmount, 0);
  assert.strictEqual(c.discountType, '', 'no discount means no discount category');
  assert.strictEqual(c.discountReason, '');
  assert.strictEqual(c.discountHistory.at(-1).discountReason, 'پایانِ بورسیه', 'removal reason stays in history');
  assert.strictEqual(c.discountHistory.length, 3);
}

function checkMonthlyRule() {
  const reg = { monthlyDiscount: { amount: 0 }, monthlyDiscountHistory: [] };
  assert.strictEqual(monthlyDiscountFor(reg, '1405-06'), null);

  assert.strictEqual(setMonthlyDiscountRule(reg, { amount: 500, untilMonth: '1405-09', discountType: 'hardship', discountReason: 'تنگدستی', by: 'u1' }), true);
  assert.strictEqual(monthlyDiscountFor(reg, '1405-09').amount, 500);
  assert.strictEqual(monthlyDiscountFor(reg, '1405-10'), null, 'rule ends after untilMonth');
  assert.strictEqual(monthlyDiscountFor(reg, '1406-01'), null);

  assert.strictEqual(setMonthlyDiscountRule(reg, { amount: 500, untilMonth: '1405-09', discountType: 'hardship' }), false);
  assert.strictEqual(setMonthlyDiscountRule(reg, { amount: 500, untilMonth: '', discountType: 'hardship', discountReason: 'ادامه‌دار' }), true);
  assert.strictEqual(monthlyDiscountFor(reg, '1410-12').amount, 500, 'empty untilMonth is open-ended');

  assert.strictEqual(setMonthlyDiscountRule(reg, { amount: 0, untilMonth: '1405-09', discountReason: 'لغو' }), true);
  assert.strictEqual(reg.monthlyDiscount.untilMonth, '', 'a cleared rule keeps no end month');
  assert.strictEqual(monthlyDiscountFor(reg, '1405-06'), null);
  assert.strictEqual(reg.monthlyDiscountHistory.length, 3);
}

checkPlainAllocation();
checkDiscountOnPaidMonthMovesSurplusAndBack();
checkSurplusWithoutOpenMonthBecomesCredit();
checkFullDiscountAndOrdering();
checkSetChargeDiscount();
checkMonthlyRule();

console.log('[check:academy-ledger-discounts] ok');
