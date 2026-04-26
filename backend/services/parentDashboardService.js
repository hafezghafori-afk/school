const mongoose = require('mongoose');

const StudentMembership = require('../models/StudentMembership');
const Attendance = require('../models/Attendance');
const Grade = require('../models/Grade');
const Homework = require('../models/Homework');
const HomeworkSubmission = require('../models/HomeworkSubmission');
const Schedule = require('../models/Schedule');
const { listLinkedStudentsForGuardianUser } = require('./studentProfileService');
const { getMembershipFinanceOverview } = require('./studentFinanceService');

function startOfDay(date = new Date()) {
  const value = new Date(date);
  value.setHours(0, 0, 0, 0);
  return value;
}

function endOfDay(date = new Date()) {
  const value = new Date(date);
  value.setHours(23, 59, 59, 999);
  return value;
}

function shiftDays(date = new Date(), days = 0) {
  const value = new Date(date);
  value.setDate(value.getDate() + days);
  return value;
}

function toDateKey(date = new Date()) {
  const value = new Date(date);
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function sumBy(items = [], selector = (item) => item) {
  return items.reduce((total, item) => total + (Number(selector(item)) || 0), 0);
}

function asPercent(value, total) {
  const safeTotal = Number(total || 0);
  if (!safeTotal) return 0;
  return Number((((Number(value || 0) / safeTotal) * 100)).toFixed(1));
}

function isWithinDays(dateValue, days = 0, now = new Date()) {
  if (!dateValue) return false;
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return false;
  const end = new Date(now.getTime() + (days * 24 * 60 * 60 * 1000));
  return date.getTime() >= now.getTime() && date.getTime() <= end.getTime();
}

function formatDashboardOrder(item = {}) {
  const outstandingAmount = Number(item.outstandingAmount || 0);
  const status = String(item.status || '');
  const supportsReceiptUpload = ['new', 'partial', 'overdue'].includes(status) && outstandingAmount > 0;
  return {
    id: String(item.id || ''),
    sourceBillId: String(item.sourceBillId || ''),
    orderNumber: String(item.orderNumber || ''),
    title: String(item.title || ''),
    status,
    dueDate: item.dueDate || null,
    outstandingAmount,
    amountDue: Number(item.amountDue || 0),
    amountPaid: Number(item.amountPaid || 0),
    currency: String(item.currency || 'AFN'),
    periodLabel: String(item.periodLabel || ''),
    orderType: String(item.orderType || ''),
    supportsReceiptUpload,
    submissionMode: item.sourceBillId ? 'legacy_receipt' : 'canonical_payment'
  };
}

function formatDashboardPayment(item = {}) {
  return {
    id: String(item.id || ''),
    paymentNumber: String(item.paymentNumber || ''),
    amount: Number(item.amount || 0),
    currency: String(item.currency || 'AFN'),
    paymentMethod: String(item.paymentMethod || ''),
    status: String(item.status || ''),
    approvalStage: String(item.approvalStage || ''),
    paidAt: item.paidAt || null,
    note: String(item.note || '')
  };
}

function formatDashboardRelief(item = {}) {
  return {
    id: String(item.id || ''),
    reliefType: String(item.reliefType || ''),
    coverageMode: String(item.coverageMode || ''),
    amount: Number(item.amount || 0),
    percentage: Number(item.percentage || 0),
    status: String(item.status || ''),
    sponsorName: String(item.sponsorName || ''),
    reason: String(item.reason || ''),
    startDate: item.startDate || null,
    endDate: item.endDate || null
  };
}

function buildEmptyParentDashboard(message = '', overrides = {}) {
  return {
    generatedAt: new Date().toISOString(),
    previewMode: true,
    setupNeeded: true,
    linkedStudent: null,
    linkedStudents: [],
    summary: {
      attendanceRate: 0,
      averageScore: 0,
      outstandingAmount: 0,
      paidAmount: 0,
      pendingHomework: 0,
      upcomingLessons: 0,
      activeReliefs: 0,
      pendingPayments: 0,
      overdueOrders: 0,
      expiringReliefs: 0
    },
    financeSummary: {
      activeReliefs: 0,
      fixedReliefAmount: 0,
      percentReliefCount: 0,
      fullReliefCount: 0,
      pendingPayments: 0,
      overdueOrders: 0,
      dueSoonOrders: 0,
      expiringReliefs: 0,
      lastPaymentAt: null
    },
    financeStatement: null,
    financeBreakdown: [],
    financeOrders: [],
    financePayments: [],
    financeReliefs: [],
    tasks: [],
    alerts: [],
    schedule: [],
    message,
    ...overrides
  };
}

async function getParentDashboard(viewer = {}, options = {}) {
  const viewerRole = String(viewer?.role || '').trim().toLowerCase();
  const requestedStudentId = String(options.studentId || '').trim();
  const isParentViewer = viewerRole === 'parent';
  const isAdminPreview = viewerRole === 'admin';
  const isStudentPreview = viewerRole === 'student';
  const linkedStudents = isParentViewer
    ? await listLinkedStudentsForGuardianUser(viewer?.id || '')
    : [];

  let selectedLink = null;
  let selectedStudentCoreId = '';
  let selectedStudentUserId = '';

  if (isParentViewer) {
    if (!linkedStudents.length) {
      return buildEmptyParentDashboard('برای این حساب والد/سرپرست هنوز متعلمی وصل نشده است. ابتدا از دفتر گزارش شاگرد، حساب والد را به متعلم لینک کنید.', {
        previewMode: false,
        linkedStudents: []
      });
    }

    selectedLink = linkedStudents.find((item) => (
      String(item.studentCoreId || '') === requestedStudentId || String(item.studentUserId || '') === requestedStudentId
    )) || linkedStudents[0];
    selectedStudentCoreId = String(selectedLink.studentCoreId || '').trim();
    selectedStudentUserId = String(selectedLink.studentUserId || '').trim();
  } else if (isStudentPreview && mongoose.Types.ObjectId.isValid(String(viewer?.id || ''))) {
    selectedStudentUserId = String(viewer.id);
  } else if (isAdminPreview && mongoose.Types.ObjectId.isValid(requestedStudentId)) {
    selectedStudentCoreId = requestedStudentId;
    selectedStudentUserId = requestedStudentId;
  }

  if (!selectedStudentCoreId && !selectedStudentUserId) {
    return buildEmptyParentDashboard('برای این نما هنوز متعلمی برای مشاهده انتخاب نشده است.', {
      previewMode: !isParentViewer,
      linkedStudents
    });
  }

  const membership = await StudentMembership.findOne({
    status: 'active',
    isCurrent: true,
    $or: [
      selectedStudentCoreId && mongoose.Types.ObjectId.isValid(selectedStudentCoreId)
        ? { studentId: new mongoose.Types.ObjectId(selectedStudentCoreId) }
        : null,
      selectedStudentUserId && mongoose.Types.ObjectId.isValid(selectedStudentUserId)
        ? { student: new mongoose.Types.ObjectId(selectedStudentUserId) }
        : null
    ].filter(Boolean)
  })
    .populate('student', 'name email')
    .populate('classId', 'title titleDari')
    .populate('course', 'title')
    .populate('academicYearId', 'title label name');

  if (!membership) {
    return buildEmptyParentDashboard('برای متعلم انتخاب‌شده عضویت فعال آموزشی پیدا نشد.', {
      previewMode: !isParentViewer,
      linkedStudents
    });
  }

  const membershipId = membership._id;
  const today = new Date();
  const todayKey = toDateKey(today);
  const weekStart = startOfDay(shiftDays(today, -6));
  const upcomingHomeworkEnd = endOfDay(shiftDays(today, 7));
  const financeSignalEnd = endOfDay(shiftDays(today, 14));
  const studentObjectId = membership.student?._id
    || (selectedStudentUserId && mongoose.Types.ObjectId.isValid(selectedStudentUserId)
      ? new mongoose.Types.ObjectId(selectedStudentUserId)
      : null);

  const [financeOverview, attendanceRows, grades, upcomingHomework, submittedHomework, todaySchedule] = await Promise.all([
    getMembershipFinanceOverview(membershipId),
    Attendance.find({
      studentMembershipId: membershipId,
      date: { $gte: weekStart, $lte: endOfDay(today) }
    }).select('status date'),
    Grade.find({ studentMembershipId: membershipId }).select('totalScore updatedAt'),
    Homework.find({
      $or: [
        membership.classId ? { classId: membership.classId._id } : null,
        membership.course ? { course: membership.course._id } : null
      ].filter(Boolean),
      dueDate: { $gte: startOfDay(today), $lte: upcomingHomeworkEnd }
    }).select('title dueDate'),
    studentObjectId
      ? HomeworkSubmission.find({ student: studentObjectId }).select('homework')
      : Promise.resolve([]),
    membership.course
      ? Schedule.find({ course: membership.course._id, date: todayKey })
          .sort({ startTime: 1 })
          .select('subject startTime endTime')
      : Promise.resolve([])
  ]);

  const orders = Array.isArray(financeOverview?.orders) ? financeOverview.orders : [];
  const payments = Array.isArray(financeOverview?.payments) ? financeOverview.payments : [];
  const reliefs = Array.isArray(financeOverview?.reliefs) ? financeOverview.reliefs : [];

  const approvedPayments = payments.filter((item) => item.status === 'approved');
  const pendingPayments = payments.filter((item) => item.status === 'pending');
  const openOrders = orders.filter((item) => ['new', 'partial', 'overdue'].includes(item.status));
  const overdueOrders = openOrders.filter((item) => item.status === 'overdue');
  const dueSoonOrders = openOrders.filter((item) => item.status !== 'overdue' && isWithinDays(item.dueDate, 7, today));
  const activeReliefs = reliefs.filter((item) => item.status === 'active');
  const expiringReliefs = activeReliefs.filter((item) => isWithinDays(item.endDate, 14, today));
  const fixedReliefAmount = activeReliefs.reduce((sum, item) => (
    item.coverageMode === 'fixed' ? sum + (Number(item.amount) || 0) : sum
  ), 0);
  const percentReliefCount = activeReliefs.filter((item) => item.coverageMode === 'percent').length;
  const fullReliefCount = activeReliefs.filter((item) => item.coverageMode === 'full').length;
  const latestPayment = approvedPayments[0] || payments[0] || null;
  const financeStatement = financeOverview?.statement || null;

  const attendanceRate = asPercent(
    attendanceRows.filter((item) => item.status === 'present' || item.status === 'late' || item.status === 'excused').length,
    attendanceRows.length || 1
  );
  const averageScore = grades.length
    ? Number((sumBy(grades, (item) => item.totalScore) / grades.length).toFixed(1))
    : 0;
  const outstandingAmount = sumBy(openOrders, (item) => item.outstandingAmount);
  const paidAmount = sumBy(approvedPayments, (item) => item.amount);
  const submittedHomeworkIds = new Set(submittedHomework.map((item) => String(item.homework || '')));
  const pendingHomework = upcomingHomework.filter((item) => !submittedHomeworkIds.has(String(item._id))).length;

  return {
    generatedAt: new Date().toISOString(),
    previewMode: !isParentViewer,
    setupNeeded: false,
    linkedStudent: {
      id: String(selectedLink?.studentCoreId || membership.studentId || membership.student?._id || selectedStudentCoreId || selectedStudentUserId),
      studentCoreId: selectedLink?.studentCoreId || '',
      studentUserId: selectedLink?.studentUserId || String(membership.student?._id || ''),
      name: membership.student?.name || 'متعلم',
      email: membership.student?.email || '',
      classTitle: membership.classId?.titleDari || membership.classId?.title || membership.course?.title || 'صنف',
      academicYearTitle: membership.academicYearId?.title || membership.academicYearId?.label || membership.academicYearId?.name || '',
      membershipId: String(membershipId),
      relation: selectedLink?.relation || ''
    },
    linkedStudents: linkedStudents.map((item) => ({
      id: item.studentCoreId || item.studentUserId || '',
      studentCoreId: item.studentCoreId || '',
      studentUserId: item.studentUserId || '',
      name: item.fullName || item.preferredName || 'متعلم',
      admissionNo: item.admissionNo || '',
      classTitle: item.classTitle || '',
      academicYearTitle: item.academicYearTitle || '',
      relation: item.relation || '',
      isPrimary: !!item.isPrimary,
      hasActiveMembership: !!item.hasActiveMembership
    })),
    summary: {
      attendanceRate,
      averageScore,
      outstandingAmount: Number(outstandingAmount.toFixed(0)),
      paidAmount: Number(paidAmount.toFixed(0)),
      pendingHomework,
      upcomingLessons: todaySchedule.length,
      activeReliefs: activeReliefs.length,
      pendingPayments: pendingPayments.length,
      overdueOrders: overdueOrders.length,
      expiringReliefs: expiringReliefs.length
    },
    financeSummary: {
      activeReliefs: activeReliefs.length,
      fixedReliefAmount: Number(fixedReliefAmount.toFixed(0)),
      percentReliefCount,
      fullReliefCount,
      pendingPayments: pendingPayments.length,
      overdueOrders: overdueOrders.length,
      dueSoonOrders: dueSoonOrders.length,
      expiringReliefs: expiringReliefs.length,
      lastPaymentAt: latestPayment?.paidAt || null
    },
    financeStatement,
    financeBreakdown: [
      {
        label: 'بدهی باز',
        value: Number(outstandingAmount.toFixed(0)),
        meta: `${openOrders.length.toLocaleString('fa-AF-u-ca-persian')} مورد`
      },
      {
        label: 'پرداخت‌های تاییدشده',
        value: Number(paidAmount.toFixed(0)),
        meta: `${approvedPayments.length.toLocaleString('fa-AF-u-ca-persian')} رسید`
      },
      {
        label: 'رسیدهای در انتظار',
        value: pendingPayments.length,
        meta: latestPayment?.paidAt ? `آخرین ثبت: ${new Date(latestPayment.paidAt).toLocaleDateString('fa-AF-u-ca-persian')}` : 'در انتظار بررسی'
      },
      {
        label: 'تسهیلات فعال',
        value: activeReliefs.length,
        meta: `${Number(fixedReliefAmount || 0).toLocaleString('fa-AF-u-ca-persian')} AFN تثبیت‌شده`
      },
      {
        label: 'تسهیلات رو به ختم',
        value: expiringReliefs.length,
        meta: `${fullReliefCount.toLocaleString('fa-AF-u-ca-persian')} پوشش کامل | ${percentReliefCount.toLocaleString('fa-AF-u-ca-persian')} درصدی`
      },
      {
        label: 'کارخانگی‌های مانده',
        value: pendingHomework,
        meta: `${upcomingHomework.length.toLocaleString('fa-AF-u-ca-persian')} مورد پیش‌رو`
      }
    ],
    financeOrders: openOrders
      .slice()
      .sort((left, right) => new Date(left.dueDate || 0).getTime() - new Date(right.dueDate || 0).getTime())
      .slice(0, 5)
      .map(formatDashboardOrder),
    financePayments: payments
      .slice(0, 5)
      .map(formatDashboardPayment),
    financeReliefs: activeReliefs
      .slice()
      .sort((left, right) => {
        const leftTime = new Date(left.endDate || financeSignalEnd).getTime();
        const rightTime = new Date(right.endDate || financeSignalEnd).getTime();
        return leftTime - rightTime;
      })
      .slice(0, 5)
      .map(formatDashboardRelief),
    tasks: [
      {
        id: 'parent-finance-orders',
        label: 'بل‌های باز مالی',
        meta: `${openOrders.length.toLocaleString('fa-AF-u-ca-persian')} مورد`,
        tone: openOrders.length ? 'rose' : 'teal'
      },
      {
        id: 'parent-finance-reliefs',
        label: 'تسهیلات فعال',
        meta: `${activeReliefs.length.toLocaleString('fa-AF-u-ca-persian')} مورد`,
        tone: activeReliefs.length ? 'mint' : 'slate'
      },
      {
        id: 'parent-homework',
        label: 'کارخانگی‌های در انتظار',
        meta: `${pendingHomework.toLocaleString('fa-AF-u-ca-persian')} مورد`,
        tone: pendingHomework ? 'copper' : 'teal'
      },
      {
        id: 'parent-lessons',
        label: 'برنامه امروز',
        meta: `${todaySchedule.length.toLocaleString('fa-AF-u-ca-persian')} درس`,
        tone: todaySchedule.length ? 'mint' : 'slate'
      },
      {
        id: 'parent-grades',
        label: 'میانگین نمره',
        meta: `${averageScore.toLocaleString('fa-AF-u-ca-persian')} از 100`,
        tone: averageScore >= 60 ? 'mint' : 'rose'
      }
    ],
    alerts: [
      ...(outstandingAmount > 0 ? [{
        id: 'parent-finance-alert',
        label: 'برای این متعلم هنوز بدهی باز مالی وجود دارد.',
        meta: `${Number(outstandingAmount || 0).toLocaleString('fa-AF-u-ca-persian')} افغانی`,
        tone: 'rose'
      }] : []),
      ...(overdueOrders.length ? [{
        id: 'parent-overdue-orders',
        label: 'حداقل یک بل مالی به وضعیت معوق رسیده است.',
        meta: `${overdueOrders.length.toLocaleString('fa-AF-u-ca-persian')} مورد`,
        tone: 'rose'
      }] : []),
      ...(pendingPayments.length ? [{
        id: 'parent-pending-receipts',
        label: 'رسید/پرداخت در انتظار تایید مالی است.',
        meta: `${pendingPayments.length.toLocaleString('fa-AF-u-ca-persian')} مورد`,
        tone: 'copper'
      }] : []),
      ...(expiringReliefs.length ? [{
        id: 'parent-expiring-reliefs',
        label: 'برخی تسهیلات مالی در آستانه ختم است.',
        meta: `${expiringReliefs.length.toLocaleString('fa-AF-u-ca-persian')} مورد`,
        tone: 'copper'
      }] : []),
      ...(attendanceRate && attendanceRate < 75 ? [{
        id: 'parent-attendance-alert',
        label: 'نرخ حضور هفتگی نیاز به پیگیری دارد.',
        meta: `${attendanceRate.toLocaleString('fa-AF-u-ca-persian')}%`,
        tone: 'copper'
      }] : [])
    ],
    schedule: todaySchedule.map((item) => ({
      id: String(item._id || ''),
      label: item.subject || 'درس',
      meta: `${item.startTime || '--:--'} تا ${item.endTime || '--:--'}`
    })),
    message: !isParentViewer
      ? 'این نما برای پیش‌نمایش مدیر یا شاگرد از داشبورد والد/سرپرست استفاده می‌شود.'
      : ''
  };
}

module.exports = {
  getParentDashboard
};
