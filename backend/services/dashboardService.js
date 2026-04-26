const mongoose = require('mongoose');

const User = require('../models/User');
const StudentMembership = require('../models/StudentMembership');
const FeeOrder = require('../models/FeeOrder');
const FeePayment = require('../models/FeePayment');
const Attendance = require('../models/Attendance');
const Grade = require('../models/Grade');
const ExamSession = require('../models/ExamSession');
const ExamResult = require('../models/ExamResult');
const Homework = require('../models/Homework');
const HomeworkSubmission = require('../models/HomeworkSubmission');
const Course = require('../models/Course');
const Schedule = require('../models/Schedule');
const CourseJoinRequest = require('../models/CourseJoinRequest');
const ProfileUpdateRequest = require('../models/ProfileUpdateRequest');
const AccessRequest = require('../models/AccessRequest');
const SchoolClass = require('../models/SchoolClass');

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

function monthKey(date = new Date()) {
  const value = new Date(date);
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

function formatDateLabel(date, options = {}) {
  const value = date instanceof Date ? date : new Date(date);
  try {
    return new Intl.DateTimeFormat('fa-AF-u-ca-persian', options).format(value);
  } catch (error) {
    try {
      return new Intl.DateTimeFormat('fa-AF', options).format(value);
    } catch (nestedError) {
      return value.toISOString().slice(0, 10);
    }
  }
}

function buildRecentDayBuckets(days = 7) {
  const buckets = [];
  const today = startOfDay(new Date());
  for (let index = days - 1; index >= 0; index -= 1) {
    const value = shiftDays(today, -index);
    buckets.push({
      key: toDateKey(value),
      label: formatDateLabel(value, { month: 'short', day: 'numeric' }),
      value
    });
  }
  return buckets;
}

function buildRecentMonthBuckets(months = 6) {
  const buckets = [];
  const today = new Date();
  for (let index = months - 1; index >= 0; index -= 1) {
    const value = new Date(today.getFullYear(), today.getMonth() - index, 1);
    buckets.push({
      key: monthKey(value),
      label: formatDateLabel(value, { month: 'short' }),
      value
    });
  }
  return buckets;
}

function sumBy(items = [], selector = (item) => item) {
  return items.reduce((total, item) => total + (Number(selector(item)) || 0), 0);
}

function uniqueObjectIdStrings(values = []) {
  return [...new Set(
    values
      .map((item) => String(item || '').trim())
      .filter(Boolean)
  )];
}

function toObjectIds(values = []) {
  return uniqueObjectIdStrings(values)
    .filter((item) => mongoose.Types.ObjectId.isValid(item))
    .map((item) => new mongoose.Types.ObjectId(item));
}

function asPercent(value, total) {
  const safeTotal = Number(total || 0);
  if (!safeTotal) return 0;
  return Number((((Number(value || 0) / safeTotal) * 100)).toFixed(1));
}

function normalizeAttendanceStatus(value = '') {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'late') return 'sick';
  if (normalized === 'excused') return 'leave';
  return normalized;
}

function isCountedAsAttended(value = '') {
  const normalized = normalizeAttendanceStatus(value);
  return normalized === 'present' || normalized === 'sick' || normalized === 'leave';
}

function compareMonthChange(current, previous) {
  const currentValue = Number(current || 0);
  const previousValue = Number(previous || 0);
  if (!previousValue) return currentValue > 0 ? 100 : 0;
  return Number((((currentValue - previousValue) / previousValue) * 100).toFixed(1));
}

function buildClassLabelMap(classes = [], courses = []) {
  const labels = new Map();
  classes.forEach((item) => {
    if (!item?._id) return;
    labels.set(String(item._id), item.titleDari || item.title || 'صنف');
  });
  courses.forEach((item) => {
    if (!item?._id) return;
    labels.set(String(item._id), item.title || 'صنف');
    if (item?.schoolClassRef?._id) {
      labels.set(
        String(item.schoolClassRef._id),
        item.schoolClassRef.titleDari || item.schoolClassRef.title || item.title || 'صنف'
      );
    }
  });
  return labels;
}

async function getTeacherDashboard(userId) {
  const TeacherAssignment = require('../models/TeacherAssignment');

  const teacherId = String(userId || '').trim();
  if (!mongoose.Types.ObjectId.isValid(teacherId)) {
    return {
      summary: {
        activeClasses: 0,
        activeStudents: 0,
        attendanceRate: 0,
        activeExams: 0,
        todayLessons: 0,
        pendingJoinRequests: 0
      },
      attendanceTrend: [],
      classPerformance: [],
      tasks: [],
      alerts: [],
      todaySchedule: []
    };
  }

  const teacherObjectId = new mongoose.Types.ObjectId(teacherId);
  const todayKey = toDateKey(new Date());
  const last7DaysStart = startOfDay(shiftDays(new Date(), -6));
  const upcomingWindowEnd = endOfDay(shiftDays(new Date(), 7));

  const assignments = await TeacherAssignment.find({
    teacherUserId: teacherObjectId,
    status: { $in: ['active', 'planned', 'pending'] }
  }).select('classId legacyCourseId');

  const assignmentCourseIds = assignments.map((item) => item.legacyCourseId).filter(Boolean);
  const assignmentClassIds = assignments.map((item) => item.classId).filter(Boolean);

  let courseItems = await Course.find({
    homeroomInstructor: teacherObjectId,
    isActive: true
  })
    .populate('schoolClassRef', 'title titleDari')
    .select('title schoolClassRef');

  if (assignmentCourseIds.length) {
    const extraCourses = await Course.find({ _id: { $in: assignmentCourseIds } })
      .populate('schoolClassRef', 'title titleDari')
      .select('title schoolClassRef');
    const seen = new Set(courseItems.map((item) => String(item._id)));
    extraCourses.forEach((item) => {
      if (!seen.has(String(item._id))) courseItems.push(item);
    });
  }

  const classIds = toObjectIds([
    ...assignmentClassIds,
    ...courseItems.map((item) => item?.schoolClassRef?._id)
  ]);
  const courseIds = toObjectIds([
    ...assignmentCourseIds,
    ...courseItems.map((item) => item?._id)
  ]);

  const [classDocs, memberships, joinRequests, todaySchedule, attendanceRows, gradeRows, activeExamCount, upcomingHomework] = await Promise.all([
    classIds.length ? SchoolClass.find({ _id: { $in: classIds } }).select('title titleDari') : Promise.resolve([]),
    StudentMembership.find({
      status: 'active',
      isCurrent: true,
      $or: [
        classIds.length ? { classId: { $in: classIds } } : null,
        courseIds.length ? { course: { $in: courseIds } } : null
      ].filter(Boolean)
    }).select('student classId course'),
    courseIds.length
      ? CourseJoinRequest.find({ course: { $in: courseIds }, status: 'pending' })
          .populate('student', 'name')
          .populate('course', 'title')
          .sort({ createdAt: -1 })
          .limit(5)
      : Promise.resolve([]),
    Schedule.find({ instructor: teacherObjectId, date: todayKey })
      .populate('course', 'title schoolClassRef')
      .sort({ startTime: 1 })
      .limit(6),
    Attendance.find({
      date: { $gte: last7DaysStart, $lte: endOfDay(new Date()) },
      $or: [
        classIds.length ? { classId: { $in: classIds } } : null,
        courseIds.length ? { course: { $in: courseIds } } : null
      ].filter(Boolean)
    }).select('date status'),
    Grade.find({
      $or: [
        classIds.length ? { classId: { $in: classIds } } : null,
        courseIds.length ? { course: { $in: courseIds } } : null
      ].filter(Boolean)
    }).select('classId course totalScore'),
    ExamSession.countDocuments({
      status: { $in: ['draft', 'active', 'published'] },
      $or: [
        classIds.length ? { classId: { $in: classIds } } : null,
        assignments.length ? { teacherAssignmentId: { $in: assignments.map((item) => item._id) } } : null
      ].filter(Boolean)
    }),
    Homework.find({
      dueDate: { $gte: startOfDay(new Date()), $lte: upcomingWindowEnd },
      $or: [
        classIds.length ? { classId: { $in: classIds } } : null,
        courseIds.length ? { course: { $in: courseIds } } : null
      ].filter(Boolean)
    })
      .sort({ dueDate: 1 })
      .limit(5)
      .select('title dueDate')
  ]);

  const labelMap = buildClassLabelMap(classDocs, courseItems);
  const attendanceByDay = new Map();
  attendanceRows.forEach((item) => {
    const label = formatDateLabel(item.date, { month: 'short', day: 'numeric' });
    const bucket = attendanceByDay.get(label) || { present: 0, absent: 0, sick: 0, leave: 0, total: 0 };
    const normalizedStatus = normalizeAttendanceStatus(item.status);
    bucket.total += 1;
    if (normalizedStatus === 'present') bucket.present += 1;
    if (normalizedStatus === 'sick') bucket.sick += 1;
    if (normalizedStatus === 'leave') bucket.leave += 1;
    if (normalizedStatus === 'absent') bucket.absent += 1;
    attendanceByDay.set(label, bucket);
  });

  const attendanceTrend = buildRecentDayBuckets(7).map((bucket) => {
    const entry = attendanceByDay.get(bucket.label) || { present: 0, absent: 0, sick: 0, leave: 0, total: 0 };
    return {
      label: bucket.label,
      value: asPercent(entry.present + entry.sick + entry.leave, entry.total || 1),
      meta: entry.total ? `${entry.present} حاضر • ${entry.absent} غایب` : 'بدون ثبت'
    };
  });

  const classPerformanceMap = new Map();
  gradeRows.forEach((item) => {
    const key = String(item.classId || item.course || '');
    if (!key) return;
    const bucket = classPerformanceMap.get(key) || { total: 0, count: 0 };
    bucket.total += Number(item.totalScore || 0);
    bucket.count += 1;
    classPerformanceMap.set(key, bucket);
  });

  const classPerformance = [...classPerformanceMap.entries()]
    .map(([key, value]) => ({
      label: labelMap.get(key) || 'صنف',
      value: Number((value.total / Math.max(value.count, 1)).toFixed(1)),
      meta: `${value.count} شاگرد`
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 6);

  const attendanceRate = asPercent(
    attendanceRows.filter((item) => isCountedAsAttended(item.status)).length,
    attendanceRows.length || 1
  );
  const activeStudents = uniqueObjectIdStrings(memberships.map((item) => item.student)).length;
  const activeClasses = uniqueObjectIdStrings([...classIds, ...courseIds]).length;

  const alerts = [];
  if (attendanceRate && attendanceRate < 75) {
    alerts.push({
      id: 'teacher-attendance-alert',
      label: 'نرخ حضور هفتگی این هفته پایین‌تر از حد مطلوب است.',
      meta: `${attendanceRate}%`,
      tone: 'rose'
    });
  }
  const weakestClass = [...classPerformance].sort((a, b) => a.value - b.value)[0];
  if (weakestClass && weakestClass.value < 60) {
    alerts.push({
      id: 'teacher-class-alert',
      label: `میانگین ${weakestClass.label} نیاز به پیگیری دارد.`,
      meta: `${weakestClass.value.toLocaleString('fa-AF-u-ca-persian')} از 100`,
      tone: 'copper'
    });
  }

  return {
    generatedAt: new Date().toISOString(),
    summary: {
      activeClasses,
      activeStudents,
      attendanceRate,
      activeExams: Number(activeExamCount || 0),
      todayLessons: todaySchedule.length,
      pendingJoinRequests: joinRequests.length
    },
    attendanceTrend,
    classPerformance,
    alerts,
    tasks: [
      {
        id: 'teacher-join-tasks',
        label: 'درخواست‌های پیوستن شاگردان',
        meta: `${joinRequests.length.toLocaleString('fa-AF-u-ca-persian')} مورد در انتظار`,
        tone: joinRequests.length ? 'rose' : 'teal'
      },
      {
        id: 'teacher-schedule-tasks',
        label: 'برنامه‌های امروز',
        meta: `${todaySchedule.length.toLocaleString('fa-AF-u-ca-persian')} ساعت درسی`,
        tone: todaySchedule.length ? 'mint' : 'slate'
      },
      {
        id: 'teacher-homework-tasks',
        label: 'تکالیف نزدیک',
        meta: `${upcomingHomework.length.toLocaleString('fa-AF-u-ca-persian')} مورد تا هفت روز`,
        tone: upcomingHomework.length ? 'copper' : 'slate'
      }
    ],
    todaySchedule: todaySchedule.map((item) => ({
      id: String(item._id || ''),
      label: item.subject || 'درس',
      meta: `${item.startTime || '--:--'} تا ${item.endTime || '--:--'} • ${item.course?.title || 'صنف'}`
    }))
  };
}

async function getAdminDashboard() {
  const todayStart = startOfDay(new Date());
  const todayEnd = endOfDay(new Date());
  const monthStart = new Date(todayStart.getFullYear(), todayStart.getMonth(), 1);
  const previousMonthStart = new Date(todayStart.getFullYear(), todayStart.getMonth() - 1, 1);
  const previousMonthEnd = new Date(monthStart.getTime() - 1);
  const attendanceStart = startOfDay(shiftDays(new Date(), -29));

  const [
    totalStudents,
    totalInstructors,
    outstandingStats,
    approvedPayments,
    attendanceRows,
    pendingProfileRequests,
    pendingAccessRequests,
    pendingFinanceReviews,
    overdueOrders,
    draftSchedules,
    recentMemberships
  ] = await Promise.all([
    User.countDocuments({ role: 'student', status: 'active' }),
    User.countDocuments({ role: 'instructor', status: 'active' }),
    FeeOrder.aggregate([
      { $match: { status: { $ne: 'void' } } },
      {
        $group: {
          _id: null,
          totalDue: { $sum: '$amountDue' },
          outstandingAmount: { $sum: '$outstandingAmount' }
        }
      }
    ]),
    FeePayment.find({ status: 'approved' }).select('amount paidAt'),
    Attendance.find({
      date: { $gte: attendanceStart, $lte: todayEnd }
    }).select('status date'),
    ProfileUpdateRequest.countDocuments({ status: 'pending' }),
    AccessRequest.countDocuments({ status: 'pending' }),
    FeePayment.countDocuments({ status: 'pending' }),
    FeeOrder.countDocuments({ status: 'overdue' }),
    Schedule.countDocuments({ visibility: 'draft' }),
    StudentMembership.find({
      createdAt: { $gte: new Date(previousMonthStart.getFullYear(), previousMonthStart.getMonth() - 4, 1) }
    }).select('createdAt joinedAt')
  ]);

  const financeSummary = outstandingStats[0] || { totalDue: 0, outstandingAmount: 0 };
  const monthlyRevenue = sumBy(
    approvedPayments.filter((item) => item.paidAt && new Date(item.paidAt) >= monthStart),
    (item) => item.amount
  );
  const previousMonthRevenue = sumBy(
    approvedPayments.filter((item) => {
      const paidAt = item.paidAt ? new Date(item.paidAt) : null;
      return paidAt && paidAt >= previousMonthStart && paidAt <= previousMonthEnd;
    }),
    (item) => item.amount
  );
  const totalRevenue = sumBy(approvedPayments, (item) => item.amount);
  const todayPayments = approvedPayments.filter((item) => {
    const paidAt = item.paidAt ? new Date(item.paidAt) : null;
    return paidAt && paidAt >= todayStart && paidAt <= todayEnd;
  });
  const attendanceRate = asPercent(
    attendanceRows.filter((item) => isCountedAsAttended(item.status)).length,
    attendanceRows.length || 1
  );

  const studentGrowth = buildRecentMonthBuckets(6).map((bucket) => ({
    label: bucket.label,
    value: recentMemberships.filter((item) => monthKey(item.joinedAt || item.createdAt || new Date()) === bucket.key).length,
    meta: 'عضویت'
  }));

  const revenueTrend = buildRecentMonthBuckets(6).map((bucket) => ({
    label: bucket.label,
    value: Number(sumBy(
      approvedPayments.filter((item) => monthKey(item.paidAt || new Date(0)) === bucket.key),
      (item) => item.amount
    ).toFixed(0)),
    meta: 'افغانی'
  }));

  return {
    generatedAt: new Date().toISOString(),
    summary: {
      totalStudents,
      totalInstructors,
      totalRevenue: Number(totalRevenue.toFixed(0)),
      totalDue: Number((financeSummary.totalDue || 0).toFixed(0)),
      outstandingAmount: Number((financeSummary.outstandingAmount || 0).toFixed(0)),
      attendanceRate,
      todayPayments: todayPayments.length,
      pendingFinanceReviews,
      pendingProfileRequests,
      pendingAccessRequests,
      monthlyRevenue: Number(monthlyRevenue.toFixed(0)),
      previousMonthRevenue: Number(previousMonthRevenue.toFixed(0)),
      monthDeltaPercent: compareMonthChange(monthlyRevenue, previousMonthRevenue)
    },
    studentGrowth,
    revenueTrend,
    alerts: [
      {
        id: 'admin-finance-overdue',
        label: 'بدهی‌های معوق مالی',
        meta: `${Number(overdueOrders || 0).toLocaleString('fa-AF-u-ca-persian')} مورد`,
        tone: overdueOrders ? 'rose' : 'teal'
      },
      {
        id: 'admin-access-pending',
        label: 'درخواست‌های دسترسی در انتظار',
        meta: `${Number(pendingAccessRequests || 0).toLocaleString('fa-AF-u-ca-persian')} مورد`,
        tone: pendingAccessRequests ? 'copper' : 'slate'
      },
      {
        id: 'admin-profile-pending',
        label: 'درخواست‌های تغییر مشخصات',
        meta: `${Number(pendingProfileRequests || 0).toLocaleString('fa-AF-u-ca-persian')} مورد`,
        tone: pendingProfileRequests ? 'mint' : 'slate'
      }
    ],
    tasks: [
      {
        id: 'admin-finance-pending',
        label: 'رسیدهای مالی در انتظار',
        meta: `${Number(pendingFinanceReviews || 0).toLocaleString('fa-AF-u-ca-persian')} مورد`,
        tone: pendingFinanceReviews ? 'rose' : 'teal'
      },
      {
        id: 'admin-schedule-drafts',
        label: 'تقسیم اوقات پیش‌نویس',
        meta: `${Number(draftSchedules || 0).toLocaleString('fa-AF-u-ca-persian')} مورد`,
        tone: draftSchedules ? 'copper' : 'slate'
      },
      {
        id: 'admin-monthly-revenue',
        label: 'مقایسه عواید ماهانه',
        meta: `${compareMonthChange(monthlyRevenue, previousMonthRevenue).toLocaleString('fa-AF-u-ca-persian')}%`,
        tone: monthlyRevenue >= previousMonthRevenue ? 'mint' : 'rose'
      }
    ]
  };
}

async function getExamsDashboard() {
  const [sessions, results] = await Promise.all([
    ExamSession.find({})
      .sort({ createdAt: -1 })
      .limit(18)
      .select('title status createdAt publishedAt'),
    ExamResult.find({})
      .sort({ createdAt: -1 })
      .limit(500)
      .select('sessionId resultStatus percentage createdAt')
  ]);

  const activeSessions = sessions.filter((item) => item.status === 'active').length;
  const publishedSessions = sessions.filter((item) => item.status === 'published').length;
  const draftSessions = sessions.filter((item) => item.status === 'draft').length;
  const pendingResults = results.filter((item) => item.resultStatus === 'pending').length;
  const completedResults = results.filter((item) => item.resultStatus !== 'pending');
  const averageMark = completedResults.length
    ? Number((sumBy(completedResults, (item) => item.percentage) / completedResults.length).toFixed(1))
    : 0;
  const passedResults = completedResults.filter((item) => ['passed', 'distinction', 'conditional'].includes(String(item.resultStatus || ''))).length;
  const passRate = asPercent(passedResults, completedResults.length || 1);

  const sessionMap = new Map(sessions.map((item) => [String(item._id), item.title || 'جلسه امتحان']));
  const recentSessionStatsMap = new Map();
  completedResults.forEach((item) => {
    const key = String(item.sessionId || '');
    if (!key) return;
    const bucket = recentSessionStatsMap.get(key) || { total: 0, count: 0 };
    bucket.total += Number(item.percentage || 0);
    bucket.count += 1;
    recentSessionStatsMap.set(key, bucket);
  });

  return {
    generatedAt: new Date().toISOString(),
    summary: {
      activeSessions,
      publishedSessions,
      draftSessions,
      averageMark,
      passRate,
      pendingResults
    },
    statusTrend: ['draft', 'active', 'closed', 'published', 'archived'].map((status) => ({
      label: status === 'draft'
        ? 'پیش‌نویس'
        : status === 'active'
          ? 'فعال'
          : status === 'closed'
            ? 'بسته'
            : status === 'published'
              ? 'منتشرشده'
              : 'آرشیف',
      value: sessions.filter((item) => item.status === status).length,
      meta: 'جلسه'
    })),
    recentSessions: [...recentSessionStatsMap.entries()]
      .map(([key, value]) => ({
        label: sessionMap.get(key) || 'جلسه امتحان',
        value: Number((value.total / Math.max(value.count, 1)).toFixed(1)),
        meta: `${value.count} نتیجه`
      }))
      .slice(0, 6),
    alerts: [
      {
        id: 'exam-draft-alert',
        label: 'جلسه‌های پیش‌نویس امتحان هنوز نهایی نشده‌اند.',
        meta: `${draftSessions.toLocaleString('fa-AF-u-ca-persian')} جلسه`,
        tone: draftSessions ? 'copper' : 'slate'
      },
      {
        id: 'exam-pending-alert',
        label: 'نتیجه‌های در انتظار محاسبه هنوز باقی مانده‌اند.',
        meta: `${pendingResults.toLocaleString('fa-AF-u-ca-persian')} مورد`,
        tone: pendingResults ? 'rose' : 'slate'
      }
    ],
    tasks: [
      {
        id: 'exam-active-sessions',
        label: 'جلسه‌های فعال',
        meta: `${activeSessions.toLocaleString('fa-AF-u-ca-persian')} جلسه`,
        tone: activeSessions ? 'teal' : 'slate'
      },
      {
        id: 'exam-published-sessions',
        label: 'جلسه‌های منتشرشده',
        meta: `${publishedSessions.toLocaleString('fa-AF-u-ca-persian')} جلسه`,
        tone: publishedSessions ? 'mint' : 'slate'
      },
      {
        id: 'exam-pass-rate',
        label: 'نرخ کامیابی',
        meta: `${passRate.toLocaleString('fa-AF-u-ca-persian')}%`,
        tone: passRate >= 60 ? 'mint' : 'copper'
      }
    ]
  };
}

async function getParentDashboard(viewer = {}, options = {}) {
  const viewerRole = String(viewer?.role || '').trim().toLowerCase();
  const requestedStudentId = String(options.studentId || '').trim();
  const resolvedStudentId = viewerRole === 'student'
    ? String(viewer?.id || '').trim()
    : viewerRole === 'admin' && mongoose.Types.ObjectId.isValid(requestedStudentId)
      ? requestedStudentId
      : '';

  if (!resolvedStudentId || !mongoose.Types.ObjectId.isValid(resolvedStudentId)) {
    return {
      previewMode: true,
      setupNeeded: true,
      linkedStudent: null,
      summary: {
        attendanceRate: 0,
        averageScore: 0,
        outstandingAmount: 0,
        paidAmount: 0,
        pendingHomework: 0,
        upcomingLessons: 0
      },
      financeBreakdown: [],
      tasks: [],
      alerts: [],
      schedule: [],
      message: 'برای نقش ولی/سرپرست هنوز اتصال رسمی حساب والدین به متعلم در سیستم تعریف نشده است.'
    };
  }

  const studentUserId = new mongoose.Types.ObjectId(resolvedStudentId);
  const membership = await StudentMembership.findOne({
    student: studentUserId,
    status: 'active',
    isCurrent: true
  })
    .populate('student', 'name email')
    .populate('classId', 'title titleDari')
    .populate('course', 'title')
    .populate('academicYearId', 'title');

  if (!membership) {
    return {
      previewMode: viewerRole !== 'parent',
      setupNeeded: true,
      linkedStudent: null,
      summary: {
        attendanceRate: 0,
        averageScore: 0,
        outstandingAmount: 0,
        paidAmount: 0,
        pendingHomework: 0,
        upcomingLessons: 0
      },
      financeBreakdown: [],
      tasks: [],
      alerts: [],
      schedule: [],
      message: 'برای این متعلم عضویت فعال آموزشی پیدا نشد.'
    };
  }

  const membershipId = membership._id;
  const today = new Date();
  const todayKey = toDateKey(today);
  const weekStart = startOfDay(shiftDays(today, -6));
  const upcomingHomeworkEnd = endOfDay(shiftDays(today, 7));

  const [orders, payments, attendanceRows, grades, upcomingHomework, submittedHomework, todaySchedule] = await Promise.all([
    FeeOrder.find({
      studentMembershipId: membershipId,
      status: { $ne: 'void' }
    }).select('title amountDue amountPaid outstandingAmount status dueDate'),
    FeePayment.find({
      studentMembershipId: membershipId,
      status: 'approved'
    }).select('amount paidAt'),
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
    HomeworkSubmission.find({ student: studentUserId }).select('homework'),
    membership.course
      ? Schedule.find({ course: membership.course._id, date: todayKey })
          .sort({ startTime: 1 })
          .select('subject startTime endTime')
      : Promise.resolve([])
  ]);

  const attendanceRate = asPercent(
    attendanceRows.filter((item) => isCountedAsAttended(item.status)).length,
    attendanceRows.length || 1
  );
  const averageScore = grades.length
    ? Number((sumBy(grades, (item) => item.totalScore) / grades.length).toFixed(1))
    : 0;
  const outstandingAmount = sumBy(orders, (item) => item.outstandingAmount);
  const paidAmount = sumBy(payments, (item) => item.amount);
  const submittedHomeworkIds = new Set(submittedHomework.map((item) => String(item.homework || '')));
  const pendingHomework = upcomingHomework.filter((item) => !submittedHomeworkIds.has(String(item._id))).length;

  return {
    previewMode: viewerRole !== 'parent',
    setupNeeded: false,
    linkedStudent: {
      id: String(membership.student?._id || studentUserId),
      name: membership.student?.name || 'متعلم',
      email: membership.student?.email || '',
      classTitle: membership.classId?.titleDari || membership.classId?.title || membership.course?.title || 'صنف',
      academicYearTitle: membership.academicYearId?.title || '',
      membershipId: String(membershipId)
    },
    summary: {
      attendanceRate,
      averageScore,
      outstandingAmount: Number(outstandingAmount.toFixed(0)),
      paidAmount: Number(paidAmount.toFixed(0)),
      pendingHomework,
      upcomingLessons: todaySchedule.length
    },
    financeBreakdown: [
      {
        label: 'بدهی باز',
        value: Number(outstandingAmount.toFixed(0)),
        meta: `${orders.filter((item) => Number(item.outstandingAmount || 0) > 0).length.toLocaleString('fa-AF-u-ca-persian')} مورد`
      },
      {
        label: 'پرداخت‌های ثبت‌شده',
        value: Number(paidAmount.toFixed(0)),
        meta: `${payments.length.toLocaleString('fa-AF-u-ca-persian')} رسید`
      },
      {
        label: 'کارخانگی‌های مانده',
        value: pendingHomework,
        meta: `${upcomingHomework.length.toLocaleString('fa-AF-u-ca-persian')} مورد پیش‌رو`
      }
    ],
    tasks: [
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
    message: viewerRole !== 'parent'
      ? 'این صفحه فعلاً در حالت پیش‌نمایش ولی/سرپرست کار می‌کند تا زمانی که نقش رسمی والدین و اتصال مستقیم guardian پیاده شود.'
      : ''
  };
}

module.exports = {
  getTeacherDashboard,
  getAdminDashboard,
  getExamsDashboard
};
