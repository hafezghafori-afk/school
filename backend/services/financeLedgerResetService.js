const crypto = require('node:crypto');
const mongoose = require('mongoose');

const AfghanSchool = require('../models/AfghanSchool');
const AcademicYear = require('../models/AcademicYear');
const ActivityLog = require('../models/ActivityLog');
const Discount = require('../models/Discount');
const FeeOrder = require('../models/FeeOrder');
const FeePayment = require('../models/FeePayment');
const FinanceAnomalyCase = require('../models/FinanceAnomalyCase');
const FinanceBill = require('../models/FinanceBill');
const FinanceDeliveryCampaign = require('../models/FinanceDeliveryCampaign');
const FinanceDocumentArchive = require('../models/FinanceDocumentArchive');
const FinanceMonthClose = require('../models/FinanceMonthClose');
const FinanceReceipt = require('../models/FinanceReceipt');
const FinanceRelief = require('../models/FinanceRelief');
const FinanceTreasuryAccount = require('../models/FinanceTreasuryAccount');
const FinanceTreasuryTransaction = require('../models/FinanceTreasuryTransaction');
const FinancialYear = require('../models/FinancialYear');
const GovernmentFinanceSnapshot = require('../models/GovernmentFinanceSnapshot');
const Order = require('../models/Order');
const SchoolClass = require('../models/SchoolClass');
const StudentMembership = require('../models/StudentMembership');
const User = require('../models/User');
const { databaseFingerprint, verifyDatabaseBackup } = require('./databaseBackupService');
const { assertFinanceMaintenanceLock } = require('./financeMaintenanceService');

const PROTECTED_MONTH_CLOSE_STATUSES = ['pending_review', 'closed', 'reopened'];
const asId = (value) => String(value?._id || value?.id || value || '').trim();
const uniqueIds = (items = []) => Array.from(new Set((items || []).map(asId).filter(Boolean))).sort();
const money = (value) => Math.round((Number(value) || 0) * 100) / 100;
const sum = (items = [], field = '') => money(items.reduce((total, item) => total + Number(item?.[field] || 0), 0));
const withSession = (query, session = null) => (session ? query.session(session) : query);

function pushInClause(clauses, field, ids = []) {
  const normalized = uniqueIds(ids);
  if (normalized.length) clauses.push({ [field]: { $in: normalized } });
}

function buildOrFilter(clauses = [], fallback = null) {
  const rows = (clauses || []).filter(Boolean);
  if (!rows.length) return fallback || { _id: { $in: [] } };
  return rows.length === 1 ? rows[0] : { $or: rows };
}

function buildLegacyLinkFilter(scope = {}) {
  const clauses = [];
  pushInClause(clauses, 'classId', scope.classIds);
  pushInClause(clauses, 'academicYearId', scope.academicYearIds);
  pushInClause(clauses, 'studentMembershipId', scope.membershipIds);
  if (scope.studentIds?.length && scope.courseIds?.length) {
    clauses.push({
      $and: [
        { student: { $in: scope.studentIds } },
        { course: { $in: scope.courseIds } }
      ]
    });
  }
  return buildOrFilter(clauses);
}

function buildOwnedFilter(scope = {}) {
  if (scope.allSchools) return {};
  const legacyLinkFilter = buildLegacyLinkFilter(scope);
  return {
    $or: [
      { schoolId: scope.schoolId },
      {
        $and: [
          { $or: [{ schoolId: null }, { schoolId: { $exists: false } }] },
          legacyLinkFilter
        ]
      }
    ]
  };
}

function buildMissingSchoolLinkFilter(linkFilter = null) {
  if (!linkFilter) return null;
  return {
    $and: [
      { $or: [{ schoolId: null }, { schoolId: { $exists: false } }] },
      linkFilter
    ]
  };
}

function buildOwnedLinkedFilter(scope = {}, linkFilter = null) {
  if (!linkFilter) return { _id: { $in: [] } };
  if (scope.allSchools) return linkFilter;
  return {
    $and: [
      linkFilter,
      {
        $or: [
          { schoolId: scope.schoolId },
          { schoolId: null },
          { schoolId: { $exists: false } }
        ]
      }
    ]
  };
}

function buildConflictingOwnershipFilter(scope = {}, linkedFilters = []) {
  if (scope.allSchools) return { _id: { $in: [] } };
  return {
    $and: [
      { schoolId: { $exists: true, $nin: [null, scope.schoolId] } },
      buildOrFilter([buildLegacyLinkFilter(scope), ...(linkedFilters || [])])
    ]
  };
}

async function resolveResetScope({ schoolId = '', allSchools = false, session = null } = {}) {
  if (allSchools) {
    return {
      allSchools: true,
      schoolId: '',
      school: null,
      classIds: [],
      courseIds: [],
      studentIds: [],
      academicYearIds: [],
      financialYearIds: [],
      membershipIds: [],
      membershipOwnershipConflicts: []
    };
  }

  const normalizedSchoolId = asId(schoolId);
  if (!mongoose.Types.ObjectId.isValid(normalizedSchoolId)) throw new Error('finance_ledger_reset_school_required');
  const school = await withSession(
    AfghanSchool.findById(normalizedSchoolId).select('_id name nameDari schoolCode status'),
    session
  ).lean();
  if (!school) throw new Error('finance_ledger_reset_school_not_found');

  const [classes, academicYearIds, financialYearIds] = await Promise.all([
    withSession(SchoolClass.find({ schoolId: normalizedSchoolId }).select('_id legacyCourseId'), session).lean(),
    withSession(AcademicYear.find({ schoolId: normalizedSchoolId }).distinct('_id'), session),
    withSession(FinancialYear.find({ schoolId: normalizedSchoolId }).distinct('_id'), session)
  ]);
  const classIds = uniqueIds(classes);
  const classCourseIds = uniqueIds(classes.map((item) => item.legacyCourseId));
  const membershipFilter = {
    $or: [
      { schoolId: normalizedSchoolId },
      {
        $and: [
          { $or: [{ schoolId: null }, { schoolId: { $exists: false } }] },
          { classId: { $in: classIds } }
        ]
      }
    ]
  };
  const [memberships, conflictingClassMemberships] = await Promise.all([
    withSession(
      StudentMembership.find(membershipFilter).select('_id student course schoolId classId'),
      session
    ).lean(),
    classIds.length
      ? withSession(StudentMembership.find({
          schoolId: { $exists: true, $nin: [null, normalizedSchoolId] },
          classId: { $in: classIds }
        }).select('_id schoolId classId student'), session).lean()
      : []
  ]);
  const targetClassIdSet = new Set(classIds);
  const membershipOwnershipConflicts = [
    ...memberships
      .filter((item) => asId(item.schoolId) === normalizedSchoolId && !targetClassIdSet.has(asId(item.classId)))
      .map((item) => ({
        kind: 'StudentMembership',
        id: asId(item),
        schoolId: asId(item.schoolId),
        classId: asId(item.classId),
        reason: asId(item.classId) ? 'class_outside_school' : 'class_missing'
      })),
    ...conflictingClassMemberships.map((item) => ({
      kind: 'StudentMembership',
      id: asId(item),
      schoolId: asId(item.schoolId),
      classId: asId(item.classId),
      reason: 'class_school_conflict'
    }))
  ];

  return {
    allSchools: false,
    schoolId: normalizedSchoolId,
    school: {
      id: normalizedSchoolId,
      name: String(school.nameDari || school.name || '').trim(),
      code: String(school.schoolCode || '').trim(),
      status: String(school.status || '').trim()
    },
    classIds,
    courseIds: uniqueIds([...classCourseIds, ...memberships.map((item) => item.course)]),
    studentIds: uniqueIds(memberships.map((item) => item.student)),
    academicYearIds: uniqueIds(academicYearIds),
    financialYearIds: uniqueIds(financialYearIds),
    membershipIds: uniqueIds(memberships),
    membershipOwnershipConflicts
  };
}

function isProtectedMonthClose(item = {}) {
  return PROTECTED_MONTH_CLOSE_STATUSES.includes(String(item.status || '').trim())
    || (Array.isArray(item.approvalTrail) && item.approvalTrail.length > 0)
    || (Array.isArray(item.history) && item.history.length > 0);
}

function isManagerDiscount(item = {}) {
  return Boolean(item.createdBy)
    || ['manual', 'migration'].includes(String(item.source || '').trim().toLowerCase());
}

function isManagerRelief(item = {}) {
  return ['manual', 'migration'].includes(String(item.sourceModel || '').trim().toLowerCase())
    && Boolean(item.createdBy || item.approvedBy);
}

function collectOutboundOwnershipConflicts({
  scope = {},
  financeBills = [],
  feeOrders = [],
  financeReceipts = [],
  feePayments = [],
  treasuryTransactions = [],
  treasuryAccounts = []
} = {}) {
  if (scope.allSchools) return [];

  const targetSchoolId = asId(scope.schoolId);
  const allowed = {
    memberships: new Set(uniqueIds(scope.membershipIds)),
    classes: new Set(uniqueIds(scope.classIds)),
    academicYears: new Set(uniqueIds(scope.academicYearIds)),
    courses: new Set(uniqueIds(scope.courseIds)),
    financeBills: new Set(uniqueIds(financeBills)),
    feeOrders: new Set(uniqueIds(feeOrders)),
    financeReceipts: new Set(uniqueIds(financeReceipts)),
    feePayments: new Set(uniqueIds(feePayments))
  };
  const accountById = new Map((treasuryAccounts || []).map((item) => [asId(item), item]));
  const conflicts = [];

  const addConflict = ({ item, kind, field, targetKind, targetId, reason = 'linked_record_outside_reset_scope' }) => {
    const normalizedTargetId = asId(targetId);
    if (!normalizedTargetId) return;
    conflicts.push({
      kind,
      id: asId(item),
      schoolId: asId(item?.schoolId),
      field,
      targetKind,
      targetId: normalizedTargetId,
      reason
    });
  };
  const requireAllowed = ({ item, kind, field, targetKind, targetId, allowedIds }) => {
    const normalizedTargetId = asId(targetId);
    if (normalizedTargetId && !allowedIds.has(normalizedTargetId)) {
      addConflict({ item, kind, field, targetKind, targetId: normalizedTargetId });
    }
  };
  const requireScopeIdentity = (item, kind) => {
    requireAllowed({ item, kind, field: 'studentMembershipId', targetKind: 'StudentMembership', targetId: item?.studentMembershipId, allowedIds: allowed.memberships });
    requireAllowed({ item, kind, field: 'classId', targetKind: 'SchoolClass', targetId: item?.classId, allowedIds: allowed.classes });
    requireAllowed({ item, kind, field: 'academicYearId', targetKind: 'AcademicYear', targetId: item?.academicYearId, allowedIds: allowed.academicYears });
  };

  for (const item of financeBills || []) {
    requireScopeIdentity(item, 'FinanceBill');
    requireAllowed({ item, kind: 'FinanceBill', field: 'course', targetKind: 'Course', targetId: item?.course, allowedIds: allowed.courses });
  }
  for (const item of feeOrders || []) {
    requireScopeIdentity(item, 'FeeOrder');
    requireAllowed({ item, kind: 'FeeOrder', field: 'sourceBillId', targetKind: 'FinanceBill', targetId: item?.sourceBillId, allowedIds: allowed.financeBills });
  }
  for (const item of financeReceipts || []) {
    requireScopeIdentity(item, 'FinanceReceipt');
    requireAllowed({ item, kind: 'FinanceReceipt', field: 'bill', targetKind: 'FinanceBill', targetId: item?.bill, allowedIds: allowed.financeBills });
  }
  for (const item of feePayments || []) {
    requireScopeIdentity(item, 'FeePayment');
    requireAllowed({ item, kind: 'FeePayment', field: 'sourceReceiptId', targetKind: 'FinanceReceipt', targetId: item?.sourceReceiptId, allowedIds: allowed.financeReceipts });
    requireAllowed({ item, kind: 'FeePayment', field: 'feeOrderId', targetKind: 'FeeOrder', targetId: item?.feeOrderId, allowedIds: allowed.feeOrders });
    for (const allocation of item?.allocations || []) {
      requireAllowed({ item, kind: 'FeePayment', field: 'allocations.feeOrderId', targetKind: 'FeeOrder', targetId: allocation?.feeOrderId, allowedIds: allowed.feeOrders });
    }
  }

  for (const item of treasuryTransactions || []) {
    const groupKey = String(item?.transactionGroupKey || '').trim();
    const paymentId = groupKey.match(/^fee-payment:([a-f0-9]{24})$/i)?.[1] || '';
    if (!paymentId || !allowed.feePayments.has(paymentId)) {
      addConflict({
        item,
        kind: 'FinanceTreasuryTransaction',
        field: 'transactionGroupKey',
        targetKind: 'FeePayment',
        targetId: paymentId || groupKey || asId(item),
        reason: paymentId ? 'linked_record_outside_reset_scope' : 'fee_payment_link_invalid'
      });
    }
    for (const field of ['accountId', 'counterAccountId']) {
      const accountId = asId(item?.[field]);
      if (!accountId) continue;
      const account = accountById.get(accountId);
      const accountSchoolId = asId(account?.schoolId);
      if (!account || accountSchoolId !== targetSchoolId) {
        addConflict({
          item,
          kind: 'FinanceTreasuryTransaction',
          field,
          targetKind: 'FinanceTreasuryAccount',
          targetId: accountId,
          reason: account ? 'treasury_account_school_conflict' : 'treasury_account_missing'
        });
      }
    }
  }

  return conflicts.sort((left, right) => (
    `${left.kind}:${left.id}:${left.field}:${left.targetId}`
      .localeCompare(`${right.kind}:${right.id}:${right.field}:${right.targetId}`)
  ));
}

function computePlanDigest(plan = {}) {
  const normalizedBlockers = Object.fromEntries(
    Object.entries(plan.blockers || {}).map(([key, items]) => [
      key,
      [...(items || [])].sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)))
    ])
  );
  const stable = {
    scope: plan.scope,
    counts: plan.counts,
    amounts: plan.amounts,
    blockers: normalizedBlockers,
    ids: plan.ids,
    versions: plan.versions
  };
  return crypto.createHash('sha256').update(JSON.stringify(stable)).digest('hex');
}

async function collectFinanceLedgerResetPlan({ schoolId = '', allSchools = false, session = null } = {}) {
  const scope = await resolveResetScope({ schoolId, allSchools, session });
  const ownedFilter = buildOwnedFilter(scope);
  const conflictFilter = buildConflictingOwnershipFilter(scope);

  const [financeBills, conflictingBills] = await Promise.all([
    withSession(FinanceBill.find(ownedFilter)
      .select('_id schoolId amountOriginal amountDue amountPaid status billNumber studentMembershipId classId academicYearId course updatedAt'), session).lean(),
    withSession(FinanceBill.find(conflictFilter).select('_id billNumber schoolId classId academicYearId studentMembershipId'), session).lean()
  ]);
  const financeBillIds = uniqueIds(financeBills);

  const orderBillLink = financeBillIds.length ? { sourceBillId: { $in: financeBillIds } } : null;
  const orderClauses = scope.allSchools
    ? [{}]
    : [ownedFilter, buildMissingSchoolLinkFilter(orderBillLink)].filter(Boolean);
  const orderConflictFilter = buildConflictingOwnershipFilter(scope, [orderBillLink].filter(Boolean));
  const [feeOrders, conflictingOrders] = await Promise.all([
    withSession(FeeOrder.find(buildOrFilter(orderClauses))
      .select('_id schoolId amountOriginal amountDue amountPaid outstandingAmount status orderNumber sourceBillId studentMembershipId classId academicYearId updatedAt'), session).lean(),
    withSession(FeeOrder.find(orderConflictFilter).select('_id orderNumber schoolId classId academicYearId studentMembershipId sourceBillId'), session).lean()
  ]);
  const feeOrderIds = uniqueIds(feeOrders);

  const receiptBillLink = financeBillIds.length ? { bill: { $in: financeBillIds } } : null;
  const receiptClauses = scope.allSchools
    ? [{}]
    : [ownedFilter, buildMissingSchoolLinkFilter(receiptBillLink)].filter(Boolean);
  const receiptConflictFilter = buildConflictingOwnershipFilter(scope, [receiptBillLink].filter(Boolean));
  const [financeReceipts, conflictingReceipts] = await Promise.all([
    withSession(FinanceReceipt.find(buildOrFilter(receiptClauses))
      .select('_id schoolId amount status bill fileUrl studentMembershipId classId academicYearId updatedAt'), session).lean(),
    withSession(FinanceReceipt.find(receiptConflictFilter).select('_id receiptNumber schoolId classId academicYearId studentMembershipId bill'), session).lean()
  ]);
  const financeReceiptIds = uniqueIds(financeReceipts);

  const paymentLinkClauses = [];
  pushInClause(paymentLinkClauses, 'sourceReceiptId', financeReceiptIds);
  pushInClause(paymentLinkClauses, 'feeOrderId', feeOrderIds);
  pushInClause(paymentLinkClauses, 'allocations.feeOrderId', feeOrderIds);
  const paymentLinkFilter = paymentLinkClauses.length ? buildOrFilter(paymentLinkClauses) : null;
  const paymentClauses = scope.allSchools
    ? [{}]
    : [ownedFilter, buildMissingSchoolLinkFilter(paymentLinkFilter)].filter(Boolean);
  const paymentConflictFilter = buildConflictingOwnershipFilter(scope, paymentLinkClauses);
  const [feePayments, conflictingPayments] = await Promise.all([
    withSession(FeePayment.find(buildOrFilter(paymentClauses))
      .select('_id schoolId amount status paymentNumber feeOrderId sourceReceiptId allocations fileUrl studentMembershipId classId academicYearId updatedAt'), session).lean(),
    withSession(FeePayment.find(paymentConflictFilter).select('_id paymentNumber schoolId classId academicYearId studentMembershipId feeOrderId sourceReceiptId allocations'), session).lean()
  ]);
  const feePaymentIds = uniqueIds(feePayments);

  let ambiguousLegacyOwnership = [];
  if (!scope.allSchools) {
    const missingSchool = { $or: [{ schoolId: null }, { schoolId: { $exists: false } }] };
    const [ambiguousBills, ambiguousOrders, ambiguousReceipts, ambiguousPayments] = await Promise.all([
      withSession(FinanceBill.find({ ...missingSchool, _id: { $nin: financeBillIds } }).select('_id billNumber'), session).lean(),
      withSession(FeeOrder.find({ ...missingSchool, _id: { $nin: feeOrderIds } }).select('_id orderNumber'), session).lean(),
      withSession(FinanceReceipt.find({ ...missingSchool, _id: { $nin: financeReceiptIds } }).select('_id receiptNumber'), session).lean(),
      withSession(FeePayment.find({ ...missingSchool, _id: { $nin: feePaymentIds } }).select('_id paymentNumber'), session).lean()
    ]);
    ambiguousLegacyOwnership = [
      ...ambiguousBills.map((item) => ({ kind: 'FinanceBill', id: asId(item), number: item.billNumber || '' })),
      ...ambiguousOrders.map((item) => ({ kind: 'FeeOrder', id: asId(item), number: item.orderNumber || '' })),
      ...ambiguousReceipts.map((item) => ({ kind: 'FinanceReceipt', id: asId(item), number: item.receiptNumber || '' })),
      ...ambiguousPayments.map((item) => ({ kind: 'FeePayment', id: asId(item), number: item.paymentNumber || '' }))
    ];
  }

  const discountClauses = [];
  pushInClause(discountClauses, 'sourceBillId', financeBillIds);
  pushInClause(discountClauses, 'feeOrderId', feeOrderIds);
  const discountLinkFilter = discountClauses.length ? buildOrFilter(discountClauses) : null;
  const [linkedDiscounts, conflictingDiscounts] = discountLinkFilter
    ? await Promise.all([
        withSession(Discount.find(buildOwnedLinkedFilter(scope, discountLinkFilter))
          .select('_id source sourceKey feeOrderId sourceBillId createdBy schoolId updatedAt'), session).lean(),
        withSession(Discount.find(buildConflictingOwnershipFilter(scope, [discountLinkFilter]))
          .select('_id sourceKey feeOrderId sourceBillId schoolId'), session).lean()
      ])
    : [[], []];
  const preservedLinkedDiscounts = linkedDiscounts.filter(isManagerDiscount);
  const deletableLinkedDiscounts = linkedDiscounts.filter((item) => !isManagerDiscount(item));
  const linkedDiscountIds = uniqueIds(linkedDiscounts);

  const reliefClauses = [];
  pushInClause(reliefClauses, 'feeOrderId', feeOrderIds);
  pushInClause(reliefClauses, 'sourceDiscountId', linkedDiscountIds);
  const reliefLinkFilter = reliefClauses.length ? buildOrFilter(reliefClauses) : null;
  const [linkedReliefs, conflictingReliefs] = reliefLinkFilter
    ? await Promise.all([
        withSession(FinanceRelief.find(buildOwnedLinkedFilter(scope, reliefLinkFilter))
          .select('_id feeOrderId sourceDiscountId sourceKey sourceModel createdBy approvedBy schoolId updatedAt'), session).lean(),
        withSession(FinanceRelief.find(buildConflictingOwnershipFilter(scope, [reliefLinkFilter]))
          .select('_id feeOrderId sourceDiscountId sourceKey schoolId'), session).lean()
      ])
    : [[], []];
  const preservedLinkedReliefs = linkedReliefs.filter(isManagerRelief);
  const deletableLinkedReliefs = linkedReliefs.filter((item) => !isManagerRelief(item));

  const paymentTransactionGroupKeys = feePaymentIds.map((id) => `fee-payment:${id}`);
  const treasuryFilter = scope.allSchools
    ? { sourceType: 'fee_payment' }
    : { sourceType: 'fee_payment', schoolId: scope.schoolId };
  const treasuryConflictFilter = scope.allSchools || !paymentTransactionGroupKeys.length
    ? { _id: { $in: [] } }
    : {
        sourceType: 'fee_payment',
        transactionGroupKey: { $in: paymentTransactionGroupKeys },
        schoolId: { $nin: [scope.schoolId] }
      };
  const [treasuryTransactions, conflictingTreasuryTransactions] = await Promise.all([
    withSession(FinanceTreasuryTransaction.find(treasuryFilter)
      .select('_id accountId counterAccountId amount status transactionGroupKey schoolId updatedAt'), session).lean(),
    withSession(FinanceTreasuryTransaction.find(treasuryConflictFilter)
      .select('_id accountId amount status transactionGroupKey schoolId'), session).lean()
  ]);
  const treasuryAccountIds = uniqueIds(treasuryTransactions.flatMap((item) => [item.accountId, item.counterAccountId]));
  const treasuryAccounts = treasuryAccountIds.length
    ? await withSession(FinanceTreasuryAccount.find({ _id: { $in: treasuryAccountIds } }).select('_id schoolId'), session).lean()
    : [];

  const outboundOwnership = collectOutboundOwnershipConflicts({
    scope,
    financeBills,
    feeOrders,
    financeReceipts,
    feePayments,
    treasuryTransactions,
    treasuryAccounts
  });

  const anomalyLinkClauses = [];
  pushInClause(anomalyLinkClauses, 'studentMembershipId', scope.membershipIds);
  pushInClause(anomalyLinkClauses, 'classId', scope.classIds);
  pushInClause(anomalyLinkClauses, 'targetId', [...financeBillIds, ...feeOrderIds, ...financeReceiptIds, ...feePaymentIds]);
  const anomalyLinkFilter = anomalyLinkClauses.length ? buildOrFilter(anomalyLinkClauses) : null;
  const anomalyFilter = scope.allSchools
    ? {}
    : buildOrFilter([
        { schoolId: scope.schoolId },
        buildMissingSchoolLinkFilter(anomalyLinkFilter)
      ].filter(Boolean));
  const anomalyConflictFilter = buildConflictingOwnershipFilter(scope, anomalyLinkClauses);
  const [anomalyCases, conflictingAnomalyCases] = await Promise.all([
    withSession(FinanceAnomalyCase.find(anomalyFilter)
      .select('_id status anomalyType schoolId updatedAt'), session).lean(),
    withSession(FinanceAnomalyCase.find(anomalyConflictFilter)
      .select('_id status anomalyType schoolId targetId'), session).lean()
  ]);

  const monthCloseFilter = scope.allSchools ? {} : { schoolId: scope.schoolId };
  const monthCloses = await withSession(FinanceMonthClose.find(monthCloseFilter)
    .select('_id status approvalStage monthKey source approvalTrail history updatedAt'), session).lean();
  const protectedMonthCloses = monthCloses.filter(isProtectedMonthClose);
  const draftMonthCloses = monthCloses.filter((item) => !isProtectedMonthClose(item));
  const monthCloseIds = uniqueIds(monthCloses);

  const governmentFilter = scope.allSchools ? {} : { schoolId: scope.schoolId };
  const governmentSnapshots = await withSession(GovernmentFinanceSnapshot.find(governmentFilter)
    .select('_id isOfficial reportKey title updatedAt'), session).lean();

  const archiveClauses = scope.allSchools ? [{}] : [];
  pushInClause(archiveClauses, 'classId', scope.classIds);
  pushInClause(archiveClauses, 'academicYearId', scope.academicYearIds);
  pushInClause(archiveClauses, 'studentMembershipId', scope.membershipIds);
  pushInClause(archiveClauses, 'sourceMonthCloseId', monthCloseIds);
  const documentArchives = await withSession(FinanceDocumentArchive.find(buildOrFilter(archiveClauses))
    .select('_id status documentType documentNo deliveryCount lastDeliveredAt updatedAt'), session).lean();
  const archiveIds = uniqueIds(documentArchives);

  const campaignClauses = scope.allSchools ? [{}] : [];
  pushInClause(campaignClauses, 'classId', scope.classIds);
  pushInClause(campaignClauses, 'academicYearId', scope.academicYearIds);
  pushInClause(campaignClauses, 'targets.archiveId', archiveIds);
  const deliveryCampaigns = await withSession(FinanceDeliveryCampaign.find(buildOrFilter(campaignClauses))
    .select('_id status automationEnabled name updatedAt'), session).lean();

  const financialYearFilter = scope.allSchools ? {} : { schoolId: scope.schoolId };
  const closedFinancialYears = await withSession(FinancialYear.find({
    ...financialYearFilter,
    $or: [{ isClosed: true }, { status: 'closed' }]
  }).select('_id title status isClosed updatedAt'), session).lean();
  const officialGovernmentSnapshots = governmentSnapshots.filter((item) => item.isOfficial === true);
  const deliveredArchives = documentArchives.filter((item) => (
    item.status === 'active' && (Number(item.deliveryCount || 0) > 0 || item.lastDeliveredAt)
  ));

  const legacyOrderFilter = scope.allSchools || !scope.studentIds.length || !scope.courseIds.length
    ? (scope.allSchools ? { amount: { $gt: 0 } } : { _id: { $in: [] } })
    : { user: { $in: scope.studentIds }, course: { $in: scope.courseIds }, amount: { $gt: 0 } };
  const legacyOrders = await withSession(Order.find(legacyOrderFilter).select('_id amount status receiptImage updatedAt'), session).lean();

  const conflictingOwnership = [
    ...(scope.membershipOwnershipConflicts || []),
    ...conflictingBills.map((item) => ({ kind: 'FinanceBill', id: asId(item), number: item.billNumber || '', schoolId: asId(item.schoolId) })),
    ...conflictingOrders.map((item) => ({ kind: 'FeeOrder', id: asId(item), number: item.orderNumber || '', schoolId: asId(item.schoolId) })),
    ...conflictingReceipts.map((item) => ({ kind: 'FinanceReceipt', id: asId(item), number: item.receiptNumber || '', schoolId: asId(item.schoolId) })),
    ...conflictingPayments.map((item) => ({ kind: 'FeePayment', id: asId(item), number: item.paymentNumber || '', schoolId: asId(item.schoolId) })),
    ...conflictingDiscounts.map((item) => ({ kind: 'Discount', id: asId(item), number: item.sourceKey || '', schoolId: asId(item.schoolId) })),
    ...conflictingReliefs.map((item) => ({ kind: 'FinanceRelief', id: asId(item), number: item.sourceKey || '', schoolId: asId(item.schoolId) })),
    ...conflictingTreasuryTransactions.map((item) => ({ kind: 'FinanceTreasuryTransaction', id: asId(item), number: item.transactionGroupKey || '', schoolId: asId(item.schoolId) })),
    ...conflictingAnomalyCases.map((item) => ({ kind: 'FinanceAnomalyCase', id: asId(item), number: item.anomalyType || '', schoolId: asId(item.schoolId) }))
  ];
  const blockers = {
    closedFinancialYears: closedFinancialYears.map((item) => ({ id: asId(item), title: item.title || '', status: item.status || '' })),
    protectedMonthCloses: protectedMonthCloses.map((item) => ({ id: asId(item), monthKey: item.monthKey || '', status: item.status || '' })),
    officialGovernmentSnapshots: officialGovernmentSnapshots.map((item) => ({ id: asId(item), reportKey: item.reportKey || '', title: item.title || '' })),
    deliveredArchives: deliveredArchives.map((item) => ({ id: asId(item), documentNo: item.documentNo || '', documentType: item.documentType || '' })),
    conflictingOwnership,
    outboundOwnership,
    ambiguousLegacyOwnership
  };

  const counts = {
    financeBills: financeBills.length,
    feeOrders: feeOrders.length,
    financeReceipts: financeReceipts.length,
    feePayments: feePayments.length,
    linkedDiscountsToDelete: deletableLinkedDiscounts.length,
    managerDiscountsToPreserve: preservedLinkedDiscounts.length,
    linkedReliefsToDelete: deletableLinkedReliefs.length,
    managerReliefsToPreserve: preservedLinkedReliefs.length,
    feePaymentTreasuryTransactions: treasuryTransactions.length,
    postedFeePaymentTreasuryTransactions: treasuryTransactions.filter((item) => item.status === 'posted').length,
    financeAnomalyCases: anomalyCases.length,
    draftDerivedMonthCloses: draftMonthCloses.length,
    nonOfficialGovernmentSnapshots: governmentSnapshots.filter((item) => item.isOfficial !== true).length,
    documentArchivesToRevoke: documentArchives.filter((item) => item.status === 'active').length,
    deliveryCampaignsToPause: deliveryCampaigns.filter((item) => item.status === 'active' || item.automationEnabled === true).length,
    legacyEnrollmentOrdersPreserved: legacyOrders.length
  };
  const amounts = {
    financeBillsOriginal: sum(financeBills, 'amountOriginal'),
    financeBillsDue: sum(financeBills, 'amountDue'),
    financeBillsPaid: sum(financeBills, 'amountPaid'),
    feeOrdersOriginal: sum(feeOrders, 'amountOriginal'),
    feeOrdersDue: sum(feeOrders, 'amountDue'),
    feeOrdersPaid: sum(feeOrders, 'amountPaid'),
    feeOrdersOutstanding: sum(feeOrders, 'outstandingAmount'),
    approvedPayments: sum(feePayments.filter((item) => item.status === 'approved'), 'amount'),
    pendingPayments: sum(feePayments.filter((item) => item.status === 'pending'), 'amount'),
    approvedReceipts: sum(financeReceipts.filter((item) => item.status === 'approved'), 'amount'),
    pendingReceipts: sum(financeReceipts.filter((item) => item.status === 'pending'), 'amount'),
    postedTreasury: sum(treasuryTransactions.filter((item) => item.status === 'posted'), 'amount'),
    legacyEnrollmentOrdersPreserved: sum(legacyOrders, 'amount')
  };

  const plan = {
    mode: 'dry-run',
    generatedAt: new Date().toISOString(),
    scope: {
      allSchools: scope.allSchools,
      schoolId: scope.schoolId,
      school: scope.school,
      classes: scope.classIds.length,
      courses: scope.courseIds.length,
      academicYears: scope.academicYearIds.length,
      memberships: scope.membershipIds.length
    },
    counts,
    amounts,
    blockers,
    blocked: Object.values(blockers).some((items) => items.length > 0),
    warnings: legacyOrders.length ? [{
      code: 'legacy_enrollment_orders_preserved',
      count: legacyOrders.length,
      message: 'Legacy enrollment orders are preserved because they also carry admission/enrollment workflow state.'
    }] : [],
    preserved: [
      'financefeeplans',
      'studentmemberships',
      'feeexemptions',
      'manager-created discounts and relief decisions (cancelled/detached, not deleted)',
      'financetreasuryaccounts',
      'manual treasury transactions',
      'expenses and procurement commitments',
      'transportfees',
      'legacy enrollment orders',
      'activitylogs'
    ],
    ids: {
      financeBillIds,
      feeOrderIds,
      financeReceiptIds,
      feePaymentIds,
      deletableLinkedDiscountIds: uniqueIds(deletableLinkedDiscounts),
      preservedLinkedDiscountIds: uniqueIds(preservedLinkedDiscounts),
      deletableLinkedReliefIds: uniqueIds(deletableLinkedReliefs),
      preservedLinkedReliefIds: uniqueIds(preservedLinkedReliefs),
      treasuryTransactionIds: uniqueIds(treasuryTransactions),
      treasuryAccountIds: uniqueIds(treasuryTransactions.map((item) => item.accountId)),
      anomalyCaseIds: uniqueIds(anomalyCases),
      draftMonthCloseIds: uniqueIds(draftMonthCloses),
      nonOfficialGovernmentSnapshotIds: uniqueIds(governmentSnapshots.filter((item) => item.isOfficial !== true)),
      activeArchiveIds: uniqueIds(documentArchives.filter((item) => item.status === 'active')),
      campaignIds: uniqueIds(deliveryCampaigns)
    },
    versions: [
      ...financeBills.map((item) => ['FinanceBill', asId(item), item.updatedAt || null]),
      ...feeOrders.map((item) => ['FeeOrder', asId(item), item.updatedAt || null]),
      ...financeReceipts.map((item) => ['FinanceReceipt', asId(item), item.updatedAt || null]),
      ...feePayments.map((item) => ['FeePayment', asId(item), item.updatedAt || null]),
      ...linkedDiscounts.map((item) => ['Discount', asId(item), item.updatedAt || null]),
      ...linkedReliefs.map((item) => ['FinanceRelief', asId(item), item.updatedAt || null]),
      ...treasuryTransactions.map((item) => ['FinanceTreasuryTransaction', asId(item), item.updatedAt || null]),
      ...anomalyCases.map((item) => ['FinanceAnomalyCase', asId(item), item.updatedAt || null]),
      ...draftMonthCloses.map((item) => ['FinanceMonthClose', asId(item), item.updatedAt || null]),
      ...governmentSnapshots.filter((item) => item.isOfficial !== true).map((item) => ['GovernmentFinanceSnapshot', asId(item), item.updatedAt || null]),
      ...documentArchives.map((item) => ['FinanceDocumentArchive', asId(item), item.updatedAt || null]),
      ...deliveryCampaigns.map((item) => ['FinanceDeliveryCampaign', asId(item), item.updatedAt || null])
    ].map(([kind, recordId, updatedAt]) => [
      kind,
      recordId,
      updatedAt ? new Date(updatedAt).toISOString() : ''
    ]).sort((left, right) => `${left[0]}:${left[1]}`.localeCompare(`${right[0]}:${right[1]}`)),
    receiptFiles: uniqueIds([
      ...financeReceipts.map((item) => item.fileUrl),
      ...feePayments.map((item) => item.fileUrl)
    ])
  };
  plan.planDigest = computePlanDigest(plan);
  return plan;
}

function compactPlan(plan = {}) {
  const { ids, receiptFiles, versions, ...summary } = plan;
  return summary;
}

function assertNoProtectedRecords(plan = {}) {
  if (!plan.blocked) return;
  const error = new Error('finance_ledger_reset_protected_records');
  error.blockers = plan.blockers;
  throw error;
}

async function validateResetActor(actorId = '', session = null) {
  const normalizedActorId = asId(actorId);
  if (!mongoose.Types.ObjectId.isValid(normalizedActorId)) throw new Error('finance_ledger_reset_actor_required');
  const actor = await withSession(User.findById(normalizedActorId).select('_id role orgRole adminLevel status'), session).lean();
  const level = String(actor?.adminLevel || actor?.orgRole || '').trim().toLowerCase();
  if (!actor || actor.role !== 'admin' || actor.status === 'inactive' || !['finance_lead', 'general_president'].includes(level)) {
    throw new Error('finance_ledger_reset_actor_not_authorized');
  }
  return actor;
}

async function verifyResetScope({ schoolId = '', allSchools = false } = {}) {
  const remainingPlan = await collectFinanceLedgerResetPlan({ schoolId, allSchools });
  const remaining = {
    financeBills: remainingPlan.counts.financeBills,
    feeOrders: remainingPlan.counts.feeOrders,
    financeReceipts: remainingPlan.counts.financeReceipts,
    feePayments: remainingPlan.counts.feePayments,
    linkedDiscounts: Number(remainingPlan.counts.linkedDiscountsToDelete || 0)
      + Number(remainingPlan.counts.managerDiscountsToPreserve || 0),
    linkedReliefs: Number(remainingPlan.counts.linkedReliefsToDelete || 0)
      + Number(remainingPlan.counts.managerReliefsToPreserve || 0),
    anomalyCases: remainingPlan.counts.financeAnomalyCases,
    draftMonthCloses: remainingPlan.counts.draftDerivedMonthCloses,
    nonOfficialGovernmentSnapshots: remainingPlan.counts.nonOfficialGovernmentSnapshots,
    activeDocumentArchives: remainingPlan.counts.documentArchivesToRevoke,
    activeDeliveryCampaigns: remainingPlan.counts.deliveryCampaignsToPause,
    postedTreasuryTransactions: remainingPlan.counts.postedFeePaymentTreasuryTransactions,
    postedTreasury: remainingPlan.amounts.postedTreasury
  };
  return {
    ok: Object.values(remaining).every((value) => Number(value || 0) === 0),
    remaining,
    planDigest: remainingPlan.planDigest
  };
}

async function verifyDeletedIds(plan = {}) {
  return verifyResetScope({
    schoolId: plan?.scope?.schoolId || '',
    allSchools: plan?.scope?.allSchools === true
  });
}

async function applyFinanceLedgerReset({
  schoolId = '',
  allSchools = false,
  actorId = '',
  maintenanceToken = '',
  backup = null,
  restoreProof = null,
  expectedPlanDigest = '',
  reason = ''
} = {}) {
  if (!backup?.manifestPath || !backup?.backupDir) throw new Error('finance_ledger_reset_backup_required');
  verifyDatabaseBackup({ backupDir: backup.backupDir, manifest: backup.manifest, requireUploads: true });
  if (backup.manifest?.database?.fingerprint !== databaseFingerprint(mongoose.connection)) {
    throw new Error('finance_ledger_reset_backup_database_mismatch');
  }
  if (restoreProof?.ok !== true) throw new Error('finance_ledger_reset_restore_proof_required');
  await assertFinanceMaintenanceLock({ schoolId: '', token: maintenanceToken });

  const resetId = `FR-${new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14)}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
  const resetReason = String(reason || 'پاک‌سازی کنترل‌شده دفتر بل و پرداخت').trim();
  const session = await mongoose.startSession();
  let operations = {};
  let committedPlan = null;

  try {
    await session.withTransaction(async () => {
      const actor = await validateResetActor(actorId, session);
      const plan = await collectFinanceLedgerResetPlan({ schoolId, allSchools, session });
      assertNoProtectedRecords(plan);
      if (!expectedPlanDigest || plan.planDigest !== String(expectedPlanDigest).trim().toLowerCase()) {
        const mismatch = new Error('finance_ledger_reset_plan_digest_mismatch');
        mismatch.expectedPlanDigest = expectedPlanDigest;
        mismatch.actualPlanDigest = plan.planDigest;
        throw mismatch;
      }
      committedPlan = plan;
      const ids = plan.ids;
      const options = { session };

      const treasuryResult = await FinanceTreasuryTransaction.updateMany(
        { _id: { $in: ids.treasuryTransactionIds }, sourceType: 'fee_payment', status: { $ne: 'void' } },
        { $set: { status: 'void', updatedBy: actorId, note: `[${resetId}] ${resetReason}` } },
        options
      );
      const accountResult = await FinanceTreasuryAccount.updateMany(
        { _id: { $in: ids.treasuryAccountIds } },
        {
          $set: {
            lastReconciledAt: null,
            lastReconciledBy: null,
            lastStatementBalance: 0,
            lastReconciliationVariance: 0,
            updatedBy: actorId
          }
        },
        options
      );
      const archiveResult = await FinanceDocumentArchive.updateMany(
        { _id: { $in: ids.activeArchiveIds }, status: 'active' },
        {
          $set: { status: 'revoked' },
          $push: { accessLog: { eventType: 'revoked', at: new Date(), actorId: asId(actorId), actorRole: 'finance_reset', note: `[${resetId}] ${resetReason}` } }
        },
        options
      );
      const campaignResult = await FinanceDeliveryCampaign.updateMany(
        { _id: { $in: ids.campaignIds } },
        { $set: { status: 'paused', automationEnabled: false, nextRunAt: null, updatedBy: actorId, note: `[${resetId}] ${resetReason}` } },
        options
      );
      const preservedReliefs = await FinanceRelief.updateMany(
        { _id: { $in: ids.preservedLinkedReliefIds } },
        {
          $set: { status: 'cancelled', feeOrderId: null, cancelledBy: actorId, cancelledAt: new Date(), cancelReason: `[${resetId}] ${resetReason}` }
        },
        options
      );
      const preservedDiscounts = await Discount.updateMany(
        { _id: { $in: ids.preservedLinkedDiscountIds } },
        {
          $set: { status: 'cancelled', feeOrderId: null, sourceBillId: null }
        },
        options
      );

      const derivedMonthCloses = await FinanceMonthClose.deleteMany({
        _id: { $in: ids.draftMonthCloseIds },
        status: { $nin: PROTECTED_MONTH_CLOSE_STATUSES },
        $and: [
          { $or: [{ approvalTrail: { $size: 0 } }, { approvalTrail: null }, { approvalTrail: { $exists: false } }] },
          { $or: [{ history: { $size: 0 } }, { history: null }, { history: { $exists: false } }] }
        ]
      }, options);
      const governmentSnapshots = await GovernmentFinanceSnapshot.deleteMany({
        _id: { $in: ids.nonOfficialGovernmentSnapshotIds },
        isOfficial: { $ne: true }
      }, options);
      const anomalyCases = await FinanceAnomalyCase.deleteMany({ _id: { $in: ids.anomalyCaseIds } }, options);
      const linkedReliefs = await FinanceRelief.deleteMany({ _id: { $in: ids.deletableLinkedReliefIds } }, options);
      const linkedDiscounts = await Discount.deleteMany({ _id: { $in: ids.deletableLinkedDiscountIds } }, options);
      const feePayments = await FeePayment.deleteMany({ _id: { $in: ids.feePaymentIds } }, options);
      const financeReceipts = await FinanceReceipt.deleteMany({ _id: { $in: ids.financeReceiptIds } }, options);
      const feeOrders = await FeeOrder.deleteMany({ _id: { $in: ids.feeOrderIds } }, options);
      const financeBills = await FinanceBill.deleteMany({ _id: { $in: ids.financeBillIds } }, options);

      operations = {
        treasuryTransactionsVoided: Number(treasuryResult.modifiedCount || 0),
        treasuryAccountsReconciliationCleared: Number(accountResult.modifiedCount || 0),
        documentArchivesRevoked: Number(archiveResult.modifiedCount || 0),
        deliveryCampaignsPaused: Number(campaignResult.modifiedCount || 0),
        managerReliefsPreservedAndCancelled: Number(preservedReliefs.modifiedCount || 0),
        managerDiscountsPreservedAndCancelled: Number(preservedDiscounts.modifiedCount || 0),
        derivedMonthClosesDeleted: Number(derivedMonthCloses.deletedCount || 0),
        nonOfficialGovernmentSnapshotsDeleted: Number(governmentSnapshots.deletedCount || 0),
        financeAnomalyCasesDeleted: Number(anomalyCases.deletedCount || 0),
        linkedReliefsDeleted: Number(linkedReliefs.deletedCount || 0),
        linkedDiscountsDeleted: Number(linkedDiscounts.deletedCount || 0),
        feePaymentsDeleted: Number(feePayments.deletedCount || 0),
        financeReceiptsDeleted: Number(financeReceipts.deletedCount || 0),
        feeOrdersDeleted: Number(feeOrders.deletedCount || 0),
        financeBillsDeleted: Number(financeBills.deletedCount || 0)
      };

      await ActivityLog.create([{
        actor: actorId,
        actorRole: 'admin',
        actorOrgRole: String(actor.orgRole || actor.adminLevel || 'finance_lead'),
        action: 'finance_ledger_reset',
        targetType: 'FinanceLedger',
        targetId: allSchools ? 'all-schools' : asId(schoolId),
        reason: resetReason,
        meta: {
          resetId,
          scope: plan.scope,
          planDigest: plan.planDigest,
          counts: plan.counts,
          amounts: plan.amounts,
          operations,
          backupManifest: backup.manifestPath,
          restoreProof,
          receiptFilesPreservedInBackup: plan.receiptFiles.length
        }
      }], options);
    }, {
      readConcern: { level: 'snapshot' },
      writeConcern: { w: 'majority' },
      readPreference: 'primary'
    });
  } catch (error) {
    const message = String(error?.message || '');
    if (message.includes('Transaction numbers are only allowed') || error?.code === 20) {
      const unsupported = new Error('finance_ledger_reset_transactions_required');
      unsupported.cause = error;
      throw unsupported;
    }
    throw error;
  } finally {
    await session.endSession();
  }

  const verification = await verifyResetScope({ schoolId, allSchools });
  if (!verification.ok) {
    const error = new Error('finance_ledger_reset_verification_failed');
    error.resetId = resetId;
    error.verification = verification;
    throw error;
  }

  return {
    ok: true,
    mode: 'apply',
    resetId,
    completedAt: new Date().toISOString(),
    backup: { backupDir: backup.backupDir, manifestPath: backup.manifestPath },
    restoreProof,
    plan: compactPlan(committedPlan),
    operations,
    verification,
    receiptFilesPreservedInBackup: committedPlan.receiptFiles
  };
}

module.exports = {
  PROTECTED_MONTH_CLOSE_STATUSES,
  applyFinanceLedgerReset,
  buildOwnedFilter,
  collectFinanceLedgerResetPlan,
  compactPlan,
  collectOutboundOwnershipConflicts,
  computePlanDigest,
  resolveResetScope,
  validateResetActor,
  verifyDeletedIds,
  verifyResetScope
};
