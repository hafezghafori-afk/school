const ExpenseCategoryDefinition = require('../models/ExpenseCategoryDefinition');
const ExpenseEntry = require('../models/ExpenseEntry');
const FinancialYear = require('../models/FinancialYear');

const DEFAULT_EXPENSE_CATEGORIES = [
  {
    key: 'salary',
    label: 'Salary',
    description: 'Teacher and staff compensation',
    colorTone: 'teal',
    isSystem: true,
    order: 1,
    subCategories: [
      { key: 'teachers', label: 'Teachers', order: 1 },
      { key: 'staff', label: 'Staff', order: 2 },
      { key: 'bonuses', label: 'Bonuses', order: 3 }
    ]
  },
  {
    key: 'maintenance',
    label: 'Maintenance',
    description: 'Building, repair, and cleaning costs',
    colorTone: 'copper',
    isSystem: true,
    order: 2,
    subCategories: [
      { key: 'building', label: 'Building', order: 1 },
      { key: 'repair', label: 'Repair', order: 2 },
      { key: 'cleaning', label: 'Cleaning', order: 3 }
    ]
  },
  {
    key: 'equipment',
    label: 'Equipment',
    description: 'Furniture, devices, and learning tools',
    colorTone: 'slate',
    isSystem: true,
    order: 3,
    subCategories: [
      { key: 'it', label: 'IT / Devices', order: 1 },
      { key: 'furniture', label: 'Furniture', order: 2 },
      { key: 'classroom', label: 'Classroom Tools', order: 3 }
    ]
  },
  {
    key: 'transport',
    label: 'Transport',
    description: 'Transport and logistics costs',
    colorTone: 'mint',
    isSystem: true,
    order: 4,
    subCategories: [
      { key: 'fuel', label: 'Fuel', order: 1 },
      { key: 'student_transport', label: 'Student Transport', order: 2 },
      { key: 'logistics', label: 'Logistics', order: 3 }
    ]
  },
  {
    key: 'utilities',
    label: 'Utilities',
    description: 'Recurring service costs',
    colorTone: 'sand',
    isSystem: true,
    order: 5,
    subCategories: [
      { key: 'electricity', label: 'Electricity', order: 1 },
      { key: 'water', label: 'Water', order: 2 },
      { key: 'internet', label: 'Internet', order: 3 }
    ]
  },
  {
    key: 'admin',
    label: 'Admin',
    description: 'Administration and office operations',
    colorTone: 'rose',
    isSystem: true,
    order: 6,
    subCategories: [
      { key: 'stationery', label: 'Stationery', order: 1 },
      { key: 'printing', label: 'Printing', order: 2 },
      { key: 'audit', label: 'Audit / Compliance', order: 3 }
    ]
  },
  {
    key: 'other',
    label: 'Other',
    description: 'Other approved finance items',
    colorTone: 'slate',
    isSystem: true,
    order: 7,
    subCategories: [
      { key: 'misc', label: 'Miscellaneous', order: 1 }
    ]
  }
];

function normalizeText(value = '') {
  return String(value || '').trim();
}

function normalizeKey(value = '', fallback = 'other') {
  const normalized = normalizeText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return normalized || fallback;
}

function startOfMonth(dateValue) {
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return null;
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function toMonthKey(value = null) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function monthLabel(monthKey = '') {
  if (!monthKey) return '---';
  const date = new Date(`${monthKey}-01T00:00:00`);
  if (Number.isNaN(date.getTime())) return monthKey;
  return new Intl.DateTimeFormat('fa-AF-u-ca-persian', { month: 'short', year: 'numeric' }).format(date);
}

async function ensureDefaultExpenseCategories() {
  const count = await ExpenseCategoryDefinition.countDocuments({});
  if (!count) {
    await ExpenseCategoryDefinition.insertMany(DEFAULT_EXPENSE_CATEGORIES);
  }

  return ExpenseCategoryDefinition.find({})
    .sort({ order: 1, label: 1 });
}

async function resolveExpenseCategorySelection({ category = '', subCategory = '' } = {}) {
  const categories = await ensureDefaultExpenseCategories();
  const categoryKey = normalizeKey(category, 'other');
  const categoryDefinition = categories.find((item) => item.key === categoryKey && item.isActive);
  if (!categoryDefinition) {
    const error = new Error('finance_expense_category_invalid');
    error.statusCode = 400;
    throw error;
  }

  const subCategoryKey = normalizeKey(subCategory, '');
  if (!subCategoryKey) {
    return {
      category: categoryDefinition.key,
      subCategory: '',
      categoryDefinition,
      subCategoryDefinition: null,
      categories
    };
  }

  const subCategoryDefinition = (categoryDefinition.subCategories || [])
    .find((item) => item.key === subCategoryKey && item.isActive !== false);
  if (!subCategoryDefinition) {
    const error = new Error('finance_expense_subcategory_invalid');
    error.statusCode = 400;
    throw error;
  }

  return {
    category: categoryDefinition.key,
    subCategory: subCategoryDefinition.key,
    categoryDefinition,
    subCategoryDefinition,
    categories
  };
}

function mapCategoryDefinition(items = []) {
  return new Map((items || []).map((item) => [item.key, item]));
}

async function buildFinancialYearCloseReadiness({ financialYearId = '', items = null } = {}) {
  const normalizedFinancialYearId = normalizeText(financialYearId);
  if (!normalizedFinancialYearId) return null;

  const expenseItems = Array.isArray(items)
    ? items
    : await ExpenseEntry.find({ financialYearId: normalizedFinancialYearId }).lean();

  const counts = {
    total: expenseItems.length,
    draft: 0,
    pendingReview: 0,
    approved: 0,
    rejected: 0,
    void: 0
  };

  expenseItems.forEach((item) => {
    const status = normalizeText(item?.status).toLowerCase();
    if (status === 'draft') counts.draft += 1;
    else if (status === 'pending_review') counts.pendingReview += 1;
    else if (status === 'approved') counts.approved += 1;
    else if (status === 'rejected') counts.rejected += 1;
    else if (status === 'void') counts.void += 1;
  });

  const blockers = [];
  if (counts.draft > 0) blockers.push(`${counts.draft} مصرف پیش‌نویس هنوز برای بررسی ارسال نشده است.`);
  if (counts.pendingReview > 0) blockers.push(`${counts.pendingReview} مصرف هنوز در صف بررسی قرار دارد.`);
  if (counts.rejected > 0) blockers.push(`${counts.rejected} مصرف ردشده هنوز نیاز به اصلاح یا باطل‌سازی دارد.`);

  let financialYear = null;
  try {
    financialYear = await FinancialYear.findById(normalizedFinancialYearId).select('title status isClosed');
  } catch {
    financialYear = null;
  }

  return {
    financialYearId: normalizedFinancialYearId,
    financialYearTitle: financialYear?.title || '',
    isClosed: Boolean(financialYear?.isClosed),
    canClose: blockers.length === 0,
    blockerCount: blockers.length,
    blockers,
    counts
  };
}

async function buildExpenseGovernanceAnalytics({ financialYearId = '', academicYearId = '', classId = '' } = {}) {
  const filter = {};
  if (normalizeText(financialYearId)) filter.financialYearId = normalizeText(financialYearId);
  if (normalizeText(academicYearId)) filter.academicYearId = normalizeText(academicYearId);
  if (normalizeText(classId)) filter.classId = normalizeText(classId);

  const [categories, entries] = await Promise.all([
    ensureDefaultExpenseCategories(),
    ExpenseEntry.find(filter)
      .sort({ expenseDate: -1, createdAt: -1 })
      .lean()
  ]);

  const categoryMap = mapCategoryDefinition(categories);
  const statusCounts = {
    draft: 0,
    pendingReview: 0,
    approved: 0,
    rejected: 0,
    void: 0
  };
  const monthlyMap = new Map();
  const vendorMap = new Map();
  const categoryTotals = new Map();
  let totalAmount = 0;
  let approvedAmount = 0;
  let pendingAmount = 0;
  let treasuryAssignedAmount = 0;
  let treasuryAssignedCount = 0;
  let treasuryUnassignedAmount = 0;
  let treasuryUnassignedCount = 0;

  entries.forEach((item) => {
    const status = normalizeText(item?.status).toLowerCase();
    const amount = Number(item?.amount || 0);
    const categoryKey = normalizeKey(item?.category, 'other');
    const categoryDefinition = categoryMap.get(categoryKey);
    const monthKey = toMonthKey(item?.expenseDate);
    const vendorName = normalizeText(item?.vendorName) || 'Unassigned vendor';

    totalAmount += amount;
    if (status === 'approved') approvedAmount += amount;
    if (status === 'pending_review') pendingAmount += amount;
    if (status === 'approved') {
      if (item?.treasuryAccountId) {
        treasuryAssignedAmount += amount;
        treasuryAssignedCount += 1;
      } else {
        treasuryUnassignedAmount += amount;
        treasuryUnassignedCount += 1;
      }
    }

    if (status === 'draft') statusCounts.draft += 1;
    else if (status === 'pending_review') statusCounts.pendingReview += 1;
    else if (status === 'approved') statusCounts.approved += 1;
    else if (status === 'rejected') statusCounts.rejected += 1;
    else if (status === 'void') statusCounts.void += 1;

    const categoryBucket = categoryTotals.get(categoryKey) || {
      key: categoryKey,
      label: categoryDefinition?.label || categoryKey,
      colorTone: categoryDefinition?.colorTone || 'slate',
      amount: 0,
      count: 0
    };
    categoryBucket.amount += amount;
    categoryBucket.count += 1;
    categoryTotals.set(categoryKey, categoryBucket);

    const vendorBucket = vendorMap.get(vendorName) || {
      label: vendorName,
      amount: 0,
      count: 0
    };
    vendorBucket.amount += amount;
    vendorBucket.count += 1;
    vendorMap.set(vendorName, vendorBucket);

    if (monthKey) {
      const monthlyBucket = monthlyMap.get(monthKey) || {
        monthKey,
        label: monthLabel(monthKey),
        amount: 0,
        approvedAmount: 0,
        pendingAmount: 0,
        count: 0
      };
      monthlyBucket.amount += amount;
      monthlyBucket.count += 1;
      if (status === 'approved') monthlyBucket.approvedAmount += amount;
      if (status === 'pending_review') monthlyBucket.pendingAmount += amount;
      monthlyMap.set(monthKey, monthlyBucket);
    }
  });

  const closeReadiness = normalizeText(financialYearId)
    ? await buildFinancialYearCloseReadiness({ financialYearId, items: entries })
    : null;

  return {
    summary: {
      totalCount: entries.length,
      totalAmount: Number(totalAmount.toFixed(2)),
      approvedAmount: Number(approvedAmount.toFixed(2)),
      pendingAmount: Number(pendingAmount.toFixed(2)),
      queueCount: statusCounts.draft + statusCounts.pendingReview + statusCounts.rejected,
      vendorCount: vendorMap.size,
      categoryCount: categoryTotals.size,
      treasuryAssignedAmount: Number(treasuryAssignedAmount.toFixed(2)),
      treasuryAssignedCount,
      treasuryUnassignedAmount: Number(treasuryUnassignedAmount.toFixed(2)),
      treasuryUnassignedCount,
      statusCounts
    },
    categories: [...categoryTotals.values()]
      .sort((left, right) => right.amount - left.amount)
      .map((item) => ({
        ...item,
        sharePercent: totalAmount > 0 ? Number(((item.amount / totalAmount) * 100).toFixed(2)) : 0
      })),
    vendors: [...vendorMap.values()]
      .sort((left, right) => right.amount - left.amount)
      .slice(0, 6),
    monthly: [...monthlyMap.values()]
      .sort((left, right) => left.monthKey.localeCompare(right.monthKey)),
    queue: entries
      .filter((item) => ['draft', 'pending_review', 'rejected'].includes(normalizeText(item?.status).toLowerCase()))
      .slice(0, 12),
    closeReadiness,
    registry: categories.map((item) => ({
      _id: item._id,
      key: item.key,
      label: item.label,
      description: item.description || '',
      colorTone: item.colorTone || 'teal',
      isActive: item.isActive !== false,
      isSystem: Boolean(item.isSystem),
      order: Number(item.order || 0),
      subCategories: (item.subCategories || []).map((subItem) => ({
        key: subItem.key,
        label: subItem.label,
        description: subItem.description || '',
        isActive: subItem.isActive !== false,
        order: Number(subItem.order || 0)
      }))
    }))
  };
}

module.exports = {
  buildExpenseGovernanceAnalytics,
  buildFinancialYearCloseReadiness,
  ensureDefaultExpenseCategories,
  normalizeExpenseCategoryKey: normalizeKey,
  resolveExpenseCategorySelection
};
