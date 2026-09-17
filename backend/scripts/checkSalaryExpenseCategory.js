const assert = require('assert');
const Module = require('module');

// Salary payments book their net amount as an approved ExpenseEntry. It must land
// under the chart's «معاشات و مزایا» (payroll) with the sub-category of the
// person's «سمت» — never under the legacy salary / other keys the expense-chart
// migration deactivated.

const PAYROLL_SUBS = ['teacher_salary', 'admin_staff', 'service_staff', 'overtime', 'bonus'];
const registry = { categories: [] };
const resetRegistry = () => {
  registry.categories = [
    { key: 'payroll', isActive: true, subCategories: PAYROLL_SUBS.map((key) => ({ key, isActive: true })) },
    { key: 'salary', isActive: false, subCategories: [{ key: 'teachers', isActive: true }, { key: 'staff', isActive: true }] },
    { key: 'other', isActive: false, subCategories: [] }
  ];
};

// Same contract as expenseGovernanceService.resolveExpenseCategorySelection:
// active category required; a non-empty sub-category must be active under it.
const expenseGovernanceStub = {
  async resolveExpenseCategorySelection({ category = '', subCategory = '' } = {}) {
    const definition = registry.categories.find((item) => item.key === category && item.isActive);
    if (!definition) {
      const error = new Error('finance_expense_category_invalid');
      error.statusCode = 400;
      throw error;
    }
    if (!subCategory) return { category: definition.key, subCategory: '' };
    const sub = definition.subCategories.find((item) => item.key === subCategory && item.isActive !== false);
    if (!sub) {
      const error = new Error('finance_expense_subcategory_invalid');
      error.statusCode = 400;
      throw error;
    }
    return { category: definition.key, subCategory: sub.key };
  }
};

const createdExpenses = [];
const expenseEntryStub = {
  async create(doc) {
    const item = { _id: `expense-${createdExpenses.length + 1}`, ...doc };
    createdExpenses.push(item);
    return item;
  }
};

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  const parentFile = String(parent?.filename || '').replace(/\\/g, '/');
  if (parentFile.endsWith('/services/staffAdvanceService.js')) {
    if (request === './expenseGovernanceService') return expenseGovernanceStub;
    if (request === '../models/ExpenseEntry') return expenseEntryStub;
  }
  return originalLoad.call(this, request, parent, isMain);
};
const { resolveSalaryExpenseCategory, finalizeSalaryPayment } = require('../services/staffAdvanceService');
Module._load = originalLoad;

const { EXPENSE_CHART, PAYROLL_SUBCATEGORY_BY_STAFF_POSITION } = require('../config/expenseChart');
const AfghanTeacher = require('../models/AfghanTeacher');

async function run() {
  resetRegistry();

  // Every «سمت» of the staff registration form maps to a payroll sub-category
  // that exists in the chart. A new position fails here until it is mapped.
  const formPositions = AfghanTeacher.schema.path('employmentInfo.position').enumValues;
  const chartPayrollSubs = new Set((EXPENSE_CHART.find((item) => item.key === 'payroll')?.subCategories || []).map((item) => item.key));
  assert.ok(formPositions.length >= 5, 'expected the staff position enum to be readable');
  formPositions.forEach((position) => {
    const sub = PAYROLL_SUBCATEGORY_BY_STAFF_POSITION[position];
    assert.ok(sub, `position «${position}» has no payroll sub-category`);
    assert.ok(chartPayrollSubs.has(sub), `payroll sub-category «${sub}» for «${position}» is not in the expense chart`);
  });

  const expectations = [
    ['teacher', 'teacher_salary'],
    ['principal', 'admin_staff'],
    ['vice_principal', 'admin_staff'],
    ['admin_staff', 'admin_staff'],
    ['support_staff', 'service_staff'],
    [' teacher ', 'teacher_salary'],
    ['', ''],
    ['driver', '']
  ];
  for (const [position, subCategory] of expectations) {
    assert.deepStrictEqual(
      await resolveSalaryExpenseCategory(position),
      { category: 'payroll', subCategory },
      `position «${position}»`
    );
  }

  // A deactivated sub-category falls back to payroll without one.
  registry.categories[0].subCategories.find((item) => item.key === 'service_staff').isActive = false;
  assert.deepStrictEqual(await resolveSalaryExpenseCategory('support_staff'), { category: 'payroll', subCategory: '' });

  // Payroll unavailable → a clear error, even when the legacy keys are active.
  resetRegistry();
  registry.categories[0].isActive = false;
  registry.categories[1].isActive = true;
  registry.categories[2].isActive = true;
  await assert.rejects(
    () => resolveSalaryExpenseCategory('teacher'),
    (error) => error.message === 'staff_salary_expense_category_unavailable'
      && error.statusCode === 409
      && /معاشات و مزایا/.test(error.userMessage || '')
  );

  // The booked expense itself carries the payroll category.
  resetRegistry();
  const payment = {
    _id: 'payment-1',
    schoolId: 'school-1',
    financialYearId: 'fy-1',
    academicYearId: 'ay-1',
    staffSnapshot: { name: 'احمد', employeeId: 'T-1', position: 'support_staff' },
    period: '1405-06',
    paymentDate: new Date('2026-09-13T00:00:00.000Z'),
    grossSalary: 8000,
    deductionTotal: 0,
    netAmount: 8000,
    deductions: [],
    paymentMethod: 'cash',
    treasuryAccountId: 'account-1'
  };
  const expenseId = await finalizeSalaryPayment({
    payment,
    financialYear: { startDate: new Date('2026-03-21T00:00:00.000Z'), endDate: new Date('2027-03-20T00:00:00.000Z') },
    actorId: 'user-1'
  });
  assert.strictEqual(expenseId, 'expense-1', 'expected the salary expense to be created');
  assert.strictEqual(payment.salaryExpenseId, 'expense-1', 'expected the payment to link its expense');
  assert.strictEqual(createdExpenses[0].category, 'payroll');
  assert.strictEqual(createdExpenses[0].subCategory, 'service_staff');
  assert.strictEqual(createdExpenses[0].referenceNo, 'staff_salary:payment-1');
  assert.strictEqual(createdExpenses[0].amount, 8000);

  console.log('[check:salary-expense-category] ok');
}

run().catch((error) => {
  console.error('[check:salary-expense-category] failed:', error?.message || error);
  process.exitCode = 1;
});
