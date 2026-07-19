const Module = require('module');
const path = require('path');

const bills = [];
const feeOrders = [];
const feePlans = [];
let syncCount = 0;

class MockQuery {
  constructor(factory) {
    this.factory = factory;
  }

  sort() { return this; }
  limit() { return this; }
  select() { return this; }
  lean() { return this; }
  exec() { return Promise.resolve(this.factory()); }
  then(resolve, reject) { return this.exec().then(resolve, reject); }
  catch(reject) { return this.exec().catch(reject); }
}

const hasAdmission = (item = {}) => (
  (Array.isArray(item.feeScopes) && item.feeScopes.includes('admission'))
  || (Array.isArray(item.lineItems) && item.lineItems.some((line) => line?.feeType === 'admission'))
  || item.orderType === 'admission'
);

function FinanceBillMock(payload = {}) {
  Object.assign(this, payload);
  this._id = this._id || `bill-${bills.length + 1}`;
  this.createdAt = this.createdAt || new Date();
}

FinanceBillMock.prototype.save = async function save() {
  bills.push(this);
  return this;
};
FinanceBillMock.findOne = (filter = {}) => new MockQuery(() => bills.find((item) => (
  String(item.studentMembershipId || '') === String(filter.studentMembershipId || '')
  && item.status !== 'void'
  && hasAdmission(item)
)) || null);
FinanceBillMock.countDocuments = async () => bills.length;

const FeeOrderMock = {
  findOne(filter = {}) {
    return new MockQuery(() => feeOrders.find((item) => (
      String(item.studentMembershipId || '') === String(filter.studentMembershipId || '')
      && item.status !== 'void'
      && hasAdmission(item)
    )) || null);
  }
};

const FinanceFeePlanMock = {
  find(filter = {}) {
    return new MockQuery(() => feePlans.filter((plan) => {
      if (filter.classId && String(plan.classId || '') !== String(filter.classId)) return false;
      if (filter.course && String(plan.course || '') !== String(filter.course)) return false;
      if (filter.academicYearId && String(plan.academicYearId || '') !== String(filter.academicYearId)) return false;
      return plan.isActive !== false && !['inactive', 'archived'].includes(plan.lifecycleStatus);
    }));
  }
};

const AcademicYearMock = {
  findById(id) {
    return new MockQuery(() => ({ _id: id, title: '1405', code: 'AY-1405' }));
  }
};

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  const parentFile = String(parent?.filename || '').replace(/\\/g, '/');
  const isTransferService = parentFile.endsWith('/services/transferAdmissionBillingService.js');
  if (isTransferService && request === '../models/FinanceBill') return FinanceBillMock;
  if (isTransferService && request === '../models/FeeOrder') return FeeOrderMock;
  if (isTransferService && request === '../models/FinanceFeePlan') return FinanceFeePlanMock;
  if (isTransferService && request === '../models/AcademicYear') return AcademicYearMock;
  if (isTransferService && request === '../utils/studentFinanceSync') {
    return {
      syncStudentFinanceFromFinanceBill: async () => {
        syncCount += 1;
        return { ok: true };
      }
    };
  }
  return originalLoad.apply(this, arguments);
};

const servicePath = path.join(__dirname, '..', 'services', 'transferAdmissionBillingService.js');
delete require.cache[require.resolve(servicePath)];
const { buildAdmissionDueDate, issueTransferAdmissionBill } = require(servicePath);
Module._load = originalLoad;
const { isTransferAssignment } = require('../services/studentClassAssignmentService');

const assertCase = (condition, message) => {
  if (!condition) throw new Error(message);
};

const membership = {
  _id: 'membership-transfer-1',
  student: 'student-user-1',
  studentId: 'student-core-1',
  course: 'course-1',
  classId: 'class-1',
  academicYear: 'academic-year-1',
  academicYearId: 'academic-year-1',
  joinedAt: new Date('2026-07-19T08:00:00.000Z'),
  createdBy: 'admin-1'
};

async function run() {
  const futureDueDate = buildAdmissionDueDate(new Date('2099-07-19T08:00:00.000Z'), 10);
  assertCase(futureDueDate.getFullYear() === 2099 && futureDueDate.getMonth() === 7 && futureDueDate.getDate() === 10, 'expected a past due-day to roll into the next month');

  assertCase(
    isTransferAssignment({ student: { academicInfo: { enrollmentType: 'transfer' } }, payload: {} }),
    'expected transfer enrollment type detection'
  );
  assertCase(
    isTransferAssignment({ student: {}, payload: { previousSchool: 'Previous school' } }),
    'expected transfer detection from previous-school data'
  );
  assertCase(
    !isTransferAssignment({ student: { academicInfo: { enrollmentType: 'new' } }, payload: {} }),
    'expected ordinary enrollment not to be treated as a transfer'
  );

  feePlans.push({
    _id: 'plan-1',
    title: 'Standard 1405',
    classId: 'class-1',
    course: 'course-1',
    academicYearId: 'academic-year-1',
    tuitionFee: 1000,
    admissionFee: 600,
    dueDay: 20,
    currency: 'AFN',
    isDefault: true,
    priority: 1,
    isActive: true,
    lifecycleStatus: 'active'
  });

  const created = await issueTransferAdmissionBill({
    membership,
    actorId: 'admin-1',
    effectiveAt: membership.joinedAt
  });
  assertCase(created.created === true, 'expected the first transfer admission bill to be created');
  assertCase(created.reason === 'admission_bill_created', 'expected the created result reason');
  assertCase(bills.length === 1, 'expected one finance bill');
  assertCase(Number(created.bill.amountOriginal) === 600, 'expected admission amount from the fee plan');
  assertCase(created.bill.feeScopes?.length === 1 && created.bill.feeScopes[0] === 'admission', 'expected admission-only scope');
  assertCase(created.bill.lineItems?.length === 1 && created.bill.lineItems[0].feeType === 'admission', 'expected one admission line item');
  assertCase(String(created.bill.lineItems[0].sourcePlanId || '') === 'plan-1', 'expected fee plan traceability');
  assertCase(created.bill.issuanceKey === 'transfer-admission:membership-transfer-1', 'expected a stable idempotency key');
  assertCase(syncCount === 1, 'expected canonical student-finance synchronization');

  const repeated = await issueTransferAdmissionBill({ membership, actorId: 'admin-1' });
  assertCase(repeated.created === false, 'expected repeat issuance to be skipped');
  assertCase(repeated.reason === 'admission_already_issued', 'expected idempotent duplicate reason');
  assertCase(bills.length === 1, 'expected no duplicate admission bill');

  bills.length = 0;
  feePlans.length = 0;
  const missingPlan = await issueTransferAdmissionBill({ membership, actorId: 'admin-1' });
  assertCase(missingPlan.created === false && missingPlan.reason === 'fee_plan_not_found', 'expected a clear missing-plan result');

  feePlans.push({
    _id: 'plan-zero-admission',
    classId: 'class-1',
    course: 'course-1',
    academicYearId: 'academic-year-1',
    tuitionFee: 1000,
    admissionFee: 0,
    isActive: true,
    lifecycleStatus: 'active'
  });
  const missingAmount = await issueTransferAdmissionBill({ membership, actorId: 'admin-1' });
  assertCase(
    missingAmount.created === false && missingAmount.reason === 'admission_fee_not_configured',
    'expected a clear result when admission is not configured in the plan'
  );

  console.log('PASS  transfer admission creates one admission-only bill from the active plan');
  console.log('PASS  transfer admission issuance is idempotent');
  console.log('PASS  transfer admission reports missing plan and missing admission amount');
  console.log('PASS  class assignment distinguishes transfer students from ordinary enrollment');
  console.log('PASS  admission due date stays in the future when this month due-day has passed');
}

run().catch((error) => {
  console.error(`FAIL  ${error.message}`);
  process.exitCode = 1;
});
