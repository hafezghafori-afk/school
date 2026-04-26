const path = require('path');
const fs = require('fs');
const Module = require('module');
const express = require('express');

const IDS = {
  class1: '507f191e810c19729de86101',
  course1: '507f191e810c19729de860ea',
  student1: '507f1f77bcf86cd799439011',
  student2: '507f1f77bcf86cd799439012',
  adminManager: '507f1f77bcf86cd799439013',
  adminLead: '507f1f77bcf86cd799439014',
  adminPresident: '507f1f77bcf86cd799439015'
};

const clone = (value) => (
  typeof structuredClone === 'function'
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value))
);

const courses = [
  { _id: IDS.course1, title: 'Class One', category: 'Morning', schoolClassRef: IDS.class1 }
];

const schoolClasses = [
  {
    _id: IDS.class1,
    title: 'Class One Core',
    code: '10-A',
    gradeLevel: 10,
    section: 'الف',
    legacyCourseId: IDS.course1,
    status: 'active'
  }
];

const users = [
  { _id: IDS.student1, role: 'student', name: 'Student Alpha', email: 'alpha@example.com', grade: '10' },
  { _id: IDS.student2, role: 'student', name: 'Student Beta', email: 'beta@example.com', grade: '10' },
  { _id: IDS.adminManager, role: 'admin', name: 'Finance Manager', email: 'manager@example.com', adminLevel: 'finance_manager' },
  { _id: IDS.adminLead, role: 'admin', name: 'Finance Lead', email: 'lead@example.com', adminLevel: 'finance_lead' },
  { _id: IDS.adminPresident, role: 'admin', name: 'President', email: 'president@example.com', adminLevel: 'general_president' }
];

const memberships = [
  { _id: 'mem-1', student: IDS.student1, course: IDS.course1, classId: IDS.class1, status: 'active', isCurrent: true },
  { _id: 'mem-2', student: IDS.student2, course: IDS.course1, classId: IDS.class1, status: 'active', isCurrent: true },
  { _id: 'mem-3', student: IDS.student2, course: IDS.course1, classId: IDS.class1, status: 'dropped', isCurrent: false }
];

let billSerial = 4;
let receiptSerial = 2;
let monthCloseSerial = 0;
let financeAnomalyCaseSerial = 0;
let notificationSerial = 0;
let feePlanSerial = 0;
let financialYearSerial = 1;
let expenseCategorySerial = 2;
let expenseEntrySerial = 1;
let treasuryAccountSerial = 1;
let treasuryTransactionSerial = 1;
let procurementCommitmentSerial = 0;
let governmentSnapshotSerial = 0;

const feePlans = [];
const discountRegistry = [];
const feeExemptions = [];
const financeReliefs = [];
const financeAnomalyCases = [];
const academicYears = [
  {
    _id: 'academic-year-1',
    schoolId: 'school-1',
    title: '1405',
    code: '1405',
    startDate: new Date('2026-01-01T00:00:00.000Z'),
    endDate: new Date('2026-12-31T00:00:00.000Z'),
    startDateLocal: '',
    endDateLocal: '',
    isActive: true
  }
];

const financialYears = [
  {
    _id: 'fy-1',
    schoolId: 'school-1',
    academicYearId: 'academic-year-1',
    code: 'FY1405',
    title: 'Financial Year 1405',
    startDate: new Date('2026-01-01T00:00:00.000Z'),
    endDate: new Date('2026-12-31T00:00:00.000Z'),
    startDateLocal: '',
    endDateLocal: '',
    dailyFeePercent: 2,
    yearlyFeePercent: 10,
    budgetTargets: {
      annualIncomeTarget: 10000,
      annualExpenseBudget: 1500,
      monthlyIncomeTarget: 900,
      monthlyExpenseBudget: 200,
      treasuryReserveTarget: 3200,
      note: 'Baseline operating budget',
      categoryBudgets: [
        { categoryKey: 'admin', label: 'Admin', annualBudget: 1000, monthlyBudget: 100, alertThresholdPercent: 85 },
        { categoryKey: 'salary', label: 'Salary', annualBudget: 500, monthlyBudget: 50, alertThresholdPercent: 85 }
      ]
    },
    status: 'active',
    isActive: true,
    isClosed: false,
    budgetApprovalStage: 'draft',
    budgetSubmittedBy: null,
    budgetSubmittedAt: null,
    budgetApprovedBy: null,
    budgetApprovedAt: null,
    budgetRejectedBy: null,
    budgetRejectedAt: null,
    budgetRejectReason: '',
    budgetApprovalTrail: [],
    budgetVersion: 1,
    budgetLastApprovedVersion: 0,
    budgetFrozenAt: null,
    budgetRevisionHistory: [],
    closedAt: null,
    closedBy: null,
    note: '',
    createdBy: IDS.adminManager,
    updatedBy: IDS.adminManager,
    createdAt: new Date('2026-01-01T08:00:00.000Z'),
    updatedAt: new Date('2026-01-01T08:00:00.000Z')
  }
];

const expenseCategories = [
  {
    _id: 'expense-category-1',
    key: 'admin',
    label: 'Admin',
    description: 'Administration and office operations',
    colorTone: 'rose',
    isActive: true,
    isSystem: true,
    order: 0,
    subCategories: [
      { key: 'stationery', label: 'Stationery', description: '', isActive: true, order: 0 },
      { key: 'printing', label: 'Printing', description: '', isActive: true, order: 1 }
    ],
    createdBy: IDS.adminManager,
    updatedBy: IDS.adminManager,
    createdAt: new Date('2026-01-02T08:00:00.000Z'),
    updatedAt: new Date('2026-01-02T08:00:00.000Z')
  },
  {
    _id: 'expense-category-2',
    key: 'salary',
    label: 'Salary',
    description: 'Teacher and staff compensation',
    colorTone: 'teal',
    isActive: true,
    isSystem: true,
    order: 1,
    subCategories: [
      { key: 'teachers', label: 'Teachers', description: '', isActive: true, order: 0 }
    ],
    createdBy: IDS.adminManager,
    updatedBy: IDS.adminManager,
    createdAt: new Date('2026-01-02T08:00:00.000Z'),
    updatedAt: new Date('2026-01-02T08:00:00.000Z')
  }
];

const expenseEntries = [
  {
    _id: 'expense-1',
    schoolId: 'school-1',
    financialYearId: 'fy-1',
    academicYearId: 'academic-year-1',
    classId: IDS.class1,
    category: 'admin',
    subCategory: 'stationery',
    amount: 1200,
    currency: 'AFN',
    expenseDate: new Date('2026-03-12T00:00:00.000Z'),
    periodQuarter: 1,
    paymentMethod: 'manual',
    vendorName: 'School Supply House',
    referenceNo: 'EXP-001',
    note: '',
    status: 'approved',
    approvalStage: 'completed',
    submittedBy: IDS.adminManager,
    submittedAt: new Date('2026-03-12T08:00:00.000Z'),
    approvedBy: IDS.adminPresident,
    approvedAt: new Date('2026-03-12T12:00:00.000Z'),
    rejectedBy: null,
    rejectedAt: null,
    rejectReason: '',
    approvalTrail: [
      { level: 'finance_manager', action: 'submit', by: IDS.adminManager, at: new Date('2026-03-12T08:00:00.000Z'), note: 'Submitted', reason: '' },
      { level: 'finance_manager', action: 'approve', by: IDS.adminManager, at: new Date('2026-03-12T09:00:00.000Z'), note: '', reason: '' },
      { level: 'finance_lead', action: 'approve', by: IDS.adminLead, at: new Date('2026-03-12T10:00:00.000Z'), note: '', reason: '' },
      { level: 'general_president', action: 'approve', by: IDS.adminPresident, at: new Date('2026-03-12T12:00:00.000Z'), note: '', reason: '' }
    ],
    createdBy: IDS.adminManager,
    updatedBy: IDS.adminPresident,
    createdAt: new Date('2026-03-12T08:00:00.000Z'),
    updatedAt: new Date('2026-03-12T12:00:00.000Z')
  }
];

const treasuryAccounts = [
  {
    _id: 'treasury-account-1',
    schoolId: 'school-1',
    financialYearId: 'fy-1',
    academicYearId: 'academic-year-1',
    code: 'CASH-01',
    title: 'Main Cashbox',
    accountType: 'cashbox',
    currency: 'AFN',
    openingBalance: 2500,
    providerName: 'Front Desk',
    branchName: '',
    accountNo: '001-1001',
    isActive: true,
    lastReconciledAt: null,
    lastReconciledBy: null,
    lastStatementBalance: 0,
    lastReconciliationVariance: 0,
    note: '',
    createdBy: IDS.adminManager,
    updatedBy: IDS.adminManager,
    createdAt: new Date('2026-03-01T08:00:00.000Z'),
    updatedAt: new Date('2026-03-01T08:00:00.000Z')
  }
];

const treasuryTransactions = [
  {
    _id: 'treasury-transaction-1',
    schoolId: 'school-1',
    financialYearId: 'fy-1',
    academicYearId: 'academic-year-1',
    accountId: 'treasury-account-1',
    counterAccountId: null,
    transactionGroupKey: '',
    transactionType: 'deposit',
    direction: 'in',
    amount: 500,
    currency: 'AFN',
    transactionDate: new Date('2026-03-05T00:00:00.000Z'),
    sourceType: 'manual',
    referenceNo: 'TR-001',
    note: 'Seed deposit',
    status: 'posted',
    createdBy: IDS.adminManager,
    updatedBy: IDS.adminManager,
    createdAt: new Date('2026-03-05T08:00:00.000Z'),
    updatedAt: new Date('2026-03-05T08:00:00.000Z')
  }
];

const procurementCommitments = [];
const governmentSnapshots = [];

const bills = [
  {
    _id: 'bill-1',
    billNumber: 'BL-202603-0001',
    student: IDS.student1,
    course: IDS.course1,
    classId: IDS.class1,
    academicYear: '1405',
    term: '1',
    periodType: 'term',
    periodLabel: '',
    currency: 'AFN',
    amountOriginal: 1000,
    amountDue: 1000,
    amountPaid: 0,
    status: 'new',
    issuedAt: new Date('2026-03-01T00:00:00.000Z'),
    dueDate: new Date('2026-03-10T00:00:00.000Z'),
    paidAt: null,
    note: '',
    adjustments: [],
    installments: [],
    createdBy: IDS.adminManager,
    createdAt: new Date('2026-03-01T08:00:00.000Z'),
    updatedAt: new Date('2026-03-01T08:00:00.000Z')
  },
  {
    _id: 'bill-2',
    billNumber: 'BL-202603-0002',
    student: IDS.student1,
    course: IDS.course1,
    classId: IDS.class1,
    academicYear: '1405',
    term: '2',
    periodType: 'term',
    periodLabel: '',
    currency: 'AFN',
    amountOriginal: 800,
    amountDue: 800,
    amountPaid: 0,
    status: 'new',
    issuedAt: new Date('2026-03-02T00:00:00.000Z'),
    dueDate: new Date('2026-03-15T00:00:00.000Z'),
    paidAt: null,
    note: '',
    adjustments: [],
    installments: [],
    createdBy: IDS.adminManager,
    createdAt: new Date('2026-03-02T08:00:00.000Z'),
    updatedAt: new Date('2026-03-02T08:00:00.000Z')
  },
  {
    _id: 'bill-3',
    billNumber: 'BL-202603-0003',
    student: IDS.student1,
    course: IDS.course1,
    classId: IDS.class1,
    academicYear: '1405',
    term: '3',
    periodType: 'term',
    periodLabel: '',
    currency: 'AFN',
    amountOriginal: 700,
    amountDue: 700,
    amountPaid: 300,
    status: 'partial',
    issuedAt: new Date('2026-03-03T00:00:00.000Z'),
    dueDate: new Date('2026-03-20T00:00:00.000Z'),
    paidAt: null,
    note: '',
    adjustments: [],
    installments: [],
    createdBy: IDS.adminManager,
    createdAt: new Date('2026-03-03T08:00:00.000Z'),
    updatedAt: new Date('2026-03-03T08:00:00.000Z')
  },
  {
    _id: 'bill-4',
    billNumber: 'BL-202603-0004',
    student: IDS.student2,
    course: IDS.course1,
    classId: IDS.class1,
    academicYear: '1405',
    term: '4',
    periodType: 'term',
    periodLabel: '',
    currency: 'AFN',
    amountOriginal: 900,
    amountDue: 900,
    amountPaid: 0,
    status: 'new',
    issuedAt: new Date('2026-03-04T00:00:00.000Z'),
    dueDate: new Date('2026-03-25T00:00:00.000Z'),
    paidAt: null,
    note: '',
    adjustments: [],
    installments: [],
    createdBy: IDS.adminManager,
    createdAt: new Date('2026-03-04T08:00:00.000Z'),
    updatedAt: new Date('2026-03-04T08:00:00.000Z')
  }
];

const receipts = [
  {
    _id: 'receipt-1',
    bill: 'bill-2',
    student: IDS.student1,
    course: IDS.course1,
    classId: IDS.class1,
    amount: 250,
    paymentMethod: 'manual',
    referenceNo: '',
    paidAt: new Date('2026-03-05T09:00:00.000Z'),
    fileUrl: 'uploads/finance-receipts/pending.pdf',
    note: '',
    status: 'pending',
    approvalStage: 'finance_manager_review',
    reviewedBy: null,
    reviewedAt: null,
    reviewNote: '',
    rejectReason: '',
    approvalTrail: [],
    createdAt: new Date('2026-03-05T09:00:00.000Z'),
    updatedAt: new Date('2026-03-05T09:00:00.000Z')
  },
  {
    _id: 'receipt-2',
    bill: 'bill-3',
    student: IDS.student1,
    course: IDS.course1,
    classId: IDS.class1,
    amount: 300,
    paymentMethod: 'bank_transfer',
    referenceNo: 'TX-1',
    paidAt: new Date('2026-03-04T10:00:00.000Z'),
    fileUrl: 'uploads/finance-receipts/approved.pdf',
    note: '',
    status: 'approved',
    approvalStage: 'completed',
    reviewedBy: IDS.adminPresident,
    reviewedAt: new Date('2026-03-04T13:00:00.000Z'),
    reviewNote: '',
    rejectReason: '',
    approvalTrail: [
      { level: 'finance_manager', action: 'approve', by: IDS.adminManager, at: new Date('2026-03-04T11:00:00.000Z'), note: '', reason: '' },
      { level: 'finance_lead', action: 'approve', by: IDS.adminLead, at: new Date('2026-03-04T12:00:00.000Z'), note: '', reason: '' },
      { level: 'general_president', action: 'approve', by: IDS.adminPresident, at: new Date('2026-03-04T13:00:00.000Z'), note: '', reason: '' }
    ],
    createdAt: new Date('2026-03-04T10:00:00.000Z'),
    updatedAt: new Date('2026-03-04T13:00:00.000Z')
  }
];

const monthClosures = [];
const notifications = [];
const archivedDocuments = [];
const deliveryCampaigns = [];
const deliveryTemplateRegistry = [];
let deliveryCampaignSerial = 0;

const deliveryTemplates = [
  {
    key: 'monthly_statement',
    label: 'Monthly Statement',
    description: 'Monthly delivery template for student and parent statements.',
    recommendedChannels: ['email', 'sms', 'whatsapp'],
    defaultSubject: 'Finance statement {{documentNo}}',
    defaultBody: 'Statement {{documentNo}} for {{subjectName}} is ready.'
  },
  {
    key: 'month_close_notice',
    label: 'Month Close Notice',
    description: 'Month close delivery pack notification.',
    recommendedChannels: ['email', 'portal'],
    defaultSubject: 'Month close pack {{documentNo}}',
    defaultBody: 'Month close package {{documentNo}} is ready.'
  },
  {
    key: 'balance_followup',
    label: 'Balance Follow-up',
    description: 'Reminder template for open balances and collections.',
    recommendedChannels: ['sms', 'whatsapp', 'email'],
    defaultSubject: 'Payment follow-up {{documentNo}}',
    defaultBody: 'Please review finance document {{documentNo}}.'
  }
];
const deliveryTemplateVariables = [
  { key: 'documentNo', label: 'Document No', description: 'Official finance document number.', sample: 'MCP-202603-001' },
  { key: 'subjectName', label: 'Subject Name', description: 'Student or batch subject.', sample: 'Student Alpha' },
  { key: 'verificationUrl', label: 'Verification URL', description: 'Verification link.', sample: 'https://example.test/verify/FV-MCP-1' },
  { key: 'monthKey', label: 'Month Key', description: 'Campaign month.', sample: '2026-03' },
  { key: 'classTitle', label: 'Class Title', description: 'Resolved class title.', sample: 'Class One Core' },
  { key: 'academicYearTitle', label: 'Academic Year', description: 'Resolved academic year title.', sample: '1406' },
  { key: 'note', label: 'Note', description: 'Operator note.', sample: 'Follow up this week' }
];
const deliveryProviderConfigs = [
  {
    channel: 'sms',
    mode: 'mock',
    provider: 'mock_sms_gateway',
    isActive: true,
    webhookUrl: '',
    statusWebhookUrl: '',
    fromHandle: '+93700111222',
    apiBaseUrl: '',
    accountSid: '',
    authToken: '',
    accessToken: '',
    phoneNumberId: '',
    webhookToken: '',
    note: 'Initial SMS gateway',
    credentialVersion: 1,
    lastRotatedAt: null,
    lastRotatedBy: null,
    auditTrail: [],
    source: 'database',
    updatedAt: new Date('2026-03-28T09:00:00.000Z').toISOString(),
    updatedBy: { _id: IDS.adminManager, name: 'Finance Manager' }
  },
  {
    channel: 'whatsapp',
    mode: 'meta',
    provider: 'meta_whatsapp_gateway',
    isActive: true,
    webhookUrl: '',
    statusWebhookUrl: 'https://hooks.example.test/finance/meta/status',
    fromHandle: '',
    apiBaseUrl: '',
    accountSid: '',
    authToken: '',
    accessToken: '',
    phoneNumberId: '',
    webhookToken: '',
    note: 'Initial WhatsApp gateway',
    credentialVersion: 1,
    lastRotatedAt: null,
    lastRotatedBy: null,
    auditTrail: [],
    source: 'database',
    updatedAt: new Date('2026-03-28T09:05:00.000Z').toISOString(),
    updatedBy: { _id: IDS.adminManager, name: 'Finance Manager' }
  }
];

const asComparable = (value) => {
  if (value && typeof value === 'object' && value._id) return String(value._id);
  return String(value);
};

const asTimeValue = (value) => {
  if (value instanceof Date) return value.getTime();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? NaN : date.getTime();
};

const matchCondition = (actualValue, expectedValue) => {
  if (expectedValue && typeof expectedValue === 'object' && !Array.isArray(expectedValue) && !(expectedValue instanceof Date)) {
    if ('$ne' in expectedValue) return asComparable(actualValue) !== String(expectedValue.$ne);
    if ('$in' in expectedValue) return expectedValue.$in.some((value) => asComparable(actualValue) === String(value));
    if ('$exists' in expectedValue) {
      const exists = actualValue !== undefined;
      return Boolean(expectedValue.$exists) === exists;
    }
    if ('$gte' in expectedValue || '$gt' in expectedValue || '$lte' in expectedValue || '$lt' in expectedValue) {
      const actualTime = asTimeValue(actualValue);
      if (Number.isNaN(actualTime)) return false;
      if ('$gte' in expectedValue && actualTime < asTimeValue(expectedValue.$gte)) return false;
      if ('$gt' in expectedValue && actualTime <= asTimeValue(expectedValue.$gt)) return false;
      if ('$lte' in expectedValue && actualTime > asTimeValue(expectedValue.$lte)) return false;
      if ('$lt' in expectedValue && actualTime >= asTimeValue(expectedValue.$lt)) return false;
      return true;
    }
  }

  if (expectedValue instanceof Date) {
    return asTimeValue(actualValue) === expectedValue.getTime();
  }

  return asComparable(actualValue) === String(expectedValue);
};

const matchesFilter = (item, filter = {}) => (
  Object.entries(filter).every(([key, expectedValue]) => {
    if (key === '$or') {
      return Array.isArray(expectedValue) && expectedValue.some((branch) => matchesFilter(item, branch));
    }
    if (key === '$and') {
      return Array.isArray(expectedValue) && expectedValue.every((branch) => matchesFilter(item, branch));
    }
    return matchCondition(item[key], expectedValue);
  })
);

const findUser = (value) => users.find((item) => String(item._id) === String(value?._id || value)) || null;
const findCourse = (value) => courses.find((item) => String(item._id) === String(value?._id || value)) || null;
const findSchoolClass = (value) => schoolClasses.find((item) => String(item._id) === String(value?._id || value)) || null;
const findBill = (value) => bills.find((item) => String(item._id) === String(value?._id || value)) || null;
const findAcademicYear = (value) => academicYears.find((item) => String(item._id) === String(value?._id || value)) || null;
const findFinancialYear = (value) => financialYears.find((item) => String(item._id) === String(value?._id || value)) || null;
const findExpenseCategory = (value) => expenseCategories.find((item) => String(item._id) === String(value?._id || value)) || null;
const findTreasuryAccount = (value) => treasuryAccounts.find((item) => String(item._id) === String(value?._id || value)) || null;
const findProcurementCommitment = (value) => procurementCommitments.find((item) => String(item._id) === String(value?._id || value)) || null;
const findGovernmentSnapshot = (value) => governmentSnapshots.find((item) => String(item._id) === String(value?._id || value)) || null;

const stripMethods = (doc) => {
  const plain = {};
  Object.keys(doc || {}).forEach((key) => {
    if (typeof doc[key] !== 'function') plain[key] = doc[key];
  });
  return plain;
};

const persistBill = (doc) => {
  const plain = stripMethods(doc);
  plain.updatedAt = new Date();
  const index = bills.findIndex((item) => String(item._id) === String(plain._id));
  if (index >= 0) bills[index] = clone(plain);
  else bills.push(clone(plain));
  return plain;
};

const persistReceipt = (doc) => {
  const plain = stripMethods(doc);
  plain.updatedAt = new Date();
  const index = receipts.findIndex((item) => String(item._id) === String(plain._id));
  if (index >= 0) receipts[index] = clone(plain);
  else receipts.push(clone(plain));
  return plain;
};

const persistMonthClose = (doc) => {
  const plain = stripMethods(doc);
  const index = monthClosures.findIndex((item) => String(item._id) === String(plain._id));
  if (index >= 0) monthClosures[index] = clone(plain);
  else monthClosures.push(clone(plain));
  return plain;
};

const persistFinanceAnomalyCase = (doc) => {
  const plain = stripMethods(doc);
  plain.updatedAt = new Date();
  const index = financeAnomalyCases.findIndex((item) => String(item._id) === String(plain._id));
  if (index >= 0) financeAnomalyCases[index] = clone(plain);
  else financeAnomalyCases.push(clone(plain));
  return plain;
};

const persistFeePlan = (doc) => {
  const plain = stripMethods(doc);
  plain.updatedAt = new Date();
  const index = feePlans.findIndex((item) => String(item._id) === String(plain._id));
  if (index >= 0) feePlans[index] = clone(plain);
  else feePlans.push(clone(plain));
  return plain;
};

const createBillDoc = (record) => {
  if (!record) return null;
  const doc = clone(record);
  doc.save = async function save() {
    persistBill(this);
    return this;
  };
  doc.toObject = function toObject() {
    return stripMethods(this);
  };
  return doc;
};

const createReceiptDoc = (record) => {
  if (!record) return null;
  const doc = clone(record);
  doc.save = async function save() {
    persistReceipt(this);
    return this;
  };
  doc.toObject = function toObject() {
    return stripMethods(this);
  };
  return doc;
};

const studentFinanceServiceMock = {
  async listFeePayments(filters = {}) {
    const approvalStage = String(filters.approvalStage || '').trim();
    const classId = String(filters.classId || '').trim();
    const student = String(filters.student || '').trim();
    return receipts
      .filter((item) => {
        if (filters.status && String(item.status || '') !== String(filters.status)) return false;
        if (approvalStage && String(item.approvalStage || '') !== approvalStage) return false;
        if (classId && String(item.classId || '') !== classId) return false;
        if (student && String(item.student || '') !== student) return false;
        return true;
      })
      .map((item) => {
        const bill = bills.find((row) => String(row._id) === String(item.bill));
        return {
          id: `payment-${item._id}`,
          sourceReceiptId: item._id,
          amount: item.amount,
          paymentMethod: item.paymentMethod,
          referenceNo: item.referenceNo,
          status: item.status,
          approvalStage: item.approvalStage,
          paidAt: item.paidAt,
          fileUrl: item.fileUrl,
          note: item.note,
          feeOrder: bill
            ? {
                id: `fee-order-${bill._id}`,
                sourceBillId: bill._id,
                orderNumber: bill.billNumber,
                title: bill.periodLabel || bill.billNumber,
                amountDue: bill.amountDue,
                amountPaid: bill.amountPaid,
                status: bill.status
              }
            : null,
          receipt: {
            id: item._id
          }
        };
      });
  },
  async getMembershipFinanceStatement(studentMembershipId = '') {
    const membership = memberships.find((item) => String(item._id) === String(studentMembershipId));
    if (!membership) return null;
    const student = findUser(membership.student);
    const schoolClass = findSchoolClass(membership.classId);
    const classBills = bills.filter((item) => String(item.student) === String(membership.student));
    const classReceipts = receipts.filter((item) => String(item.student) === String(membership.student));
    const totalDue = classBills.reduce((sum, item) => sum + Number(item.amountDue || 0), 0);
    const totalPaid = classReceipts
      .filter((item) => String(item.status || '') === 'approved')
      .reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const totalOutstanding = Math.max(0, totalDue - totalPaid);
    return {
      membership: {
        id: String(membership._id || ''),
        student: {
          userId: String(student?._id || ''),
          studentId: `student-core-${student?._id || membership.student}`,
          fullName: student?.name || 'Student'
        },
        schoolClass: {
          id: String(schoolClass?._id || membership.classId || ''),
          title: schoolClass?.title || 'Class'
        },
        academicYear: {
          id: 'academic-year-1',
          title: '1405'
        }
      },
      statement: {
        generatedAt: '2026-03-28T09:00:00.000Z',
        currency: 'AFN',
        totals: {
          totalOrders: classBills.length,
          totalPayments: classReceipts.length,
          totalDue,
          totalPaid,
          totalOutstanding,
          totalReliefs: 0,
          totalFixedReliefAmount: 0
        },
        pack: {
          recommendedAction: totalOutstanding > 0 ? 'Follow up on open balance' : 'No special action',
          summary: { total: 0, critical: 0 }
        },
        latestApprovedPayment: classReceipts.find((item) => String(item.status || '') === 'approved')
          ? {
              amount: classReceipts.find((item) => String(item.status || '') === 'approved').amount,
              paidAt: classReceipts.find((item) => String(item.status || '') === 'approved').paidAt
            }
          : null,
        latestPendingPayment: classReceipts.find((item) => String(item.status || '') === 'pending')
          ? {
              amount: classReceipts.find((item) => String(item.status || '') === 'pending').amount,
              approvalStage: classReceipts.find((item) => String(item.status || '') === 'pending').approvalStage
            }
          : null
      },
      orders: classBills.map((item) => ({
        id: String(item._id || ''),
        orderNumber: item.billNumber,
        title: item.periodLabel || item.billNumber,
        orderType: 'tuition',
        status: item.status,
        dueDate: item.dueDate,
        outstandingAmount: Math.max(0, Number(item.amountDue || 0) - Number(item.amountPaid || 0)),
        currency: item.currency || 'AFN'
      })),
      payments: classReceipts.map((item) => ({
        id: String(item._id || ''),
        paymentNumber: `PAY-${item._id}`,
        amount: item.amount,
        paymentMethod: item.paymentMethod,
        status: item.status,
        approvalStage: item.approvalStage,
        paidAt: item.paidAt,
        currency: 'AFN'
      })),
      reliefs: []
    };
  }
};

const financeDocumentArchiveMock = {
  async buildFinanceDocumentDescriptor({ documentType = 'student_statement' } = {}) {
    const ordinal = String(archivedDocuments.length + 1).padStart(3, '0');
    return {
      documentNo: `DOC-${documentType}-${ordinal}`,
      verificationCode: `VERIFY-${documentType}-${ordinal}`,
      verificationUrl: `http://127.0.0.1/verify/${documentType}/${ordinal}`,
      verificationQrBuffer: Buffer.from(`qr-${documentType}-${ordinal}`)
    };
  },
  async createFinanceDocumentArchive(payload = {}) {
    const descriptor = payload?.descriptor || {};
    const record = {
      _id: `archive-${archivedDocuments.length + 1}`,
      documentNo: descriptor.documentNo || `DOC-${payload?.documentType || 'student_statement'}-${archivedDocuments.length + 1}`,
      verificationCode: descriptor.verificationCode || `VERIFY-${payload?.documentType || 'student_statement'}-${archivedDocuments.length + 1}`,
      verificationUrl: descriptor.verificationUrl || `http://127.0.0.1/verify/${payload?.documentType || 'student_statement'}`,
      filename: payload?.filename || 'document.bin',
      documentType: payload?.documentType || 'student_statement',
      title: payload?.title || '',
      subjectName: payload?.subjectName || '',
      membershipLabel: payload?.membershipLabel || '',
      batchLabel: payload?.batchLabel || '',
      monthKey: payload?.monthKey || '',
      classId: payload?.classId || payload?.meta?.classId || '',
      academicYearId: payload?.academicYearId || payload?.meta?.academicYearId || '',
      status: 'active',
      sizeBytes: Buffer.isBuffer(payload?.buffer) ? payload.buffer.length : 0,
      sha256: 'mock-sha256',
      generatedAt: new Date().toISOString(),
      generatedBy: { _id: IDS.adminManager, name: 'Finance Manager' },
      classTitle: payload?.meta?.classTitle || '',
      academicYearTitle: payload?.meta?.academicYearTitle || '',
      deliveryCount: 0,
      lastDeliveredAt: null,
      lastDeliveryStatus: '',
      deliveryLog: [],
      verifyCount: 0,
      downloadCount: Array.isArray(payload?.accessEvents) && payload.accessEvents.includes('downloaded') ? 1 : 0,
      lastDownloadedAt: Array.isArray(payload?.accessEvents) && payload.accessEvents.includes('downloaded') ? new Date().toISOString() : null,
      lastVerifiedAt: null,
      childDocuments: Array.isArray(payload?.childDocuments) ? payload.childDocuments : [],
      meta: payload?.meta && typeof payload.meta === 'object' ? clone(payload.meta) : {},
      verification: {
        code: descriptor.verificationCode || `VERIFY-${payload?.documentType || 'student_statement'}-${archivedDocuments.length + 1}`,
        url: descriptor.verificationUrl || `http://127.0.0.1/verify/${payload?.documentType || 'student_statement'}`
      }
    };
    archivedDocuments.unshift(record);
    return clone(record);
  },
  async listFinanceDocumentArchives(filters = {}) {
    const limit = Math.max(1, Number(filters.limit || 12) || 12);
    const documentType = String(filters.documentType || '').trim();
    const monthKey = String(filters.monthKey || '').trim();
    const classId = String(filters.classId || '').trim();
    const academicYearId = String(filters.academicYearId || '').trim();
    return clone(archivedDocuments
      .filter((item) => {
        if (documentType && String(item.documentType || '') !== documentType) return false;
        if (monthKey && String(item.monthKey || '') !== monthKey) return false;
        if (classId && String(item.classId || '') !== classId) return false;
        if (academicYearId && String(item.academicYearId || '') !== academicYearId) return false;
        return true;
      })
      .slice(0, limit));
  },
  async getFinanceDocumentArchiveById(archiveId = '') {
    const item = archivedDocuments.find((entry) => String(entry._id || '') === String(archiveId || '')) || null;
    return item ? clone(item) : null;
  },
  async verifyFinanceDocumentArchive({ verificationCode = '' } = {}) {
    const item = archivedDocuments.find((entry) => String(entry.verificationCode || '') === String(verificationCode || ''));
    if (!item) return null;
    item.verifyCount = Number(item.verifyCount || 0) + 1;
    item.lastVerifiedAt = new Date().toISOString();
    return clone(item);
  },
  async recordFinanceDocumentDelivery({
    archiveId = '',
    channel = 'email',
    status = 'sent',
    recipient = '',
    recipientCount = 0,
    linkedAudienceNotified = false,
    subject = '',
    note = '',
    provider = '',
    providerMessageId = '',
    providerStatus = '',
    errorMessage = '',
    failureCode = '',
    retryable = false,
    nextRetryAt = null
  } = {}) {
    const item = archivedDocuments.find((entry) => String(entry._id || '') === String(archiveId || '')) || null;
    if (!item) return null;
    item.deliveryLog = Array.isArray(item.deliveryLog) ? item.deliveryLog : [];
    item.deliveryLog.push({
      channel: String(channel || 'email').trim() || 'email',
      status,
      recipient,
      recipientCount,
      linkedAudienceNotified,
      subject,
      provider,
      providerMessageId,
      providerStatus,
      note,
      errorMessage,
      failureCode,
      retryable: retryable === true,
      nextRetryAt: nextRetryAt || null,
      sentAt: new Date().toISOString(),
      sentBy: { _id: IDS.adminManager, name: 'Finance Manager' }
    });
    item.lastDeliveryStatus = status;
    if (status !== 'failed') {
      item.deliveryCount = Number(item.deliveryCount || 0) + 1;
      item.lastDeliveredAt = new Date().toISOString();
    }
    return clone(item);
  },
  async buildFinanceDocumentZipBuffer({ entries = [], manifest = {} } = {}) {
    return Buffer.from(JSON.stringify({
      kind: 'mock-zip',
      totalEntries: Array.isArray(entries) ? entries.length : 0,
      manifest
    }));
  }
};

const getMockDeliveryTemplateBase = (templateKey = '') => (
  deliveryTemplates.find((item) => String(item?.key || '') === String(templateKey || '').trim()) || null
);

const normalizeMockDeliveryTemplateApprovalStage = (value = '') => {
  const normalized = String(value || '').trim().toLowerCase();
  return ['draft', 'pending_review', 'approved', 'rejected'].includes(normalized) ? normalized : 'draft';
};

const buildMockDeliveryTemplateRolloutMetrics = (templateKey = '') => {
  const campaigns = deliveryCampaigns.filter((item) => (
    String(item?.messageTemplateKey || '').trim() === String(templateKey || '').trim()
  ));
  const byChannel = campaigns.reduce((acc, item) => {
    const key = String(item?.channel || 'email').trim() || 'email';
    acc[key] = Number(acc[key] || 0) + 1;
    return acc;
  }, {});
  const lastUsedAt = campaigns.reduce((latest, item) => {
    const candidate = item?.lastRunAt || item?.updatedAt || item?.createdAt || null;
    if (!candidate) return latest;
    if (!latest) return candidate;
    return new Date(candidate).getTime() >= new Date(latest).getTime() ? candidate : latest;
  }, null);
  return {
    totalCampaigns: campaigns.length,
    activeCampaigns: campaigns.filter((item) => String(item?.status || '') === 'active').length,
    automatedCampaigns: campaigns.filter((item) => item?.automationEnabled === true).length,
    deliveredTargets: campaigns.reduce((sum, item) => sum + Number(item?.successCount || 0), 0),
    failedTargets: campaigns.reduce((sum, item) => sum + Number(item?.failureCount || 0), 0),
    lastUsedAt,
    byChannel
  };
};

const buildMockDeliveryTemplateItem = (templateKey = '') => {
  const base = getMockDeliveryTemplateBase(templateKey);
  if (!base) return null;
  const registry = deliveryTemplateRegistry.find((item) => String(item?.key || '') === String(templateKey || '').trim()) || null;
  const publishedVersionNumber = Number(registry?.currentPublishedVersion || 1) || 1;
  const draftVersionNumber = Number(registry?.currentDraftVersion || 0) || null;
  const serializeVersion = (item = {}, { isSystem = false } = {}) => {
    const versionNumber = Number(item?.versionNumber || 0) || 0;
    const status = isSystem
      ? (publishedVersionNumber === 1 ? 'published' : 'archived')
      : (versionNumber === publishedVersionNumber ? 'published' : (versionNumber === draftVersionNumber ? 'draft' : 'archived'));
    const approvalStage = isSystem
      ? 'approved'
      : normalizeMockDeliveryTemplateApprovalStage(
        item?.approvalStage
        || (versionNumber === publishedVersionNumber ? 'approved' : (versionNumber === draftVersionNumber ? 'draft' : 'approved'))
      );
    return {
      ...clone(item),
      versionNumber,
      status,
      approvalStage,
      canRequestReview: !isSystem && status === 'draft' && approvalStage !== 'pending_review',
      canApprove: !isSystem && status === 'draft' && approvalStage === 'pending_review',
      canReject: !isSystem && status === 'draft' && approvalStage === 'pending_review',
      canPublish: !isSystem && status === 'draft' && approvalStage === 'approved'
    };
  };
  const systemVersion = serializeVersion({
    versionNumber: 1,
    subject: base.defaultSubject,
    body: base.defaultBody,
    changeNote: 'system baseline',
    source: 'system',
    isSystem: true
  }, { isSystem: true });
  const customVersions = Array.isArray(registry?.versions) ? registry.versions.map((item) => serializeVersion(item)) : [];
  const versions = [systemVersion, ...customVersions]
    .sort((left, right) => Number(right?.versionNumber || 0) - Number(left?.versionNumber || 0));
  const publishedVersion = versions.find((item) => Number(item?.versionNumber || 0) === publishedVersionNumber) || systemVersion;
  const draftVersion = versions.find((item) => Number(item?.versionNumber || 0) === draftVersionNumber) || null;
  return {
    ...clone(base),
    defaultSubject: publishedVersion.subject || base.defaultSubject,
    defaultBody: publishedVersion.body || base.defaultBody,
    publishedVersionNumber,
    draftVersionNumber,
    versions,
    publishedVersion,
    draftVersion,
    history: Array.isArray(registry?.history) ? clone(registry.history) : [],
    hasCustomizations: customVersions.length > 0,
    currentVersionNumber: publishedVersionNumber,
    approvalSummary: {
      draft: versions.filter((item) => item.approvalStage === 'draft').length,
      pendingReview: versions.filter((item) => item.approvalStage === 'pending_review').length,
      approved: versions.filter((item) => item.approvalStage === 'approved').length,
      rejected: versions.filter((item) => item.approvalStage === 'rejected').length
    },
    pendingReviewVersionNumber: versions.find((item) => item.approvalStage === 'pending_review' && item.isSystem !== true)?.versionNumber || null,
    rolloutMetrics: buildMockDeliveryTemplateRolloutMetrics(templateKey)
  };
};

const buildMockProviderDeliveryOutcome = ({
  providerStatus = '',
  failureCode = '',
  errorMessage = ''
} = {}) => {
  const normalizedStatus = String(providerStatus || '').trim().toLowerCase();
  if (['delivered', 'read', 'seen', 'completed'].includes(normalizedStatus)) {
    return { terminal: true, status: 'delivered', failureCode: '', errorMessage: '', retryable: false };
  }
  if (['failed', 'undelivered', 'rejected', 'blocked', 'expired'].includes(normalizedStatus)) {
    const normalizedFailureCode = String(failureCode || 'provider_rejected').trim() || 'provider_rejected';
    return {
      terminal: true,
      status: 'failed',
      failureCode: normalizedFailureCode,
      errorMessage: String(errorMessage || normalizedStatus || normalizedFailureCode).trim(),
      retryable: ['provider_timeout', 'provider_unavailable', 'rate_limited', 'transport_error'].includes(normalizedFailureCode)
    };
  }
  return {
    terminal: false,
    status: '',
    failureCode: String(failureCode || '').trim(),
    errorMessage: String(errorMessage || '').trim(),
    retryable: false
  };
};

const reconcileMockCampaignTargetSummary = (campaign = null) => {
  if (!campaign) return;
  const targets = Array.isArray(campaign.targets) ? campaign.targets : [];
  campaign.targetSummary = {
    total: targets.length,
    successful: targets.filter((entry) => ['sent', 'resent', 'delivered'].includes(String(entry?.status || ''))).length,
    failed: targets.filter((entry) => String(entry?.status || '') === 'failed').length,
    skipped: targets.filter((entry) => String(entry?.status || '') === 'skipped').length
  };
  campaign.successCount = campaign.targetSummary.successful;
  campaign.failureCount = campaign.targetSummary.failed;
};

const buildMockRecoveryAgeMinutes = (value = null) => {
  if (!value) return null;
  const occurredAt = new Date(value);
  if (Number.isNaN(occurredAt.getTime())) return null;
  return Math.max(0, Math.floor((Date.now() - occurredAt.getTime()) / 60000));
};

const buildMockRecoveryState = ({
  providerStatus = '',
  status = '',
  retryable = false,
  nextRetryAt = null,
  failureCode = '',
  errorMessage = '',
  occurredAt = null
} = {}) => {
  const normalizedProviderStatus = String(providerStatus || '').trim().toLowerCase();
  const normalizedStatus = String(status || '').trim().toLowerCase();
  const normalizedFailureCode = String(failureCode || '').trim().toLowerCase();
  const normalizedError = String(errorMessage || '').trim().toLowerCase();
  let stage = 'unknown';
  if (['read', 'seen'].includes(normalizedProviderStatus)) stage = 'read';
  else if (['delivered', 'delivery_confirmed', 'completed', 'complete'].includes(normalizedProviderStatus)) stage = 'delivered';
  else if (['failed', 'undelivered', 'rejected', 'expired', 'cancelled', 'canceled', 'error', 'timeout', 'bounced'].includes(normalizedProviderStatus)) stage = 'failed';
  else if (['accepted', 'submitted', 'received'].includes(normalizedProviderStatus)) stage = 'accepted';
  else if (['queued', 'pending', 'scheduled'].includes(normalizedProviderStatus)) stage = 'queued';
  else if (['sent', 'dispatched', 'dispatching', 'in_transit'].includes(normalizedProviderStatus)) stage = 'sent';
  else if (normalizedStatus === 'delivered') stage = 'delivered';
  else if (normalizedStatus === 'failed') stage = 'failed';
  else if (['sent', 'resent'].includes(normalizedStatus)) stage = 'sent';
  else if (normalizedStatus === 'skipped') stage = 'skipped';
  else if (normalizedFailureCode || normalizedError) stage = 'failed';

  const ageMinutes = buildMockRecoveryAgeMinutes(occurredAt);
  const waitingForRetry = retryable === true && nextRetryAt && new Date(nextRetryAt).getTime() > Date.now();
  if (['queued', 'accepted', 'sent'].includes(stage) && ageMinutes != null && ageMinutes >= 20) {
    return { key: 'awaiting_callback', stage, ageMinutes };
  }
  if (stage === 'unknown' && ageMinutes != null && ageMinutes >= 20) {
    return { key: 'status_unknown', stage, ageMinutes };
  }
  if (stage === 'failed') {
    return { key: waitingForRetry ? 'retry_waiting' : (retryable === true ? 'retry_ready' : 'provider_failed'), stage, ageMinutes };
  }
  return { key: '', stage, ageMinutes };
};

const buildMockDeliveryRecoveryQueue = (filters = {}) => {
  const normalizedChannel = String(filters?.channel || '').trim();
  const normalizedStatus = String(filters?.status || '').trim();
  const normalizedProvider = String(filters?.provider || '').trim();
  const normalizedFailureCode = String(filters?.failureCode || '').trim();
  const normalizedRecoveryState = String(filters?.recoveryState || '').trim();
  const retryableFilter = String(filters?.retryable || '').trim().toLowerCase();
  const retryableValue = retryableFilter === 'true' || retryableFilter === 'retryable'
    ? true
    : retryableFilter === 'false' || retryableFilter === 'non_retryable' || retryableFilter === 'not_retryable'
      ? false
      : null;
  const groups = new Map();
  const appendGroup = ({
    providerMessageId = '',
    provider = '',
    providerStatus = '',
    channel = '',
    recipient = '',
    deliveryStatus = '',
    failureCode = '',
    errorMessage = '',
    retryable = false,
    nextRetryAt = null,
    occurredAt = null,
    recoveryState = '',
    ageMinutes = null,
    archiveRef = null,
    campaignRef = null
  } = {}) => {
    const normalizedMessageId = String(providerMessageId || '').trim();
    if (!normalizedMessageId || !recoveryState) return;
    const current = groups.get(normalizedMessageId) || {
      providerMessageId: normalizedMessageId,
      provider: '',
      providerStatus: '',
      channel: String(channel || 'email').trim() || 'email',
      recipient: '',
      deliveryStatus: '',
      failureCode: '',
      errorMessage: '',
      retryable: false,
      nextRetryAt: null,
      recoveryState: '',
      ageMinutes: null,
      lastEventAt: null,
      archiveRefs: [],
      campaignRefs: []
    };
    const currentTime = current.lastEventAt ? new Date(current.lastEventAt).getTime() : 0;
    const nextTime = occurredAt ? new Date(occurredAt).getTime() : 0;
    const shouldReplace = nextTime >= currentTime;
    if (shouldReplace) {
      current.provider = String(provider || '').trim();
      current.providerStatus = String(providerStatus || '').trim();
      current.channel = String(channel || 'email').trim() || 'email';
      current.recipient = String(recipient || '').trim();
      current.deliveryStatus = String(deliveryStatus || '').trim();
      current.failureCode = String(failureCode || '').trim();
      current.errorMessage = String(errorMessage || '').trim();
      current.retryable = retryable === true;
      current.nextRetryAt = nextRetryAt || null;
      current.recoveryState = recoveryState;
      current.ageMinutes = ageMinutes;
      current.lastEventAt = occurredAt || null;
    }
    if (archiveRef?.archiveId && !current.archiveRefs.some((item) => String(item.archiveId || '') === String(archiveRef.archiveId || ''))) {
      current.archiveRefs.push(clone(archiveRef));
    }
    if (campaignRef?.campaignId && !current.campaignRefs.some((item) => (
      String(item.campaignId || '') === String(campaignRef.campaignId || '')
      && String(item.archiveId || '') === String(campaignRef.archiveId || '')
    ))) {
      current.campaignRefs.push(clone(campaignRef));
    }
    groups.set(normalizedMessageId, current);
  };

  archivedDocuments.forEach((archive) => {
    (Array.isArray(archive?.deliveryLog) ? archive.deliveryLog : []).forEach((entry) => {
      const state = buildMockRecoveryState({
        providerStatus: entry?.providerStatus,
        status: entry?.status,
        retryable: entry?.retryable === true,
        nextRetryAt: entry?.nextRetryAt || null,
        failureCode: entry?.failureCode,
        errorMessage: entry?.errorMessage,
        occurredAt: entry?.sentAt || null
      });
      appendGroup({
        providerMessageId: entry?.providerMessageId,
        provider: entry?.provider,
        providerStatus: entry?.providerStatus,
        channel: entry?.channel || 'email',
        recipient: entry?.recipient,
        deliveryStatus: entry?.status,
        failureCode: entry?.failureCode,
        errorMessage: entry?.errorMessage,
        retryable: entry?.retryable === true,
        nextRetryAt: entry?.nextRetryAt || null,
        occurredAt: entry?.sentAt || null,
        recoveryState: state.key,
        ageMinutes: state.ageMinutes,
        archiveRef: {
          archiveId: archive._id,
          documentNo: archive.documentNo,
          subjectName: archive.subjectName,
          status: entry?.status || archive?.lastDeliveryStatus || ''
        }
      });
    });
  });

  deliveryCampaigns.forEach((campaign) => {
    (Array.isArray(campaign?.targets) ? campaign.targets : []).forEach((target) => {
      const state = buildMockRecoveryState({
        providerStatus: target?.providerStatus,
        status: target?.status,
        retryable: target?.retryable === true,
        nextRetryAt: target?.nextRetryAt || null,
        failureCode: target?.lastFailureCode,
        errorMessage: target?.lastError,
        occurredAt: target?.lastAttemptAt || target?.lastDeliveredAt || null
      });
      appendGroup({
        providerMessageId: target?.providerMessageId,
        provider: target?.provider,
        providerStatus: target?.providerStatus,
        channel: target?.channel || campaign?.channel || 'email',
        recipient: target?.recipient,
        deliveryStatus: target?.status,
        failureCode: target?.lastFailureCode,
        errorMessage: target?.lastError,
        retryable: target?.retryable === true,
        nextRetryAt: target?.nextRetryAt || null,
        occurredAt: target?.lastAttemptAt || target?.lastDeliveredAt || null,
        recoveryState: state.key,
        ageMinutes: state.ageMinutes,
        campaignRef: {
          campaignId: campaign._id,
          campaignName: campaign.name,
          archiveId: target?.archiveId || '',
          documentNo: target?.documentNo || '',
          status: target?.status || ''
        }
      });
    });
  });

  return clone(Array.from(groups.values())
    .map((item) => ({
      ...item,
      documentNos: Array.from(new Set([
        ...item.archiveRefs.map((ref) => String(ref?.documentNo || '').trim()),
        ...item.campaignRefs.map((ref) => String(ref?.documentNo || '').trim())
      ].filter(Boolean))),
      campaignNames: Array.from(new Set(
        item.campaignRefs.map((ref) => String(ref?.campaignName || '').trim()).filter(Boolean)
      )),
      archiveCount: item.archiveRefs.length,
      campaignCount: item.campaignRefs.length,
      replayRecommendedStatus: ['awaiting_callback', 'retry_ready', 'retry_waiting', 'status_unknown'].includes(String(item?.recoveryState || '').trim())
        ? 'delivered'
        : 'failed'
    }))
    .filter((item) => (
      (!normalizedChannel || String(item?.channel || '').trim() === normalizedChannel)
      && (!normalizedStatus || String(item?.deliveryStatus || '').trim() === normalizedStatus)
      && (!normalizedProvider || String(item?.provider || '').trim() === normalizedProvider)
      && (!normalizedFailureCode || String(item?.failureCode || '').trim() === normalizedFailureCode)
      && (!normalizedRecoveryState || String(item?.recoveryState || '').trim() === normalizedRecoveryState)
      && (retryableValue == null || Boolean(item?.retryable === true) === retryableValue)
    ))
    .sort((left, right) => new Date(right?.lastEventAt || 0).getTime() - new Date(left?.lastEventAt || 0).getTime()));
};

const maskMockProviderSecret = (value = '') => {
  const normalized = String(value || '').trim();
  if (!normalized) return '';
  if (normalized.length <= 4) return '*'.repeat(normalized.length);
  return `${normalized.slice(0, 2)}***${normalized.slice(-2)}`;
};

const buildMockProviderWebhookPath = (config = {}) => {
  const mode = String(config?.mode || 'webhook').trim();
  const providerKey = mode === 'twilio'
    ? 'twilio'
    : mode === 'meta'
      ? 'meta'
      : String(config?.provider || 'generic').trim() || 'generic';
  return `/api/finance/delivery/providers/${providerKey}/status`;
};

const appendMockProviderAuditEntry = (config = null, {
  action = 'config_saved',
  note = '',
  changedFields = [],
  rotatedFields = [],
  by = { _id: IDS.adminManager, name: 'Finance Manager' },
  at = new Date().toISOString()
} = {}) => {
  if (!config) return;
  if (!Array.isArray(config.auditTrail)) config.auditTrail = [];
  config.auditTrail.unshift({
    action,
    by: clone(by),
    at,
    note: String(note || '').trim(),
    changedFields: Array.isArray(changedFields) ? [...changedFields] : [],
    rotatedFields: Array.isArray(rotatedFields) ? [...rotatedFields] : [],
    credentialVersion: Math.max(1, Number(config.credentialVersion || 1) || 1)
  });
  if (config.auditTrail.length > 20) {
    config.auditTrail = config.auditTrail.slice(0, 20);
  }
};

const buildMockDeliveryProviderConfigItem = (channel = 'sms') => {
  const config = deliveryProviderConfigs.find((item) => String(item?.channel || '') === String(channel || '').trim()) || null;
  if (!config) return null;
  const mode = String(config?.mode || 'webhook').trim() || 'webhook';
  const requiredFields = mode === 'webhook'
    ? ['webhookUrl']
    : mode === 'twilio'
      ? ['accountSid', 'authToken', 'fromHandle']
      : mode === 'meta'
        ? ['accessToken', 'phoneNumberId']
        : [];
  const missingRequiredFields = requiredFields.filter((field) => !String(config?.[field] || '').trim());
  const webhookPath = buildMockProviderWebhookPath(config);
  return {
    channel: String(config.channel || '').trim(),
    mode,
    provider: String(config.provider || '').trim(),
    isActive: config.isActive !== false,
    webhookUrl: String(config.webhookUrl || '').trim(),
    statusWebhookUrl: String(config.statusWebhookUrl || '').trim(),
    fromHandle: String(config.fromHandle || '').trim(),
    apiBaseUrl: String(config.apiBaseUrl || '').trim(),
    note: String(config.note || '').trim(),
    credentialVersion: Math.max(1, Number(config.credentialVersion || 1) || 1),
    lastRotatedAt: config.lastRotatedAt || null,
    lastRotatedBy: clone(config.lastRotatedBy || null),
    source: String(config.source || 'database').trim() || 'database',
    updatedAt: config.updatedAt || null,
    updatedBy: clone(config.updatedBy || null),
    auditTrail: Array.isArray(config.auditTrail) ? clone(config.auditTrail) : [],
    fields: {
      accountSid: { configured: Boolean(String(config.accountSid || '').trim()), masked: maskMockProviderSecret(config.accountSid) },
      authToken: { configured: Boolean(String(config.authToken || '').trim()), masked: maskMockProviderSecret(config.authToken) },
      accessToken: { configured: Boolean(String(config.accessToken || '').trim()), masked: maskMockProviderSecret(config.accessToken) },
      phoneNumberId: { configured: Boolean(String(config.phoneNumberId || '').trim()), masked: maskMockProviderSecret(config.phoneNumberId) },
      webhookToken: { configured: Boolean(String(config.webhookToken || '').trim()), masked: maskMockProviderSecret(config.webhookToken) }
    },
    readiness: {
      configured: config.isActive !== false && missingRequiredFields.length === 0,
      missingRequiredFields,
      providerKey: mode === 'twilio' ? 'twilio' : mode === 'meta' ? 'meta' : String(config.provider || '').trim(),
      webhookPath,
      webhookUrl: `http://127.0.0.1:4010${webhookPath}`,
      providerCallbackUrl: String(config.statusWebhookUrl || '').trim() || ((mode === 'twilio' || mode === 'meta') ? `http://127.0.0.1:4010${webhookPath}` : ''),
      inboundTokenRequired: Boolean(String(config.webhookToken || '').trim())
    }
  };
};

const financeDeliveryServiceMock = {
  async listFinanceDeliveryProviderConfigs() {
    return deliveryProviderConfigs
      .map((item) => buildMockDeliveryProviderConfigItem(item.channel))
      .filter(Boolean);
  },
  async saveFinanceDeliveryProviderConfig(channel = '', payload = {}) {
    const normalizedChannel = String(channel || '').trim() || 'sms';
    let config = deliveryProviderConfigs.find((item) => String(item?.channel || '') === normalizedChannel) || null;
    if (!config) {
      config = {
        channel: normalizedChannel,
        source: 'database',
        credentialVersion: 1,
        lastRotatedAt: null,
        lastRotatedBy: null,
        auditTrail: []
      };
      deliveryProviderConfigs.push(config);
    }
    const changedFields = [];
    const rotatedFields = [];
    [
      'mode',
      'provider',
      'isActive',
      'webhookUrl',
      'statusWebhookUrl',
      'fromHandle',
      'apiBaseUrl',
      'note'
    ].forEach((field) => {
      const previousValue = field === 'isActive'
        ? config[field] !== false
        : String(config?.[field] || '').trim();
      const nextValue = field === 'isActive'
        ? payload?.isActive !== false
        : String(payload?.[field] || '').trim();
      if (previousValue !== nextValue) changedFields.push(field);
    });
    Object.assign(config, {
      mode: String(payload?.mode || config.mode || 'webhook').trim() || 'webhook',
      provider: String(payload?.provider || config.provider || `generic_${normalizedChannel}_gateway`).trim(),
      isActive: payload?.isActive !== false,
      webhookUrl: String(payload?.webhookUrl || '').trim(),
      statusWebhookUrl: String(payload?.statusWebhookUrl || '').trim(),
      fromHandle: String(payload?.fromHandle || '').trim(),
      apiBaseUrl: String(payload?.apiBaseUrl || '').trim(),
      note: String(payload?.note || '').trim(),
      updatedAt: new Date().toISOString(),
      updatedBy: { _id: IDS.adminManager, name: 'Finance Manager' }
    });
    ['accountSid', 'authToken', 'accessToken', 'phoneNumberId', 'webhookToken'].forEach((field) => {
      const nextValue = String(payload?.[field] || '').trim();
      const previousValue = String(config?.[field] || '').trim();
      if (nextValue && nextValue !== previousValue) {
        config[field] = nextValue;
        rotatedFields.push(field);
      }
    });
    if (rotatedFields.length) {
      config.credentialVersion = Math.max(1, Number(config.credentialVersion || 1) || 1) + 1;
      config.lastRotatedAt = new Date().toISOString();
      config.lastRotatedBy = { _id: IDS.adminManager, name: 'Finance Manager' };
    }
    appendMockProviderAuditEntry(config, {
      action: changedFields.length ? 'config_saved' : 'created',
      note: String(payload?.note || '').trim(),
      changedFields,
      rotatedFields
    });
    return buildMockDeliveryProviderConfigItem(normalizedChannel);
  },
  async rotateFinanceDeliveryProviderCredentials(channel = '', payload = {}) {
    const normalizedChannel = String(channel || '').trim() || 'sms';
    let config = deliveryProviderConfigs.find((item) => String(item?.channel || '') === normalizedChannel) || null;
    if (!config) {
      config = {
        channel: normalizedChannel,
        source: 'database',
        credentialVersion: 1,
        lastRotatedAt: null,
        lastRotatedBy: null,
        auditTrail: []
      };
      deliveryProviderConfigs.push(config);
    }
    const rotatedFields = ['accountSid', 'authToken', 'accessToken', 'phoneNumberId', 'webhookToken']
      .filter((field) => {
        const nextValue = String(payload?.[field] || '').trim();
        const previousValue = String(config?.[field] || '').trim();
        if (nextValue && nextValue !== previousValue) {
          config[field] = nextValue;
          return true;
        }
        return false;
      });
    if (!rotatedFields.length) {
      const error = new Error('No credential changes supplied.');
      error.statusCode = 400;
      throw error;
    }
    config.credentialVersion = Math.max(1, Number(config.credentialVersion || 1) || 1) + 1;
    config.lastRotatedAt = new Date().toISOString();
    config.lastRotatedBy = { _id: IDS.adminManager, name: 'Finance Manager' };
    config.updatedAt = new Date().toISOString();
    config.updatedBy = { _id: IDS.adminManager, name: 'Finance Manager' };
    appendMockProviderAuditEntry(config, {
      action: 'credentials_rotated',
      note: String(payload?.note || '').trim(),
      rotatedFields
    });
    return buildMockDeliveryProviderConfigItem(normalizedChannel);
  },
  async listFinanceDeliveryProviderWebhookTokens() {
    return [];
  },
  async listFinanceDeliveryTemplates() {
    return deliveryTemplates.map((item) => buildMockDeliveryTemplateItem(item.key));
  },
  listFinanceDeliveryTemplateVariables() {
    return clone(deliveryTemplateVariables);
  },
  async saveFinanceDeliveryTemplateDraft(templateKey = '', payload = {}) {
    const base = getMockDeliveryTemplateBase(templateKey);
    if (!base) {
      const error = new Error('Unknown template key.');
      error.statusCode = 400;
      error.meta = { invalidTemplateKey: templateKey };
      throw error;
    }
    let registry = deliveryTemplateRegistry.find((item) => String(item?.key || '') === String(templateKey || '').trim()) || null;
    if (!registry) {
      registry = {
        key: String(templateKey || '').trim(),
        currentPublishedVersion: 1,
        currentDraftVersion: null,
        versions: [],
        history: []
      };
      deliveryTemplateRegistry.push(registry);
    }
    const nextVersionNumber = Number(registry.currentDraftVersion || 0)
      || (registry.versions.reduce((max, item) => Math.max(max, Number(item?.versionNumber || 0) || 0), 1) + 1);
    const subject = String(payload?.subject || payload?.messageTemplateSubject || base.defaultSubject || '').trim();
    const body = String(payload?.body || payload?.messageTemplateBody || base.defaultBody || '').trim();
    const changeNote = String(payload?.changeNote || payload?.note || '').trim();
    const existing = registry.versions.find((item) => Number(item?.versionNumber || 0) === nextVersionNumber) || null;
    if (existing) {
      existing.subject = subject;
      existing.body = body;
      existing.changeNote = changeNote;
      existing.status = 'draft';
      existing.approvalStage = 'draft';
      existing.reviewRequestedAt = null;
      existing.reviewRequestedBy = null;
      existing.reviewNote = '';
      existing.approvedAt = null;
      existing.approvedBy = null;
      existing.approvalNote = '';
      existing.rejectedAt = null;
      existing.rejectedBy = null;
      existing.rejectionNote = '';
      existing.updatedAt = new Date().toISOString();
    } else {
      registry.versions.push({
        versionNumber: nextVersionNumber,
        status: 'draft',
        approvalStage: 'draft',
        subject,
        body,
        changeNote,
        source: 'custom',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
    }
    registry.currentDraftVersion = nextVersionNumber;
    registry.history.unshift({
      action: 'draft_saved',
      versionNumber: nextVersionNumber,
      toVersionNumber: nextVersionNumber,
      note: changeNote,
      at: new Date().toISOString(),
      by: { _id: IDS.adminManager, name: 'Finance Manager' }
    });
    return buildMockDeliveryTemplateItem(templateKey);
  },
  async requestFinanceDeliveryTemplateReview(templateKey = '', payload = {}) {
    const registry = deliveryTemplateRegistry.find((item) => String(item?.key || '') === String(templateKey || '').trim()) || null;
    if (!registry) {
      const error = new Error('No draft version found.');
      error.statusCode = 400;
      throw error;
    }
    const versionNumber = Number(payload?.versionNumber || registry.currentDraftVersion || 0) || 0;
    const target = registry.versions.find((item) => Number(item?.versionNumber || 0) === versionNumber) || null;
    if (!target) {
      const error = new Error('Template version not found.');
      error.statusCode = 404;
      throw error;
    }
    target.approvalStage = 'pending_review';
    target.reviewRequestedAt = new Date().toISOString();
    target.reviewRequestedBy = { _id: IDS.adminManager, name: 'Finance Manager' };
    target.reviewNote = String(payload?.note || '').trim();
    target.approvedAt = null;
    target.approvedBy = null;
    target.approvalNote = '';
    target.rejectedAt = null;
    target.rejectedBy = null;
    target.rejectionNote = '';
    registry.history.unshift({
      action: 'review_requested',
      versionNumber,
      fromVersionNumber: versionNumber,
      toVersionNumber: versionNumber,
      note: String(payload?.note || '').trim(),
      at: new Date().toISOString(),
      by: { _id: IDS.adminManager, name: 'Finance Manager' }
    });
    return buildMockDeliveryTemplateItem(templateKey);
  },
  async approveFinanceDeliveryTemplateVersion(templateKey = '', payload = {}) {
    const registry = deliveryTemplateRegistry.find((item) => String(item?.key || '') === String(templateKey || '').trim()) || null;
    if (!registry) {
      const error = new Error('No pending version found.');
      error.statusCode = 400;
      throw error;
    }
    const versionNumber = Number(payload?.versionNumber || registry.currentDraftVersion || 0) || 0;
    const target = registry.versions.find((item) => Number(item?.versionNumber || 0) === versionNumber) || null;
    if (!target) {
      const error = new Error('Template version not found.');
      error.statusCode = 404;
      throw error;
    }
    target.approvalStage = 'approved';
    target.approvedAt = new Date().toISOString();
    target.approvedBy = { _id: IDS.adminLead, name: 'Finance Lead' };
    target.approvalNote = String(payload?.note || '').trim();
    target.rejectedAt = null;
    target.rejectedBy = null;
    target.rejectionNote = '';
    registry.history.unshift({
      action: 'approved',
      versionNumber,
      fromVersionNumber: versionNumber,
      toVersionNumber: versionNumber,
      note: String(payload?.note || '').trim(),
      at: new Date().toISOString(),
      by: { _id: IDS.adminLead, name: 'Finance Lead' }
    });
    return buildMockDeliveryTemplateItem(templateKey);
  },
  async rejectFinanceDeliveryTemplateVersion(templateKey = '', payload = {}) {
    const registry = deliveryTemplateRegistry.find((item) => String(item?.key || '') === String(templateKey || '').trim()) || null;
    if (!registry) {
      const error = new Error('No pending version found.');
      error.statusCode = 400;
      throw error;
    }
    const versionNumber = Number(payload?.versionNumber || registry.currentDraftVersion || 0) || 0;
    const target = registry.versions.find((item) => Number(item?.versionNumber || 0) === versionNumber) || null;
    if (!target) {
      const error = new Error('Template version not found.');
      error.statusCode = 404;
      throw error;
    }
    target.approvalStage = 'rejected';
    target.rejectedAt = new Date().toISOString();
    target.rejectedBy = { _id: IDS.adminLead, name: 'Finance Lead' };
    target.rejectionNote = String(payload?.note || payload?.reason || '').trim();
    target.approvedAt = null;
    target.approvedBy = null;
    target.approvalNote = '';
    registry.history.unshift({
      action: 'rejected',
      versionNumber,
      fromVersionNumber: versionNumber,
      toVersionNumber: versionNumber,
      note: String(payload?.note || payload?.reason || '').trim(),
      at: new Date().toISOString(),
      by: { _id: IDS.adminLead, name: 'Finance Lead' }
    });
    return buildMockDeliveryTemplateItem(templateKey);
  },
  async publishFinanceDeliveryTemplateVersion(templateKey = '', payload = {}) {
    const registry = deliveryTemplateRegistry.find((item) => String(item?.key || '') === String(templateKey || '').trim()) || null;
    if (!registry) {
      const error = new Error('No draft version found.');
      error.statusCode = 400;
      throw error;
    }
    const versionNumber = Number(payload?.versionNumber || registry.currentDraftVersion || 0) || 0;
    const target = registry.versions.find((item) => Number(item?.versionNumber || 0) === versionNumber) || null;
    if (!target) {
      const error = new Error('Template version not found.');
      error.statusCode = 404;
      throw error;
    }
    if (versionNumber > 1 && normalizeMockDeliveryTemplateApprovalStage(target.approvalStage) !== 'approved') {
      const error = new Error('Template must be approved before publishing.');
      error.statusCode = 400;
      throw error;
    }
    registry.versions.forEach((item) => {
      if (Number(item?.versionNumber || 0) === versionNumber) {
        item.status = 'published';
        item.approvalStage = 'approved';
        item.publishedAt = new Date().toISOString();
      } else if (String(item?.status || '') === 'published') {
        item.status = 'archived';
        item.archivedAt = new Date().toISOString();
      }
    });
    registry.currentPublishedVersion = versionNumber;
    if (Number(registry.currentDraftVersion || 0) === versionNumber) registry.currentDraftVersion = null;
    registry.history.unshift({
      action: 'published',
      versionNumber,
      fromVersionNumber: 1,
      toVersionNumber: versionNumber,
      note: String(payload?.note || '').trim(),
      at: new Date().toISOString(),
      by: { _id: IDS.adminManager, name: 'Finance Manager' }
    });
    return buildMockDeliveryTemplateItem(templateKey);
  },
  async archiveFinanceDeliveryTemplateVersion(templateKey = '', payload = {}) {
    const registry = deliveryTemplateRegistry.find((item) => String(item?.key || '') === String(templateKey || '').trim()) || null;
    const versionNumber = Number(payload?.versionNumber || 0) || 0;
    const target = registry?.versions?.find((item) => Number(item?.versionNumber || 0) === versionNumber) || null;
    if (!target) {
      const error = new Error('Template version not found.');
      error.statusCode = 404;
      throw error;
    }
    target.status = 'archived';
    target.archivedAt = new Date().toISOString();
    if (Number(registry.currentDraftVersion || 0) === versionNumber) registry.currentDraftVersion = null;
    registry.history.unshift({
      action: 'archived',
      versionNumber,
      fromVersionNumber: versionNumber,
      toVersionNumber: versionNumber,
      note: String(payload?.note || '').trim(),
      at: new Date().toISOString(),
      by: { _id: IDS.adminManager, name: 'Finance Manager' }
    });
    return buildMockDeliveryTemplateItem(templateKey);
  },
  async rollbackFinanceDeliveryTemplateVersion(templateKey = '', payload = {}) {
    const registry = deliveryTemplateRegistry.find((item) => String(item?.key || '') === String(templateKey || '').trim()) || null;
    if (!registry) return buildMockDeliveryTemplateItem(templateKey);
    const versionNumber = Number(payload?.versionNumber || 0) || 0;
    registry.versions.forEach((item) => {
      if (String(item?.status || '') === 'published') {
        item.status = 'archived';
        item.archivedAt = new Date().toISOString();
      }
      if (Number(item?.versionNumber || 0) === versionNumber) {
        item.status = 'published';
        item.publishedAt = new Date().toISOString();
      }
    });
    registry.currentPublishedVersion = versionNumber || 1;
    registry.history.unshift({
      action: 'rolled_back',
      versionNumber,
      fromVersionNumber: 1,
      toVersionNumber: versionNumber || 1,
      note: String(payload?.note || '').trim(),
      at: new Date().toISOString(),
      by: { _id: IDS.adminManager, name: 'Finance Manager' }
    });
    return buildMockDeliveryTemplateItem(templateKey);
  },
  async previewFinanceDeliveryTemplate(payload = {}) {
    const templateVariables = new Set(deliveryTemplateVariables.map((item) => item.key));
    const template = payload?.messageTemplateKey
      ? buildMockDeliveryTemplateItem(String(payload?.messageTemplateKey || '').trim())
      : null;
    if (payload?.messageTemplateKey && !template) {
      const error = new Error('template انتخاب‌شده در سیستم مالی شناخته نشد.');
      error.statusCode = 400;
      error.meta = { invalidTemplateKey: payload?.messageTemplateKey };
      throw error;
    }
    const subjectTemplate = String(payload?.messageTemplateSubject || template?.defaultSubject || '').trim();
    const bodyTemplate = String(payload?.messageTemplateBody || template?.defaultBody || '').trim();
    const extractVariables = (text = '') => Array.from(new Set(
      Array.from(String(text || '').matchAll(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g))
        .map((match) => String(match?.[1] || '').trim())
        .filter(Boolean)
    ));
    const usedVariables = Array.from(new Set([...extractVariables(subjectTemplate), ...extractVariables(bodyTemplate)]));
    const unknownVariables = usedVariables.filter((item) => !templateVariables.has(item));
    const context = {
      documentNo: 'MCP-202603-001',
      subjectName: 'Student Alpha',
      verificationUrl: 'https://example.test/verify/FV-MCP-1',
      monthKey: String(payload?.monthKey || '2026-03'),
      classTitle: payload?.classId === IDS.class1 ? 'Class One Core' : '',
      academicYearTitle: payload?.academicYearId === 'academic-year-1' ? '1405' : '',
      note: String(payload?.note || '').trim()
    };
    const render = (text = '') => String(text || '').replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key) => String(context[key] || ''));
    return {
      templateKey: String(payload?.messageTemplateKey || ''),
      templateLabel: template?.label || '',
      templateVersionNumber: Number(template?.publishedVersionNumber || 0) || null,
      templateStatus: template?.publishedVersion?.status || '',
      valid: unknownVariables.length === 0,
      usedVariables,
      unknownVariables,
      emptyVariables: usedVariables.filter((item) => !String(context[item] || '').trim()),
      warnings: [],
      sampleSource: 'synthetic',
      sample: {
        documentNo: context.documentNo,
        documentType: String(payload?.documentType || 'batch_statement_pack'),
        subjectName: context.subjectName,
        classTitle: context.classTitle,
        academicYearTitle: context.academicYearTitle,
        monthKey: context.monthKey
      },
      context,
      subjectTemplate,
      bodyTemplate,
      renderedSubject: render(subjectTemplate),
      renderedBody: render(bodyTemplate),
      renderedHtml: `<p>${render(bodyTemplate)}</p>`,
      rolloutPreview: {
        matchedArchiveCount: archivedDocuments.filter((item) => (
          (!payload?.documentType || String(item?.documentType || '') === String(payload.documentType || ''))
          && (!payload?.classId || String(item?.scope?.classId || '') === String(payload.classId || ''))
          && (!payload?.academicYearId || String(item?.scope?.academicYearId || '') === String(payload.academicYearId || ''))
          && (!payload?.monthKey || String(item?.scope?.monthKey || '') === String(payload.monthKey || ''))
        )).length,
        recommendedChannels: Array.isArray(template?.recommendedChannels) ? template.recommendedChannels : [],
        scope: {
          documentType: String(payload?.documentType || 'batch_statement_pack'),
          classId: String(payload?.classId || ''),
          academicYearId: String(payload?.academicYearId || ''),
          monthKey: String(payload?.monthKey || '')
        }
      }
    };
  },
  async deliverFinanceDocumentArchive({
    archiveId = '',
    channel = 'email',
    emails = '',
    recipientHandles = '',
    includeLinkedAudience = true,
    subject = '',
    note = ''
  } = {}) {
    const archive = archivedDocuments.find((entry) => String(entry._id || '') === String(archiveId || '')) || null;
    if (!archive) {
      return {
        ok: false,
        statusCode: 404,
        message: 'سند مالی موردنظر در آرشیف پیدا نشد.',
        item: null,
        failedRecipients: []
      };
    }
    const normalizedChannel = String(channel || 'email').trim() || 'email';
    const normalizedRecipients = Array.isArray(recipientHandles)
      ? recipientHandles
      : String(recipientHandles || emails || '').split(/[\n,;]+/).map((item) => item.trim()).filter(Boolean);
    const nextStatus = Number(archive.deliveryCount || 0) > 0 ? 'resent' : 'sent';
    const provider = normalizedChannel === 'sms'
      ? 'mock_sms_gateway'
      : normalizedChannel === 'whatsapp'
        ? 'mock_whatsapp_gateway'
        : normalizedChannel === 'portal'
          ? 'portal_notification'
          : 'smtp';
    const providerMessageId = normalizedChannel === 'portal'
      ? ''
      : `${provider}-${archive._id || 'archive'}-${Date.now()}`;
    const providerStatus = normalizedChannel === 'portal'
      ? 'delivered'
      : normalizedChannel === 'email'
        ? 'sent'
        : 'accepted';
    archive.deliveryLog = Array.isArray(archive.deliveryLog) ? archive.deliveryLog : [];
    archive.deliveryLog.push({
      channel: normalizedChannel,
      status: nextStatus,
      recipient: normalizedRecipients.join(', '),
      recipientCount: normalizedRecipients.length + (includeLinkedAudience ? 1 : 0),
      linkedAudienceNotified: includeLinkedAudience === true,
      subject: String(subject || ''),
      provider,
      providerMessageId,
      providerStatus,
      note: String(note || ''),
      errorMessage: '',
      failureCode: '',
      retryable: false,
      nextRetryAt: null,
      sentAt: new Date().toISOString(),
      sentBy: { _id: IDS.adminManager, name: 'Finance Manager' }
    });
    archive.deliveryCount = Number(archive.deliveryCount || 0) + 1;
    archive.lastDeliveredAt = new Date().toISOString();
    archive.lastDeliveryStatus = nextStatus;
    return {
      ok: true,
      statusCode: 200,
      message: 'سند مالی برای ارسال ثبت شد.',
      item: clone(archive),
      failedRecipients: [],
      deliveredManualCount: 1,
      linkedAudienceNotified: includeLinkedAudience === true,
      channel: normalizedChannel,
      status: nextStatus,
      provider,
      providerMessageId,
      providerStatus,
      failureCode: '',
      retryable: false,
      nextRetryAt: null
    };
  },
  async listFinanceDeliveryCampaigns(filters = {}) {
    const limit = Math.max(1, Number(filters.limit || 12) || 12);
    return clone(deliveryCampaigns.slice(0, limit));
  },
  async createFinanceDeliveryCampaign(payload = {}) {
    deliveryCampaignSerial += 1;
    const normalizedChannel = String(payload?.channel || 'email').trim() || 'email';
    const template = payload?.messageTemplateKey
      ? buildMockDeliveryTemplateItem(String(payload?.messageTemplateKey || '').trim())
      : null;
    const recipientHandles = Array.isArray(payload?.recipientHandles)
      ? payload.recipientHandles
      : String(payload?.recipientHandles || payload?.recipientEmails || payload?.emails || '')
        .split(/[\n,;]+/)
        .map((entry) => entry.trim())
        .filter(Boolean);
    const seededTargets = normalizedChannel === 'sms'
      ? [{
          archiveId: archivedDocuments[0]?._id || '',
          documentNo: archivedDocuments[0]?.documentNo || 'DOC-1',
          channel: normalizedChannel,
          status: 'failed',
          recipient: recipientHandles[0] || '+93700111222',
          recipientCount: 1,
          attempts: 1,
          lastAttemptAt: '2026-03-28T09:30:00.000Z',
          lastError: 'sms_gateway_timeout',
          provider: 'mock_sms_gateway',
          providerMessageId: '',
          providerStatus: 'timeout',
          lastFailureCode: 'provider_timeout',
          retryable: true,
          nextRetryAt: '2026-03-28T09:45:00.000Z'
        }]
      : [];
    const item = {
      _id: `delivery-campaign-${deliveryCampaignSerial}`,
      name: payload?.name || `Campaign ${deliveryCampaignSerial}`,
      status: payload?.status === 'paused' ? 'paused' : 'active',
      documentType: payload?.documentType || 'batch_statement_pack',
      channel: normalizedChannel,
      classId: payload?.classId || '',
      academicYearId: payload?.academicYearId || '',
      classTitle: payload?.classId === IDS.class1 ? 'Class One Core' : '',
      academicYearTitle: payload?.academicYearId === 'academic-year-1' ? '1405' : '',
      monthKey: payload?.monthKey || '',
      messageTemplateKey: payload?.messageTemplateKey || '',
      messageTemplateSubject: payload?.messageTemplateSubject || template?.defaultSubject || '',
      messageTemplateBody: payload?.messageTemplateBody || template?.defaultBody || '',
      recipientHandles,
      recipientEmails: recipientHandles,
      includeLinkedAudience: payload?.includeLinkedAudience !== false,
      retryFailed: payload?.retryFailed !== false,
      automationEnabled: payload?.automationEnabled === true,
      intervalHours: Number(payload?.intervalHours || 24),
      maxDocumentsPerRun: Number(payload?.maxDocumentsPerRun || 10),
      note: payload?.note || '',
      nextRunAt: payload?.automationEnabled === true ? '2026-03-29T08:00:00.000Z' : null,
      lastRunAt: null,
      lastRunStatus: 'idle',
      lastRunSummary: {},
      runCount: 0,
      successCount: 0,
      failureCount: seededTargets.filter((entry) => entry.status === 'failed').length,
      targetSummary: {
        total: seededTargets.length,
        successful: seededTargets.filter((entry) => entry.status === 'sent' || entry.status === 'delivered' || entry.status === 'resent').length,
        failed: seededTargets.filter((entry) => entry.status === 'failed').length,
        skipped: seededTargets.filter((entry) => entry.status === 'skipped').length
      },
      targets: seededTargets,
      runLog: [],
      createdBy: { _id: IDS.adminManager, name: 'Finance Manager' },
      updatedBy: { _id: IDS.adminManager, name: 'Finance Manager' }
    };
    deliveryCampaigns.unshift(item);
    return clone(item);
  },
  async setFinanceDeliveryCampaignStatus(campaignId = '', status = 'active') {
    const item = deliveryCampaigns.find((entry) => String(entry._id || '') === String(campaignId || '')) || null;
    if (!item) return null;
    item.status = status === 'paused' ? 'paused' : 'active';
    item.nextRunAt = item.status === 'active' && item.automationEnabled ? '2026-03-29T08:00:00.000Z' : null;
    return clone(item);
  },
  async runFinanceDeliveryCampaign({ campaignId = '', mode = 'manual' } = {}) {
    const item = deliveryCampaigns.find((entry) => String(entry._id || '') === String(campaignId || '')) || null;
    if (!item) return null;
    const archive = archivedDocuments.find((entry) => String(entry.documentType || '') === String(item.documentType || '')) || archivedDocuments[0] || null;
    const matchedDocuments = archive ? 1 : 0;
    const deliveredDocuments = archive ? 1 : 0;
    item.lastRunAt = new Date().toISOString();
    item.lastRunStatus = archive ? 'success' : 'skipped';
    item.lastRunSummary = {
      matchedDocuments,
      deliveredDocuments,
      failedDocuments: 0,
      skippedDocuments: archive ? 0 : 1,
      runAt: item.lastRunAt,
      mode
    };
    item.runCount = Number(item.runCount || 0) + 1;
    item.successCount = Number(item.successCount || 0) + deliveredDocuments;
    item.targetSummary = {
      total: matchedDocuments,
      successful: deliveredDocuments,
      failed: 0,
      skipped: archive ? 0 : 1
    };
    item.runLog = Array.isArray(item.runLog) ? item.runLog : [];
    item.runLog.unshift({
      runAt: item.lastRunAt,
      mode,
      status: item.lastRunStatus,
      matchedDocuments,
      deliveredDocuments,
      failedDocuments: 0,
      skippedDocuments: archive ? 0 : 1,
      actorName: 'Finance Manager'
    });
    return {
      ok: true,
      skipped: false,
      summary: clone(item.lastRunSummary),
      item: clone(item)
    };
  },
  async runDueFinanceDeliveryCampaigns() {
    return {
      ok: true,
      skipped: false,
      runsAt: new Date().toISOString(),
      executed: deliveryCampaigns.filter((item) => item.automationEnabled === true && item.status === 'active').length,
      deliveredDocuments: 1,
      failedDocuments: 0
    };
  },
  async buildFinanceDeliveryAnalytics(filters = {}) {
    const normalizedChannel = String(filters?.channel || '').trim();
    const normalizedStatus = String(filters?.status || '').trim();
    const normalizedProvider = String(filters?.provider || '').trim();
    const normalizedFailureCode = String(filters?.failureCode || '').trim();
    const retryableFilter = String(filters?.retryable || '').trim().toLowerCase();
    const retryableValue = retryableFilter === 'true' || retryableFilter === 'retryable'
      ? true
      : retryableFilter === 'false' || retryableFilter === 'non_retryable' || retryableFilter === 'not_retryable'
        ? false
        : null;
    const deliveryEvents = archivedDocuments.flatMap((archive) => (
      Array.isArray(archive.deliveryLog) ? archive.deliveryLog.map((entry) => ({ archive, entry })) : []
    )).filter(({ entry }) => (
      (!normalizedChannel || String(entry?.channel || '').trim() === normalizedChannel)
      && (!normalizedStatus || String(entry?.status || '').trim() === normalizedStatus)
      && (!normalizedProvider || String(entry?.provider || '').trim() === normalizedProvider)
      && (!normalizedFailureCode || String(entry?.failureCode || '').trim() === normalizedFailureCode)
      && (retryableValue == null || Boolean(entry?.retryable === true) === retryableValue)
    ));
    const retryQueue = deliveryCampaigns.flatMap((campaign) => (
      Array.isArray(campaign.targets) ? campaign.targets.map((target) => ({ campaign, target })) : []
    )).filter(({ target, campaign }) => (
      String(target?.status || '') === 'failed'
      && (!normalizedChannel || String(target?.channel || campaign?.channel || '').trim() === normalizedChannel)
      && (!normalizedStatus || String(target?.status || '').trim() === normalizedStatus)
      && (!normalizedProvider || String(target?.provider || '').trim() === normalizedProvider)
      && (!normalizedFailureCode || String(target?.lastFailureCode || '').trim() === normalizedFailureCode)
      && (retryableValue == null || Boolean(target?.retryable === true) === retryableValue)
    ));
    const recoveryQueue = buildMockDeliveryRecoveryQueue(filters);
    const readyToRetryCount = retryQueue.filter((item) => (
      item?.target?.retryable === true && (!item?.target?.nextRetryAt || new Date(item.target.nextRetryAt).getTime() <= Date.now())
    )).length;
    const waitingRetryCount = retryQueue.filter((item) => (
      item?.target?.retryable === true && item?.target?.nextRetryAt && new Date(item.target.nextRetryAt).getTime() > Date.now()
    )).length;
    const blockedRetryCount = retryQueue.filter((item) => item?.target?.retryable !== true).length;
    const byProvider = retryQueue.length
      ? retryQueue.reduce((acc, { target }) => {
        const provider = String(target?.provider || '').trim();
        if (provider) acc[provider] = Number(acc[provider] || 0) + 1;
        return acc;
      }, {})
      : deliveryEvents.reduce((acc, { entry }) => {
        const provider = String(entry?.provider || '').trim();
        if (provider) acc[provider] = Number(acc[provider] || 0) + 1;
        return acc;
      }, {});
    const byFailureCode = retryQueue.length
      ? retryQueue.reduce((acc, { target }) => {
        const failureCode = String(target?.lastFailureCode || '').trim();
        if (failureCode) acc[failureCode] = Number(acc[failureCode] || 0) + 1;
        return acc;
      }, {})
      : deliveryEvents.reduce((acc, { entry }) => {
        const failureCode = String(entry?.failureCode || '').trim();
        if (failureCode) acc[failureCode] = Number(acc[failureCode] || 0) + 1;
        return acc;
      }, {});
    return {
      summary: {
        campaignsTotal: deliveryCampaigns.length,
        campaignsActive: deliveryCampaigns.filter((item) => item.status === 'active').length,
        campaignsPaused: deliveryCampaigns.filter((item) => item.status === 'paused').length,
        automatedCampaigns: deliveryCampaigns.filter((item) => item.automationEnabled).length,
        dueCampaigns: deliveryCampaigns.filter((item) => item.automationEnabled && item.status === 'active').length,
        deliveriesTotal: deliveryEvents.length,
        failedQueueCount: retryQueue.length,
        recoveryQueueCount: recoveryQueue.length,
        awaitingWebhookCount: recoveryQueue.filter((item) => String(item?.recoveryState || '') === 'awaiting_callback').length,
        recoveryRetryableCount: recoveryQueue.filter((item) => item?.retryable === true).length,
        readyToRetryCount,
        waitingRetryCount,
        blockedRetryCount,
        byChannel: {
          email: deliveryEvents.filter(({ entry }) => entry?.channel === 'email').length,
          portal: deliveryEvents.filter(({ entry }) => entry?.channel === 'portal').length,
          sms: deliveryEvents.filter(({ entry }) => entry?.channel === 'sms').length,
          whatsapp: deliveryEvents.filter(({ entry }) => entry?.channel === 'whatsapp').length
        },
        byStatus: {
          sent: deliveryEvents.filter(({ entry }) => entry?.status === 'sent').length,
          resent: deliveryEvents.filter(({ entry }) => entry?.status === 'resent').length,
          delivered: deliveryEvents.filter(({ entry }) => entry?.status === 'delivered').length,
          failed: deliveryEvents.filter(({ entry }) => entry?.status === 'failed').length
        },
        byProvider,
        byFailureCode,
        byRecoveryState: recoveryQueue.reduce((acc, item) => {
          const key = String(item?.recoveryState || '').trim();
          if (key) acc[key] = Number(acc[key] || 0) + 1;
          return acc;
        }, {})
      },
      recentFailures: retryQueue.slice(0, 8).map(({ campaign, target }) => ({
        campaignId: campaign._id,
        campaignName: campaign.name,
        archiveId: target.archiveId,
        documentNo: target.documentNo,
        channel: target.channel || campaign.channel,
        recipient: target.recipient,
        recipientCount: target.recipientCount || 0,
        attempts: target.attempts || 0,
        lastAttemptAt: target.lastAttemptAt || null,
        lastError: target.lastError || '',
        lastFailureCode: target.lastFailureCode || '',
        retryable: target.retryable === true,
        nextRetryAt: target.nextRetryAt || null,
        provider: target.provider || '',
        providerMessageId: target.providerMessageId || '',
        providerStatus: target.providerStatus || ''
      }))
    };
  },
  async listFinanceDeliveryRetryQueue(filters = {}) {
    const normalizedChannel = String(filters?.channel || '').trim();
    const normalizedStatus = String(filters?.status || '').trim();
    const normalizedProvider = String(filters?.provider || '').trim();
    const normalizedFailureCode = String(filters?.failureCode || '').trim();
    const retryableFilter = String(filters?.retryable || '').trim().toLowerCase();
    const retryableValue = retryableFilter === 'true' || retryableFilter === 'retryable'
      ? true
      : retryableFilter === 'false' || retryableFilter === 'non_retryable' || retryableFilter === 'not_retryable'
        ? false
        : null;
    const limit = Math.max(1, Number(filters?.limit || 12) || 12);
    return clone(deliveryCampaigns.flatMap((campaign) => (
      Array.isArray(campaign.targets) ? campaign.targets.map((target) => ({ campaign, target })) : []
    )).filter(({ target, campaign }) => (
      String(target?.status || '') === 'failed'
      && (!normalizedChannel || String(target?.channel || campaign?.channel || '').trim() === normalizedChannel)
      && (!normalizedStatus || String(target?.status || '').trim() === normalizedStatus)
      && (!normalizedProvider || String(target?.provider || '').trim() === normalizedProvider)
      && (!normalizedFailureCode || String(target?.lastFailureCode || '').trim() === normalizedFailureCode)
      && (retryableValue == null || Boolean(target?.retryable === true) === retryableValue)
    )).slice(0, limit).map(({ campaign, target }) => ({
      campaignId: campaign._id,
      campaignName: campaign.name,
      archiveId: target.archiveId,
      documentNo: target.documentNo,
      channel: target.channel || campaign.channel,
      status: target.status,
      recipient: target.recipient,
      recipientCount: target.recipientCount || 0,
      attempts: target.attempts || 0,
      lastAttemptAt: target.lastAttemptAt || null,
      lastError: target.lastError || '',
      lastFailureCode: target.lastFailureCode || '',
      retryable: target.retryable === true,
      nextRetryAt: target.nextRetryAt || null,
      provider: target.provider || '',
      providerMessageId: target.providerMessageId || '',
      providerStatus: target.providerStatus || ''
    })));
  },
  async listFinanceDeliveryRecoveryQueue(filters = {}) {
    const limit = Math.max(1, Number(filters?.limit || 12) || 12);
    return buildMockDeliveryRecoveryQueue(filters).slice(0, limit);
  },
  async retryFinanceDeliveryTarget({ campaignId = '', archiveId = '' } = {}) {
    const campaign = deliveryCampaigns.find((entry) => String(entry._id || '') === String(campaignId || '')) || null;
    if (!campaign) return null;
    const target = Array.isArray(campaign.targets)
      ? campaign.targets.find((entry) => String(entry.archiveId || '') === String(archiveId || ''))
      : null;
    if (!target) {
      return {
        ok: false,
        statusCode: 404,
        message: 'Delivery target not found.'
      };
    }
    target.status = 'resent';
    target.attempts = Number(target.attempts || 0) + 1;
    target.lastAttemptAt = '2026-03-28T10:00:00.000Z';
    target.lastDeliveredAt = '2026-03-28T10:00:00.000Z';
    target.lastError = '';
    target.lastFailureCode = '';
    target.retryable = false;
    target.nextRetryAt = null;
    target.provider = target.provider || 'mock_sms_gateway';
    target.providerMessageId = `mock_sms_gateway-${archiveId || 'archive'}-retry-001`;
    target.providerStatus = 'accepted';
    campaign.failureCount = Array.isArray(campaign.targets) ? campaign.targets.filter((entry) => entry.status === 'failed').length : 0;
    campaign.successCount = Number(campaign.successCount || 0) + 1;
    campaign.targetSummary = {
      total: Array.isArray(campaign.targets) ? campaign.targets.length : 0,
      successful: Array.isArray(campaign.targets) ? campaign.targets.filter((entry) => ['sent', 'resent', 'delivered'].includes(entry.status)).length : 0,
      failed: Array.isArray(campaign.targets) ? campaign.targets.filter((entry) => entry.status === 'failed').length : 0,
      skipped: Array.isArray(campaign.targets) ? campaign.targets.filter((entry) => entry.status === 'skipped').length : 0
    };
    return {
      ok: true,
      statusCode: 200,
      summary: clone(campaign.targetSummary),
      item: clone(campaign),
      message: 'retry موفق بود.'
    };
  },
  async replayFinanceDeliveryProviderStatus({
    provider = '',
    providerMessageId = '',
    providerStatus = '',
    failureCode = '',
    errorMessage = '',
    recipient = ''
  } = {}) {
    const normalizedProviderStatus = String(providerStatus || '').trim();
    if (!normalizedProviderStatus) {
      const error = new Error('provider status is required.');
      error.statusCode = 400;
      throw error;
    }
    const result = await financeDeliveryServiceMock.syncFinanceDeliveryProviderStatus({
      provider,
      providerMessageId,
      providerStatus: normalizedProviderStatus,
      failureCode,
      errorMessage,
      recipient
    });
    if (!Number(result?.matchedArchive || 0) && !Number(result?.matchedCampaigns || 0)) {
      const error = new Error('هیچ delivery با این provider message id برای replay پیدا نشد.');
      error.statusCode = 404;
      throw error;
    }
    return {
      ...result,
      replayed: true,
      replayedAt: new Date().toISOString()
    };
  },
  async syncFinanceDeliveryProviderStatus({
    provider = '',
    providerMessageId = '',
    providerStatus = '',
    failureCode = '',
    errorMessage = '',
    recipient = ''
  } = {}) {
    const normalizedMessageId = String(providerMessageId || '').trim();
    if (!normalizedMessageId) {
      const error = new Error('provider message id is required.');
      error.statusCode = 400;
      throw error;
    }
    const normalizedProvider = String(provider || '').trim();
    const normalizedProviderStatus = String(providerStatus || '').trim();
    const outcome = buildMockProviderDeliveryOutcome({
      providerStatus: normalizedProviderStatus,
      failureCode,
      errorMessage
    });
    const archive = archivedDocuments.find((entry) => (
      Array.isArray(entry.deliveryLog) && entry.deliveryLog.some((log) => String(log?.providerMessageId || '') === normalizedMessageId)
    )) || null;
    let archiveItem = null;
    if (archive) {
      const targetLog = [...archive.deliveryLog].reverse().find((log) => (
        String(log?.providerMessageId || '') === normalizedMessageId
      )) || null;
      if (targetLog) {
        if (normalizedProvider) targetLog.provider = normalizedProvider;
        if (normalizedProviderStatus) targetLog.providerStatus = normalizedProviderStatus;
        if (recipient) targetLog.recipient = String(recipient || '').trim();
        if (outcome.terminal && outcome.status === 'delivered') {
          targetLog.status = 'delivered';
          targetLog.errorMessage = '';
          targetLog.failureCode = '';
          targetLog.retryable = false;
          targetLog.nextRetryAt = null;
          archive.lastDeliveryStatus = 'delivered';
          archive.lastDeliveredAt = new Date().toISOString();
        } else if (outcome.terminal && outcome.status === 'failed') {
          targetLog.status = 'failed';
          targetLog.errorMessage = outcome.errorMessage;
          targetLog.failureCode = outcome.failureCode;
          targetLog.retryable = outcome.retryable === true;
          targetLog.nextRetryAt = outcome.retryable ? '2026-03-29T09:00:00.000Z' : null;
          archive.lastDeliveryStatus = 'failed';
        }
      }
      archiveItem = clone(archive);
    }
    const updatedCampaigns = deliveryCampaigns.filter((campaign) => (
      Array.isArray(campaign.targets) && campaign.targets.some((target) => String(target?.providerMessageId || '') === normalizedMessageId)
    )).map((campaign) => {
      campaign.targets.forEach((target) => {
        if (String(target?.providerMessageId || '') !== normalizedMessageId) return;
        if (normalizedProvider) target.provider = normalizedProvider;
        if (normalizedProviderStatus) target.providerStatus = normalizedProviderStatus;
        if (recipient) target.recipient = String(recipient || '').trim();
        if (outcome.terminal && outcome.status === 'delivered') {
          target.status = 'delivered';
          target.lastDeliveredAt = '2026-03-29T08:00:00.000Z';
          target.lastError = '';
          target.lastFailureCode = '';
          target.retryable = false;
          target.nextRetryAt = null;
        } else if (outcome.terminal && outcome.status === 'failed') {
          target.status = 'failed';
          target.lastError = outcome.errorMessage;
          target.lastFailureCode = outcome.failureCode;
          target.retryable = outcome.retryable === true;
          target.nextRetryAt = outcome.retryable ? '2026-03-29T09:00:00.000Z' : null;
        }
      });
      reconcileMockCampaignTargetSummary(campaign);
      return clone(campaign);
    });
    return {
      provider: normalizedProvider,
      providerMessageId: normalizedMessageId,
      providerStatus: normalizedProviderStatus,
      matchedArchive: archiveItem ? 1 : 0,
      matchedCampaigns: updatedCampaigns.length,
      terminal: outcome.terminal,
      status: outcome.status,
      archive: archiveItem,
      campaigns: updatedCampaigns
    };
  },
  async ingestFinanceDeliveryProviderWebhook({ providerKey = '', payload = {} } = {}) {
    const normalizedProviderKey = String(providerKey || '').trim().toLowerCase();
    let events = [];
    if (normalizedProviderKey === 'twilio') {
      events = [{
        provider: String(payload?.provider || '').trim(),
        providerMessageId: String(payload?.MessageSid || payload?.SmsSid || payload?.Sid || '').trim(),
        providerStatus: String(payload?.MessageStatus || payload?.SmsStatus || payload?.Status || '').trim(),
        failureCode: String(payload?.ErrorCode || payload?.errorCode || '').trim(),
        errorMessage: String(payload?.ErrorMessage || payload?.errorMessage || '').trim(),
        recipient: String(payload?.To || '').replace(/^whatsapp:/i, '').trim()
      }];
    } else if (normalizedProviderKey === 'meta') {
      events = (Array.isArray(payload?.entry) ? payload.entry : []).flatMap((entry) => (
        Array.isArray(entry?.changes) ? entry.changes : []
      )).flatMap((change) => (
        Array.isArray(change?.value?.statuses) ? change.value.statuses : []
      )).map((statusEntry) => ({
        provider: String(statusEntry?.provider || 'meta_whatsapp_gateway').trim(),
        providerMessageId: String(statusEntry?.id || '').trim(),
        providerStatus: String(statusEntry?.status || '').trim(),
        failureCode: String(statusEntry?.errors?.[0]?.code || '').trim(),
        errorMessage: String(statusEntry?.errors?.[0]?.title || statusEntry?.errors?.[0]?.message || '').trim(),
        recipient: String(statusEntry?.recipient_id || '').trim()
      }));
    } else {
      events = [{
        provider: String(payload?.provider || '').trim(),
        providerMessageId: String(payload?.providerMessageId || payload?.messageId || '').trim(),
        providerStatus: String(payload?.providerStatus || payload?.status || '').trim(),
        failureCode: String(payload?.failureCode || payload?.errorCode || '').trim(),
        errorMessage: String(payload?.errorMessage || payload?.message || '').trim(),
        recipient: String(payload?.recipient || '').trim()
      }];
    }
    const results = [];
    for (const event of events.filter((item) => String(item?.providerMessageId || '').trim())) {
      results.push(await financeDeliveryServiceMock.syncFinanceDeliveryProviderStatus(event));
    }
    return {
      providerKey: normalizedProviderKey || 'generic',
      receivedCount: events.length,
      processedCount: results.length,
      results
    };
  }
};

const createMonthCloseDoc = (record) => {
  if (!record) return null;
  const doc = clone(record);
  doc.save = async function save() {
    persistMonthClose(this);
    return this;
  };
  doc.toObject = function toObject() {
    return stripMethods(this);
  };
  return doc;
};

const createFeePlanDoc = (record) => {
  if (!record) return null;
  const doc = clone(record);
  doc.save = async function save() {
    persistFeePlan(this);
    return this;
  };
  doc.toObject = function toObject() {
    return stripMethods(this);
  };
  return doc;
};

const persistFinancialYear = (doc) => {
  const plain = stripMethods(doc);
  plain.updatedAt = new Date();
  const index = financialYears.findIndex((item) => String(item._id) === String(plain._id));
  if (index >= 0) financialYears[index] = clone(plain);
  else financialYears.push(clone(plain));
  return plain;
};

const persistExpenseCategory = (doc) => {
  const plain = stripMethods(doc);
  plain.updatedAt = new Date();
  const index = expenseCategories.findIndex((item) => String(item._id) === String(plain._id));
  if (index >= 0) expenseCategories[index] = clone(plain);
  else expenseCategories.push(clone(plain));
  return plain;
};

const persistExpenseEntry = (doc) => {
  const plain = stripMethods(doc);
  plain.updatedAt = new Date();
  const index = expenseEntries.findIndex((item) => String(item._id) === String(plain._id));
  if (index >= 0) expenseEntries[index] = clone(plain);
  else expenseEntries.push(clone(plain));
  return plain;
};

const persistProcurementCommitment = (doc) => {
  const plain = stripMethods(doc);
  plain.updatedAt = new Date();
  const index = procurementCommitments.findIndex((item) => String(item._id) === String(plain._id));
  if (index >= 0) procurementCommitments[index] = clone(plain);
  else procurementCommitments.unshift(clone(plain));
  return plain;
};

const persistGovernmentSnapshot = (doc) => {
  const plain = stripMethods(doc);
  const index = governmentSnapshots.findIndex((item) => String(item._id) === String(plain._id));
  if (index >= 0) governmentSnapshots[index] = clone(plain);
  else governmentSnapshots.unshift(clone(plain));
  return plain;
};

const createFinancialYearDoc = (record) => {
  if (!record) return null;
  const doc = clone(record);
  doc.save = async function save() {
    persistFinancialYear(this);
    return this;
  };
  doc.toObject = function toObject() {
    return stripMethods(this);
  };
  return doc;
};

const createFinanceAnomalyCaseDoc = (record) => {
  if (!record) return null;
  const doc = clone(record);
  doc.save = async function save() {
    persistFinanceAnomalyCase(this);
    return this;
  };
  doc.toObject = function toObject() {
    return stripMethods(this);
  };
  return doc;
};

const createExpenseCategoryDoc = (record) => {
  if (!record) return null;
  const doc = clone(record);
  doc.save = async function save() {
    persistExpenseCategory(this);
    return this;
  };
  doc.toObject = function toObject() {
    return stripMethods(this);
  };
  return doc;
};

const createExpenseEntryDoc = (record) => {
  if (!record) return null;
  const doc = clone(record);
  doc.save = async function save() {
    persistExpenseEntry(this);
    return this;
  };
  doc.toObject = function toObject() {
    return stripMethods(this);
  };
  return doc;
};

const createProcurementCommitmentDoc = (record) => {
  if (!record) return null;
  const doc = clone(record);
  doc.save = async function save() {
    persistProcurementCommitment(this);
    return this;
  };
  doc.toObject = function toObject() {
    return stripMethods(this);
  };
  return doc;
};

const createGovernmentSnapshotDoc = (record) => {
  if (!record) return null;
  const doc = clone(record);
  doc.save = async function save() {
    persistGovernmentSnapshot(this);
    return this;
  };
  doc.toObject = function toObject() {
    return stripMethods(this);
  };
  return doc;
};

class MockQuery {
  constructor(executor) {
    this.executor = executor;
    this.populateFields = [];
    this.sortSpec = null;
    this.limitValue = null;
  }

  select() {
    return this;
  }

  lean() {
    return this;
  }

  populate(field) {
    this.populateFields.push(field);
    return this;
  }

  sort(spec = null) {
    this.sortSpec = spec;
    return this;
  }

  limit(value) {
    this.limitValue = value;
    return this;
  }

  exec() {
    return Promise.resolve().then(() => {
      let value = this.executor();

      if (Array.isArray(value) && this.sortSpec && typeof this.sortSpec === 'object') {
        const [sortKey, sortDir] = Object.entries(this.sortSpec)[0] || [];
        value = [...value].sort((left, right) => {
          const a = left?.[sortKey];
          const b = right?.[sortKey];
          if (a === b) return 0;
          if (a === undefined) return 1;
          if (b === undefined) return -1;
          return sortDir < 0 ? (a < b ? 1 : -1) : (a < b ? -1 : 1);
        });
      }

      if (Array.isArray(value) && Number.isFinite(this.limitValue)) {
        value = value.slice(0, this.limitValue);
      }

      return applyPopulate(value, this.populateFields);
    });
  }

  then(resolve, reject) {
    return this.exec().then(resolve, reject);
  }

  catch(reject) {
    return this.exec().catch(reject);
  }

  finally(handler) {
    return this.exec().finally(handler);
  }
}

const applyPopulate = (value, fields = []) => {
  const populateOne = (item) => {
    if (!item) return item;
    const next = item;
    fields.forEach((field) => {
      if (field === 'student' && next.student) next.student = findUser(next.student);
      if (field === 'course' && next.course) next.course = findCourse(next.course);
      if (field === 'classId' && next.classId) next.classId = findSchoolClass(next.classId);
      if (field === 'financialYearId' && next.financialYearId) next.financialYearId = findFinancialYear(next.financialYearId);
      if (field === 'academicYearId' && next.academicYearId) next.academicYearId = findAcademicYear(next.academicYearId);
      if (field === 'treasuryAccountId' && next.treasuryAccountId) next.treasuryAccountId = findTreasuryAccount(next.treasuryAccountId);
      if (field === 'procurementCommitmentId' && next.procurementCommitmentId) next.procurementCommitmentId = createProcurementCommitmentDoc(findProcurementCommitment(next.procurementCommitmentId));
      if (field === 'bill' && next.bill) next.bill = createBillDoc(findBill(next.bill));
      if (field === 'reviewedBy' && next.reviewedBy) next.reviewedBy = findUser(next.reviewedBy);
      if (field === 'closedBy' && next.closedBy) next.closedBy = findUser(next.closedBy);
      if (field === 'requestedBy' && next.requestedBy) next.requestedBy = findUser(next.requestedBy);
      if (field === 'approvedBy' && next.approvedBy) next.approvedBy = findUser(next.approvedBy);
      if (field === 'rejectedBy' && next.rejectedBy) next.rejectedBy = findUser(next.rejectedBy);
      if (field === 'budgetSubmittedBy' && next.budgetSubmittedBy) next.budgetSubmittedBy = findUser(next.budgetSubmittedBy);
      if (field === 'budgetApprovedBy' && next.budgetApprovedBy) next.budgetApprovedBy = findUser(next.budgetApprovedBy);
      if (field === 'budgetRejectedBy' && next.budgetRejectedBy) next.budgetRejectedBy = findUser(next.budgetRejectedBy);
      if (field === 'createdBy' && next.createdBy) next.createdBy = findUser(next.createdBy);
      if (field === 'updatedBy' && next.updatedBy) next.updatedBy = findUser(next.updatedBy);
      if (field === 'submittedBy' && next.submittedBy) next.submittedBy = findUser(next.submittedBy);
      if (field === 'generatedBy' && next.generatedBy) next.generatedBy = findUser(next.generatedBy);
      if (field === 'assignedTo' && next.assignedTo) next.assignedTo = findUser(next.assignedTo);
      if (field === 'resolvedBy' && next.resolvedBy) next.resolvedBy = findUser(next.resolvedBy);
      if (field === 'latestActionBy' && next.latestActionBy) next.latestActionBy = findUser(next.latestActionBy);
      if (field === 'approvalTrail.by' && Array.isArray(next.approvalTrail)) {
        next.approvalTrail = next.approvalTrail.map((entry) => ({
          ...entry,
          by: findUser(entry.by)
        }));
      }
      if (field === 'budgetApprovalTrail.by' && Array.isArray(next.budgetApprovalTrail)) {
        next.budgetApprovalTrail = next.budgetApprovalTrail.map((entry) => ({
          ...entry,
          by: findUser(entry.by)
        }));
      }
      if (field === 'budgetRevisionHistory.by' && Array.isArray(next.budgetRevisionHistory)) {
        next.budgetRevisionHistory = next.budgetRevisionHistory.map((entry) => ({
          ...entry,
          by: findUser(entry.by)
        }));
      }
      if (field === 'history.by' && Array.isArray(next.history)) {
        next.history = next.history.map((entry) => ({
          ...entry,
          by: findUser(entry.by)
        }));
      }
      if (field === 'followUp.updatedBy' && next.followUp?.updatedBy) {
        next.followUp = {
          ...next.followUp,
          updatedBy: findUser(next.followUp.updatedBy)
        };
      }
      if (field === 'followUp.history.updatedBy' && Array.isArray(next.followUp?.history)) {
        next.followUp = {
          ...next.followUp,
          history: next.followUp.history.map((entry) => ({
            ...entry,
            updatedBy: findUser(entry.updatedBy)
          }))
        };
      }
      if (field === 'user' && next.user) next.user = findUser(next.user);
    });
    return next;
  };

  if (Array.isArray(value)) return value.map(populateOne);
  return populateOne(value);
};

const AcademicYearMock = {
  find(filter = {}) {
    return new MockQuery(() => (
      academicYears.filter((item) => matchesFilter(item, filter)).map((item) => clone(item))
    ));
  },
  findById(id) {
    return new MockQuery(() => clone(findAcademicYear(id)));
  },
  findOne(filter = {}) {
    return new MockQuery(() => clone(academicYears.find((item) => matchesFilter(item, filter)) || null));
  }
};

function FinanceBillMock(payload = {}) {
  Object.assign(this, clone(payload));
  if (!this._id) this._id = `bill-${++billSerial}`;
  if (!this.createdAt) this.createdAt = new Date();
  if (!this.updatedAt) this.updatedAt = new Date();
  if (!Array.isArray(this.adjustments)) this.adjustments = [];
  if (!Array.isArray(this.installments)) this.installments = [];
}

FinanceBillMock.prototype.save = async function save() {
  persistBill(this);
  return this;
};

FinanceBillMock.find = (filter = {}) => new MockQuery(() => (
  bills.filter((item) => matchesFilter(item, filter)).map((item) => createBillDoc(item))
));

FinanceBillMock.findOne = (filter = {}) => new MockQuery(() => (
  createBillDoc(bills.find((item) => matchesFilter(item, filter)) || null)
));

FinanceBillMock.findById = (id) => new MockQuery(() => (
  createBillDoc(bills.find((item) => String(item._id) === String(id)) || null)
));

FinanceBillMock.countDocuments = async (filter = {}) => bills.filter((item) => matchesFilter(item, filter)).length;
FinanceBillMock.aggregate = async () => [];

const sumMatchingReceipts = (match = {}) => receipts
  .filter((item) => matchesFilter(item, match))
  .reduce((sum, item) => sum + (Number(item.amount) || 0), 0);

const FinanceReceiptMock = {
  find(filter = {}) {
    return new MockQuery(() => (
      receipts.filter((item) => matchesFilter(item, filter)).map((item) => createReceiptDoc(item))
    ));
  },
  findOne(filter = {}) {
    return new MockQuery(() => (
      createReceiptDoc(receipts.find((item) => matchesFilter(item, filter)) || null)
    ));
  },
  findById(id) {
    return new MockQuery(() => (
      createReceiptDoc(receipts.find((item) => String(item._id) === String(id)) || null)
    ));
  },
  async create(payload = {}) {
    const item = {
      _id: `receipt-${++receiptSerial}`,
      status: 'pending',
      reviewedBy: null,
      reviewedAt: null,
      reviewNote: '',
      rejectReason: '',
      approvalTrail: [],
      followUp: {
        assignedLevel: 'finance_manager',
        status: 'new',
        note: '',
        updatedBy: null,
        updatedAt: null,
        history: []
      },
      createdAt: new Date(),
      updatedAt: new Date(),
      ...clone(payload)
    };
    receipts.push(item);
    return createReceiptDoc(item);
  },
  async aggregate(pipeline = []) {
    const matchStage = pipeline.find((stage) => stage.$match)?.$match || {};
    const groupStage = pipeline.find((stage) => stage.$group)?.$group || {};
    const matchedItems = receipts.filter((item) => matchesFilter(item, matchStage));

    if (groupStage._id?.y && groupStage._id?.m && groupStage._id?.d) {
      const grouped = new Map();
      matchedItems.forEach((item) => {
        const paidAt = new Date(item.paidAt);
        if (Number.isNaN(paidAt.getTime())) return;
        const y = paidAt.getUTCFullYear();
        const m = paidAt.getUTCMonth() + 1;
        const d = paidAt.getUTCDate();
        const key = `${y}-${m}-${d}`;
        const bucket = grouped.get(key) || {
          _id: { y, m, d },
          total: 0,
          count: 0
        };
        bucket.total += Number(item.amount) || 0;
        bucket.count += 1;
        grouped.set(key, bucket);
      });
      return [...grouped.values()].sort((left, right) => {
        const a = `${left._id.y}-${String(left._id.m).padStart(2, '0')}-${String(left._id.d).padStart(2, '0')}`;
        const b = `${right._id.y}-${String(right._id.m).padStart(2, '0')}-${String(right._id.d).padStart(2, '0')}`;
        return a.localeCompare(b);
      });
    }

    if (groupStage.total && groupStage.total.$sum === '$amount') {
      return [{ _id: null, total: sumMatchingReceipts(matchStage) }];
    }

    return [];
  }
};

const FinanceMonthCloseMock = {
  find(filter = {}) {
    return new MockQuery(() => (
      monthClosures.filter((item) => matchesFilter(item, filter)).map((item) => createMonthCloseDoc(item))
    ));
  },
  findById(id) {
    return new MockQuery(() => (
      createMonthCloseDoc(monthClosures.find((item) => String(item._id) === String(id)) || null)
    ));
  },
  findOne(filter = {}) {
    return new MockQuery(() => (
      createMonthCloseDoc(monthClosures.find((item) => matchesFilter(item, filter)) || null)
    ));
  },
  async exists(filter = {}) {
    return monthClosures.some((item) => matchesFilter(item, filter));
  },
  async create(payload = {}) {
    const item = {
      _id: `month-close-${++monthCloseSerial}`,
      createdAt: new Date(),
      ...clone(payload)
    };
    monthClosures.push(item);
    return createMonthCloseDoc(item);
  }
};

function FinanceAnomalyCaseMock(payload = {}) {
  Object.assign(this, clone(payload));
  if (!this._id) this._id = `anomaly-case-${++financeAnomalyCaseSerial}`;
  if (!this.createdAt) this.createdAt = new Date();
  if (!this.updatedAt) this.updatedAt = new Date();
  if (!Array.isArray(this.history)) this.history = [];
}

FinanceAnomalyCaseMock.prototype.save = async function save() {
  persistFinanceAnomalyCase(this);
  return this;
};

FinanceAnomalyCaseMock.find = (filter = {}) => new MockQuery(() => (
  financeAnomalyCases.filter((item) => matchesFilter(item, filter)).map((item) => createFinanceAnomalyCaseDoc(item))
));

FinanceAnomalyCaseMock.findOne = (filter = {}) => new MockQuery(() => (
  createFinanceAnomalyCaseDoc(financeAnomalyCases.find((item) => matchesFilter(item, filter)) || null)
));

FinanceAnomalyCaseMock.findById = (id) => new MockQuery(() => (
  createFinanceAnomalyCaseDoc(financeAnomalyCases.find((item) => String(item._id) === String(id)) || null)
));

const FinanceFeePlanMock = {
  find(filter = {}) {
    return new MockQuery(() => (
      feePlans.filter((item) => matchesFilter(item, filter)).map((item) => createFeePlanDoc(item))
    ));
  },
  findById(id) {
    return new MockQuery(() => (
      createFeePlanDoc(feePlans.find((item) => String(item._id) === String(id)) || null)
    ));
  },
  findOne(filter = {}) {
    return new MockQuery(() => (
      createFeePlanDoc(feePlans.find((item) => matchesFilter(item, filter)) || null)
    ));
  },
  findOneAndUpdate(filter = {}, update = {}, options = {}) {
    return new MockQuery(() => {
      const changes = clone(update?.$set || {});
      const existing = feePlans.find((item) => matchesFilter(item, filter));
      if (existing) {
        Object.assign(existing, changes, { updatedAt: new Date() });
        return createFeePlanDoc(existing);
      }
      if (!options.upsert) return null;
      const created = {
        _id: `fee-plan-${++feePlanSerial}`,
        createdAt: new Date(),
        updatedAt: new Date(),
        ...changes
      };
      feePlans.push(created);
      return createFeePlanDoc(created);
    });
  }
};

const DiscountMock = {
  find(filter = {}) {
    return new MockQuery(() => (
      discountRegistry.filter((item) => matchesFilter(item, filter)).map((item) => clone(item))
    ));
  }
};

const FeeExemptionMock = {
  find(filter = {}) {
    return new MockQuery(() => (
      feeExemptions.filter((item) => matchesFilter(item, filter)).map((item) => clone(item))
    ));
  }
};

const FinanceReliefMock = {
  find(filter = {}) {
    return new MockQuery(() => (
      financeReliefs.filter((item) => matchesFilter(item, filter)).map((item) => clone(item))
    ));
  },
  async aggregate(pipeline = []) {
    const matchStage = pipeline.find((stage) => stage.$match)?.$match || {};
    const groupStage = pipeline.find((stage) => stage.$group)?.$group || {};
    const matchedItems = financeReliefs.filter((item) => matchesFilter(item, matchStage));

    if (groupStage.count?.$sum === 1 && groupStage.total?.$sum === '$amount') {
      const grouped = new Map();
      matchedItems.forEach((item) => {
        const key = String(item?.coverageMode || '');
        const bucket = grouped.get(key) || { _id: key, count: 0, total: 0 };
        bucket.count += 1;
        bucket.total += Number(item?.amount || 0);
        grouped.set(key, bucket);
      });
      return [...grouped.values()];
    }

    return [];
  }
};

const StudentCoreMock = {
  find() {
    return new MockQuery(() => []);
  },
  findOne() {
    return new MockQuery(() => null);
  }
};

const StudentProfileMock = {
  find() {
    return new MockQuery(() => []);
  },
  findOne() {
    return new MockQuery(() => null);
  }
};

const toCanonicalOrder = (bill) => ({
  _id: `fee-order-${bill._id}`,
  orderNumber: bill.billNumber,
  student: bill.student,
  studentId: null,
  studentMembershipId: null,
  classId: bill.classId,
  academicYearId: 'academic-year-1',
  amountDue: bill.amountDue,
  amountPaid: bill.amountPaid,
  outstandingAmount: Math.max(0, Number(bill.amountDue || 0) - Number(bill.amountPaid || 0)),
  status: bill.status,
  issuedAt: bill.issuedAt,
  dueDate: bill.dueDate
});

const toCanonicalPayment = (receipt) => {
  const bill = findBill(receipt.bill);
  return {
    _id: `fee-payment-${receipt._id}`,
    paymentNumber: receipt._id,
    feeOrderId: bill ? `fee-order-${bill._id}` : null,
    student: receipt.student,
    studentId: null,
    studentMembershipId: null,
    classId: receipt.classId,
    academicYearId: 'academic-year-1',
    amount: receipt.amount,
    paidAt: receipt.paidAt,
    paymentMethod: receipt.paymentMethod,
    status: receipt.status,
    approvalStage: receipt.approvalStage
  };
};

const FeeOrderMock = {
  find(filter = {}) {
    return new MockQuery(() => bills.map(toCanonicalOrder).filter((item) => matchesFilter(item, filter)).map((item) => clone(item)));
  },
  async countDocuments(filter = {}) {
    return bills.map(toCanonicalOrder).filter((item) => matchesFilter(item, filter)).length;
  },
  async aggregate(pipeline = []) {
    const matchStage = pipeline.find((stage) => stage.$match)?.$match || {};
    const projectStage = pipeline.find((stage) => stage.$project)?.$project || {};
    const groupStage = pipeline.find((stage) => stage.$group)?.$group || {};
    let matchedItems = bills.map(toCanonicalOrder).filter((item) => matchesFilter(item, matchStage));

    if (projectStage.remaining === '$outstandingAmount') {
      matchedItems = matchedItems.map((item) => ({
        student: item.student,
        remaining: item.outstandingAmount
      }));
    }

    if (groupStage.totalDue?.$sum === '$amountDue') {
      return [{
        _id: null,
        totalDue: matchedItems.reduce((sum, item) => sum + Number(item.amountDue || 0), 0),
        totalPaid: matchedItems.reduce((sum, item) => sum + Number(item.amountPaid || 0), 0),
        totalOutstanding: matchedItems.reduce((sum, item) => sum + Number(item.outstandingAmount || 0), 0)
      }];
    }

    if (groupStage.amount?.$sum === '$remaining') {
      const grouped = new Map();
      matchedItems
        .filter((item) => Number(item.remaining || 0) > 0)
        .forEach((item) => {
          const key = String(item.student || '');
          const bucket = grouped.get(key) || { _id: key, amount: 0 };
          bucket.amount += Number(item.remaining || 0);
          grouped.set(key, bucket);
        });
      return [...grouped.values()]
        .sort((left, right) => right.amount - left.amount)
        .slice(0, 10);
    }

    return [];
  }
};

const FeePaymentMock = {
  find(filter = {}) {
    return new MockQuery(() => (
      receipts.map(toCanonicalPayment).filter((item) => matchesFilter(item, filter)).map((item) => clone(item))
    ));
  },
  async countDocuments(filter = {}) {
    return receipts.map(toCanonicalPayment).filter((item) => matchesFilter(item, filter)).length;
  },
  async aggregate(pipeline = []) {
    const matchStage = pipeline.find((stage) => stage.$match)?.$match || {};
    const groupStage = pipeline.find((stage) => stage.$group)?.$group || {};
    const matchedItems = receipts.map(toCanonicalPayment).filter((item) => matchesFilter(item, matchStage));

    if (groupStage._id?.y && groupStage._id?.m && groupStage._id?.d) {
      const grouped = new Map();
      matchedItems.forEach((item) => {
        const paidAt = new Date(item.paidAt);
        if (Number.isNaN(paidAt.getTime())) return;
        const y = paidAt.getUTCFullYear();
        const m = paidAt.getUTCMonth() + 1;
        const d = paidAt.getUTCDate();
        const key = `${y}-${m}-${d}`;
        const bucket = grouped.get(key) || { _id: { y, m, d }, total: 0, count: 0 };
        bucket.total += Number(item.amount || 0);
        bucket.count += 1;
        grouped.set(key, bucket);
      });
      return [...grouped.values()].sort((left, right) => {
        const a = `${left._id.y}-${String(left._id.m).padStart(2, '0')}-${String(left._id.d).padStart(2, '0')}`;
        const b = `${right._id.y}-${String(right._id.m).padStart(2, '0')}-${String(right._id.d).padStart(2, '0')}`;
        return a.localeCompare(b);
      });
    }

    if (groupStage._id && groupStage.count?.$sum === 1 && !groupStage.total) {
      const grouped = new Map();
      matchedItems.forEach((item) => {
        const key = String(item.approvalStage || 'finance_manager_review');
        const bucket = grouped.get(key) || { _id: key, count: 0 };
        bucket.count += 1;
        grouped.set(key, bucket);
      });
      return [...grouped.values()];
    }

    if (groupStage.total?.$sum === '$amount') {
      return [{
        _id: null,
        total: matchedItems.reduce((sum, item) => sum + Number(item.amount || 0), 0),
        count: matchedItems.length
      }];
    }

    return [];
  }
};

const reportEngineServiceMock = {
  async runReport(reportKey, filters = {}) {
    if (reportKey === 'fee_collection_by_class') {
      const scopedBills = bills.filter((item) => !filters.classId || String(item.classId) === String(filters.classId));
      const totalDue = scopedBills.reduce((sum, item) => sum + Number(item.amountDue || 0), 0);
      const totalPaid = scopedBills.reduce((sum, item) => sum + Number(item.amountPaid || 0), 0);
      return {
        rows: [{
          classId: IDS.class1,
          classTitle: 'Class One Core',
          orderCount: scopedBills.length,
          paymentCount: receipts.length,
          approvedPaymentCount: receipts.filter((item) => item.status === 'approved').length,
          pendingPaymentCount: receipts.filter((item) => item.status === 'pending').length,
          totalDue,
          approvedAmount: receipts.filter((item) => item.status === 'approved').reduce((sum, item) => sum + Number(item.amount || 0), 0),
          pendingAmount: receipts.filter((item) => item.status === 'pending').reduce((sum, item) => sum + Number(item.amount || 0), 0),
          totalOutstanding: Math.max(0, totalDue - totalPaid),
          reliefCount: financeReliefs.length,
          fixedReliefAmount: financeReliefs.reduce((sum, item) => sum + Number(item.amount || 0), 0),
          fullReliefCount: financeReliefs.filter((item) => item.coverageMode === 'full').length
        }],
        summary: { totalClasses: 1 }
      };
    }

    if (reportKey === 'fee_discount_exemption_overview') {
      return {
        rows: financeReliefs.map((item) => ({
          benefitType: item.reliefType || 'relief',
          amount: Number(item.amount || 0)
        })),
        summary: { activeReliefs: financeReliefs.length, activeScholarships: 0 }
      };
    }

    return { rows: [], summary: {} };
  }
};

const FinancialYearMock = {
  find(filter = {}) {
    return new MockQuery(() => (
      financialYears.filter((item) => matchesFilter(item, filter)).map((item) => createFinancialYearDoc(item))
    ));
  },
  findById(id) {
    return new MockQuery(() => (
      createFinancialYearDoc(financialYears.find((item) => String(item._id) === String(id)) || null)
    ));
  },
  findOne(filter = {}) {
    return new MockQuery(() => (
      createFinancialYearDoc(financialYears.find((item) => matchesFilter(item, filter)) || null)
    ));
  },
  async create(payload = {}) {
    const duplicateAcademicYear = financialYears.find((item) => (
      String(item.schoolId || '') === String(payload.schoolId || '')
      && String(item.academicYearId || '') === String(payload.academicYearId || '')
    ));
    if (duplicateAcademicYear) {
      const error = new Error('E11000 duplicate key error');
      error.code = 11000;
      error.keyPattern = { academicYearId: 1 };
      error.keyValue = { academicYearId: payload.academicYearId };
      throw error;
    }

    const duplicateTitle = financialYears.find((item) => (
      String(item.schoolId || '') === String(payload.schoolId || '')
      && String(item.title || '') === String(payload.title || '')
    ));
    if (duplicateTitle) {
      const error = new Error('E11000 duplicate key error');
      error.code = 11000;
      error.keyPattern = { title: 1 };
      error.keyValue = { title: payload.title };
      throw error;
    }

    if (String(payload.code || '').trim()) {
      const duplicateCode = financialYears.find((item) => (
        String(item.schoolId || '') === String(payload.schoolId || '')
        && String(item.code || '') === String(payload.code || '')
      ));
      if (duplicateCode) {
        const error = new Error('E11000 duplicate key error');
        error.code = 11000;
        error.keyPattern = { code: 1 };
        error.keyValue = { code: payload.code };
        throw error;
      }
    }

    const item = {
      _id: `fy-${++financialYearSerial}`,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...clone(payload)
    };
    financialYears.push(item);
    return createFinancialYearDoc(item);
  },
  async updateMany(filter = {}, update = {}) {
    const changes = clone(update?.$set || {});
    let modifiedCount = 0;
    financialYears.forEach((item) => {
      if (!matchesFilter(item, filter)) return;
      Object.assign(item, changes, { updatedAt: new Date() });
      modifiedCount += 1;
    });
    return { acknowledged: true, modifiedCount };
  }
};

const ExpenseCategoryDefinitionMock = {
  find(filter = {}) {
    return new MockQuery(() => (
      expenseCategories.filter((item) => matchesFilter(item, filter)).map((item) => createExpenseCategoryDoc(item))
    ));
  },
  findById(id) {
    return new MockQuery(() => (
      createExpenseCategoryDoc(expenseCategories.find((item) => String(item._id) === String(id)) || null)
    ));
  },
  findOne(filter = {}) {
    return new MockQuery(() => (
      createExpenseCategoryDoc(expenseCategories.find((item) => matchesFilter(item, filter)) || null)
    ));
  },
  async create(payload = {}) {
    const item = {
      _id: `expense-category-${++expenseCategorySerial}`,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...clone(payload)
    };
    expenseCategories.push(item);
    return createExpenseCategoryDoc(item);
  }
};

const ExpenseEntryMock = {
  find(filter = {}) {
    return new MockQuery(() => (
      expenseEntries.filter((item) => matchesFilter(item, filter)).map((item) => createExpenseEntryDoc(item))
    ));
  },
  findById(id) {
    return new MockQuery(() => (
      createExpenseEntryDoc(expenseEntries.find((item) => String(item._id) === String(id)) || null)
    ));
  },
  async create(payload = {}) {
    const item = {
      _id: `expense-${++expenseEntrySerial}`,
      createdAt: new Date(),
      updatedAt: new Date(),
      approvalTrail: [],
      ...clone(payload)
    };
    expenseEntries.unshift(item);
    return createExpenseEntryDoc(item);
  }
};

function FinanceProcurementCommitmentMock(payload = {}) {
  Object.assign(this, clone(payload));
  if (!this._id) this._id = `procurement-${++procurementCommitmentSerial}`;
  if (!this.createdAt) this.createdAt = new Date();
  if (!this.updatedAt) this.updatedAt = new Date();
  if (!Array.isArray(this.approvalTrail)) this.approvalTrail = [];
}

FinanceProcurementCommitmentMock.prototype.save = async function save() {
  persistProcurementCommitment(this);
  return this;
};

FinanceProcurementCommitmentMock.find = (filter = {}) => new MockQuery(() => (
  procurementCommitments.filter((item) => matchesFilter(item, filter)).map((item) => createProcurementCommitmentDoc(item))
));

FinanceProcurementCommitmentMock.findById = (id) => new MockQuery(() => (
  createProcurementCommitmentDoc(procurementCommitments.find((item) => String(item._id) === String(id)) || null)
));

FinanceProcurementCommitmentMock.findOne = (filter = {}) => new MockQuery(() => (
  createProcurementCommitmentDoc(procurementCommitments.find((item) => matchesFilter(item, filter)) || null)
));

const GovernmentFinanceSnapshotMock = {
  find(filter = {}) {
    return new MockQuery(() => (
      governmentSnapshots.filter((item) => matchesFilter(item, filter)).map((item) => createGovernmentSnapshotDoc(item))
    ));
  },
  findById(id) {
    return new MockQuery(() => (
      createGovernmentSnapshotDoc(governmentSnapshots.find((item) => String(item._id) === String(id)) || null)
    ));
  },
  findOne(filter = {}) {
    return new MockQuery(() => (
      createGovernmentSnapshotDoc(governmentSnapshots.find((item) => matchesFilter(item, filter)) || null)
    ));
  },
  async create(payload = {}) {
    const plainPayload = JSON.parse(JSON.stringify(payload || {}));
    const item = {
      _id: `government-snapshot-${++governmentSnapshotSerial}`,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...plainPayload
    };
    governmentSnapshots.unshift(item);
    return createGovernmentSnapshotDoc(item);
  }
};

const SchoolClassMock = {
  find(filter = {}) {
    return new MockQuery(() => (
      schoolClasses.filter((item) => {
        if (filter._id?.$in) {
          return filter._id.$in.some((value) => String(value) === String(item._id));
        }
        return matchesFilter(item, filter);
      }).map((item) => clone(item))
    ));
  }
};

const UserMock = {
  find(filter = {}) {
    return new MockQuery(() => (
      users.filter((item) => matchesFilter(item, filter)).map((item) => clone(item))
    ));
  },
  findById(id) {
    return new MockQuery(() => clone(findUser(id)));
  }
};

const CourseMock = {
  find(filter = {}) {
    return new MockQuery(() => (
      courses.filter((item) => {
        if (filter._id?.$in) {
          return filter._id.$in.some((value) => String(value) === String(item._id));
        }
        return matchesFilter(item, filter);
      }).map((item) => clone(item))
    ));
  }
};

const OrderMock = {
  async distinct() {
    throw new Error('financeRoutes should not read billable students from Order anymore');
  }
};

const StudentMembershipMock = {
  find(filter = {}) {
    return new MockQuery(() => (
      memberships.filter((item) => matchesFilter(item, filter)).map((item) => ({
        ...clone(item),
        academicYearId: item.academicYearId || 'academic-year-1',
        joinedAt: item.joinedAt || new Date('2026-01-03T00:00:00.000Z'),
        enrolledAt: item.enrolledAt || new Date('2026-01-03T00:00:00.000Z')
      }))
    ));
  },
  async countDocuments(filter = {}) {
    return memberships.filter((item) => matchesFilter({
      ...item,
      academicYearId: item.academicYearId || 'academic-year-1',
      joinedAt: item.joinedAt || new Date('2026-01-03T00:00:00.000Z'),
      enrolledAt: item.enrolledAt || new Date('2026-01-03T00:00:00.000Z')
    }, filter)).length;
  },
  async distinct(field, filter = {}) {
    if (field !== 'student') return [];
    return memberships
      .filter((item) => matchesFilter(item, filter))
      .map((item) => item.student)
      .filter((value, index, list) => list.findIndex((entry) => String(entry) === String(value)) === index);
  }
};

const studentMembershipLookupMock = {
  async listCourseMemberships({ courseId = '' } = {}) {
    return clone(memberships
      .filter((item) => String(item.course) === String(courseId) && item.status === 'active' && item.isCurrent)
      .map((item) => ({
        ...item,
        studentId: `student-core-${item.student}`,
        classId: item.classId || IDS.class1,
        academicYearId: 'year-1405'
      })));
  },
  async findClassMemberships({ classId = '', academicYearId = '' } = {}) {
    return clone(memberships
      .filter((item) => (
        String(item.classId || '') === String(classId || '')
        && item.status === 'active'
        && item.isCurrent
      ))
      .map((item) => ({
        ...item,
        studentId: `student-core-${item.student}`,
        classId: item.classId || IDS.class1,
        academicYearId: academicYearId || 'academic-year-1'
      })));
  },
  async resolveMembershipTransactionLink({ studentUserId = '', courseId = '', academicYear = '' } = {}) {
    const membership = memberships.find((item) => (
      String(item.student) === String(studentUserId)
      && String(item.course) === String(courseId)
      && item.status === 'active'
      && item.isCurrent
    )) || null;

    return {
      membership: membership ? clone(membership) : null,
      courseContext: { kind: 'academic_class' },
      linkFields: {
        studentId: studentUserId ? `student-core-${studentUserId}` : null,
        studentMembershipId: membership?._id || null,
        classId: membership?.classId || (courseId ? IDS.class1 : null),
        academicYearId: academicYear ? `year-${academicYear}` : 'year-1405'
      }
    };
  }
};

const classScopeMock = {
  normalizeText(value = '') {
    return String(value || '').trim();
  },
  serializeSchoolClassLite(value = null) {
    if (!value) return null;
    return {
      _id: value._id || value.id || value,
      id: value._id || value.id || value,
      title: value.title || '',
      code: value.code || '',
      gradeLevel: value.gradeLevel || '',
      section: value.section || ''
    };
  },
  async resolveClassCourseReference({ classId = '', courseId = '' } = {}) {
    const normalizedClassId = String(classId || '').trim();
    const normalizedCourseId = String(courseId || '').trim();

    if (normalizedClassId && normalizedClassId !== IDS.class1) {
      return { error: 'Class is invalid.' };
    }
    if (normalizedCourseId && normalizedCourseId !== IDS.course1) {
      return { error: 'Course is invalid.' };
    }

    if (!normalizedClassId && !normalizedCourseId) {
      return {
        classId: '',
        courseId: '',
        schoolClass: null,
        course: null
      };
    }

    return {
      classId: IDS.class1,
      courseId: IDS.course1,
      schoolClass: {
        _id: IDS.class1,
        title: 'Class One Core',
        code: '10-A',
        gradeLevel: 10,
        section: 'الف',
        legacyCourseId: IDS.course1
      },
      course: {
        _id: IDS.course1,
        title: 'Class One'
      }
    };
  }
};

const normalizeExpenseCategoryKey = (value = '', fallback = 'other') => {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return normalized || fallback;
};

const ensureDefaultExpenseCategories = async () => expenseCategories.map((item) => createExpenseCategoryDoc(item));

const resolveExpenseCategorySelection = async ({ category = '', subCategory = '' } = {}) => {
  const normalizedCategory = normalizeExpenseCategoryKey(category);
  const definition = expenseCategories.find((item) => item.key === normalizedCategory && item.isActive !== false);
  if (!definition) {
    const error = new Error('finance_expense_category_invalid');
    error.statusCode = 400;
    throw error;
  }

  const normalizedSubCategory = normalizeExpenseCategoryKey(subCategory, '');
  const activeSubCategories = Array.isArray(definition.subCategories)
    ? definition.subCategories.filter((item) => item.isActive !== false)
    : [];

  if (!normalizedSubCategory) {
    return {
      category: definition.key,
      subCategory: activeSubCategories[0]?.key || ''
    };
  }

  const subDefinition = activeSubCategories.find((item) => item.key === normalizedSubCategory);
  if (!subDefinition) {
    const error = new Error('finance_expense_subcategory_invalid');
    error.statusCode = 400;
    throw error;
  }

  return {
    category: definition.key,
    subCategory: subDefinition.key
  };
};

const buildCloseReadinessFromExpenses = (financialYearId = '') => {
  const filtered = expenseEntries.filter((item) => String(item.financialYearId || '') === String(financialYearId || ''));
  const counts = {
    draft: filtered.filter((item) => item.status === 'draft').length,
    pendingReview: filtered.filter((item) => item.status === 'pending_review').length,
    approved: filtered.filter((item) => item.status === 'approved').length,
    rejected: filtered.filter((item) => item.status === 'rejected').length,
    void: filtered.filter((item) => item.status === 'void').length
  };
  const blockers = [];
  if (counts.draft) blockers.push(`${counts.draft} مصرف پیش‌نویس هنوز برای بررسی ارسال نشده است.`);
  if (counts.pendingReview) blockers.push(`${counts.pendingReview} مصرف هنوز در صف بررسی قرار دارد.`);
  if (counts.rejected) blockers.push(`${counts.rejected} مصرف ردشده هنوز نیاز به اصلاح یا باطل‌سازی دارد.`);
  const financialYear = findFinancialYear(financialYearId);

  return {
    financialYearId: String(financialYearId || ''),
    financialYearTitle: financialYear?.title || '',
    isClosed: Boolean(financialYear?.isClosed),
    canClose: blockers.length === 0,
    blockerCount: blockers.length,
    blockers,
    counts
  };
};

const buildExpenseGovernanceAnalytics = async ({ financialYearId = '', academicYearId = '', classId = '' } = {}) => {
  const filtered = expenseEntries.filter((item) => {
    if (financialYearId && String(item.financialYearId || '') !== String(financialYearId)) return false;
    if (academicYearId && String(item.academicYearId || '') !== String(academicYearId)) return false;
    if (classId && String(item.classId || '') !== String(classId)) return false;
    return true;
  });

  const totalAmount = filtered.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
  const approvedAmount = filtered
    .filter((item) => item.status === 'approved')
    .reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
  const pendingAmount = filtered
    .filter((item) => item.status === 'pending_review')
    .reduce((sum, item) => sum + (Number(item.amount) || 0), 0);

  const vendorMap = new Map();
  const monthlyMap = new Map();
  const categoryMap = new Map();
  filtered.forEach((item) => {
    const vendor = String(item.vendorName || 'Unassigned vendor').trim() || 'Unassigned vendor';
    const vendorBucket = vendorMap.get(vendor) || { label: vendor, amount: 0, count: 0 };
    vendorBucket.amount += Number(item.amount || 0);
    vendorBucket.count += 1;
    vendorMap.set(vendor, vendorBucket);

    const monthKey = new Date(item.expenseDate).toISOString().slice(0, 7);
    const monthBucket = monthlyMap.get(monthKey) || {
      monthKey,
      label: monthKey,
      amount: 0,
      approvedAmount: 0,
      pendingAmount: 0,
      count: 0
    };
    monthBucket.amount += Number(item.amount || 0);
    monthBucket.count += 1;
    if (item.status === 'approved') monthBucket.approvedAmount += Number(item.amount || 0);
    if (item.status === 'pending_review') monthBucket.pendingAmount += Number(item.amount || 0);
    monthlyMap.set(monthKey, monthBucket);

    const categoryDefinition = expenseCategories.find((entry) => entry.key === item.category);
    const categoryBucket = categoryMap.get(item.category) || {
      key: item.category,
      label: categoryDefinition?.label || item.category,
      colorTone: categoryDefinition?.colorTone || 'slate',
      amount: 0,
      count: 0,
      sharePercent: 0
    };
    categoryBucket.amount += Number(item.amount || 0);
    categoryBucket.count += 1;
    categoryMap.set(item.category, categoryBucket);
  });

  const closeReadiness = buildCloseReadinessFromExpenses(financialYearId);
  const categories = [...categoryMap.values()].sort((left, right) => right.amount - left.amount);
  categories.forEach((item) => {
    item.sharePercent = totalAmount > 0 ? Number(((item.amount / totalAmount) * 100).toFixed(2)) : 0;
  });

  return {
    summary: {
      totalAmount,
      approvedAmount,
      pendingAmount,
      queueCount: closeReadiness.counts.draft + closeReadiness.counts.pendingReview + closeReadiness.counts.rejected,
      vendorCount: vendorMap.size,
      categoryCount: categories.length,
      statusCounts: closeReadiness.counts
    },
    categories,
    vendors: [...vendorMap.values()].sort((left, right) => right.amount - left.amount),
    monthly: [...monthlyMap.values()].sort((left, right) => left.monthKey.localeCompare(right.monthKey)),
    queue: filtered.filter((item) => ['draft', 'pending_review', 'rejected'].includes(item.status)).map((item) => createExpenseEntryDoc(item)),
    closeReadiness,
    registry: expenseCategories.map((item) => createExpenseCategoryDoc(item))
  };
};

const buildFinancialYearCloseReadiness = async ({ financialYearId = '' } = {}) => buildCloseReadinessFromExpenses(financialYearId);

const financialYearServiceMock = {
  assertDateWithinFinancialYear(financialYear, dateValue) {
    const date = new Date(dateValue);
    if (!financialYear || Number.isNaN(date.getTime())) {
      const error = new Error('Invalid financial year date context.');
      error.statusCode = 400;
      throw error;
    }
    if (date < new Date(financialYear.startDate) || date > new Date(financialYear.endDate)) {
      const error = new Error('Expense date is outside the financial year range.');
      error.statusCode = 400;
      throw error;
    }
  },
  assertFinancialYearDates({ startDate, endDate } = {}) {
    const nextStartDate = new Date(startDate);
    const nextEndDate = new Date(endDate);
    if (Number.isNaN(nextStartDate.getTime()) || Number.isNaN(nextEndDate.getTime()) || nextStartDate >= nextEndDate) {
      const error = new Error('Invalid financial year date range.');
      error.statusCode = 400;
      throw error;
    }
    return { startDate: nextStartDate, endDate: nextEndDate };
  },
  assertFinancialYearWritable(item) {
    if (!item) {
      const error = new Error('Financial year not found.');
      error.statusCode = 404;
      throw error;
    }
    if (item.isClosed || item.status === 'closed') {
      const error = new Error('Closed financial year cannot be modified.');
      error.statusCode = 409;
      throw error;
    }
  },
  async ensureFinancialYearNoOverlap({ schoolId = '', startDate, endDate, excludeId = '' } = {}) {
    const overlap = financialYears.find((item) => (
      String(item.schoolId || '') === String(schoolId || '')
      && String(item._id || '') !== String(excludeId || '')
      && new Date(item.startDate) < new Date(endDate)
      && new Date(item.endDate) > new Date(startDate)
    ));
    if (overlap) {
      const error = new Error('Financial year range overlaps with an existing year.');
      error.statusCode = 409;
      throw error;
    }
  },
  async ensureSingleActiveFinancialYear({ schoolId = '' } = {}) {
    const existing = financialYears.find((item) => String(item.schoolId || '') === String(schoolId || '') && item.isActive);
    if (existing) {
      const error = new Error('Another active financial year already exists.');
      error.statusCode = 409;
      throw error;
    }
  },
  async ensureFinancialYearUniqueness({ schoolId = '', academicYearId = '', title = '', code = '', excludeId = '' } = {}) {
    const duplicateAcademicYear = financialYears.find((item) => (
      String(item.schoolId || '') === String(schoolId || '')
      && String(item.academicYearId || '') === String(academicYearId || '')
      && String(item._id || '') !== String(excludeId || '')
    ));
    if (duplicateAcademicYear) {
      const error = new Error('finance_financial_year_duplicate_academic_year');
      error.statusCode = 409;
      throw error;
    }

    const duplicateTitle = financialYears.find((item) => (
      String(item.schoolId || '') === String(schoolId || '')
      && String(item.title || '') === String(title || '')
      && String(item._id || '') !== String(excludeId || '')
    ));
    if (duplicateTitle) {
      const error = new Error('finance_financial_year_duplicate_title');
      error.statusCode = 409;
      throw error;
    }

    if (String(code || '').trim()) {
      const duplicateCode = financialYears.find((item) => (
        String(item.schoolId || '') === String(schoolId || '')
        && String(item.code || '') === String(code || '')
        && String(item._id || '') !== String(excludeId || '')
      ));
      if (duplicateCode) {
        const error = new Error('finance_financial_year_duplicate_code');
        error.statusCode = 409;
        throw error;
      }
    }
  },
  async resolveAcademicYearFinancialContext(academicYearId = '') {
    const academicYear = findAcademicYear(academicYearId) || academicYears[0];
    return clone(academicYear);
  }
};

const financialPeriodServiceMock = {
  resolveQuarterForDate(financialYear, dateValue) {
    const startDate = new Date(financialYear.startDate);
    const currentDate = new Date(dateValue);
    const monthOffset = ((currentDate.getFullYear() - startDate.getFullYear()) * 12)
      + (currentDate.getMonth() - startDate.getMonth());
    return Math.max(1, Math.min(4, Math.floor(monthOffset / 3) + 1));
  }
};

const expenseGovernanceServiceMock = {
  buildExpenseGovernanceAnalytics,
  buildFinancialYearCloseReadiness,
  ensureDefaultExpenseCategories,
  normalizeExpenseCategoryKey,
  resolveExpenseCategorySelection
};

const governmentFinanceReportServiceMock = {
  async buildGovernmentBudgetVsActualReport(filters = {}) {
    return clone(buildMockGovernmentBudgetVsActual(filters));
  }
};

const serializeMockTreasuryUser = (value = null) => {
  if (!value) return null;
  const user = users.find((item) => String(item._id || '') === String(value?._id || value || '')) || value;
  return user?._id ? { _id: user._id, name: user.name || '' } : null;
};

const buildMockTreasuryMetrics = (accounts = [], transactions = [], expenses = []) => {
  const metrics = new Map(
    (accounts || []).map((item) => [String(item._id), {
      manualInflow: 0,
      manualOutflow: 0,
      transferIn: 0,
      transferOut: 0,
      expenseOutflow: 0,
      transferCount: 0,
      expenseCount: 0,
      bookBalance: Number(item.openingBalance || 0),
      lastTransactionAt: null
    }])
  );

  (transactions || []).forEach((item) => {
    const key = String(item.accountId || '');
    if (!metrics.has(key)) return;
    const bucket = metrics.get(key);
    const amount = Number(item.amount || 0);
    if (item.transactionType === 'transfer_in') {
      bucket.transferIn += amount;
      bucket.transferCount += 1;
      bucket.bookBalance += amount;
    } else if (item.transactionType === 'transfer_out') {
      bucket.transferOut += amount;
      bucket.transferCount += 1;
      bucket.bookBalance -= amount;
    } else if (item.direction === 'in') {
      bucket.manualInflow += amount;
      bucket.bookBalance += amount;
    } else {
      bucket.manualOutflow += amount;
      bucket.bookBalance -= amount;
    }
    bucket.lastTransactionAt = item.transactionDate ? new Date(item.transactionDate).toISOString() : bucket.lastTransactionAt;
  });

  (expenses || []).forEach((item) => {
    const key = String(item.treasuryAccountId || '');
    if (!metrics.has(key)) return;
    const bucket = metrics.get(key);
    const amount = Number(item.amount || 0);
    bucket.expenseOutflow += amount;
    bucket.expenseCount += 1;
    bucket.bookBalance -= amount;
    bucket.lastTransactionAt = item.expenseDate ? new Date(item.expenseDate).toISOString() : bucket.lastTransactionAt;
  });

  return metrics;
};

const serializeMockTreasuryAccount = (account = {}, metricsById = new Map()) => {
  const metrics = metricsById.get(String(account._id || '')) || {
    manualInflow: 0,
    manualOutflow: 0,
    transferIn: 0,
    transferOut: 0,
    expenseOutflow: 0,
    transferCount: 0,
    expenseCount: 0,
    bookBalance: Number(account.openingBalance || 0),
    lastTransactionAt: null
  };
  return {
    ...clone(account),
    createdBy: serializeMockTreasuryUser(account.createdBy),
    updatedBy: serializeMockTreasuryUser(account.updatedBy),
    lastReconciledBy: serializeMockTreasuryUser(account.lastReconciledBy),
    accountNoMasked: String(account.accountNo || '').trim() ? `***${String(account.accountNo).trim().slice(-4)}` : '',
    metrics: clone(metrics)
  };
};

const serializeMockTreasuryTransaction = (transaction = {}) => {
  const account = treasuryAccounts.find((item) => String(item._id || '') === String(transaction.accountId || '')) || null;
  const counterAccount = treasuryAccounts.find((item) => String(item._id || '') === String(transaction.counterAccountId || '')) || null;
  return {
    ...clone(transaction),
    account: account ? {
      _id: account._id,
      title: account.title || '',
      code: account.code || '',
      accountType: account.accountType || '',
      accountNoMasked: String(account.accountNo || '').trim() ? `***${String(account.accountNo).trim().slice(-4)}` : ''
    } : null,
    counterAccount: counterAccount ? {
      _id: counterAccount._id,
      title: counterAccount.title || '',
      code: counterAccount.code || '',
      accountType: counterAccount.accountType || '',
      accountNoMasked: String(counterAccount.accountNo || '').trim() ? `***${String(counterAccount.accountNo).trim().slice(-4)}` : ''
    } : null,
    createdBy: serializeMockTreasuryUser(transaction.createdBy),
    updatedBy: serializeMockTreasuryUser(transaction.updatedBy)
  };
};

const buildMockTreasuryAnalytics = (filters = {}) => {
  const filteredAccounts = treasuryAccounts.filter((item) => (
    (!filters.financialYearId || String(item.financialYearId || '') === String(filters.financialYearId || ''))
    && (!filters.academicYearId || String(item.academicYearId || '') === String(filters.academicYearId || ''))
    && (!filters.accountId || String(item._id || '') === String(filters.accountId || ''))
  ));
  const accountIds = new Set(filteredAccounts.map((item) => String(item._id || '')));
  const filteredTransactions = treasuryTransactions.filter((item) => accountIds.has(String(item.accountId || '')) && item.status !== 'void');
  const filteredExpenses = expenseEntries.filter((item) => item.status === 'approved' && accountIds.has(String(item.treasuryAccountId || '')));
  const metricsById = buildMockTreasuryMetrics(filteredAccounts, filteredTransactions, filteredExpenses);
  const accounts = filteredAccounts.map((item) => serializeMockTreasuryAccount(item, metricsById));
  const recentTransactions = filteredTransactions
    .slice()
    .sort((left, right) => new Date(right.transactionDate || 0).getTime() - new Date(left.transactionDate || 0).getTime())
    .slice(0, 12)
    .map((item) => serializeMockTreasuryTransaction(item));
  const unassignedApprovedExpenses = expenseEntries.filter((item) => (
    item.status === 'approved'
    && (!filters.financialYearId || String(item.financialYearId || '') === String(filters.financialYearId || ''))
    && (!filters.academicYearId || String(item.academicYearId || '') === String(filters.academicYearId || ''))
    && !item.treasuryAccountId
  ));
  const summary = {
    accountCount: accounts.length,
    activeAccountCount: accounts.filter((item) => item.isActive !== false).length,
    cashBalance: accounts.filter((item) => item.accountType === 'cashbox').reduce((sum, item) => sum + Number(item.metrics?.bookBalance || 0), 0),
    bankBalance: accounts.filter((item) => item.accountType === 'bank').reduce((sum, item) => sum + Number(item.metrics?.bookBalance || 0), 0),
    bookBalance: accounts.reduce((sum, item) => sum + Number(item.metrics?.bookBalance || 0), 0),
    manualInflow: accounts.reduce((sum, item) => sum + Number(item.metrics?.manualInflow || 0), 0),
    manualOutflow: accounts.reduce((sum, item) => sum + Number(item.metrics?.manualOutflow || 0), 0),
    transferCount: accounts.reduce((sum, item) => sum + Number(item.metrics?.transferCount || 0), 0) / 2,
    expenseOutflow: accounts.reduce((sum, item) => sum + Number(item.metrics?.expenseOutflow || 0), 0),
    unassignedApprovedExpenseCount: unassignedApprovedExpenses.length,
    unassignedApprovedExpenseAmount: unassignedApprovedExpenses.reduce((sum, item) => sum + Number(item.amount || 0), 0),
    reconciledAccountCount: accounts.filter((item) => item.lastReconciledAt).length,
    unreconciledAccountCount: accounts.filter((item) => !item.lastReconciledAt).length
  };
  const alerts = [];
  if (summary.unassignedApprovedExpenseCount > 0) {
    alerts.push({
      key: 'unassigned_expense',
      tone: 'rose',
      label: `${summary.unassignedApprovedExpenseCount} approved expense(s) missing treasury account assignment.`
    });
  }
  if (summary.unreconciledAccountCount > 0) {
    alerts.push({
      key: 'unreconciled_accounts',
      tone: 'copper',
      label: `${summary.unreconciledAccountCount} treasury account(s) still need reconciliation.`
    });
  }
  return {
    summary,
    accounts,
    recentTransactions,
    alerts
  };
};

const buildMockTreasuryReportBundle = (filters = {}) => {
  const analytics = buildMockTreasuryAnalytics(filters);
  const selectedAccount = analytics.accounts[0] || null;
  const selectedAccountId = String(selectedAccount?._id || '');
  const cashbookRows = [];
  let runningBalance = Number(selectedAccount?.openingBalance || 0);
  let inflowTotal = 0;
  let outflowTotal = 0;

  treasuryTransactions
    .filter((item) => String(item.accountId || '') === selectedAccountId && item.status !== 'void')
    .sort((left, right) => new Date(left.transactionDate || 0).getTime() - new Date(right.transactionDate || 0).getTime())
    .forEach((item) => {
      const amount = Number(item.amount || 0);
      const inflow = item.direction === 'in' ? amount : 0;
      const outflow = item.direction === 'out' ? amount : 0;
      inflowTotal += inflow;
      outflowTotal += outflow;
      runningBalance += inflow;
      runningBalance -= outflow;
      cashbookRows.push({
        key: `txn-${item._id}`,
        postedAt: item.transactionDate,
        sourceType: item.sourceType || 'manual',
        rowType: 'transaction',
        transactionType: item.transactionType || '',
        title: item.transactionType || 'transaction',
        referenceNo: item.referenceNo || '',
        note: item.note || '',
        counterparty: serializeMockTreasuryTransaction(item).counterAccount?.title || '',
        amount,
        inflow,
        outflow,
        balance: Number(runningBalance.toFixed(2))
      });
    });

  expenseEntries
    .filter((item) => item.status === 'approved' && String(item.treasuryAccountId || '') === selectedAccountId)
    .sort((left, right) => new Date(left.expenseDate || 0).getTime() - new Date(right.expenseDate || 0).getTime())
    .forEach((item) => {
      const outflow = Number(item.amount || 0);
      outflowTotal += outflow;
      runningBalance -= outflow;
      cashbookRows.push({
        key: `exp-${item._id}`,
        postedAt: item.expenseDate,
        sourceType: 'expense',
        rowType: 'expense',
        transactionType: 'expense_outflow',
        title: item.subCategory || item.category || 'expense',
        referenceNo: item.referenceNo || '',
        note: item.note || '',
        counterparty: item.vendorName || '',
        amount: outflow,
        inflow: 0,
        outflow,
        balance: Number(runningBalance.toFixed(2))
      });
    });

  cashbookRows.sort((left, right) => new Date(left.postedAt || 0).getTime() - new Date(right.postedAt || 0).getTime());

  const movementRows = (analytics.accounts || []).map((item) => ({
    accountId: item._id,
    accountTitle: item.title || item.code || '',
    accountCode: item.code || '',
    accountType: item.accountType || '',
    openingBalance: Number(item.openingBalance || 0),
    manualInflow: Number(item.metrics?.manualInflow || 0),
    manualOutflow: Number(item.metrics?.manualOutflow || 0),
    transferIn: Number(item.metrics?.transferIn || 0),
    transferOut: Number(item.metrics?.transferOut || 0),
    expenseOutflow: Number(item.metrics?.expenseOutflow || 0),
    netChange: Number((
      Number(item.metrics?.manualInflow || 0)
      + Number(item.metrics?.transferIn || 0)
      - Number(item.metrics?.manualOutflow || 0)
      - Number(item.metrics?.transferOut || 0)
      - Number(item.metrics?.expenseOutflow || 0)
    ).toFixed(2)),
    closingBalance: Number(item.metrics?.bookBalance || 0),
    lastTransactionAt: item.metrics?.lastTransactionAt || null
  }));

  const reconciliationRows = (analytics.accounts || []).map((item) => {
    const variance = Number(item.lastReconciliationVariance || 0);
    return {
      accountId: item._id,
      accountTitle: item.title || item.code || '',
      accountCode: item.code || '',
      accountType: item.accountType || '',
      bookBalance: Number(item.metrics?.bookBalance || 0),
      statementBalance: Number(item.lastStatementBalance || 0),
      variance,
      status: !item.lastReconciledAt ? 'pending' : (Math.abs(variance) < 0.01 ? 'matched' : 'variance'),
      lastReconciledAt: item.lastReconciledAt || null,
      lastReconciledBy: serializeMockTreasuryUser(item.lastReconciledBy)
    };
  });

  const varianceRows = [];
  reconciliationRows.forEach((item) => {
    if (item.status === 'pending') {
      varianceRows.push({
        key: `missing-${item.accountId}`,
        issueType: 'missing_reconciliation',
        severity: 'warning',
        accountId: item.accountId,
        accountTitle: item.accountTitle,
        referenceNo: '',
        amount: Number(item.bookBalance || 0),
        occurredAt: item.lastReconciledAt || null,
        note: 'Account has not been reconciled yet.'
      });
    } else if (item.status === 'variance') {
      varianceRows.push({
        key: `variance-${item.accountId}`,
        issueType: 'reconciliation_variance',
        severity: Math.abs(Number(item.variance || 0)) >= 500 ? 'critical' : 'warning',
        accountId: item.accountId,
        accountTitle: item.accountTitle,
        referenceNo: '',
        amount: Number(item.variance || 0),
        occurredAt: item.lastReconciledAt || null,
        note: 'Reconciliation variance still needs follow-up.'
      });
    }
  });

  expenseEntries
    .filter((item) => item.status === 'approved' && !item.treasuryAccountId)
    .forEach((item) => {
      varianceRows.push({
        key: `expense-${item._id}`,
        issueType: 'unassigned_expense',
        severity: 'critical',
        accountId: '',
        accountTitle: item.vendorName || item.category || 'expense',
        referenceNo: item.referenceNo || '',
        amount: Number(item.amount || 0),
        occurredAt: item.expenseDate || null,
        note: 'Approved expense is not linked to a treasury account.'
      });
    });

  return {
    generatedAt: new Date('2026-03-24T10:00:00.000Z').toISOString(),
    selectedAccountId,
    cashbook: {
      account: selectedAccount,
      rows: cashbookRows,
      summary: {
        openingBalance: Number(selectedAccount?.openingBalance || 0),
        inflowTotal: Number(inflowTotal.toFixed(2)),
        outflowTotal: Number(outflowTotal.toFixed(2)),
        closingBalance: Number((selectedAccount?.metrics?.bookBalance || runningBalance || 0).toFixed(2)),
        rowCount: cashbookRows.length
      }
    },
    movementSummary: {
      rows: movementRows,
      summary: {
        accountCount: movementRows.length,
        totalOpeningBalance: Number(movementRows.reduce((sum, item) => sum + Number(item.openingBalance || 0), 0).toFixed(2)),
        totalClosingBalance: Number(movementRows.reduce((sum, item) => sum + Number(item.closingBalance || 0), 0).toFixed(2)),
        totalNetChange: Number(movementRows.reduce((sum, item) => sum + Number(item.netChange || 0), 0).toFixed(2))
      }
    },
    reconciliation: {
      rows: reconciliationRows,
      summary: {
        totalAccounts: reconciliationRows.length,
        matchedCount: reconciliationRows.filter((item) => item.status === 'matched').length,
        varianceCount: reconciliationRows.filter((item) => item.status === 'variance').length,
        pendingCount: reconciliationRows.filter((item) => item.status === 'pending').length
      }
    },
    variance: {
      rows: varianceRows,
      summary: {
        totalIssues: varianceRows.length,
        criticalCount: varianceRows.filter((item) => item.severity === 'critical').length,
        warningCount: varianceRows.filter((item) => item.severity === 'warning').length
      }
    }
  };
};

const buildMockGovernmentBudgetVsActual = ({ financialYearId = '', academicYearId = '', classId = '' } = {}) => {
  const financialYear = financialYears.find((item) => (
    (!financialYearId || String(item._id || '') === String(financialYearId || ''))
    && (!academicYearId || String(item.academicYearId || '') === String(academicYearId || ''))
  )) || financialYears[0] || {};
  const scopedExpenses = expenseEntries.filter((item) => (
    item.status === 'approved'
    && (!financialYearId || String(item.financialYearId || '') === String(financialYearId || ''))
    && (!academicYearId || String(item.academicYearId || '') === String(academicYearId || ''))
    && (!classId || String(item.classId || '') === String(classId || ''))
  ));
  const actualExpense = scopedExpenses.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const actualIncome = 8200;
  const treasuryAnalytics = buildMockTreasuryAnalytics({ financialYearId, academicYearId });
  const budgetTargets = clone(financialYear?.budgetTargets || {});
  const categoryRows = expenseCategories.map((item) => {
    const actualAmount = scopedExpenses
      .filter((entry) => String(entry.category || '') === String(item.key || ''))
      .reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
    const configuredBudget = (budgetTargets.categoryBudgets || []).find((entry) => String(entry.categoryKey || '') === String(item.key || '')) || {};
    const annualBudget = Number(configuredBudget.annualBudget || 0);
    const utilizationPercent = annualBudget > 0 ? Number(((actualAmount / annualBudget) * 100).toFixed(2)) : 0;
    let status = 'on_track';
    if (annualBudget <= 0 && actualAmount > 0) status = 'unbudgeted';
    else if (annualBudget > 0 && actualAmount > annualBudget) status = 'over_budget';
    else if (annualBudget > 0 && utilizationPercent >= Number(configuredBudget.alertThresholdPercent || 85)) status = 'watch';
    else if (annualBudget <= 0) status = 'no_budget';
    return {
      categoryKey: item.key,
      categoryLabel: item.label,
      annualBudget,
      monthlyBudget: Number(configuredBudget.monthlyBudget || 0),
      actualAmount,
      status
    };
  });
  return {
    meta: {
      financialYearId: String(financialYear?._id || ''),
      academicYearId: String(financialYear?.academicYearId || ''),
      financialYearTitle: financialYear?.title || '',
      budgetNote: String(budgetTargets.note || '')
    },
    summary: {
      annualIncomeTarget: Number(budgetTargets.annualIncomeTarget || 0),
      annualExpenseBudget: Number(budgetTargets.annualExpenseBudget || 0),
      monthlyIncomeTarget: Number(budgetTargets.monthlyIncomeTarget || 0),
      monthlyExpenseBudget: Number(budgetTargets.monthlyExpenseBudget || 0),
      treasuryReserveTarget: Number(budgetTargets.treasuryReserveTarget || 0),
      actualIncome,
      actualExpense,
      actualNet: Number((actualIncome - actualExpense).toFixed(2)),
      incomeVariance: Number((actualIncome - Number(budgetTargets.annualIncomeTarget || 0)).toFixed(2)),
      expenseVariance: Number((actualExpense - Number(budgetTargets.annualExpenseBudget || 0)).toFixed(2)),
      treasuryReserveBalance: Number(treasuryAnalytics.summary?.bookBalance || 0),
      treasuryReserveVariance: Number((Number(treasuryAnalytics.summary?.bookBalance || 0) - Number(budgetTargets.treasuryReserveTarget || 0)).toFixed(2)),
      overBudgetCategoryCount: categoryRows.filter((item) => item.status === 'over_budget').length,
      unbudgetedCategoryCount: categoryRows.filter((item) => item.status === 'unbudgeted').length,
      watchCategoryCount: categoryRows.filter((item) => item.status === 'watch').length
    },
    categories: categoryRows,
    alerts: [],
    treasury: {
      summary: treasuryAnalytics.summary,
      alerts: treasuryAnalytics.alerts
    }
  };
};

const serializeMockBudgetApproval = (financialYear = {}) => ({
  configured: Boolean(
    Number(financialYear?.budgetTargets?.annualIncomeTarget || 0)
    || Number(financialYear?.budgetTargets?.annualExpenseBudget || 0)
    || Number(financialYear?.budgetTargets?.monthlyIncomeTarget || 0)
    || Number(financialYear?.budgetTargets?.monthlyExpenseBudget || 0)
    || Number(financialYear?.budgetTargets?.treasuryReserveTarget || 0)
  ),
  stage: String(financialYear?.budgetApprovalStage || 'draft'),
  submittedBy: financialYear?.budgetSubmittedBy ? findUser(financialYear.budgetSubmittedBy) : null,
  submittedAt: financialYear?.budgetSubmittedAt || null,
  approvedBy: financialYear?.budgetApprovedBy ? findUser(financialYear.budgetApprovedBy) : null,
  approvedAt: financialYear?.budgetApprovedAt || null,
  rejectedBy: financialYear?.budgetRejectedBy ? findUser(financialYear.budgetRejectedBy) : null,
  rejectedAt: financialYear?.budgetRejectedAt || null,
  rejectReason: String(financialYear?.budgetRejectReason || ''),
  version: Math.max(1, Number(financialYear?.budgetVersion || 1)),
  lastApprovedVersion: Math.max(0, Number(financialYear?.budgetLastApprovedVersion || 0)),
  frozenAt: financialYear?.budgetFrozenAt || null,
  canStartRevision: String(financialYear?.budgetApprovalStage || '').trim() === 'approved' && !Boolean(financialYear?.isClosed),
  trail: Array.isArray(financialYear?.budgetApprovalTrail)
    ? financialYear.budgetApprovalTrail.map((entry) => ({
        ...entry,
        by: findUser(entry.by)
      }))
    : [],
  revisionHistory: Array.isArray(financialYear?.budgetRevisionHistory)
    ? financialYear.budgetRevisionHistory.map((entry) => ({
        ...entry,
        by: findUser(entry.by)
      }))
    : []
});

const buildMockProcurementAnalytics = ({ financialYearId = '', academicYearId = '', classId = '', status = '', approvalStage = '' } = {}) => {
  const items = procurementCommitments
    .filter((item) => (
      (!financialYearId || String(item.financialYearId || '') === String(financialYearId || ''))
      && (!academicYearId || String(item.academicYearId || '') === String(academicYearId || ''))
      && (!classId || String(item.classId || '') === String(classId || ''))
      && (!status || String(item.status || '') === String(status || ''))
      && (!approvalStage || String(item.approvalStage || '') === String(approvalStage || ''))
    ))
    .map((item) => {
      const approvedExpenses = expenseEntries.filter((entry) => (
        String(entry.procurementCommitmentId || '') === String(item._id || '')
        && String(entry.status || '') === 'approved'
      ));
      const approvedExpenseAmount = approvedExpenses.reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
      const outstandingAmount = Math.max(0, Number(item.committedAmount || 0) - approvedExpenseAmount);
      const settlements = Array.isArray(item.settlements) ? item.settlements : [];
      const settledAmount = settlements.reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
      const payableReadyAmount = Math.max(0, approvedExpenseAmount - settledAmount);
      const settlementBalanceAmount = Math.max(0, outstandingAmount - settledAmount);
      return {
        ...clone(item),
        settlements,
        settledAmount: Number(settledAmount.toFixed(2)),
        settlementCount: Number(item.settlementCount || settlements.length || 0),
        approvedExpenseAmount: Number(approvedExpenseAmount.toFixed(2)),
        approvedExpenseCount: approvedExpenses.length,
        outstandingAmount: Number(outstandingAmount.toFixed(2)),
        payableReadyAmount: Number(payableReadyAmount.toFixed(2)),
        settlementBalanceAmount: Number(settlementBalanceAmount.toFixed(2)),
        settlementProgressPercent: approvedExpenseAmount > 0
          ? Number(Math.min(100, (settledAmount / Math.max(approvedExpenseAmount, 1)) * 100).toFixed(2))
          : 0,
        fulfillmentPercent: Number(item.committedAmount || 0) > 0
          ? Number(Math.min(100, (approvedExpenseAmount / Number(item.committedAmount || 0)) * 100).toFixed(2))
          : 0,
        lastSettledAt: item.lastSettledAt || settlements.slice().sort((left, right) => new Date(right.settlementDate || right.createdAt || 0).getTime() - new Date(left.settlementDate || left.createdAt || 0).getTime())[0]?.settlementDate || null,
        lastSettledBy: item.lastSettledBy ? findUser(item.lastSettledBy) : null,
        latestExpenseDate: approvedExpenses
          .slice()
          .sort((left, right) => new Date(right.expenseDate || 0).getTime() - new Date(left.expenseDate || 0).getTime())[0]?.expenseDate || null
      };
    });

  const vendors = Array.from(items.reduce((map, item) => {
    const key = String(item.vendorName || '').trim().toLowerCase();
    if (!key) return map;
    const bucket = map.get(key) || {
      vendorName: item.vendorName,
      commitmentCount: 0,
      committedAmount: 0,
      outstandingAmount: 0,
      settledAmount: 0,
      payableReadyAmount: 0
    };
    bucket.commitmentCount += 1;
    bucket.committedAmount += Number(item.committedAmount || 0);
    bucket.outstandingAmount += Number(item.outstandingAmount || 0);
    bucket.settledAmount += Number(item.settledAmount || 0);
    bucket.payableReadyAmount += Number(item.payableReadyAmount || 0);
    map.set(key, bucket);
    return map;
  }, new Map()).values());

  return {
    summary: {
      totalCount: items.length,
      draftCount: items.filter((item) => item.status === 'draft').length,
      pendingReviewCount: items.filter((item) => item.status === 'pending_review').length,
      approvedCount: items.filter((item) => item.status === 'approved').length,
      rejectedCount: items.filter((item) => item.status === 'rejected').length,
      cancelledCount: items.filter((item) => item.status === 'cancelled').length,
      vendorCount: vendors.length,
      totalCommittedAmount: Number(items.reduce((sum, item) => sum + Number(item.committedAmount || 0), 0).toFixed(2)),
      totalApprovedExpenseAmount: Number(items.reduce((sum, item) => sum + Number(item.approvedExpenseAmount || 0), 0).toFixed(2)),
      totalOutstandingAmount: Number(items.reduce((sum, item) => sum + Number(item.outstandingAmount || 0), 0).toFixed(2)),
      totalSettledAmount: Number(items.reduce((sum, item) => sum + Number(item.settledAmount || 0), 0).toFixed(2)),
      totalPayableReadyAmount: Number(items.reduce((sum, item) => sum + Number(item.payableReadyAmount || 0), 0).toFixed(2)),
      openCommitmentCount: items.filter((item) => item.status === 'approved' && Number(item.outstandingAmount || 0) > 0).length,
      settlementReadyCount: items.filter((item) => item.status === 'approved' && Number(item.payableReadyAmount || 0) > 0).length,
      settledCount: items.filter((item) => Number(item.settledAmount || 0) > 0).length
    },
    items,
    vendors
  };
};

const treasuryGovernanceServiceMock = {
  async buildTreasuryAnalytics(filters = {}) {
    return clone(buildMockTreasuryAnalytics(filters));
  },
  async buildTreasuryReportBundle(filters = {}) {
    return clone(buildMockTreasuryReportBundle(filters));
  },
  async createTreasuryAccount({ financialYear, payload = {}, actorId = '' } = {}) {
    const item = {
      _id: `treasury-account-${++treasuryAccountSerial}`,
      schoolId: financialYear.schoolId,
      financialYearId: String(financialYear._id || ''),
      academicYearId: String(financialYear.academicYearId || ''),
      code: String(payload.code || '').trim().toUpperCase(),
      title: String(payload.title || '').trim(),
      accountType: String(payload.accountType || 'cashbox').trim() || 'cashbox',
      currency: String(payload.currency || 'AFN').trim().toUpperCase() || 'AFN',
      openingBalance: Number(payload.openingBalance || 0),
      providerName: String(payload.providerName || '').trim(),
      branchName: String(payload.branchName || '').trim(),
      accountNo: String(payload.accountNo || '').trim(),
      isActive: payload.isActive !== false,
      lastReconciledAt: null,
      lastReconciledBy: null,
      lastStatementBalance: 0,
      lastReconciliationVariance: 0,
      note: String(payload.note || '').trim(),
      createdBy: actorId || IDS.adminManager,
      updatedBy: actorId || IDS.adminManager,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    treasuryAccounts.push(item);
    return serializeMockTreasuryAccount(item, buildMockTreasuryMetrics(treasuryAccounts, treasuryTransactions, expenseEntries.filter((entry) => entry.status === 'approved')));
  },
  async updateTreasuryAccount({ account, payload = {}, actorId = '' } = {}) {
    const current = treasuryAccounts.find((item) => String(item._id || '') === String(account?._id || account || ''));
    Object.assign(current, {
      title: payload.title != null ? String(payload.title).trim() : current.title,
      code: payload.code != null ? String(payload.code).trim().toUpperCase() : current.code,
      accountType: payload.accountType != null ? String(payload.accountType).trim() : current.accountType,
      openingBalance: payload.openingBalance != null ? Number(payload.openingBalance || 0) : current.openingBalance,
      currency: payload.currency != null ? String(payload.currency).trim().toUpperCase() : current.currency,
      providerName: payload.providerName != null ? String(payload.providerName).trim() : current.providerName,
      branchName: payload.branchName != null ? String(payload.branchName).trim() : current.branchName,
      accountNo: payload.accountNo != null ? String(payload.accountNo).trim() : current.accountNo,
      note: payload.note != null ? String(payload.note).trim() : current.note,
      isActive: payload.isActive != null ? payload.isActive !== false : current.isActive,
      updatedBy: actorId || IDS.adminManager,
      updatedAt: new Date()
    });
    return serializeMockTreasuryAccount(current, buildMockTreasuryMetrics(treasuryAccounts, treasuryTransactions, expenseEntries.filter((entry) => entry.status === 'approved')));
  },
  async resolveTreasuryAccountSelection({ accountId = '', allowInactive = false } = {}) {
    if (!String(accountId || '').trim()) return null;
    const item = treasuryAccounts.find((entry) => String(entry._id || '') === String(accountId || '')) || null;
    if (!item) {
      const error = new Error('finance_treasury_account_invalid');
      error.statusCode = 404;
      throw error;
    }
    if (!allowInactive && item.isActive === false) {
      const error = new Error('finance_treasury_account_inactive');
      error.statusCode = 409;
      throw error;
    }
    return clone(item);
  },
  async createTreasuryManualTransaction({ financialYear, account, payload = {}, actorId = '' } = {}) {
    const type = String(payload.transactionType || 'deposit').trim();
    const direction = ['withdrawal', 'adjustment_out'].includes(type) ? 'out' : 'in';
    const item = {
      _id: `treasury-transaction-${++treasuryTransactionSerial}`,
      schoolId: financialYear.schoolId,
      financialYearId: String(financialYear._id || ''),
      academicYearId: String(financialYear.academicYearId || ''),
      accountId: String(account._id || account || ''),
      counterAccountId: null,
      transactionGroupKey: '',
      transactionType: type,
      direction,
      amount: Number(payload.amount || 0),
      currency: 'AFN',
      transactionDate: new Date(payload.transactionDate || '2026-03-20'),
      sourceType: 'manual',
      referenceNo: String(payload.referenceNo || '').trim(),
      note: String(payload.note || '').trim(),
      status: 'posted',
      createdBy: actorId || IDS.adminManager,
      updatedBy: actorId || IDS.adminManager,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    treasuryTransactions.unshift(item);
    return serializeMockTreasuryTransaction(item);
  },
  async createTreasuryTransfer({ financialYear, sourceAccount, destinationAccount, payload = {}, actorId = '' } = {}) {
    const groupKey = `transfer-${++treasuryTransactionSerial}`;
    const outItem = {
      _id: `treasury-transaction-${++treasuryTransactionSerial}`,
      schoolId: financialYear.schoolId,
      financialYearId: String(financialYear._id || ''),
      academicYearId: String(financialYear.academicYearId || ''),
      accountId: String(sourceAccount._id || sourceAccount || ''),
      counterAccountId: String(destinationAccount._id || destinationAccount || ''),
      transactionGroupKey: groupKey,
      transactionType: 'transfer_out',
      direction: 'out',
      amount: Number(payload.amount || 0),
      currency: 'AFN',
      transactionDate: new Date(payload.transactionDate || '2026-03-20'),
      sourceType: 'transfer',
      referenceNo: String(payload.referenceNo || '').trim(),
      note: String(payload.note || '').trim(),
      status: 'posted',
      createdBy: actorId || IDS.adminManager,
      updatedBy: actorId || IDS.adminManager,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    const inItem = {
      ...clone(outItem),
      _id: `treasury-transaction-${++treasuryTransactionSerial}`,
      accountId: String(destinationAccount._id || destinationAccount || ''),
      counterAccountId: String(sourceAccount._id || sourceAccount || ''),
      transactionType: 'transfer_in',
      direction: 'in'
    };
    treasuryTransactions.unshift(inItem);
    treasuryTransactions.unshift(outItem);
    return {
      transactionGroupKey: groupKey,
      items: [serializeMockTreasuryTransaction(outItem), serializeMockTreasuryTransaction(inItem)]
    };
  },
  async reconcileTreasuryAccount({ account, payload = {}, actorId = '' } = {}) {
    const current = treasuryAccounts.find((item) => String(item._id || '') === String(account?._id || account || ''));
    const analytics = buildMockTreasuryAnalytics({ accountId: current._id });
    const bookBalanceBefore = Number(analytics.accounts[0]?.metrics?.bookBalance || current.openingBalance || 0);
    const statementBalance = Number(payload.statementBalance || 0);
    const variance = Number((statementBalance - bookBalanceBefore).toFixed(2));
    current.lastReconciledAt = new Date(payload.reconciliationDate || '2026-03-20');
    current.lastReconciledBy = actorId || IDS.adminManager;
    current.lastStatementBalance = statementBalance;
    current.lastReconciliationVariance = variance;
    current.updatedBy = actorId || IDS.adminManager;
    current.updatedAt = new Date();
    let adjustment = null;
    if (payload.applyAdjustment && variance !== 0) {
      adjustment = {
        _id: `treasury-transaction-${++treasuryTransactionSerial}`,
        schoolId: current.schoolId,
        financialYearId: current.financialYearId,
        academicYearId: current.academicYearId,
        accountId: current._id,
        counterAccountId: null,
        transactionGroupKey: '',
        transactionType: 'reconciliation_adjustment',
        direction: variance >= 0 ? 'in' : 'out',
        amount: Math.abs(variance),
        currency: current.currency || 'AFN',
        transactionDate: new Date(payload.reconciliationDate || '2026-03-20'),
        sourceType: 'reconciliation',
        referenceNo: String(payload.referenceNo || '').trim(),
        note: String(payload.note || '').trim(),
        status: 'posted',
        createdBy: actorId || IDS.adminManager,
        updatedBy: actorId || IDS.adminManager,
        createdAt: new Date(),
        updatedAt: new Date()
      };
      treasuryTransactions.unshift(adjustment);
    }
    const refreshed = buildMockTreasuryAnalytics({ accountId: current._id });
    return {
      account: refreshed.accounts[0] || serializeMockTreasuryAccount(current),
      adjustment: adjustment ? serializeMockTreasuryTransaction(adjustment) : null,
      bookBalanceBefore,
      statementBalance,
      variance
    };
  }
};

const procurementCommitmentServiceMock = {
  async buildProcurementCommitmentAnalytics(filters = {}) {
    return clone(buildMockProcurementAnalytics(filters));
  },
  async createProcurementCommitment({ financialYear, payload = {}, actorId = '', classId = '' } = {}) {
    const item = {
      _id: `procurement-${++procurementCommitmentSerial}`,
      schoolId: financialYear.schoolId,
      financialYearId: String(financialYear._id || ''),
      academicYearId: String(financialYear.academicYearId || ''),
      classId: classId || null,
      treasuryAccountId: String(payload.treasuryAccountId || '').trim() || null,
      category: String(payload.category || '').trim().toLowerCase(),
      subCategory: String(payload.subCategory || '').trim(),
      procurementType: String(payload.procurementType || 'vendor_commitment').trim() || 'vendor_commitment',
      title: String(payload.title || '').trim(),
      vendorName: String(payload.vendorName || '').trim(),
      description: String(payload.description || '').trim(),
      committedAmount: Number(payload.committedAmount || 0),
      currency: String(payload.currency || 'AFN').trim().toUpperCase(),
      requestDate: new Date(payload.requestDate || '2026-03-20'),
      expectedDeliveryDate: payload.expectedDeliveryDate ? new Date(payload.expectedDeliveryDate) : null,
      referenceNo: String(payload.referenceNo || '').trim(),
      paymentTerms: String(payload.paymentTerms || '').trim(),
      note: String(payload.note || '').trim(),
      status: String(payload.status || '') === 'pending_review' ? 'pending_review' : 'draft',
      approvalStage: String(payload.status || '') === 'pending_review' ? 'finance_manager_review' : 'draft',
      settlements: [],
      settledAmount: 0,
      settlementCount: 0,
      lastSettledAt: null,
      lastSettledBy: null,
      submittedBy: String(payload.status || '') === 'pending_review' ? actorId : null,
      submittedAt: String(payload.status || '') === 'pending_review' ? new Date() : null,
      approvedBy: null,
      approvedAt: null,
      rejectedBy: null,
      rejectedAt: null,
      rejectReason: '',
      approvalTrail: String(payload.status || '') === 'pending_review'
        ? [{ level: 'finance_manager', action: 'submit', by: actorId, at: new Date(), note: 'Submitted during commitment creation.', reason: '' }]
        : [],
      createdBy: actorId,
      updatedBy: actorId,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    procurementCommitments.unshift(item);
    return clone(buildMockProcurementAnalytics({ financialYearId: item.financialYearId, academicYearId: item.academicYearId, classId }).items.find((entry) => String(entry._id) === String(item._id)) || item);
  },
  async resolveProcurementCommitmentSelection({ commitmentId = '', financialYearId = '', academicYearId = '', allowStatuses = ['approved'] } = {}) {
    if (!String(commitmentId || '').trim()) return null;
    const item = procurementCommitments.find((entry) => String(entry._id) === String(commitmentId || '')) || null;
    if (!item) {
      const error = new Error('finance_procurement_commitment_not_found');
      error.statusCode = 404;
      throw error;
    }
    if (financialYearId && String(item.financialYearId || '') !== String(financialYearId || '')) {
      const error = new Error('finance_procurement_commitment_scope_invalid');
      error.statusCode = 400;
      throw error;
    }
    if (academicYearId && String(item.academicYearId || '') !== String(academicYearId || '')) {
      const error = new Error('finance_procurement_commitment_scope_invalid');
      error.statusCode = 400;
      throw error;
    }
    if (allowStatuses?.length && !allowStatuses.includes(String(item.status || ''))) {
      const error = new Error('finance_procurement_commitment_status_invalid');
      error.statusCode = 409;
      throw error;
    }
    return createProcurementCommitmentDoc(item);
  },
  async submitProcurementCommitmentForReview({ commitment, actorId = '', note = '' } = {}) {
    const item = procurementCommitments.find((entry) => String(entry._id) === String(commitment?._id || commitment || ''));
    if (!item) {
      const error = new Error('finance_procurement_commitment_not_found');
      error.statusCode = 404;
      throw error;
    }
    item.status = 'pending_review';
    item.approvalStage = 'finance_manager_review';
    item.submittedBy = actorId || item.submittedBy || null;
    item.submittedAt = item.submittedAt || new Date();
    item.rejectedBy = null;
    item.rejectedAt = null;
    item.rejectReason = '';
    item.updatedBy = actorId || item.updatedBy || null;
    item.approvalTrail = Array.isArray(item.approvalTrail) ? item.approvalTrail : [];
    item.approvalTrail.push({
      level: 'finance_manager',
      action: 'submit',
      by: actorId,
      at: new Date(),
      note: String(note || 'Submitted for procurement review.'),
      reason: ''
    });
    return createProcurementCommitmentDoc(item);
  },
  async reviewProcurementCommitmentTransition({ commitment, actorId = '', actorLevel = '', action = 'approve', note = '', reason = '' } = {}) {
    const item = procurementCommitments.find((entry) => String(entry._id) === String(commitment?._id || commitment || ''));
    if (!item) {
      const error = new Error('finance_procurement_commitment_not_found');
      error.statusCode = 404;
      throw error;
    }
    const normalizedAction = String(action || 'approve').trim().toLowerCase() === 'reject' ? 'reject' : 'approve';
    const level = String(actorLevel || 'finance_manager').trim();
    const currentStage = String(item.approvalStage || 'draft');
    if (normalizedAction === 'reject') {
      item.status = 'rejected';
      item.approvalStage = 'rejected';
      item.rejectedBy = actorId || null;
      item.rejectedAt = new Date();
      item.rejectReason = String(reason || '').trim();
      item.approvalTrail.push({ level, action: 'reject', by: actorId, at: new Date(), note: String(note || '').trim(), reason: String(reason || '').trim() });
      return { nextStage: 'rejected', completed: false, item: createProcurementCommitmentDoc(item) };
    }

    let nextStage = 'finance_lead_review';
    if (level === 'finance_lead' || currentStage === 'finance_lead_review') nextStage = 'general_president_review';
    if (level === 'general_president' || currentStage === 'general_president_review') nextStage = 'approved';

    item.approvalTrail.push({ level, action: 'approve', by: actorId, at: new Date(), note: String(note || '').trim(), reason: '' });
    if (nextStage === 'approved') {
      item.status = 'approved';
      item.approvalStage = 'approved';
      item.approvedBy = actorId || null;
      item.approvedAt = new Date();
      return { nextStage, completed: true, item: createProcurementCommitmentDoc(item) };
    }

    item.status = 'pending_review';
    item.approvalStage = nextStage;
    return { nextStage, completed: false, item: createProcurementCommitmentDoc(item) };
  },
  async createProcurementSettlement({ commitment, payload = {}, actorId = '' } = {}) {
    const item = procurementCommitments.find((entry) => String(entry._id) === String(commitment?._id || commitment || ''));
    if (!item) {
      const error = new Error('finance_procurement_commitment_not_found');
      error.statusCode = 404;
      throw error;
    }
    const amount = Number(payload.amount || 0);
    if (!(amount > 0)) {
      const error = new Error('finance_procurement_settlement_invalid');
      error.statusCode = 400;
      throw error;
    }
    const analytics = buildMockProcurementAnalytics({ financialYearId: item.financialYearId, academicYearId: item.academicYearId, classId: item.classId || '' });
    const resolved = analytics.items.find((entry) => String(entry._id || '') === String(item._id || '')) || null;
    const payableReadyAmount = Number(resolved?.payableReadyAmount || 0);
    if (amount > payableReadyAmount + 0.0001) {
      const error = new Error('finance_procurement_settlement_limit');
      error.statusCode = 409;
      throw error;
    }
    const treasuryAccount = treasuryAccounts.find((entry) => String(entry._id || '') === String(payload.treasuryAccountId || item.treasuryAccountId || '')) || null;
    if (!treasuryAccount) {
      const error = new Error('finance_treasury_account_invalid');
      error.statusCode = 404;
      throw error;
    }
    const transaction = {
      _id: `treasury-transaction-${++treasuryTransactionSerial}`,
      schoolId: item.schoolId,
      financialYearId: item.financialYearId,
      academicYearId: item.academicYearId,
      accountId: treasuryAccount._id,
      counterAccountId: null,
      transactionGroupKey: '',
      transactionType: 'withdrawal',
      direction: 'out',
      amount,
      currency: item.currency || 'AFN',
      transactionDate: new Date(payload.settlementDate || '2026-03-24'),
      sourceType: 'procurement_settlement',
      referenceNo: String(payload.referenceNo || '').trim(),
      note: String(payload.note || '').trim(),
      status: 'posted',
      createdBy: actorId || IDS.adminManager,
      updatedBy: actorId || IDS.adminManager,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    treasuryTransactions.unshift(transaction);
    const settlement = {
      _id: `proc-settlement-${item._id}-${(Array.isArray(item.settlements) ? item.settlements.length : 0) + 1}`,
      amount,
      currency: item.currency || 'AFN',
      settlementDate: transaction.transactionDate,
      treasuryAccountId: treasuryAccount._id,
      treasuryTransactionId: transaction._id,
      referenceNo: String(payload.referenceNo || '').trim(),
      note: String(payload.note || '').trim(),
      createdBy: actorId || IDS.adminManager,
      createdAt: new Date()
    };
    item.settlements = Array.isArray(item.settlements) ? item.settlements : [];
    item.settlements.push(settlement);
    item.settledAmount = Number(item.settlements.reduce((sum, entry) => sum + Number(entry.amount || 0), 0).toFixed(2));
    item.settlementCount = item.settlements.length;
    item.lastSettledAt = settlement.settlementDate;
    item.lastSettledBy = actorId || IDS.adminManager;
    item.updatedBy = actorId || IDS.adminManager;
    item.updatedAt = new Date();
    const refreshed = buildMockProcurementAnalytics({ financialYearId: item.financialYearId, academicYearId: item.academicYearId, classId: item.classId || '' }).items.find((entry) => String(entry._id || '') === String(item._id || '')) || null;
    return {
      item: clone(refreshed),
      settlement: {
        ...clone(settlement),
        treasuryAccountId: serializeMockTreasuryAccount(treasuryAccount),
        treasuryTransactionId: serializeMockTreasuryTransaction(transaction),
        createdBy: findUser(actorId || IDS.adminManager)
      }
    };
  },
  serializeProcurementCommitment(item = null) {
    return item ? clone(item.toObject ? item.toObject() : item) : null;
  }
};

const UserNotificationMock = {
  async insertMany(items = []) {
    return items.map((item) => {
      const record = {
        _id: `notification-${++notificationSerial}`,
        createdAt: new Date(),
        ...clone(item)
      };
      notifications.push(record);
      return {
        ...record,
        toObject() {
          return clone(record);
        }
      };
    });
  },
  async create(item = {}) {
    const record = {
      _id: `notification-${++notificationSerial}`,
      createdAt: new Date(),
      ...clone(item)
    };
    notifications.push(record);
    return {
      ...record,
      toObject() {
        return clone(record);
      }
    };
  }
};

const authMock = {
  requireAuth(req, res, next) {
    const raw = req.get('x-test-user');
    if (!raw) {
      return res.status(401).json({ success: false, message: 'Authentication required.' });
    }

    try {
      req.user = JSON.parse(raw);
      return next();
    } catch {
      return res.status(400).json({ success: false, message: 'Invalid test user header.' });
    }
  },
  requireRole(allowedRoles = []) {
    return (req, res, next) => {
      if (allowedRoles.includes(String(req.user?.role || ''))) {
        return next();
      }
      return res.status(403).json({ success: false, message: 'Forbidden by role.' });
    };
  },
  requirePermission(permission) {
    return (req, res, next) => {
      const permissions = Array.isArray(req.user?.permissions) ? req.user.permissions : [];
      if (permissions.includes(permission)) {
        return next();
      }
      return res.status(403).json({ success: false, message: 'Forbidden by permission.' });
    };
  }
};

function loadFinanceRouter() {
  const routePath = path.join(__dirname, '..', 'routes', 'financeRoutes.js');
  const originalLoad = Module._load;

  Module._load = function patchedLoad(request, parent, isMain) {
    const parentFile = String(parent?.filename || '').replace(/\\/g, '/');
    const isFinanceRoute = parentFile.endsWith('/routes/financeRoutes.js');
    const isFinanceAdminActionService = parentFile.endsWith('/services/financeAdminActionService.js');
    const isFinanceReceiptValidation = parentFile.endsWith('/utils/financeReceiptValidation.js');
    const isFinanceFeePlanService = parentFile.endsWith('/services/financeFeePlanService.js');
    const isFeeBillingService = parentFile.endsWith('/services/feeBillingService.js');

    if (isFinanceRoute && request === '../models/FinanceBill') return FinanceBillMock;
    if (isFinanceRoute && request === '../models/FinanceReceipt') return FinanceReceiptMock;
    if (isFinanceRoute && request === '../models/FinanceMonthClose') return FinanceMonthCloseMock;
    if (isFinanceRoute && request === '../models/FinanceAnomalyCase') return FinanceAnomalyCaseMock;
    if (isFinanceRoute && request === '../models/FinanceFeePlan') return FinanceFeePlanMock;
    if (isFinanceRoute && request === '../models/FinancialYear') return FinancialYearMock;
    if (isFinanceRoute && request === '../models/ExpenseEntry') return ExpenseEntryMock;
    if (isFinanceRoute && request === '../models/ExpenseCategoryDefinition') return ExpenseCategoryDefinitionMock;
    if (isFinanceRoute && request === '../models/GovernmentFinanceSnapshot') return GovernmentFinanceSnapshotMock;
    if (isFinanceRoute && request === '../models/FinanceProcurementCommitment') return FinanceProcurementCommitmentMock;
    if (isFinanceRoute && request === '../models/User') return UserMock;
    if (isFinanceRoute && request === '../models/StudentCore') return StudentCoreMock;
    if (isFinanceRoute && request === '../models/StudentProfile') return StudentProfileMock;
    if (isFinanceRoute && request === '../models/Course') return CourseMock;
    if (isFinanceRoute && request === '../models/SchoolClass') return SchoolClassMock;
    if (isFinanceRoute && request === '../models/AcademicYear') return AcademicYearMock;
    if (isFinanceRoute && request === '../models/FeeOrder') return FeeOrderMock;
    if (isFinanceRoute && request === '../models/FeePayment') return FeePaymentMock;
    if (isFinanceRoute && request === '../models/FinanceRelief') return FinanceReliefMock;
    if (isFinanceRoute && request === '../utils/studentMembershipLookup') return studentMembershipLookupMock;
    if (isFinanceRoute && request === '../utils/classScope') return classScopeMock;
    if (isFinanceRoute && request === '../utils/studentFinanceSync') {
      return {
        syncStudentFinanceFromFinanceBill: async () => ({ ok: true }),
        syncStudentFinanceFromFinanceReceipt: async () => ({ ok: true })
      };
    }
    if (isFinanceRoute && request === '../services/financialYearService') return financialYearServiceMock;
    if (isFinanceRoute && request === '../services/financeDeliveryService') return financeDeliveryServiceMock;
    if (isFinanceRoute && request === '../services/expenseGovernanceService') return expenseGovernanceServiceMock;
    if (isFinanceRoute && request === '../services/treasuryGovernanceService') return treasuryGovernanceServiceMock;
    if (isFinanceRoute && request === '../services/governmentFinanceReportService') return governmentFinanceReportServiceMock;
    if (isFinanceRoute && request === '../services/procurementCommitmentService') return procurementCommitmentServiceMock;
    if (isFinanceRoute && request === '../services/financialPeriodService') return financialPeriodServiceMock;
    if (isFinanceRoute && request === '../services/studentFinanceService') return studentFinanceServiceMock;
    if (isFinanceRoute && request === '../utils/financeDocumentArchive') return financeDocumentArchiveMock;
    if (isFinanceRoute && request === '../services/financeFeePlanService') {
      return require(path.join(__dirname, '..', 'services', 'financeFeePlanService'));
    }
    if (isFinanceRoute && request === '../services/feeBillingService') {
      return require(path.join(__dirname, '..', 'services', 'feeBillingService'));
    }
    if (isFinanceRoute && request === '../services/reportEngineService') return reportEngineServiceMock;
    if (isFinanceRoute && request === '../models/Order') return OrderMock;
    if (isFinanceRoute && request === '../models/StudentMembership') return StudentMembershipMock;
    if (isFinanceRoute && request === '../models/UserNotification') return UserNotificationMock;
    if (isFinanceRoute && request === '../middleware/auth') return authMock;
    if (isFinanceRoute && request === '../utils/activity') return { logActivity: async () => {} };
    if (isFinanceRoute && request === '../utils/mailer') return { sendMail: async () => ({ ok: true }) };
    if (isFinanceAdminActionService && request === '../models/FinanceBill') return FinanceBillMock;
    if (isFinanceAdminActionService && request === '../models/FinanceReceipt') return FinanceReceiptMock;
    if (isFinanceAdminActionService && request === '../models/FinanceMonthClose') return FinanceMonthCloseMock;
    if (isFinanceAdminActionService && request === '../models/StudentCore') return StudentCoreMock;
    if (isFinanceAdminActionService && request === '../models/StudentProfile') return StudentProfileMock;
    if (isFinanceAdminActionService && request === '../models/User') return UserMock;
    if (isFinanceAdminActionService && request === '../models/UserNotification') return UserNotificationMock;
    if (isFinanceAdminActionService && request === '../utils/activity') return { logActivity: async () => {} };
    if (isFinanceAdminActionService && request === '../utils/mailer') return { sendMail: async () => ({ ok: true }) };
    if (isFinanceAdminActionService && request === '../utils/financeReceiptValidation') {
      return require(path.join(__dirname, '..', 'utils', 'financeReceiptValidation'));
    }
    if (isFinanceAdminActionService && request === '../utils/studentFinanceSync') {
      return {
        syncStudentFinanceFromFinanceBill: async () => ({ ok: true }),
        syncStudentFinanceFromFinanceReceipt: async () => ({ ok: true })
      };
    }
    if (isFinanceReceiptValidation && request === '../models/FinanceReceipt') return FinanceReceiptMock;
    if (isFinanceFeePlanService && request === '../models/AcademicYear') return AcademicYearMock;
    if (isFeeBillingService && request === '../models/FinanceBill') return FinanceBillMock;
    if (isFeeBillingService && request === '../models/FinanceFeePlan') return FinanceFeePlanMock;
    if (isFeeBillingService && request === '../models/Discount') return DiscountMock;
    if (isFeeBillingService && request === '../models/FeeExemption') return FeeExemptionMock;
    if (isFeeBillingService && request === '../models/FinanceRelief') return FinanceReliefMock;
    if (isFeeBillingService && request === '../utils/studentMembershipLookup') return studentMembershipLookupMock;
    if (isFeeBillingService && request === './financeFeePlanService') {
      return require(path.join(__dirname, '..', 'services', 'financeFeePlanService'));
    }

    return originalLoad.apply(this, arguments);
  };

  try {
    delete require.cache[require.resolve(routePath)];
    return require(routePath);
  } finally {
    Module._load = originalLoad;
  }
}

const financeRouter = loadFinanceRouter();

const assertCase = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

async function createServer() {
  const app = express();
  app.use(express.json());
  app.use('/api/finance', financeRouter);
  return new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => resolve(server));
  });
}

async function request(server, targetPath, { method = 'GET', user = null, body } = {}) {
  const address = server.address();
  const headers = {};
  let payload = body;

  if (user) {
    headers['x-test-user'] = JSON.stringify(user);
  }

  if (body && !(body instanceof FormData) && typeof body === 'object') {
    headers['content-type'] = 'application/json';
    payload = JSON.stringify(body);
  }

  const response = await fetch(`http://127.0.0.1:${address.port}${targetPath}`, {
    method,
    headers,
    body: payload
  });

  const buffer = Buffer.from(await response.arrayBuffer());
  const text = buffer.toString('utf8');

  let data = null;
  try {
    data = JSON.parse(text);
  } catch {
    data = null;
  }

  return {
    status: response.status,
    headers: Object.fromEntries(response.headers.entries()),
    text,
    buffer,
    data
  };
}

const createReceiptForm = (fields = {}) => {
  const form = new FormData();
  Object.entries(fields).forEach(([key, value]) => {
    form.append(key, String(value));
  });
  form.append('receipt', new Blob(['fake receipt pdf'], { type: 'application/pdf' }), 'receipt.pdf');
  return form;
};

async function run() {
  const cases = [];
  const server = await createServer();
  const uploadDir = path.join(__dirname, '..', 'uploads', 'finance-receipts');
  const baselineFiles = fs.existsSync(uploadDir) ? new Set(fs.readdirSync(uploadDir)) : new Set();

  const financeManagerUser = {
    id: IDS.adminManager,
    role: 'admin',
    permissions: ['manage_finance'],
    adminLevel: 'finance_manager'
  };
  const financeLeadUser = {
    id: IDS.adminLead,
    role: 'admin',
    permissions: ['manage_finance'],
    adminLevel: 'finance_lead'
  };
  const presidentUser = {
    id: IDS.adminPresident,
    role: 'admin',
    permissions: ['manage_finance'],
    adminLevel: 'general_president'
  };
  const studentOneUser = {
    id: IDS.student1,
    role: 'student',
    permissions: []
  };
  const studentTwoUser = {
    id: IDS.student2,
    role: 'student',
    permissions: []
  };

  const check = async (label, handler) => {
    try {
      await handler();
      cases.push({ label, status: 'PASS' });
    } catch (error) {
      cases.push({ label, status: 'FAIL', error: error.message });
    }
  };

  try {
    await check('route smoke: admin bill creation rejects unauthenticated access', async () => {
      const response = await request(server, '/api/finance/admin/bills', {
        method: 'POST',
        body: { studentId: IDS.student2, courseId: IDS.course1, amount: 500, dueDate: '2026-04-01' }
      });
      assertCase(response.status === 401, `expected 401, received ${response.status}`);
    });

    await check('route smoke: manual bill creation blocks duplicate obligation', async () => {
      const response = await request(server, '/api/finance/admin/bills', {
        method: 'POST',
        user: financeManagerUser,
        body: {
          studentId: IDS.student1,
          courseId: IDS.course1,
          amount: 1000,
          dueDate: '2026-04-10',
          issuedAt: '2026-03-06',
          academicYear: '1405',
          term: '1',
          periodType: 'term',
          periodLabel: ''
        }
      });
      assertCase(response.status === 409, `expected 409, received ${response.status}`);
      assertCase(String(response.data?.message || '').includes('BL-202603-0001'), 'expected duplicate bill reference');
    });

    await check('route smoke: manual bill creation accepts a unique obligation', async () => {
      const response = await request(server, '/api/finance/admin/bills', {
        method: 'POST',
        user: financeManagerUser,
        body: {
          studentId: IDS.student2,
          classId: IDS.class1,
          amount: 550,
          dueDate: '2026-04-12',
          issuedAt: '2026-03-06',
          academicYear: '1405',
          term: '5',
          periodType: 'term',
          periodLabel: ''
        }
      });
      assertCase(response.status === 201, `expected 201, received ${response.status}`);
      assertCase(response.data?.item?.billNumber, 'expected created bill number');
      assertCase(String(response.data?.item?.classId?._id || response.data?.item?.classId || '') === IDS.class1, 'expected canonical classId on created bill');
      assertCase(String(response.data?.item?.course?._id || response.data?.item?.course || '') === IDS.course1, 'expected compatibility course id on created bill');
      assertCase(Array.isArray(response.data?.item?.lineItems) && response.data.item.lineItems.length === 1, 'expected manual bill to persist one canonical line item');
      assertCase(String(response.data?.item?.lineItems?.[0]?.feeType || '') === 'tuition', 'expected manual bill line item to default to tuition');
    });

    await check('route smoke: grouped bill generation uses active memberships', async () => {
      const baselineCount = bills.length;
      const response = await request(server, '/api/finance/admin/bills/generate', {
        method: 'POST',
        user: financeManagerUser,
        body: {
          classId: IDS.class1,
          amount: 640,
          dueDate: '2026-04-18',
          issuedAt: '2026-03-06',
          academicYear: '1405',
          term: '7',
          periodType: 'term',
          periodLabel: ''
        }
      });
      assertCase(response.status === 200, `expected 200, received ${response.status}: ${response.text}`);
      assertCase(response.data?.created === 2, `expected 2 created bills, received ${response.data?.created}`);
      assertCase(response.data?.skipped === 0, `expected 0 skipped bills, received ${response.data?.skipped}`);
      const createdBills = bills.slice(baselineCount);
      assertCase(createdBills.length === 2, `expected exactly 2 new bills, received ${createdBills.length}`);
      const createdStudentIds = createdBills.map((item) => String(item.student)).sort();
      assertCase(createdStudentIds.join(',') === [IDS.student1, IDS.student2].sort().join(','), 'expected bills only for active current memberships');
      assertCase(createdBills.every((item) => item.term === '7'), 'expected generated bills to use requested term');
      assertCase(createdBills.every((item) => String(item.classId || '') === IDS.class1), 'expected generated bills to carry canonical classId');
      assertCase(createdBills.every((item) => Array.isArray(item.lineItems) && item.lineItems.length >= 1), 'expected generated bills to persist canonical line items');
    });

    await check('route smoke: canonical billing preview applies discount and exemption registry rules', async () => {
      feePlans.push({
        _id: 'fee-plan-preview',
        title: 'Class One 1405 Canonical',
        course: IDS.course1,
        classId: IDS.class1,
        academicYear: '1405',
        academicYearId: 'year-1405',
        term: '8',
        billingFrequency: 'term',
        periodType: 'term',
        tuitionFee: 600,
        admissionFee: 100,
        transportDefaultFee: 50,
        isActive: true
      });
      discountRegistry.push({
        _id: 'discount-preview-1',
        studentMembershipId: 'mem-1',
        feeOrderId: null,
        discountType: 'discount',
        amount: 50,
        reason: 'Aid package',
        status: 'active',
        createdAt: new Date('2026-03-05T00:00:00.000Z')
      });
      feeExemptions.push({
        _id: 'exemption-preview-1',
        studentMembershipId: 'mem-2',
        exemptionType: 'partial',
        scope: 'tuition',
        amount: 0,
        percentage: 50,
        reason: 'Sponsored seat',
        status: 'active',
        createdAt: new Date('2026-03-05T00:00:00.000Z')
      });

      const response = await request(server, '/api/finance/admin/bills/preview', {
        method: 'POST',
        user: financeManagerUser,
        body: {
          classId: IDS.class1,
          dueDate: '2026-05-12',
          issuedAt: '2026-03-06',
          academicYear: '1405',
          term: '8',
          includeAdmission: true
        }
      });

      discountRegistry.length = 0;
      feeExemptions.length = 0;
      feePlans.pop();

      assertCase(response.status === 200, `expected 200, received ${response.status}: ${response.text}`);
      assertCase(response.data?.summary?.candidateCount === 2, `expected 2 preview candidates, received ${response.data?.summary?.candidateCount}`);
      const previewItems = Array.isArray(response.data?.items) ? response.data.items : [];
      const alpha = previewItems.find((item) => String(item.studentMembershipId || '') === 'mem-1');
      const beta = previewItems.find((item) => String(item.studentMembershipId || '') === 'mem-2');
      assertCase(Number(alpha?.amountDue || 0) === 650, `expected alpha preview amount 650, received ${alpha?.amountDue}`);
      assertCase(Number(beta?.amountDue || 0) === 400, `expected beta preview amount 400, received ${beta?.amountDue}`);
      assertCase((alpha?.adjustments || []).length >= 1, 'expected discount adjustment in preview');
      assertCase((beta?.adjustments || []).some((item) => item.type === 'waiver'), 'expected exemption waiver adjustment in preview');
      assertCase(Array.isArray(alpha?.lineItems) && alpha.lineItems.length === 2, 'expected alpha preview line items to include fee breakdown');
      assertCase((alpha?.lineItems || []).some((item) => item.feeType === 'admission'), 'expected alpha preview line items to include admission');
      assertCase((beta?.lineItems || []).some((item) => Number(item.netAmount || 0) < Number(item.grossAmount || 0)), 'expected beta preview line items to reflect relief reductions');
    });

    await check('route smoke: admin bills list accepts canonical class filter', async () => {
      const response = await request(server, `/api/finance/admin/bills?classId=${IDS.class1}`, {
        user: financeManagerUser
      });
      assertCase(response.status === 200, `expected 200, received ${response.status}`);
      assertCase(String(response.headers['x-deprecated-route'] || '') === 'true', 'expected deprecated route header on legacy bills list');
      assertCase(String(response.headers['x-replacement-endpoint'] || '').includes('/api/student-finance/orders'), 'expected canonical orders replacement endpoint');
      assertCase(Array.isArray(response.data?.items) && response.data.items.length >= 1, 'expected bill rows for canonical class filter');
    });

    await check('route smoke: admin receipts list is deprecated in favor of canonical student-finance payments', async () => {
      const response = await request(server, '/api/finance/admin/receipts?status=pending', {
        user: financeManagerUser
      });
      assertCase(response.status === 200, `expected 200, received ${response.status}`);
      assertCase(String(response.headers['x-deprecated-route'] || '') === 'true', 'expected deprecated route header on legacy receipts list');
      assertCase(String(response.headers['x-replacement-endpoint'] || '').includes('/api/student-finance/payments?status=pending'), 'expected canonical payments replacement endpoint');
      assertCase(Array.isArray(response.data?.items), 'expected receipts array payload');
    });

    await check('route smoke: finance reference-data exposes canonical class options', async () => {
      const response = await request(server, '/api/finance/admin/reference-data', {
        user: financeManagerUser
      });
      assertCase(response.status === 200, `expected 200, received ${response.status}`);
      assertCase(Array.isArray(response.data?.classes) && response.data.classes.length === 1, 'expected canonical class options');
      assertCase(String(response.data?.classes?.[0]?.classId || '') === IDS.class1, 'expected canonical class id in reference data');
      assertCase(String(response.data?.classes?.[0]?.courseId || '') === IDS.course1, 'expected compatibility course id in reference data');
    });

    await check('route smoke: expense category registry exposes seeded official categories and allows adding a new one', async () => {
      const listResponse = await request(server, '/api/finance/admin/expense-categories', {
        user: financeManagerUser
      });
      assertCase(listResponse.status === 200, `expected 200, received ${listResponse.status}`);
      assertCase((listResponse.data?.items || []).some((item) => item.key === 'admin'), 'expected seeded admin category');

      const createResponse = await request(server, '/api/finance/admin/expense-categories', {
        method: 'POST',
        user: financeManagerUser,
        body: {
          key: 'technology',
          label: 'Technology',
          description: 'Devices and classroom technology',
          colorTone: 'copper',
          subCategories: [
            { key: 'devices', label: 'Devices', order: 0 },
            { key: 'projectors', label: 'Projectors', order: 1 }
          ]
        }
      });
      assertCase(createResponse.status === 201, `expected 201, received ${createResponse.status}: ${createResponse.text}`);
      assertCase(createResponse.data?.item?.key === 'technology', 'expected created technology category');
      assertCase((createResponse.data?.item?.subCategories || []).length === 2, 'expected created subcategories');
    });

    await check('route smoke: treasury analytics expose balances, alerts, and recent transactions', async () => {
      const response = await request(server, '/api/finance/admin/treasury/analytics?financialYearId=fy-1&academicYearId=academic-year-1', {
        user: financeManagerUser
      });
      assertCase(response.status === 200, `expected 200, received ${response.status}`);
      assertCase(Number(response.data?.analytics?.summary?.accountCount || 0) >= 1, 'expected at least one treasury account');
      assertCase(Number(response.data?.analytics?.summary?.bookBalance || 0) > 0, 'expected positive book balance');
      assertCase((response.data?.analytics?.accounts || []).some((item) => String(item.code || '') === 'CASH-01'), 'expected seeded cashbox account');
      assertCase((response.data?.analytics?.alerts || []).some((item) => String(item.key || '') === 'unassigned_expense'), 'expected unassigned expense alert');
      assertCase((response.data?.analytics?.recentTransactions || []).some((item) => String(item.referenceNo || '') === 'TR-001'), 'expected seeded treasury transaction');
    });

    await check('route smoke: treasury report bundle returns cashbook, reconciliation, movement, and variance views', async () => {
      const response = await request(server, '/api/finance/admin/treasury/reports?financialYearId=fy-1&academicYearId=academic-year-1&accountId=treasury-account-1', {
        user: financeManagerUser
      });
      assertCase(response.status === 200, `expected 200, received ${response.status}`);
      assertCase(String(response.data?.reports?.selectedAccountId || '') === 'treasury-account-1', 'expected scoped treasury report account');
      assertCase((response.data?.reports?.cashbook?.rows || []).some((item) => String(item.referenceNo || '') === 'TR-001'), 'expected cashbook row');
      assertCase(Number(response.data?.reports?.movementSummary?.summary?.accountCount || 0) >= 1, 'expected movement summary account count');
      assertCase(Number(response.data?.reports?.reconciliation?.summary?.pendingCount || 0) >= 1, 'expected reconciliation summary');
      assertCase((response.data?.reports?.variance?.rows || []).some((item) => String(item.issueType || '') === 'unassigned_expense'), 'expected variance issue for unassigned expense');
    });

    await check('route smoke: treasury account, transaction, transfer, and reconciliation flow works end-to-end', async () => {
      const accountCreateResponse = await request(server, '/api/finance/admin/treasury/accounts', {
        method: 'POST',
        user: financeManagerUser,
        body: {
          financialYearId: 'fy-1',
          academicYearId: 'academic-year-1',
          title: 'Operations Bank',
          code: 'BANK-02',
          accountType: 'bank',
          openingBalance: 1800,
          currency: 'AFN',
          providerName: 'AIB',
          branchName: 'Kabul Main',
          accountNo: '222-0002',
          note: 'Operations treasury account.'
        }
      });
      assertCase(accountCreateResponse.status === 201, `expected 201, received ${accountCreateResponse.status}: ${accountCreateResponse.text}`);
      assertCase(String(accountCreateResponse.data?.item?.accountType || '') === 'bank', 'expected bank treasury account');
      const bankAccountId = String(accountCreateResponse.data?.item?._id || '');
      assertCase(Boolean(bankAccountId), 'expected created treasury account id');

      const manualTransactionResponse = await request(server, '/api/finance/admin/treasury/transactions', {
        method: 'POST',
        user: financeManagerUser,
        body: {
          accountId: bankAccountId,
          transactionType: 'withdrawal',
          amount: 250,
          transactionDate: '2026-03-22',
          referenceNo: 'BANK-WD-01',
          note: 'Petty cash support.'
        }
      });
      assertCase(manualTransactionResponse.status === 201, `expected 201, received ${manualTransactionResponse.status}: ${manualTransactionResponse.text}`);
      assertCase(String(manualTransactionResponse.data?.item?.transactionType || '') === 'withdrawal', 'expected withdrawal transaction type');
      assertCase(String(manualTransactionResponse.data?.item?.direction || '') === 'out', 'expected withdrawal to post as outflow');

      const transferResponse = await request(server, '/api/finance/admin/treasury/transfers', {
        method: 'POST',
        user: financeManagerUser,
        body: {
          sourceAccountId: 'treasury-account-1',
          destinationAccountId: bankAccountId,
          amount: 400,
          transactionDate: '2026-03-23',
          referenceNo: 'TRF-01',
          note: 'Top up bank reserve.'
        }
      });
      assertCase(transferResponse.status === 201, `expected 201, received ${transferResponse.status}: ${transferResponse.text}`);
      assertCase(String(transferResponse.data?.transactionGroupKey || '').length > 0, 'expected treasury transfer group key');
      assertCase((transferResponse.data?.items || []).length === 2, 'expected paired transfer transactions');

      const reconciliationResponse = await request(server, `/api/finance/admin/treasury/accounts/${bankAccountId}/reconcile`, {
        method: 'POST',
        user: financeManagerUser,
        body: {
          statementBalance: 2100,
          reconciliationDate: '2026-03-24',
          referenceNo: 'REC-01',
          note: 'Bank statement matched.',
          applyAdjustment: true
        }
      });
      assertCase(reconciliationResponse.status === 200, `expected 200, received ${reconciliationResponse.status}: ${reconciliationResponse.text}`);
      assertCase(Number(reconciliationResponse.data?.variance || 0) !== 0, 'expected reconciliation variance for adjustment path');
      assertCase(String(reconciliationResponse.data?.adjustment?.transactionType || '') === 'reconciliation_adjustment', 'expected reconciliation adjustment transaction');
      assertCase(Boolean(reconciliationResponse.data?.account?.lastReconciledAt), 'expected reconciled timestamp');

      const analyticsResponse = await request(server, `/api/finance/admin/treasury/analytics?financialYearId=fy-1&accountId=${bankAccountId}`, {
        user: financeManagerUser
      });
      assertCase(analyticsResponse.status === 200, `expected 200, received ${analyticsResponse.status}`);
      assertCase(Number(analyticsResponse.data?.analytics?.summary?.accountCount || 0) === 1, 'expected scoped treasury analytics');
      assertCase(Number(analyticsResponse.data?.analytics?.summary?.reconciledAccountCount || 0) === 1, 'expected reconciled account count');
      assertCase((analyticsResponse.data?.analytics?.recentTransactions || []).some((item) => String(item.referenceNo || '') === 'REC-01'), 'expected reconciliation transaction in recent activity');
      assertCase((analyticsResponse.data?.analytics?.recentTransactions || []).some((item) => String(item.referenceNo || '') === 'TRF-01'), 'expected transfer transaction in recent activity');
    });

    await check('route smoke: financial year budget vs actual returns live targets, treasury reserve, and category status', async () => {
      const response = await request(server, `/api/finance/admin/financial-years/fy-1/budget-vs-actual?classId=${IDS.class1}`, {
        user: financeManagerUser
      });
      assertCase(response.status === 200, `expected 200, received ${response.status}: ${response.text}`);
      assertCase(Number(response.data?.report?.summary?.annualExpenseBudget || 0) === 1500, `expected annual expense budget 1500, received ${response.data?.report?.summary?.annualExpenseBudget}`);
      assertCase(Number(response.data?.report?.summary?.treasuryReserveTarget || 0) === 3200, `expected treasury reserve target 3200, received ${response.data?.report?.summary?.treasuryReserveTarget}`);
      assertCase((response.data?.report?.categories || []).some((item) => String(item.categoryKey || '') === 'admin'), 'expected admin category budget row');
      assertCase(Number(response.data?.report?.treasury?.summary?.accountCount || 0) >= 1, 'expected treasury summary in budget report');
    });

    await check('route smoke: budget approval workflow progresses from request review to approved', async () => {
      const saveResponse = await request(server, '/api/finance/admin/financial-years/fy-1', {
        method: 'PATCH',
        user: financeManagerUser,
        body: {
          budgetTargets: {
            annualIncomeTarget: 12000,
            annualExpenseBudget: 1800,
            monthlyIncomeTarget: 1000,
            monthlyExpenseBudget: 220,
            treasuryReserveTarget: 3600,
            note: 'Updated annual budget',
            categoryBudgets: [
              { categoryKey: 'admin', label: 'Admin', annualBudget: 1250, monthlyBudget: 105, alertThresholdPercent: 85 }
            ]
          }
        }
      });
      assertCase(saveResponse.status === 200, `expected 200, received ${saveResponse.status}: ${saveResponse.text}`);
      assertCase(String(saveResponse.data?.item?.budgetApproval?.stage || '') === 'draft', 'expected draft budget stage after save');

      const requestReview = await request(server, '/api/finance/admin/financial-years/fy-1/budget/request-review', {
        method: 'POST',
        user: financeLeadUser,
        body: { note: 'Submit budget for review.' }
      });
      assertCase(requestReview.status === 200, `expected 200, received ${requestReview.status}: ${requestReview.text}`);
      assertCase(String(requestReview.data?.item?.budgetApproval?.stage || '') === 'finance_manager_review', 'expected finance manager budget review stage');

      const presidentApprove = await request(server, '/api/finance/admin/financial-years/fy-1/budget/review', {
        method: 'POST',
        user: presidentUser,
        body: { action: 'approve', note: 'President approved budget.' }
      });
      assertCase(presidentApprove.status === 200, `expected 200, received ${presidentApprove.status}: ${presidentApprove.text}`);
      assertCase(String(presidentApprove.data?.nextStage || '') === 'approved', 'expected approved budget stage');
      assertCase(String(presidentApprove.data?.item?.budgetApproval?.stage || '') === 'approved', 'expected approved budget payload');
      assertCase((presidentApprove.data?.item?.budgetApproval?.trail || []).length >= 3, 'expected budget approval trail');

      const revisionResponse = await request(server, '/api/finance/admin/financial-years/fy-1/budget/start-revision', {
        method: 'POST',
        user: financeManagerUser,
        body: { note: 'Need revised procurement ceiling.' }
      });
      assertCase(revisionResponse.status === 200, `expected 200, received ${revisionResponse.status}: ${revisionResponse.text}`);
      assertCase(Number(revisionResponse.data?.item?.budgetApproval?.version || 0) === 2, 'expected budget version to increment on revision start');
      assertCase(String(revisionResponse.data?.item?.budgetApproval?.stage || '') === 'draft', 'expected draft stage after revision start');
      assertCase((revisionResponse.data?.item?.budgetApproval?.revisionHistory || []).some((entry) => String(entry?.action || '') === 'revision_started'), 'expected revision history event');
    });

    await check('route smoke: procurement commitments support review workflow and expense linkage', async () => {
      const createResponse = await request(server, '/api/finance/admin/procurements', {
        method: 'POST',
        user: financeManagerUser,
        body: {
          financialYearId: 'fy-1',
          classId: IDS.class1,
          category: 'admin',
          subCategory: 'stationery',
          procurementType: 'vendor_commitment',
          title: 'Stationery bulk order',
          vendorName: 'Atlas Supplies',
          committedAmount: 1100,
          requestDate: '2026-03-21',
          expectedDeliveryDate: '2026-03-24',
          treasuryAccountId: 'treasury-account-1',
          referenceNo: 'PROC-001',
          paymentTerms: 'Net 15',
          note: 'Need procurement approval'
        }
      });
      assertCase(createResponse.status === 201, `expected 201, received ${createResponse.status}: ${createResponse.text}`);
      const procurementId = createResponse.data?.item?._id;
      assertCase(Boolean(procurementId), 'expected procurement id');

      const submitResponse = await request(server, `/api/finance/admin/procurements/${procurementId}/submit`, {
        method: 'POST',
        user: financeManagerUser,
        body: { note: 'Submit procurement for review.' }
      });
      assertCase(submitResponse.status === 200, `expected 200, received ${submitResponse.status}: ${submitResponse.text}`);
      assertCase(String(submitResponse.data?.item?.status || '') === 'pending_review', 'expected pending procurement review');

      const managerApprove = await request(server, `/api/finance/admin/procurements/${procurementId}/review`, {
        method: 'POST',
        user: financeManagerUser,
        body: { action: 'approve', note: 'Manager approved procurement.' }
      });
      assertCase(managerApprove.status === 200, `expected 200, received ${managerApprove.status}: ${managerApprove.text}`);
      assertCase(String(managerApprove.data?.nextStage || '') === 'finance_lead_review', 'expected finance lead procurement stage');

      const leadApprove = await request(server, `/api/finance/admin/procurements/${procurementId}/review`, {
        method: 'POST',
        user: financeLeadUser,
        body: { action: 'approve', note: 'Lead approved procurement.' }
      });
      assertCase(leadApprove.status === 200, `expected 200, received ${leadApprove.status}: ${leadApprove.text}`);
      assertCase(String(leadApprove.data?.nextStage || '') === 'general_president_review', 'expected general president procurement stage');

      const presidentApprove = await request(server, `/api/finance/admin/procurements/${procurementId}/review`, {
        method: 'POST',
        user: presidentUser,
        body: { action: 'approve', note: 'President approved procurement.' }
      });
      assertCase(presidentApprove.status === 200, `expected 200, received ${presidentApprove.status}: ${presidentApprove.text}`);
      assertCase(String(presidentApprove.data?.item?.status || '') === 'approved', 'expected approved procurement');

      const expenseResponse = await request(server, '/api/finance/admin/expenses', {
        method: 'POST',
        user: financeManagerUser,
        body: {
          financialYearId: 'fy-1',
          classId: IDS.class1,
          category: 'admin',
          subCategory: 'stationery',
          amount: 450,
          expenseDate: '2026-03-22',
          vendorName: 'Atlas Supplies',
          procurementCommitmentId: procurementId,
          treasuryAccountId: 'treasury-account-1',
          referenceNo: 'EXP-PROC-01',
          note: 'Linked procurement expense',
          status: 'pending_review'
        }
      });
      assertCase(expenseResponse.status === 201, `expected 201, received ${expenseResponse.status}: ${expenseResponse.text}`);
      const procurementExpenseId = expenseResponse.data?.item?._id;
      assertCase(String(expenseResponse.data?.item?.procurementCommitmentId || '') === procurementId, 'expected expense linked to procurement commitment');

      await request(server, `/api/finance/admin/expenses/${procurementExpenseId}/review`, {
        method: 'POST',
        user: financeManagerUser,
        body: { action: 'approve', note: 'Manager approved procurement expense.' }
      });
      await request(server, `/api/finance/admin/expenses/${procurementExpenseId}/review`, {
        method: 'POST',
        user: financeLeadUser,
        body: { action: 'approve', note: 'Lead approved procurement expense.' }
      });
      await request(server, `/api/finance/admin/expenses/${procurementExpenseId}/review`, {
        method: 'POST',
        user: presidentUser,
        body: { action: 'approve', note: 'President approved procurement expense.' }
      });

      const listResponse = await request(server, '/api/finance/admin/procurements?financialYearId=fy-1', {
        user: financeManagerUser
      });
      assertCase(listResponse.status === 200, `expected 200, received ${listResponse.status}: ${listResponse.text}`);
      const listedItem = (listResponse.data?.items || []).find((item) => String(item._id || '') === procurementId);
      assertCase(Boolean(listedItem), 'expected procurement in list');
      assertCase(Number(listedItem?.approvedExpenseAmount || 0) === 450, 'expected approved expense coverage on procurement');
      assertCase(Number(listedItem?.outstandingAmount || 0) === 650, 'expected outstanding procurement exposure');

      const settlementResponse = await request(server, `/api/finance/admin/procurements/${procurementId}/settlements`, {
        method: 'POST',
        user: financeManagerUser,
        body: {
          amount: 200,
          settlementDate: '2026-03-24',
          treasuryAccountId: 'treasury-account-1',
          referenceNo: 'SET-PROC-01',
          note: 'Initial vendor settlement.'
        }
      });
      assertCase(settlementResponse.status === 200, `expected 200, received ${settlementResponse.status}: ${settlementResponse.text}`);
      assertCase(Number(settlementResponse.data?.item?.settledAmount || 0) === 200, 'expected settled amount on procurement after settlement');
      assertCase(Number(settlementResponse.data?.item?.payableReadyAmount || 0) === 250, 'expected payable ready amount after settlement');
      assertCase(String(settlementResponse.data?.settlement?.referenceNo || '') === 'SET-PROC-01', 'expected settlement reference number');
    });

    await check('route smoke: government snapshot export pdf includes budget and procurement pack sections', async () => {
      const createResponse = await request(server, '/api/finance/admin/government-snapshots', {
        method: 'POST',
        user: financeManagerUser,
        body: {
          reportType: 'annual',
          financialYearId: 'fy-1',
          academicYearId: 'academic-year-1',
          classId: IDS.class1,
          isOfficial: true
        }
      });
      assertCase(createResponse.status === 201, `expected 201, received ${createResponse.status}: ${createResponse.text}`);
      const snapshotId = createResponse.data?.item?._id;
      assertCase(Boolean(snapshotId), 'expected government snapshot id');
      assertCase(Boolean(createResponse.data?.item?.pack?.budgetApproval), 'expected budget approval in snapshot pack');
      assertCase(Boolean(createResponse.data?.item?.pack?.procurementAnalytics), 'expected procurement analytics in snapshot pack');

      const pdfResponse = await request(server, `/api/finance/admin/government-snapshots/${snapshotId}/export.pdf`, {
        user: financeManagerUser
      });
      assertCase(pdfResponse.status === 200, `expected 200, received ${pdfResponse.status}: ${pdfResponse.text}`);
      assertCase(String(pdfResponse.headers['content-type'] || '').includes('application/pdf'), 'expected government snapshot pdf content type');
      assertCase(String(pdfResponse.buffer.slice(0, 4).toString('utf8')) === '%PDF', 'expected PDF signature');
      const archiveResponse = await request(server, '/api/finance/admin/document-archive?documentType=government_snapshot_pack&academicYearId=academic-year-1&limit=5', {
        user: financeManagerUser
      });
      assertCase(archiveResponse.status === 200, `expected 200, received ${archiveResponse.status}: ${archiveResponse.text}`);
      assertCase((archiveResponse.data?.items || []).some((item) => String(item.documentType || '') === 'government_snapshot_pack'), 'expected government snapshot archive item');
    });

    await check('route smoke: expense governance review chain blocks year close until approval is complete', async () => {
      const createResponse = await request(server, '/api/finance/admin/expenses', {
        method: 'POST',
        user: financeManagerUser,
        body: {
          financialYearId: 'fy-1',
          classId: IDS.class1,
          category: 'technology',
          subCategory: 'devices',
          amount: 950,
          expenseDate: '2026-03-20',
          vendorName: 'Atlas Supplies',
          referenceNo: 'GF-2026-009',
          note: 'Technology refresh',
          status: 'pending_review'
        }
      });
      assertCase(createResponse.status === 201, `expected 201, received ${createResponse.status}: ${createResponse.text}`);
      assertCase(createResponse.data?.item?.status === 'pending_review', 'expected pending_review status');
      assertCase(createResponse.data?.item?.approvalStage === 'finance_manager_review', 'expected finance_manager_review stage');
      const expenseId = createResponse.data?.item?._id;
      assertCase(Boolean(expenseId), 'expected created expense id');

      const analyticsResponse = await request(server, '/api/finance/admin/expenses/analytics?financialYearId=fy-1', {
        user: financeManagerUser
      });
      assertCase(analyticsResponse.status === 200, `expected 200, received ${analyticsResponse.status}`);
      assertCase(Number(analyticsResponse.data?.analytics?.summary?.queueCount || 0) >= 1, 'expected analytics queue count');
      assertCase((analyticsResponse.data?.analytics?.registry || []).some((item) => item.key === 'technology'), 'expected technology in analytics registry');

      const blockedCloseResponse = await request(server, '/api/finance/admin/financial-years/fy-1/close', {
        method: 'POST',
        user: financeManagerUser,
        body: { note: 'Attempting close with pending queue.' }
      });
      assertCase(blockedCloseResponse.status === 409, `expected 409, received ${blockedCloseResponse.status}`);
      assertCase(String(blockedCloseResponse.data?.code || '') === 'finance_financial_year_close_blocked', 'expected close blocked code');
      assertCase(Number(blockedCloseResponse.data?.readiness?.blockerCount || 0) >= 1, 'expected close blockers');

      const managerReview = await request(server, `/api/finance/admin/expenses/${expenseId}/review`, {
        method: 'POST',
        user: financeManagerUser,
        body: { action: 'approve', note: 'Finance manager approved.' }
      });
      assertCase(managerReview.status === 200, `expected 200, received ${managerReview.status}: ${managerReview.text}`);
      assertCase(managerReview.data?.nextStage === 'finance_lead_review', 'expected finance_lead_review next stage');

      const leadReview = await request(server, `/api/finance/admin/expenses/${expenseId}/review`, {
        method: 'POST',
        user: financeLeadUser,
        body: { action: 'approve', note: 'Finance lead approved.' }
      });
      assertCase(leadReview.status === 200, `expected 200, received ${leadReview.status}: ${leadReview.text}`);
      assertCase(leadReview.data?.nextStage === 'general_president_review', 'expected general_president_review next stage');

      const presidentReview = await request(server, `/api/finance/admin/expenses/${expenseId}/review`, {
        method: 'POST',
        user: presidentUser,
        body: { action: 'approve', note: 'President approved.' }
      });
      assertCase(presidentReview.status === 200, `expected 200, received ${presidentReview.status}: ${presidentReview.text}`);
      assertCase(presidentReview.data?.nextStage === 'completed', 'expected completed next stage');
      assertCase(presidentReview.data?.item?.status === 'approved', 'expected approved status after president review');

      const closeReadinessResponse = await request(server, '/api/finance/admin/financial-years/fy-1/close-readiness', {
        user: financeManagerUser
      });
      assertCase(closeReadinessResponse.status === 200, `expected 200, received ${closeReadinessResponse.status}`);
      assertCase(closeReadinessResponse.data?.readiness?.canClose === true, 'expected ready-to-close response');

      const closeResponse = await request(server, '/api/finance/admin/financial-years/fy-1/close', {
        method: 'POST',
        user: financeManagerUser,
        body: { note: 'Queue resolved.' }
      });
      assertCase(closeResponse.status === 200, `expected 200, received ${closeResponse.status}: ${closeResponse.text}`);
      assertCase(closeResponse.data?.item?.isClosed === true, 'expected financial year to close');
      assertCase(closeResponse.data?.item?.status === 'closed', 'expected closed financial year status');
    });

    await check('route smoke: creating another financial year for the same academic year returns a clear duplicate message', async () => {
      const response = await request(server, '/api/finance/admin/financial-years', {
        method: 'POST',
        user: financeManagerUser,
        body: {
          academicYearId: 'academic-year-1',
          title: 'Financial Year 1405 Copy',
          code: 'FY1405-COPY',
          startDate: '2027-01-01',
          endDate: '2027-12-31',
          dailyFeePercent: 2,
          yearlyFeePercent: 10
        }
      });

      assertCase(response.status === 409, `expected 409, received ${response.status}: ${response.text}`);
      assertCase(
        String(response.data?.message || '').includes('برای این سال تعلیمی قبلاً سال مالی ثبت شده است'),
        'expected duplicate academic year guidance'
      );
    });

    await check('route smoke: fee plans accept canonical class scope with fee breakdown', async () => {
      const response = await request(server, '/api/finance/admin/fee-plans', {
        method: 'POST',
        user: financeManagerUser,
        body: {
          title: 'Term 1 Fee',
          classId: IDS.class1,
          academicYearId: 'academic-year-1',
          term: '1',
          billingFrequency: 'term',
          tuitionFee: 1200,
          admissionFee: 300,
          examFee: 150,
          documentFee: 50,
          transportDefaultFee: 200,
          dueDay: 8
        }
      });
      assertCase(response.status === 200, `expected 200, received ${response.status}: ${response.text}`);
      assertCase(String(response.data?.item?.classId || response.data?.item?.schoolClass?._id || '') === IDS.class1, 'expected canonical class scope on fee plan');
      assertCase(String(response.data?.item?.courseId || response.data?.item?.course?._id || '') === IDS.course1, 'expected compatibility course on fee plan');
      assertCase(String(response.data?.item?.academicYearId || response.data?.item?.academicYear?._id || '') === 'academic-year-1', 'expected canonical academicYearId on fee plan');
      assertCase(Number(response.data?.item?.tuitionFee || 0) === 1200, 'expected tuitionFee breakdown');
      assertCase(Number(response.data?.item?.admissionFee || 0) === 300, 'expected admissionFee breakdown');

      const listResponse = await request(server, `/api/finance/admin/fee-plans?classId=${IDS.class1}`, {
        user: financeManagerUser
      });
      assertCase(listResponse.status === 200, `expected 200, received ${listResponse.status}`);
      assertCase(Array.isArray(listResponse.data?.items) && listResponse.data.items.length >= 1, 'expected class-scoped fee plans');
      assertCase(listResponse.data?.items?.[0]?.academicYear?.title === '1405', 'expected academic year payload in fee plans list');
    });

    await check('route smoke: admin receipts list deprecates course-only filter in favor of classId', async () => {
      const response = await request(server, `/api/finance/admin/receipts?courseId=${IDS.course1}`, {
        user: financeManagerUser
      });
      assertCase(response.status === 200, `expected 200, received ${response.status}`);
      assertCase(String(response.headers['x-deprecated-route'] || '') === 'true', 'expected deprecated-route header');
      assertCase(String(response.headers['x-replacement-endpoint'] || '').includes(`classId=${IDS.class1}`), 'expected canonical class replacement endpoint');
    });

    await check('route smoke: legacy student finance summary is retired in favor of canonical membership overviews', async () => {
      const response = await request(server, '/api/finance/student/me', {
        user: studentOneUser
      });
      assertCase(response.status === 410, `expected 410, received ${response.status}`);
      assertCase(String(response.headers['x-deprecated-route'] || '') === 'true', 'expected deprecated route header');
      assertCase(String(response.headers['x-replacement-endpoint'] || '').includes('/api/student-finance/me/overviews'), 'expected canonical student finance replacement');
      assertCase(response.data?.retired === true, 'expected retired flag in response payload');
      assertCase(String(response.data?.replacementEndpoint || '').includes('/api/student-finance/me/overviews'), 'expected retired payload replacement endpoint');
    });

    await check('route smoke: class finance report returns canonical class totals', async () => {
      const response = await request(server, '/api/finance/admin/reports/by-class', {
        user: financeManagerUser
      });
      assertCase(response.status === 200, `expected 200, received ${response.status}`);
      const item = (response.data?.items || []).find((entry) => String(entry.classId || '') === IDS.class1);
      assertCase(Boolean(item), 'expected canonical class report row');
      assertCase(Number(item?.due || 0) >= 3400, 'expected aggregated due amount for class');
    });

    await check('route smoke: class finance report accepts canonical class filter', async () => {
      const response = await request(server, `/api/finance/admin/reports/by-class?classId=${IDS.class1}`, {
        user: financeManagerUser
      });
      assertCase(response.status === 200, `expected 200, received ${response.status}`);
      assertCase((response.data?.items || []).every((entry) => String(entry.classId || '') === IDS.class1), 'expected class-scoped report rows');
    });

    await check('route smoke: aging report accepts canonical class filter and deprecates course-only filter', async () => {
      const classResponse = await request(server, `/api/finance/admin/reports/aging?classId=${IDS.class1}`, {
        user: financeManagerUser
      });
      assertCase(classResponse.status === 200, `expected 200, received ${classResponse.status}`);
      assertCase((classResponse.data?.rows || []).every((entry) => String(entry.classId || '') === IDS.class1), 'expected class-scoped aging rows');

      const courseResponse = await request(server, `/api/finance/admin/reports/aging?courseId=${IDS.course1}`, {
        user: financeManagerUser
      });
      assertCase(courseResponse.status === 200, `expected 200, received ${courseResponse.status}`);
      assertCase(String(courseResponse.headers['x-deprecated-route'] || '') === 'true', 'expected deprecated route header for course-only aging');
      assertCase(String(courseResponse.headers['x-replacement-endpoint'] || '').includes(`classId=${IDS.class1}`), 'expected canonical class aging replacement');
    });

    await check('route smoke: cashflow report accepts canonical class filter and deprecates course-only filter', async () => {
      const queryWindow = 'from=2026-03-01&to=2026-03-31';
      const classResponse = await request(server, `/api/finance/admin/reports/cashflow?classId=${IDS.class1}&${queryWindow}`, {
        user: financeManagerUser
      });
      assertCase(classResponse.status === 200, `expected 200, received ${classResponse.status}`);
      assertCase(Array.isArray(classResponse.data?.items) && classResponse.data.items.length >= 1, 'expected class-scoped cashflow rows');
      assertCase(Number(classResponse.data?.total || 0) >= 300, 'expected scoped cashflow total');

      const courseResponse = await request(server, `/api/finance/admin/reports/cashflow?courseId=${IDS.course1}&${queryWindow}`, {
        user: financeManagerUser
      });
      assertCase(courseResponse.status === 200, `expected 200, received ${courseResponse.status}`);
      assertCase(String(courseResponse.headers['x-deprecated-route'] || '') === 'true', 'expected deprecated route header for course-only cashflow');
      assertCase(String(courseResponse.headers['x-replacement-endpoint'] || '').includes(`classId=${IDS.class1}`), 'expected canonical class cashflow replacement');
    });

    await check('route smoke: legacy by-course finance report is retired with canonical replacement metadata', async () => {
      const response = await request(server, '/api/finance/admin/reports/by-course', {
        user: financeManagerUser
      });
      assertCase(response.status === 410, `expected 410, received ${response.status}`);
      assertCase(String(response.headers['x-deprecated-route'] || '') === 'true', 'expected deprecated route header');
      assertCase(String(response.headers['x-replacement-endpoint'] || '').includes('/api/finance/admin/reports/by-class'), 'expected canonical class report replacement');
      assertCase(response.data?.retired === true, 'expected retired flag in response payload');
      assertCase(String(response.data?.replacementEndpoint || '').includes('/api/finance/admin/reports/by-class'), 'expected retired payload replacement endpoint');
    });

    await check('route smoke: legacy finance receipt follow-up route is retired with canonical replacement metadata', async () => {
      const updateResponse = await request(server, '/api/finance/admin/receipts/receipt-1/follow-up', {
        method: 'POST',
        user: financeManagerUser,
        body: {
          assignedLevel: 'finance_lead',
          status: 'in_progress',
          note: 'Need finance lead review'
        }
      });
      assertCase(updateResponse.status === 410, `expected 410, received ${updateResponse.status}: ${updateResponse.text}`);
      assertCase(String(updateResponse.headers['x-deprecated-route'] || '') === 'true', 'expected deprecated route header');
      assertCase(String(updateResponse.headers['x-replacement-endpoint'] || '').includes('/api/student-finance/payments/:feePaymentId/follow-up'), 'expected canonical follow-up replacement endpoint');
      assertCase(updateResponse.data?.retired === true, 'expected retired payload');
    });

    await check('route smoke: legacy finance bill action routes are retired with canonical order replacements', async () => {
      const discountResponse = await request(server, '/api/finance/admin/bills/bill-1/discount', {
        method: 'POST',
        user: financeManagerUser,
        body: { type: 'discount', amount: 40, reason: 'Legacy test' }
      });
      assertCase(discountResponse.status === 410, `expected 410, received ${discountResponse.status}: ${discountResponse.text}`);
      assertCase(String(discountResponse.headers['x-replacement-endpoint'] || '').includes('/api/student-finance/orders/:feeOrderId/discount'), 'expected canonical discount replacement endpoint');

      const installmentsResponse = await request(server, '/api/finance/admin/bills/bill-1/installments', {
        method: 'POST',
        user: financeManagerUser,
        body: { count: 2 }
      });
      assertCase(installmentsResponse.status === 410, `expected 410, received ${installmentsResponse.status}: ${installmentsResponse.text}`);
      assertCase(String(installmentsResponse.headers['x-replacement-endpoint'] || '').includes('/api/student-finance/orders/:feeOrderId/installments'), 'expected canonical installments replacement endpoint');

      const voidResponse = await request(server, '/api/finance/admin/bills/bill-1/void', {
        method: 'POST',
        user: financeManagerUser,
        body: { reason: 'Legacy test' }
      });
      assertCase(voidResponse.status === 410, `expected 410, received ${voidResponse.status}: ${voidResponse.text}`);
      assertCase(String(voidResponse.headers['x-replacement-endpoint'] || '').includes('/api/student-finance/orders/:feeOrderId/void'), 'expected canonical void replacement endpoint');
    });

    await check('route smoke: student receipt submission blocks another pending receipt on the same bill', async () => {
      const response = await request(server, '/api/finance/student/receipts', {
        method: 'POST',
        user: studentOneUser,
        body: createReceiptForm({
          billId: 'bill-2',
          amount: 100,
          paymentMethod: 'manual',
          paidAt: '2026-03-06'
        })
      });
      assertCase(response.status === 409, `expected 409, received ${response.status}: ${response.text}`);
      assertCase(Boolean(response.data?.pendingReceiptId), 'expected pendingReceiptId');
    });

    await check('route smoke: student receipt submission blocks duplicate reference numbers for one bill', async () => {
      const response = await request(server, '/api/finance/student/receipts', {
        method: 'POST',
        user: studentOneUser,
        body: createReceiptForm({
          billId: 'bill-3',
          amount: 300,
          paymentMethod: 'bank_transfer',
          referenceNo: 'TX-1',
          paidAt: '2026-03-08'
        })
      });
      assertCase(response.status === 409, `expected 409, received ${response.status}: ${response.text}`);
      assertCase(Boolean(response.data?.duplicateReceiptId), 'expected duplicateReceiptId');
    });

    await check('route smoke: student receipt submission accepts a valid receipt', async () => {
      const response = await request(server, '/api/finance/student/receipts', {
        method: 'POST',
        user: studentTwoUser,
        body: createReceiptForm({
          billId: 'bill-4',
          amount: 450,
          paymentMethod: 'cash',
          referenceNo: 'CASH-450',
          paidAt: '2026-03-08'
        })
      });
      assertCase(response.status === 201, `expected 201, received ${response.status}: ${response.text}`);
      assertCase(response.data?.receipt?.approvalStage === 'finance_manager_review', 'expected finance_manager_review stage');
    });

    await check('route smoke: legacy finance receipt approval and rejection routes are retired with canonical payment replacements', async () => {
      const pendingReceipt = receipts.find((item) => item.referenceNo === 'CASH-450');
      assertCase(Boolean(pendingReceipt), 'expected pending receipt to exist');

      const approveResponse = await request(server, `/api/finance/admin/receipts/${pendingReceipt._id}/approve`, {
        method: 'POST',
        user: financeManagerUser,
        body: { note: 'Manager review complete' }
      });
      assertCase(approveResponse.status === 410, `expected 410, received ${approveResponse.status}`);
      assertCase(String(approveResponse.headers['x-replacement-endpoint'] || '').includes('/api/student-finance/payments/:feePaymentId/approve'), 'expected canonical payment approve replacement');
      assertCase(approveResponse.data?.retired === true, 'expected retired approve payload');

      const rejectResponse = await request(server, `/api/finance/admin/receipts/${pendingReceipt._id}/reject`, {
        method: 'POST',
        user: financeManagerUser,
        body: { reason: 'Legacy reject test' }
      });
      assertCase(rejectResponse.status === 410, `expected 410, received ${rejectResponse.status}`);
      assertCase(String(rejectResponse.headers['x-replacement-endpoint'] || '').includes('/api/student-finance/payments/:feePaymentId/reject'), 'expected canonical payment reject replacement');
      assertCase(rejectResponse.data?.retired === true, 'expected retired reject payload');
    });

    await check('route smoke: month close approval workflow closes the month and blocks future bill creation inside the closed month', async () => {
      const requestResponse = await request(server, '/api/finance/admin/month-close', {
        method: 'POST',
        user: financeManagerUser,
        body: { monthKey: '2026-01', note: 'Ready for manager review' }
      });
      assertCase(requestResponse.status === 201, `expected 201, received ${requestResponse.status}`);
      assertCase(requestResponse.data?.item?.status === 'pending_review', 'expected pending_review status after request');
      assertCase(requestResponse.data?.item?.approvalStage === 'finance_manager_review', 'expected finance_manager_review stage');

      const monthCloseId = requestResponse.data?.item?._id;
      assertCase(Boolean(monthCloseId), 'expected month close request id');

      const managerApproveResponse = await request(server, `/api/finance/admin/month-close/${monthCloseId}/approve`, {
        method: 'POST',
        user: financeManagerUser,
        body: { note: 'Manager approved the package' }
      });
      assertCase(managerApproveResponse.status === 200, `expected 200, received ${managerApproveResponse.status}`);
      assertCase(managerApproveResponse.data?.item?.approvalStage === 'finance_lead_review', 'expected finance_lead_review stage');

      const leadApproveResponse = await request(server, `/api/finance/admin/month-close/${monthCloseId}/approve`, {
        method: 'POST',
        user: financeLeadUser,
        body: { note: 'Lead approved the package' }
      });
      assertCase(leadApproveResponse.status === 200, `expected 200, received ${leadApproveResponse.status}`);
      assertCase(leadApproveResponse.data?.item?.approvalStage === 'general_president_review', 'expected general_president_review stage');

      const closeResponse = await request(server, `/api/finance/admin/month-close/${monthCloseId}/approve`, {
        method: 'POST',
        user: presidentUser,
        body: { note: 'Final close approved' }
      });
      assertCase(closeResponse.status === 200, `expected 200, received ${closeResponse.status}`);
      assertCase(closeResponse.data?.item?.status === 'closed', 'expected month status closed');

      const pdfResponse = await request(server, `/api/finance/admin/month-close/${monthCloseId}/export.pdf`, {
        user: financeManagerUser
      });
      assertCase(pdfResponse.status === 200, `expected 200, received ${pdfResponse.status}`);
      assertCase(String(pdfResponse.headers['content-type'] || '').includes('application/pdf'), 'expected month close pdf content-type');
      assertCase(String(pdfResponse.headers['content-disposition'] || '').includes('.pdf'), 'expected month close pdf attachment filename');
      assertCase(String(pdfResponse.text || '').startsWith('%PDF'), 'expected month close pdf payload');

      const createResponse = await request(server, '/api/finance/admin/bills', {
        method: 'POST',
        user: financeManagerUser,
        body: {
          studentId: IDS.student2,
          courseId: IDS.course1,
          amount: 600,
          dueDate: '2026-01-25',
          issuedAt: '2026-01-14',
          academicYear: '1405',
          term: '6',
          periodType: 'term',
          periodLabel: ''
        }
      });
      assertCase(createResponse.status === 400, `expected 400, received ${createResponse.status}`);
    });

    await check('route smoke: finance document archive list, verification, and batch export work end-to-end', async () => {
      const listResponse = await request(server, '/api/finance/admin/document-archive?limit=5', {
        user: financeManagerUser
      });
      assertCase(listResponse.status === 200, `expected 200, received ${listResponse.status}`);
      assertCase(Array.isArray(listResponse.data?.items), 'expected document archive items array');
      assertCase((listResponse.data?.items || []).some((item) => String(item.documentType || '') === 'month_close_pack'), 'expected month close archive item in list');

      const firstDocument = listResponse.data?.items?.[0];
      assertCase(Boolean(firstDocument?.verification?.code || firstDocument?.verificationCode), 'expected verification code on archive item');
      const verificationCode = encodeURIComponent(firstDocument?.verification?.code || firstDocument?.verificationCode || '');
      const verifyResponse = await request(server, `/api/finance/documents/verify/${verificationCode}`);
      assertCase(verifyResponse.status === 200, `expected 200, received ${verifyResponse.status}`);
      assertCase(verifyResponse.data?.item?.documentNo === firstDocument?.documentNo, 'expected verified document to match archive item');

      const deliverResponse = await request(server, `/api/finance/admin/document-archive/${firstDocument?._id}/deliver`, {
        method: 'POST',
        user: financeManagerUser,
        body: {
          channel: 'email',
          recipientHandles: 'family@example.com',
          includeLinkedAudience: false,
          note: 'Manual resend for archive verification'
        }
      });
      assertCase(deliverResponse.status === 200, `expected 200, received ${deliverResponse.status}`);
      assertCase(deliverResponse.data?.item?.deliveryLog?.length >= 1, 'expected delivery log entry after archive send');
      assertCase(String(deliverResponse.data?.item?.lastDeliveryStatus || '') !== '', 'expected archive delivery status');
      assertCase(String(deliverResponse.data?.item?.deliveryLog?.[0]?.provider || '') === 'smtp', 'expected smtp provider on archive delivery log');

      const batchResponse = await request(server, '/api/finance/admin/documents/batch-statements.zip', {
        method: 'POST',
        user: financeManagerUser,
        body: {
          classId: IDS.class1,
          academicYearId: 'academic-year-1',
          monthKey: '2026-03'
        }
      });
      assertCase(batchResponse.status === 200, `expected 200, received ${batchResponse.status}`);
      assertCase(String(batchResponse.headers['content-type'] || '').includes('application/zip'), 'expected batch export zip content-type');
      assertCase(String(batchResponse.headers['content-disposition'] || '').includes('.zip'), 'expected batch export filename');
      assertCase(String(batchResponse.headers['x-finance-document-no'] || '').length > 0, 'expected batch export document number header');
      assertCase(archivedDocuments.some((item) => String(item.documentType || '') === 'batch_statement_pack'), 'expected batch archive document to be recorded');
      assertCase(archivedDocuments.some((item) => String(item.documentType || '') === 'student_statement'), 'expected child statement archive documents to be recorded');
    });

    await check('route smoke: finance delivery provider configs list and save current channel setup', async () => {
      const listResponse = await request(server, '/api/finance/admin/delivery-providers', {
        user: financeManagerUser
      });
      assertCase(listResponse.status === 200, `expected 200, received ${listResponse.status}`);
      assertCase(Array.isArray(listResponse.data?.items), 'expected provider config list');
      assertCase((listResponse.data?.items || []).some((item) => String(item.channel || '') === 'sms'), 'expected sms provider config');

      const saveResponse = await request(server, '/api/finance/admin/delivery-providers/sms', {
        method: 'POST',
        user: financeManagerUser,
        body: {
          mode: 'twilio',
          provider: 'twilio_sms_gateway',
          fromHandle: '+93700999000',
          accountSid: 'AC1234567890',
          authToken: 'secret-token-12345',
          webhookToken: 'sms-hook-token',
          note: 'Production SMS setup'
        }
      });
      assertCase(saveResponse.status === 200, `expected 200, received ${saveResponse.status}: ${saveResponse.text}`);
      assertCase(String(saveResponse.data?.item?.mode || '') === 'twilio', 'expected saved twilio mode');
      assertCase(String(saveResponse.data?.item?.provider || '') === 'twilio_sms_gateway', 'expected provider name on saved config');
      assertCase(saveResponse.data?.item?.fields?.authToken?.configured === true, 'expected masked auth token status');
      assertCase(String(saveResponse.data?.item?.readiness?.providerKey || '') === 'twilio', 'expected twilio provider key');
      assertCase(String(saveResponse.data?.item?.readiness?.webhookPath || '').includes('/api/finance/delivery/providers/twilio/status'), 'expected twilio webhook path');

      const rotateResponse = await request(server, '/api/finance/admin/delivery-providers/sms/rotate', {
        method: 'POST',
        user: financeManagerUser,
        body: {
          authToken: 'secret-token-rotated',
          note: 'Monthly rotation'
        }
      });
      assertCase(rotateResponse.status === 200, `expected 200, received ${rotateResponse.status}`);
      assertCase(Number(rotateResponse.data?.item?.credentialVersion || 0) >= 2, 'expected credential version bump after rotation');
      assertCase((rotateResponse.data?.item?.auditTrail || []).some((entry) => String(entry.action || '') === 'credentials_rotated'), 'expected rotation audit entry');
    });

    await check('route smoke: finance delivery campaigns create, run, and toggle status', async () => {
      const templatesResponse = await request(server, '/api/finance/admin/delivery-campaigns/templates', {
        user: financeManagerUser
      });
      assertCase(templatesResponse.status === 200, `expected 200, received ${templatesResponse.status}`);
      assertCase((templatesResponse.data?.items || []).some((item) => String(item.key || '') === 'monthly_statement'), 'expected monthly_statement template');
      assertCase((templatesResponse.data?.variables || []).some((item) => String(item.key || '') === 'documentNo'), 'expected documentNo variable in catalog');

      const draftTemplateResponse = await request(server, '/api/finance/admin/delivery-campaigns/templates/monthly_statement/draft', {
        method: 'POST',
        user: financeManagerUser,
        body: {
          subject: 'Custom statement {{documentNo}}',
          body: 'Custom body {{documentNo}} for {{subjectName}}',
          changeNote: 'Version 2 draft'
        }
      });
      assertCase(draftTemplateResponse.status === 200, `expected 200, received ${draftTemplateResponse.status}`);
      assertCase(Number(draftTemplateResponse.data?.item?.draftVersionNumber || 0) >= 2, 'expected custom draft version');
      assertCase(draftTemplateResponse.data?.item?.approvalSummary?.draft >= 1, 'expected draft approval summary');

      const reviewTemplateResponse = await request(server, '/api/finance/admin/delivery-campaigns/templates/monthly_statement/review', {
        method: 'POST',
        user: financeManagerUser,
        body: {
          versionNumber: Number(draftTemplateResponse.data?.item?.draftVersionNumber || 0),
          note: 'Send to finance lead'
        }
      });
      assertCase(reviewTemplateResponse.status === 200, `expected 200, received ${reviewTemplateResponse.status}`);
      assertCase(Number(reviewTemplateResponse.data?.item?.pendingReviewVersionNumber || 0) >= 2, 'expected pending review version');

      const approveTemplateResponse = await request(server, '/api/finance/admin/delivery-campaigns/templates/monthly_statement/approve', {
        method: 'POST',
        user: financeManagerUser,
        body: {
          versionNumber: Number(draftTemplateResponse.data?.item?.draftVersionNumber || 0),
          note: 'Lead approved the template'
        }
      });
      assertCase(approveTemplateResponse.status === 200, `expected 200, received ${approveTemplateResponse.status}`);
      assertCase(approveTemplateResponse.data?.item?.approvalSummary?.approved >= 2, 'expected approved template version summary');

      const publishTemplateResponse = await request(server, '/api/finance/admin/delivery-campaigns/templates/monthly_statement/publish', {
        method: 'POST',
        user: financeManagerUser,
        body: {
          versionNumber: Number(draftTemplateResponse.data?.item?.draftVersionNumber || 0)
        }
      });
      assertCase(publishTemplateResponse.status === 200, `expected 200, received ${publishTemplateResponse.status}`);
      assertCase(Number(publishTemplateResponse.data?.item?.publishedVersionNumber || 0) >= 2, 'expected published custom template version');

      const rollbackTemplateResponse = await request(server, '/api/finance/admin/delivery-campaigns/templates/monthly_statement/rollback', {
        method: 'POST',
        user: financeManagerUser,
        body: {
          versionNumber: 1
        }
      });
      assertCase(rollbackTemplateResponse.status === 200, `expected 200, received ${rollbackTemplateResponse.status}`);
      assertCase(Number(rollbackTemplateResponse.data?.item?.publishedVersionNumber || 0) === 1, 'expected rollback to baseline template version');

      const previewResponse = await request(server, '/api/finance/admin/delivery-campaigns/template-preview', {
        method: 'POST',
        user: financeManagerUser,
        body: {
          documentType: 'batch_statement_pack',
          classId: IDS.class1,
          academicYearId: 'academic-year-1',
          monthKey: '2026-03',
          messageTemplateKey: 'monthly_statement',
          messageTemplateSubject: 'Finance statement {{documentNo}}',
          messageTemplateBody: 'Statement {{documentNo}} for {{subjectName}} is ready.'
        }
      });
      assertCase(previewResponse.status === 200, `expected 200, received ${previewResponse.status}`);
      assertCase(String(previewResponse.data?.preview?.renderedSubject || '').includes('MCP-202603-001'), 'expected rendered subject preview');
      assertCase((previewResponse.data?.preview?.usedVariables || []).includes('subjectName'), 'expected subjectName variable in preview');
      assertCase(typeof previewResponse.data?.preview?.rolloutPreview?.matchedArchiveCount === 'number', 'expected rollout preview count');

      const createResponse = await request(server, '/api/finance/admin/delivery-campaigns', {
        method: 'POST',
        user: financeManagerUser,
        body: {
          name: 'Monthly statement campaign',
          documentType: 'batch_statement_pack',
          channel: 'email',
          classId: IDS.class1,
          academicYearId: 'academic-year-1',
          monthKey: '2026-03',
          messageTemplateKey: 'monthly_statement',
          messageTemplateSubject: 'Finance statement {{documentNo}}',
          messageTemplateBody: 'Statement {{documentNo}} for {{subjectName}} is ready.',
          recipientHandles: ['finance@example.com', 'director@example.com'],
          includeLinkedAudience: false,
          automationEnabled: true,
          intervalHours: 24,
          maxDocumentsPerRun: 5
        }
      });
      assertCase(createResponse.status === 201, `expected 201, received ${createResponse.status}: ${createResponse.text}`);
      assertCase(String(createResponse.data?.item?.status || '') === 'active', 'expected active campaign status');
      assertCase(createResponse.data?.item?.automationEnabled === true, 'expected automation enabled');
      assertCase(String(createResponse.data?.item?.messageTemplateKey || '') === 'monthly_statement', 'expected template key on campaign');
      const campaignId = createResponse.data?.item?._id;
      assertCase(Boolean(campaignId), 'expected delivery campaign id');

      const listResponse = await request(server, '/api/finance/admin/delivery-campaigns?limit=5', {
        user: financeManagerUser
      });
      assertCase(listResponse.status === 200, `expected 200, received ${listResponse.status}`);
      assertCase((listResponse.data?.items || []).some((item) => String(item._id || '') === String(campaignId)), 'expected campaign in list');

      const runResponse = await request(server, `/api/finance/admin/delivery-campaigns/${campaignId}/run`, {
        method: 'POST',
        user: financeManagerUser
      });
      assertCase(runResponse.status === 200, `expected 200, received ${runResponse.status}: ${runResponse.text}`);
      assertCase(Number(runResponse.data?.summary?.deliveredDocuments || 0) >= 1, 'expected delivered document count');
      assertCase(String(runResponse.data?.item?.lastRunStatus || '') === 'success', 'expected success run status');

      const queueResponse = await request(server, '/api/finance/admin/delivery-campaigns/run-due', {
        method: 'POST',
        user: financeManagerUser
      });
      assertCase(queueResponse.status === 200, `expected 200, received ${queueResponse.status}`);
      assertCase(Number(queueResponse.data?.result?.executed || 0) >= 1, 'expected executed due campaign count');

      const pauseResponse = await request(server, `/api/finance/admin/delivery-campaigns/${campaignId}/status`, {
        method: 'POST',
        user: financeManagerUser,
        body: { status: 'paused' }
      });
      assertCase(pauseResponse.status === 200, `expected 200, received ${pauseResponse.status}: ${pauseResponse.text}`);
      assertCase(String(pauseResponse.data?.item?.status || '') === 'paused', 'expected paused campaign status');
    });

    await check('route smoke: finance delivery analytics and retry queue are available', async () => {
      const createResponse = await request(server, '/api/finance/admin/delivery-campaigns', {
        method: 'POST',
        user: financeManagerUser,
        body: {
          name: 'SMS retry campaign',
          documentType: 'student_statement',
          channel: 'sms',
          classId: IDS.class1,
          academicYearId: 'academic-year-1',
          monthKey: '2026-03',
          recipientHandles: ['+93700111222'],
          includeLinkedAudience: true,
          automationEnabled: false,
          retryFailed: true
        }
      });
      assertCase(createResponse.status === 201, `expected 201, received ${createResponse.status}: ${createResponse.text}`);
      const campaignId = createResponse.data?.item?._id;
      const archiveId = createResponse.data?.item?.targets?.[0]?.archiveId;
      assertCase(Boolean(campaignId), 'expected retry campaign id');
      assertCase(Boolean(archiveId), 'expected retry archive id');

      const analyticsResponse = await request(server, '/api/finance/admin/delivery-campaigns/analytics?channel=sms', {
        user: financeManagerUser
      });
      assertCase(analyticsResponse.status === 200, `expected 200, received ${analyticsResponse.status}`);
      assertCase(Number(analyticsResponse.data?.analytics?.summary?.failedQueueCount || 0) >= 1, 'expected failed queue count in analytics');
      assertCase(Number(analyticsResponse.data?.analytics?.summary?.readyToRetryCount || 0) >= 1, 'expected ready to retry count in analytics');
      assertCase((analyticsResponse.data?.analytics?.recentFailures || []).some((item) => String(item.provider || '') === 'mock_sms_gateway'), 'expected provider metadata in analytics failures');

      const providerAnalyticsResponse = await request(server, '/api/finance/admin/delivery-campaigns/analytics?channel=sms&provider=mock_sms_gateway&retryable=true', {
        user: financeManagerUser
      });
      assertCase(providerAnalyticsResponse.status === 200, `expected 200, received ${providerAnalyticsResponse.status}`);
      assertCase(Number(providerAnalyticsResponse.data?.analytics?.summary?.deliveriesTotal || 0) === 0, 'expected filtered analytics to keep retry queue only');
      assertCase(Number(providerAnalyticsResponse.data?.analytics?.summary?.failedQueueCount || 0) >= 1, 'expected retryable provider queue count');

      const retryQueueResponse = await request(server, '/api/finance/admin/delivery-campaigns/retry-queue?channel=sms', {
        user: financeManagerUser
      });
      assertCase(retryQueueResponse.status === 200, `expected 200, received ${retryQueueResponse.status}`);
      assertCase((retryQueueResponse.data?.items || []).some((item) => String(item.campaignId || '') === String(campaignId)), 'expected retry queue item for sms campaign');
      assertCase((retryQueueResponse.data?.items || []).some((item) => String(item.provider || '') === 'mock_sms_gateway'), 'expected provider metadata in retry queue');
      assertCase((retryQueueResponse.data?.items || []).some((item) => String(item.lastFailureCode || '') === 'provider_timeout'), 'expected failure code metadata in retry queue');

      const filteredRetryQueueResponse = await request(server, '/api/finance/admin/delivery-campaigns/retry-queue?channel=sms&failureCode=provider_timeout&retryable=true', {
        user: financeManagerUser
      });
      assertCase(filteredRetryQueueResponse.status === 200, `expected 200, received ${filteredRetryQueueResponse.status}`);
      assertCase((filteredRetryQueueResponse.data?.items || []).every((item) => String(item.lastFailureCode || '') === 'provider_timeout'), 'expected filtered retry queue by failure code');

      const retryResponse = await request(server, `/api/finance/admin/delivery-campaigns/${campaignId}/retry-target`, {
        method: 'POST',
        user: financeManagerUser,
        body: { archiveId }
      });
      assertCase(retryResponse.status === 200, `expected 200, received ${retryResponse.status}: ${retryResponse.text}`);
      assertCase(Number(retryResponse.data?.item?.targetSummary?.failed || 0) === 0, 'expected failed targets to clear after retry');
      assertCase((retryResponse.data?.item?.targets || []).some((item) => String(item.providerMessageId || '').length > 0), 'expected retry response to include provider message id');
    });

    await check('route smoke: finance delivery provider status sync updates archive and campaign state', async () => {
      const archiveListResponse = await request(server, '/api/finance/admin/document-archive?limit=1', {
        user: financeManagerUser
      });
      assertCase(archiveListResponse.status === 200, `expected 200, received ${archiveListResponse.status}`);
      const archiveId = archiveListResponse.data?.items?.[0]?._id;
      assertCase(Boolean(archiveId), 'expected archive id for provider sync test');

      const smsDeliverResponse = await request(server, `/api/finance/admin/document-archive/${archiveId}/deliver`, {
        method: 'POST',
        user: financeManagerUser,
        body: {
          channel: 'sms',
          recipientHandles: '+93700111222',
          includeLinkedAudience: false,
          note: 'Provider webhook sync test'
        }
      });
      assertCase(smsDeliverResponse.status === 200, `expected 200, received ${smsDeliverResponse.status}: ${smsDeliverResponse.text}`);
      const archiveProviderMessageId = smsDeliverResponse.data?.item?.deliveryLog?.slice(-1)?.[0]?.providerMessageId || '';
      assertCase(Boolean(archiveProviderMessageId), 'expected provider message id on sms archive delivery');

      const archiveWebhookResponse = await request(server, '/api/finance/delivery/providers/twilio/status', {
        method: 'POST',
        body: {
          MessageSid: archiveProviderMessageId,
          MessageStatus: 'delivered',
          To: '+93700111222'
        }
      });
      assertCase(archiveWebhookResponse.status === 200, `expected 200, received ${archiveWebhookResponse.status}: ${archiveWebhookResponse.text}`);
      assertCase(Number(archiveWebhookResponse.data?.result?.processedCount || 0) >= 1, 'expected processed provider webhook event');
      const syncedArchive = archivedDocuments.find((item) => String(item._id || '') === String(archiveId)) || null;
      assertCase((syncedArchive?.deliveryLog || []).some((item) => String(item.providerMessageId || '') === String(archiveProviderMessageId) && String(item.status || '') === 'delivered'), 'expected archive delivery log to be marked delivered');

      const createCampaignResponse = await request(server, '/api/finance/admin/delivery-campaigns', {
        method: 'POST',
        user: financeManagerUser,
        body: {
          name: 'Provider sync campaign',
          documentType: 'student_statement',
          channel: 'sms',
          classId: IDS.class1,
          academicYearId: 'academic-year-1',
          monthKey: '2026-03',
          recipientHandles: ['+93700111333'],
          includeLinkedAudience: true,
          automationEnabled: false,
          retryFailed: true
        }
      });
      assertCase(createCampaignResponse.status === 201, `expected 201, received ${createCampaignResponse.status}: ${createCampaignResponse.text}`);
      const campaignId = createCampaignResponse.data?.item?._id;
      const campaignArchiveId = createCampaignResponse.data?.item?.targets?.[0]?.archiveId;
      assertCase(Boolean(campaignId), 'expected provider sync campaign id');
      assertCase(Boolean(campaignArchiveId), 'expected provider sync archive id');

      const campaignRetryResponse = await request(server, `/api/finance/admin/delivery-campaigns/${campaignId}/retry-target`, {
        method: 'POST',
        user: financeManagerUser,
        body: { archiveId: campaignArchiveId }
      });
      assertCase(campaignRetryResponse.status === 200, `expected 200, received ${campaignRetryResponse.status}: ${campaignRetryResponse.text}`);
      const campaignProviderMessageId = campaignRetryResponse.data?.item?.targets?.find((item) => String(item.archiveId || '') === String(campaignArchiveId))?.providerMessageId || '';
      assertCase(Boolean(campaignProviderMessageId), 'expected provider message id on campaign retry target');

      const syncResponse = await request(server, '/api/finance/admin/delivery-campaigns/provider-status/sync', {
        method: 'POST',
        user: financeManagerUser,
        body: {
          provider: 'mock_sms_gateway',
          providerMessageId: campaignProviderMessageId,
          providerStatus: 'delivered',
          recipient: '+93700111333'
        }
      });
      assertCase(syncResponse.status === 200, `expected 200, received ${syncResponse.status}: ${syncResponse.text}`);
      assertCase(Number(syncResponse.data?.result?.results?.[0]?.matchedCampaigns || 0) >= 1, 'expected matched campaign count in sync response');
      const syncedCampaign = deliveryCampaigns.find((item) => String(item._id || '') === String(campaignId)) || null;
      assertCase((syncedCampaign?.targets || []).some((item) => String(item.providerMessageId || '') === String(campaignProviderMessageId) && String(item.status || '') === 'delivered'), 'expected campaign target to be marked delivered');
    });

    await check('route smoke: finance delivery recovery queue and replay endpoint recover stuck provider callbacks', async () => {
      const archive = archivedDocuments[0] || null;
      assertCase(Boolean(archive?._id), 'expected archive record for recovery queue test');
      const providerMessageId = `mock-recovery-${Date.now()}`;
      archive.deliveryLog = Array.isArray(archive.deliveryLog) ? archive.deliveryLog : [];
      archive.deliveryLog.push({
        channel: 'sms',
        status: 'sent',
        recipient: '+93700111444',
        recipientCount: 1,
        linkedAudienceNotified: false,
        subject: 'Recovery queue test',
        provider: 'mock_sms_gateway',
        providerMessageId,
        providerStatus: 'accepted',
        note: 'Awaiting provider callback',
        errorMessage: '',
        failureCode: '',
        retryable: false,
        nextRetryAt: null,
        sentAt: '2026-03-01T08:00:00.000Z',
        sentBy: { _id: IDS.adminManager, name: 'Finance Manager' }
      });
      archive.lastDeliveryStatus = 'sent';

      deliveryCampaigns.unshift({
        _id: `campaign-recovery-${Date.now()}`,
        name: 'Recovery callback campaign',
        status: 'active',
        documentType: 'student_statement',
        channel: 'sms',
        classId: IDS.class1,
        academicYearId: 'academic-year-1',
        classTitle: 'Class One Core',
        academicYearTitle: '1405',
        monthKey: '2026-03',
        recipientHandles: ['+93700111444'],
        retryFailed: true,
        automationEnabled: false,
        successCount: 0,
        failureCount: 0,
        targetSummary: { total: 1, successful: 1, failed: 0, skipped: 0 },
        targets: [{
          archiveId: archive._id,
          documentNo: archive.documentNo,
          channel: 'sms',
          status: 'sent',
          recipient: '+93700111444',
          recipientCount: 1,
          attempts: 1,
          lastAttemptAt: '2026-03-01T08:00:00.000Z',
          lastDeliveredAt: null,
          lastError: '',
          lastFailureCode: '',
          retryable: false,
          nextRetryAt: null,
          provider: 'mock_sms_gateway',
          providerMessageId,
          providerStatus: 'accepted'
        }],
        runLog: []
      });

      const recoveryQueueResponse = await request(server, '/api/finance/admin/delivery-campaigns/recovery-queue?channel=sms&recoveryState=awaiting_callback', {
        user: financeManagerUser
      });
      assertCase(recoveryQueueResponse.status === 200, `expected 200, received ${recoveryQueueResponse.status}`);
      assertCase((recoveryQueueResponse.data?.items || []).some((item) => String(item.providerMessageId || '') === providerMessageId), 'expected stuck provider message id in recovery queue');

      const replayResponse = await request(server, '/api/finance/admin/delivery-campaigns/recovery-queue/replay', {
        method: 'POST',
        user: financeManagerUser,
        body: {
          provider: 'mock_sms_gateway',
          providerMessageId,
          providerStatus: 'delivered',
          recipient: '+93700111444'
        }
      });
      assertCase(replayResponse.status === 200, `expected 200, received ${replayResponse.status}: ${replayResponse.text}`);
      assertCase(Number(replayResponse.data?.result?.matchedArchive || 0) >= 1, 'expected replay to match archive');
      assertCase(Number(replayResponse.data?.result?.matchedCampaigns || 0) >= 1, 'expected replay to match campaign');

      const replayedArchive = archivedDocuments.find((item) => String(item._id || '') === String(archive._id || '')) || null;
      assertCase((replayedArchive?.deliveryLog || []).some((item) => String(item.providerMessageId || '') === providerMessageId && String(item.status || '') === 'delivered'), 'expected archive delivery log to be replayed as delivered');
      const replayedCampaign = deliveryCampaigns.find((item) => (
        Array.isArray(item.targets) && item.targets.some((target) => String(target.providerMessageId || '') === providerMessageId)
      )) || null;
      assertCase((replayedCampaign?.targets || []).some((item) => String(item.providerMessageId || '') === providerMessageId && String(item.status || '') === 'delivered'), 'expected campaign target to be replayed as delivered');
    });

    await check('route smoke: finance CSV export returns an attachment response', async () => {
      const response = await request(server, '/api/finance/admin/reports/export.csv', {
        user: financeManagerUser
      });
      assertCase(response.status === 200, `expected 200, received ${response.status}`);
      assertCase(String(response.headers['content-type'] || '').includes('text/csv'), 'expected csv content-type');
      assertCase(String(response.headers['content-disposition'] || '').includes('finance-report.csv'), 'expected csv attachment filename');
      assertCase(response.text.includes('BillNumber,Student,Email,Class,Course'), 'expected csv header row');
    });

    await check('route smoke: finance CSV export accepts canonical class filter and deprecates course-only filter', async () => {
      const classResponse = await request(server, `/api/finance/admin/reports/export.csv?classId=${IDS.class1}`, {
        user: financeManagerUser
      });
      assertCase(classResponse.status === 200, `expected 200, received ${classResponse.status}`);
      assertCase(classResponse.text.includes('Class One Core') || classResponse.text.includes('Class One'), 'expected class-scoped export content');

      const courseResponse = await request(server, `/api/finance/admin/reports/export.csv?courseId=${IDS.course1}`, {
        user: financeManagerUser
      });
      assertCase(courseResponse.status === 200, `expected 200, received ${courseResponse.status}`);
      assertCase(String(courseResponse.headers['x-deprecated-route'] || '') === 'true', 'expected deprecated route header for course-only export');
      assertCase(String(courseResponse.headers['x-replacement-endpoint'] || '').includes(`classId=${IDS.class1}`), 'expected canonical class export replacement');
    });
  } finally {
    await new Promise((resolve) => server.close(resolve));

    if (fs.existsSync(uploadDir)) {
      for (const fileName of fs.readdirSync(uploadDir)) {
        if (!baselineFiles.has(fileName)) {
          fs.unlinkSync(path.join(uploadDir, fileName));
        }
      }
    }
  }

  const failures = cases.filter((item) => item.status === 'FAIL');
  cases.forEach((item) => {
    if (item.status === 'PASS') {
      console.log(`PASS  ${item.label}`);
    } else {
      console.error(`FAIL  ${item.label}`);
      console.error(`      ${item.error}`);
    }
  });

  if (failures.length) {
    console.error(`\nFinance route smoke failed: ${failures.length} case(s) failed.`);
    process.exit(1);
  }

  console.log(`\nFinance route smoke passed: ${cases.length} case(s).`);
}

run().catch((error) => {
  console.error('[check:finance-routes] fatal error');
  console.error(error);
  process.exit(1);
});
