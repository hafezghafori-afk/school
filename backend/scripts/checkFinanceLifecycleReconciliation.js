// Finds finance rows (open FinanceBill / FeeOrder) that belong to a student
// whose academic lifecycle status says they've left (dropped/expelled/
// transferred/inactive) - i.e. exactly the "شاگرد منفک شده اما در بخش مالی
// باقی‌دار نشان می‌دهد" scenario. Meant to be run periodically (cron or by
// hand) as the reconciliation audit described in the finance-lifecycle
// proposal. This only *reports*; it never modifies data - a human finance
// manager decides whether each balance gets refunded, written off, or kept
// as legitimate pre-departure arrears.
require('dotenv').config();
const mongoose = require('mongoose');

require('../models/User');
require('../models/StudentCore');
require('../models/SchoolClass');
require('../models/StudentMembership');
const FinanceBill = require('../models/FinanceBill');
const FeeOrder = require('../models/FeeOrder');
const { loadCurrentMembershipStatusMap, hasStudentLeft, getStudentStatusBadge } = require('../utils/financeStudentLifecycleStatus');

const OPEN_BILL_STATUSES = ['new', 'partial', 'overdue'];

function roundMoney(value = 0) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

async function main() {
  await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 8000 });

  const [bills, orders] = await Promise.all([
    FinanceBill.find({ status: { $in: OPEN_BILL_STATUSES } })
      .select('billNumber student amountDue amountPaid dueDate status')
      .populate('student', 'name')
      .lean(),
    FeeOrder.find({ status: { $in: OPEN_BILL_STATUSES } })
      .select('orderNumber student outstandingAmount dueDate status')
      .populate('student', 'name')
      .lean()
  ]);

  const allStudentIds = [
    ...bills.map((item) => item.student),
    ...orders.map((item) => item.student)
  ];
  const statusMap = await loadCurrentMembershipStatusMap(allStudentIds);

  const byStudent = new Map();
  const addRow = (kind, item, outstanding) => {
    const studentId = String(item?.student?._id || item?.student || '').trim();
    if (!studentId || outstanding <= 0) return;
    const status = statusMap.get(studentId) || '';
    if (!hasStudentLeft(status)) return; // only report students who have actually left
    const entry = byStudent.get(studentId) || {
      studentId,
      name: item?.student?.name || 'شاگرد',
      status,
      badge: getStudentStatusBadge(status).label,
      totalOutstanding: 0,
      rows: []
    };
    entry.totalOutstanding = roundMoney(entry.totalOutstanding + outstanding);
    entry.rows.push({
      kind,
      number: item.billNumber || item.orderNumber || '',
      outstanding: roundMoney(outstanding),
      dueDate: item.dueDate ? new Date(item.dueDate).toISOString().slice(0, 10) : ''
    });
    byStudent.set(studentId, entry);
  };

  bills.forEach((item) => addRow('FinanceBill', item, Number(item.amountDue || 0) - Number(item.amountPaid || 0)));
  orders.forEach((item) => addRow('FeeOrder', item, Number(item.outstandingAmount || 0)));

  const flagged = Array.from(byStudent.values()).sort((left, right) => right.totalOutstanding - left.totalOutstanding);

  console.log('==== گزارش تطبیق وضعیت تعلیمی-مالی ====');
  console.log(`تعداد بل/سفارش باز بررسی‌شده: ${bills.length + orders.length}`);
  console.log(`تعداد شاگردان خارج‌شده که هنوز بدهی باز دارند: ${flagged.length}`);
  console.log('');

  if (!flagged.length) {
    console.log('همه چیز همسان است: هیچ شاگرد خارج‌شده‌ای بدهی باز بدون رسیدگی ندارد.');
  } else {
    flagged.forEach((entry, index) => {
      console.log(`--- ${index + 1}. ${entry.name} (وضعیت: ${entry.badge}) — مجموع بدهی باز: ${entry.totalOutstanding} AFN ---`);
      entry.rows.forEach((row) => {
        console.log(`   ${row.kind} ${row.number} — ${row.outstanding} AFN — سررسید: ${row.dueDate || '-'}`);
      });
    });
    console.log('');
    console.log('پیشنهاد: برای هر مورد بالا تصمیم بگیرید: بازپرداخت، انتقال بدهی به مکتب جدید (تبدیلی)، یا راکد اعلام کردن با تأیید مدیر مالی.');
  }

  await mongoose.connection.close();
}

main().catch((err) => {
  console.error('خطا در اجرای گزارش تطبیق:', err);
  process.exit(1);
});
