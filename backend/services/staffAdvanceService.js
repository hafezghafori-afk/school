const StaffAdvance = require('../models/StaffAdvance');
const StaffSalaryPayment = require('../models/StaffSalaryPayment');
const AfghanTeacher = require('../models/AfghanTeacher');
const ExpenseEntry = require('../models/ExpenseEntry');
const FinanceTreasuryTransaction = require('../models/FinanceTreasuryTransaction');
const { resolveExpenseCategorySelection } = require('./expenseGovernanceService');
const { resolveQuarterForDate } = require('./financialPeriodService');

// Hard caps by kind (user decision): advances / withdrawals may not exceed one
// month of the person's salary basis; a staff loan may reach three months.
const KIND_CAP_MULTIPLIER = {
  salary_advance: 1,
  principal_withdrawal: 1,
  owner_withdrawal: 1,
  staff_loan: 3
};

const KIND_LABELS = {
  salary_advance: 'پیشکیِ معاش',
  principal_withdrawal: 'برداشتِ مدیر مکتب',
  owner_withdrawal: 'برداشتِ صاحب امتیاز',
  staff_loan: 'قرضِ کارمند'
};

const OPEN_STATUSES = ['approved'];
const DISBURSED_STATUSES = ['approved', 'settled', 'written_off', 'refunded'];
const QUEUE_STATUSES = ['draft', 'pending_review', 'rejected'];

function roundMoney(value = 0) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function normalizeText(value = '') {
  return String(value || '').trim();
}

function advanceCapFor(kind = '', monthlySalaryBasis = 0) {
  const multiplier = KIND_CAP_MULTIPLIER[normalizeText(kind)] || 1;
  return roundMoney((Number(monthlySalaryBasis) || 0) * multiplier);
}

// Throws a 400 with a Persian userMessage when the amount breaks the cap.
function assertAdvanceWithinCap({ kind = '', amount = 0, monthlySalaryBasis = 0 } = {}) {
  const basis = Number(monthlySalaryBasis) || 0;
  if (basis <= 0) {
    const error = new Error('staff_advance_basis_required');
    error.statusCode = 400;
    error.userMessage = 'معاشِ ماهانهٔ مبنا را وارد کنید.';
    throw error;
  }
  const value = Number(amount) || 0;
  if (value <= 0) {
    const error = new Error('staff_advance_amount_invalid');
    error.statusCode = 400;
    error.userMessage = 'مبلغِ پیشکی باید بزرگ‌تر از صفر باشد.';
    throw error;
  }
  const cap = advanceCapFor(kind, basis);
  if (value > cap + 0.001) {
    const multiplier = KIND_CAP_MULTIPLIER[normalizeText(kind)] || 1;
    const error = new Error('staff_advance_over_cap');
    error.statusCode = 400;
    error.userMessage = `مبلغ از سقفِ مجاز (${multiplier} برابرِ معاشِ مبنا = ${cap.toLocaleString('fa-AF')} افغانی) بیشتر است.`;
    throw error;
  }
  return cap;
}

// Full advance amount leaves the treasury on final approval. Modelled as a
// plain manual withdrawal transaction so the existing treasury fold
// (treasuryMetricsFold) reduces bookBalance with no new enum values. Idempotent
// on the advance id.
async function postAdvanceTreasuryDebit({ advance, actorId = null } = {}) {
  if (!advance) return null;
  if (advance.treasuryTransactionId) return advance.treasuryTransactionId;

  const groupKey = `staff_advance:${advance._id}`;
  const existing = await FinanceTreasuryTransaction.findOne({
    schoolId: advance.schoolId,
    idempotencyKey: groupKey,
    transactionType: 'withdrawal'
  });
  if (existing) {
    advance.treasuryTransactionId = existing._id;
    return existing._id;
  }

  const label = KIND_LABELS[advance.kind] || advance.kind || 'پیشکی';
  const name = normalizeText(advance.staffSnapshot?.name);
  try {
    const txn = await FinanceTreasuryTransaction.create({
      schoolId: advance.schoolId,
      financialYearId: advance.financialYearId,
      academicYearId: advance.academicYearId,
      accountId: advance.treasuryAccountId,
      transactionGroupKey: groupKey,
      idempotencyKey: groupKey,
      transactionType: 'withdrawal',
      direction: 'out',
      amount: roundMoney(advance.amount),
      currency: normalizeText(advance.currency).toUpperCase() || 'AFN',
      transactionDate: advance.issueDate || new Date(),
      sourceType: 'manual',
      referenceNo: groupKey,
      note: `${label}${name ? ` — ${name}` : ''}`.trim(),
      createdBy: actorId || null,
      updatedBy: actorId || null
    });
    advance.treasuryTransactionId = txn._id;
    return txn._id;
  } catch (error) {
    if (error?.code === 11000) {
      const found = await FinanceTreasuryTransaction.findOne({
        schoolId: advance.schoolId,
        idempotencyKey: groupKey,
        transactionType: 'withdrawal'
      });
      if (found) {
        advance.treasuryTransactionId = found._id;
        return found._id;
      }
    }
    throw error;
  }
}

async function voidAdvanceTreasuryDebit({ advance, actorId = null } = {}) {
  if (!advance?.treasuryTransactionId) return;
  await FinanceTreasuryTransaction.updateOne(
    { _id: advance.treasuryTransactionId, status: { $ne: 'void' } },
    { $set: { status: 'void', updatedBy: actorId || null, note: 'برگشت به‌دلیل باطل‌شدنِ پیشکی/برداشت.' } }
  );
}

function repaidTotal(row = {}) {
  return (Array.isArray(row.repayments) ? row.repayments : [])
    .reduce((sum, item) => sum + Math.max(0, Number(item?.amount) || 0), 0);
}

function serializeStaffAdvance(doc = {}) {
  const d = doc && typeof doc.toObject === 'function' ? doc.toObject() : (doc || {});
  return {
    _id: String(d._id || ''),
    staffId: d.staffId ? String(d.staffId._id || d.staffId) : '',
    staff: {
      name: normalizeText(d.staffSnapshot?.name),
      employeeId: normalizeText(d.staffSnapshot?.employeeId),
      position: normalizeText(d.staffSnapshot?.position)
    },
    kind: d.kind || '',
    kindLabel: KIND_LABELS[d.kind] || d.kind || '',
    amount: roundMoney(d.amount),
    currency: d.currency || 'AFN',
    monthlySalaryBasis: roundMoney(d.monthlySalaryBasis),
    cap: advanceCapFor(d.kind, d.monthlySalaryBasis),
    issueDate: d.issueDate || null,
    reason: d.reason || '',
    note: d.note || '',
    treasuryAccountId: d.treasuryAccountId ? String(d.treasuryAccountId._id || d.treasuryAccountId) : '',
    paymentMethod: d.paymentMethod || 'manual',
    repaymentPlan: {
      mode: d.repaymentPlan?.mode || 'next_salary',
      installmentAmount: roundMoney(d.repaymentPlan?.installmentAmount),
      months: Math.max(1, Number(d.repaymentPlan?.months) || 1)
    },
    repayments: (Array.isArray(d.repayments) ? d.repayments : []).map((item) => ({
      period: item?.period || '',
      amount: roundMoney(item?.amount),
      at: item?.at || null
    })),
    repaidAmount: roundMoney(repaidTotal(d)),
    outstandingAmount: roundMoney(d.outstandingAmount),
    status: d.status || 'draft',
    approvalStage: d.approvalStage || 'draft',
    approvalTrail: Array.isArray(d.approvalTrail) ? d.approvalTrail : [],
    settledAt: d.settledAt || null,
    createdAt: d.createdAt || null
  };
}

async function buildStaffAdvanceAnalytics({ schoolId = '', financialYearId = '', academicYearId = '' } = {}) {
  const filter = {};
  if (normalizeText(schoolId)) filter.schoolId = normalizeText(schoolId);
  if (normalizeText(financialYearId)) filter.financialYearId = normalizeText(financialYearId);
  if (normalizeText(academicYearId)) filter.academicYearId = normalizeText(academicYearId);

  const rows = await StaffAdvance.find(filter)
    .sort({ issueDate: -1, createdAt: -1 })
    .lean();

  const statusCounts = {
    draft: 0,
    pendingReview: 0,
    approved: 0,
    settled: 0,
    rejected: 0,
    void: 0,
    writtenOff: 0,
    refunded: 0
  };
  let totalAdvanced = 0;
  let totalOutstanding = 0;
  let totalRepaid = 0;
  const ledgerMap = new Map();

  for (const row of rows) {
    const status = normalizeText(row.status).toLowerCase();
    if (status === 'draft') statusCounts.draft += 1;
    else if (status === 'pending_review') statusCounts.pendingReview += 1;
    else if (status === 'approved') statusCounts.approved += 1;
    else if (status === 'settled') statusCounts.settled += 1;
    else if (status === 'rejected') statusCounts.rejected += 1;
    else if (status === 'void') statusCounts.void += 1;
    else if (status === 'written_off') statusCounts.writtenOff += 1;
    else if (status === 'refunded') statusCounts.refunded += 1;

    if (!DISBURSED_STATUSES.includes(status)) continue;

    const amount = roundMoney(row.amount);
    const repaid = roundMoney(repaidTotal(row));
    const outstanding = OPEN_STATUSES.includes(status) ? roundMoney(row.outstandingAmount) : 0;
    totalAdvanced += amount;
    totalRepaid += repaid;
    totalOutstanding += outstanding;

    const key = String(row.staffId || row.staffSnapshot?.name || row._id);
    const bucket = ledgerMap.get(key) || {
      staffId: row.staffId ? String(row.staffId) : '',
      name: normalizeText(row.staffSnapshot?.name) || 'بدون نام',
      employeeId: normalizeText(row.staffSnapshot?.employeeId),
      position: normalizeText(row.staffSnapshot?.position),
      advanced: 0,
      repaid: 0,
      outstanding: 0,
      openCount: 0,
      items: []
    };
    bucket.advanced += amount;
    bucket.repaid += repaid;
    bucket.outstanding += outstanding;
    if (OPEN_STATUSES.includes(status) && outstanding > 0) bucket.openCount += 1;
    bucket.items.push({
      _id: String(row._id || ''),
      kind: row.kind || '',
      kindLabel: KIND_LABELS[row.kind] || row.kind || '',
      amount,
      repaidAmount: repaid,
      outstanding,
      status,
      issueDate: row.issueDate || null
    });
    ledgerMap.set(key, bucket);
  }

  const ledger = [...ledgerMap.values()]
    .map((item) => ({
      ...item,
      advanced: roundMoney(item.advanced),
      repaid: roundMoney(item.repaid),
      outstanding: roundMoney(item.outstanding)
    }))
    .sort((left, right) => right.outstanding - left.outstanding);

  const openAdvances = rows.filter((row) => (
    normalizeText(row.status).toLowerCase() === 'approved' && roundMoney(row.outstandingAmount) > 0
  ));

  // Departed staff still carrying a balance — the year-close gate input.
  const openStaffIds = [...new Set(openAdvances.map((row) => String(row.staffId || '')).filter(Boolean))];
  const departed = { count: 0, amount: 0, names: [] };
  if (openStaffIds.length) {
    const activeRows = await AfghanTeacher.find({ _id: { $in: openStaffIds }, status: 'active' })
      .select('_id')
      .lean();
    const activeSet = new Set(activeRows.map((item) => String(item._id)));
    for (const row of openAdvances) {
      const staffId = String(row.staffId || '');
      if (staffId && !activeSet.has(staffId)) {
        departed.count += 1;
        departed.amount += roundMoney(row.outstandingAmount);
        const name = normalizeText(row.staffSnapshot?.name);
        if (name && !departed.names.includes(name)) departed.names.push(name);
      }
    }
    departed.amount = roundMoney(departed.amount);
  }

  const salaryFilter = {};
  if (normalizeText(schoolId)) salaryFilter.schoolId = normalizeText(schoolId);
  if (normalizeText(financialYearId)) salaryFilter.financialYearId = normalizeText(financialYearId);
  if (normalizeText(academicYearId)) salaryFilter.academicYearId = normalizeText(academicYearId);
  const salaryRows = await StaffSalaryPayment.find(salaryFilter)
    .sort({ paymentDate: -1, createdAt: -1 })
    .lean();
  const salaryPaidTotal = salaryRows
    .filter((row) => normalizeText(row.status).toLowerCase() === 'approved')
    .reduce((sum, row) => sum + roundMoney(row.deductionTotal), 0);

  return {
    summary: {
      totalAdvanced: roundMoney(totalAdvanced),
      totalRepaid: roundMoney(totalRepaid),
      totalOutstanding: roundMoney(totalOutstanding),
      openCount: openAdvances.length,
      staffCount: ledger.filter((item) => item.outstanding > 0).length,
      departedOutstanding: departed,
      salaryDeductedTotal: roundMoney(salaryPaidTotal),
      statusCounts
    },
    ledger: ledger.slice(0, 60),
    queue: rows
      .filter((row) => QUEUE_STATUSES.includes(normalizeText(row.status).toLowerCase()))
      .slice(0, 60)
      .map(serializeStaffAdvance),
    recent: rows.slice(0, 12).map(serializeStaffAdvance),
    salaryPayments: {
      queue: salaryRows
        .filter((row) => ['draft', 'pending_review', 'rejected'].includes(normalizeText(row.status).toLowerCase()))
        .slice(0, 40)
        .map(serializeStaffSalaryPayment),
      recent: salaryRows.slice(0, 12).map(serializeStaffSalaryPayment)
    }
  };
}

// --- Phase 2: individual salary payment with automatic advance deduction ---

// Suggested repayment for a person's next salary. Oldest advance first; each
// takes its planned installment (or the whole outstanding for a `next_salary`
// plan), never more than what is left in the gross salary — so a short month
// simply carries the rest to the next payment.
function computeSalaryDeduction({ openAdvances = [], grossSalary = 0 } = {}) {
  const gross = Math.max(0, Number(grossSalary) || 0);
  const sorted = (Array.isArray(openAdvances) ? openAdvances : [])
    .filter((advance) => roundMoney(advance?.outstandingAmount) > 0)
    .sort((left, right) => new Date(left.issueDate || 0).getTime() - new Date(right.issueDate || 0).getTime());
  let remaining = gross;
  const deductions = [];
  for (const advance of sorted) {
    if (remaining <= 0.001) break;
    const outstanding = roundMoney(advance.outstandingAmount);
    const installment = advance.repaymentPlan?.mode === 'installments'
      ? (roundMoney(advance.repaymentPlan.installmentAmount) || outstanding)
      : outstanding;
    const take = roundMoney(Math.min(outstanding, installment, remaining));
    if (take > 0) {
      deductions.push({ advanceId: String(advance._id), amount: take, kind: advance.kind || '' });
      remaining = roundMoney(remaining - take);
    }
  }
  const deductionTotal = roundMoney(gross - remaining);
  return { deductions, deductionTotal, netAmount: roundMoney(gross - deductionTotal) };
}

async function listOpenAdvancesForStaff({ schoolId, financialYearId = '', staffId = '', staffName = '' } = {}) {
  const filter = { schoolId, status: 'approved', outstandingAmount: { $gt: 0 } };
  if (normalizeText(financialYearId)) filter.financialYearId = normalizeText(financialYearId);
  if (normalizeText(staffId)) filter.staffId = normalizeText(staffId);
  else if (normalizeText(staffName)) filter['staffSnapshot.name'] = normalizeText(staffName);
  else return [];
  return StaffAdvance.find(filter).sort({ issueDate: 1, createdAt: 1 });
}

function serializeStaffSalaryPayment(doc = {}) {
  const d = doc && typeof doc.toObject === 'function' ? doc.toObject() : (doc || {});
  return {
    _id: String(d._id || ''),
    staffId: d.staffId ? String(d.staffId._id || d.staffId) : '',
    staff: {
      name: normalizeText(d.staffSnapshot?.name),
      employeeId: normalizeText(d.staffSnapshot?.employeeId),
      position: normalizeText(d.staffSnapshot?.position)
    },
    period: d.period || '',
    paymentDate: d.paymentDate || null,
    grossSalary: roundMoney(d.grossSalary),
    deductionTotal: roundMoney(d.deductionTotal),
    netAmount: roundMoney(d.netAmount),
    deductions: (Array.isArray(d.deductions) ? d.deductions : []).map((item) => ({
      advanceId: String(item.advanceId || ''),
      amount: roundMoney(item.amount),
      kind: item.kind || '',
      kindLabel: KIND_LABELS[item.kind] || item.kind || ''
    })),
    treasuryAccountId: d.treasuryAccountId ? String(d.treasuryAccountId._id || d.treasuryAccountId) : '',
    paymentMethod: d.paymentMethod || 'manual',
    salaryExpenseId: d.salaryExpenseId ? String(d.salaryExpenseId) : '',
    note: d.note || '',
    status: d.status || 'draft',
    approvalStage: d.approvalStage || 'draft',
    approvalTrail: Array.isArray(d.approvalTrail) ? d.approvalTrail : [],
    createdAt: d.createdAt || null
  };
}

async function resolveSalaryExpenseCategory(position = '') {
  const sub = normalizeText(position) === 'teacher' ? 'teachers' : 'staff';
  const attempts = [
    { category: 'salary', subCategory: sub },
    { category: 'salary', subCategory: '' },
    { category: 'other', subCategory: '' }
  ];
  for (const attempt of attempts) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const resolved = await resolveExpenseCategorySelection(attempt);
      return { category: resolved.category, subCategory: resolved.subCategory };
    } catch {
      // try the next fallback
    }
  }
  return { category: 'other', subCategory: '' };
}

// Runs when a salary payment reaches its final approval: books the NET salary
// as an approved ExpenseEntry (treasury debited by net) and posts one
// repayment installment onto each linked advance. Idempotent on
// payment.salaryExpenseId.
async function finalizeSalaryPayment({ payment, financialYear, actorId = null } = {}) {
  if (!payment) return null;
  if (payment.salaryExpenseId) return payment.salaryExpenseId;

  const advanceIds = (payment.deductions || []).map((item) => String(item.advanceId)).filter(Boolean);
  const advances = advanceIds.length
    ? await StaffAdvance.find({ _id: { $in: advanceIds }, schoolId: payment.schoolId })
    : [];
  const advanceById = new Map(advances.map((advance) => [String(advance._id), advance]));

  for (const deduction of payment.deductions || []) {
    const advance = advanceById.get(String(deduction.advanceId));
    if (!advance || advance.status !== 'approved') {
      const error = new Error('staff_salary_deduction_target_invalid');
      error.statusCode = 409;
      error.userMessage = 'یکی از پیشکی‌های مرتبط دیگر فعال نیست؛ پرداختِ معاش را دوباره بسازید.';
      throw error;
    }
    if (roundMoney(deduction.amount) > roundMoney(advance.outstandingAmount) + 0.001) {
      const error = new Error('staff_salary_deduction_exceeds_outstanding');
      error.statusCode = 409;
      error.userMessage = 'ماندهٔ یکی از پیشکی‌ها تغییر کرده؛ پرداختِ معاش را دوباره بسازید.';
      throw error;
    }
  }

  const { category, subCategory } = await resolveSalaryExpenseCategory(payment.staffSnapshot?.position);
  const now = new Date();
  const staffName = normalizeText(payment.staffSnapshot?.name);
  const expense = await ExpenseEntry.create({
    schoolId: payment.schoolId,
    financialYearId: payment.financialYearId,
    academicYearId: payment.academicYearId,
    classId: null,
    category,
    subCategory,
    amount: roundMoney(payment.netAmount),
    currency: 'AFN',
    expenseDate: payment.paymentDate,
    periodQuarter: resolveQuarterForDate(financialYear, payment.paymentDate),
    paymentMethod: payment.paymentMethod || 'manual',
    treasuryAccountId: payment.treasuryAccountId || null,
    procurementCommitmentId: null,
    vendorName: staffName,
    referenceNo: `staff_salary:${payment._id}`,
    note: `معاشِ ${payment.period}${staffName ? ` — ${staffName}` : ''}: ناخالص ${roundMoney(payment.grossSalary)} − پیشکی ${roundMoney(payment.deductionTotal)} = خالص ${roundMoney(payment.netAmount)}`,
    status: 'approved',
    approvalStage: 'completed',
    submittedBy: actorId || null,
    submittedAt: now,
    approvedBy: actorId || null,
    approvedAt: now,
    createdBy: actorId || null,
    updatedBy: actorId || null,
    approvalTrail: [
      { level: 'finance_manager', action: 'submit', by: actorId || null, at: now, note: 'Auto-created from staff salary payment.', reason: '' },
      { level: 'general_president', action: 'approve', by: actorId || null, at: now, note: 'Salary payment approved.', reason: '' }
    ]
  });
  payment.salaryExpenseId = expense._id;

  for (const deduction of payment.deductions || []) {
    const advance = advanceById.get(String(deduction.advanceId));
    advance.repayments.push({
      period: payment.period,
      amount: roundMoney(deduction.amount),
      salaryExpenseId: expense._id,
      by: actorId || null,
      at: now
    });
    advance.updatedBy = actorId || null;
    // eslint-disable-next-line no-await-in-loop
    await advance.save();
  }

  return expense._id;
}

module.exports = {
  KIND_CAP_MULTIPLIER,
  KIND_LABELS,
  advanceCapFor,
  assertAdvanceWithinCap,
  postAdvanceTreasuryDebit,
  voidAdvanceTreasuryDebit,
  serializeStaffAdvance,
  buildStaffAdvanceAnalytics,
  computeSalaryDeduction,
  listOpenAdvancesForStaff,
  serializeStaffSalaryPayment,
  finalizeSalaryPayment
};
