const StaffAdvance = require('../models/StaffAdvance');
const AfghanTeacher = require('../models/AfghanTeacher');
const FinanceTreasuryTransaction = require('../models/FinanceTreasuryTransaction');

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

  return {
    summary: {
      totalAdvanced: roundMoney(totalAdvanced),
      totalRepaid: roundMoney(totalRepaid),
      totalOutstanding: roundMoney(totalOutstanding),
      openCount: openAdvances.length,
      staffCount: ledger.filter((item) => item.outstanding > 0).length,
      departedOutstanding: departed,
      statusCounts
    },
    ledger: ledger.slice(0, 60),
    queue: rows
      .filter((row) => QUEUE_STATUSES.includes(normalizeText(row.status).toLowerCase()))
      .slice(0, 60)
      .map(serializeStaffAdvance),
    recent: rows.slice(0, 12).map(serializeStaffAdvance)
  };
}

module.exports = {
  KIND_CAP_MULTIPLIER,
  KIND_LABELS,
  advanceCapFor,
  assertAdvanceWithinCap,
  postAdvanceTreasuryDebit,
  voidAdvanceTreasuryDebit,
  serializeStaffAdvance,
  buildStaffAdvanceAnalytics
};
