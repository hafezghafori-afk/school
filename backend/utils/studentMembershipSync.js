const StudentMembership = require('../models/StudentMembership');
const Course = require('../models/Course');

function deriveMembershipStatus(value = '') {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'approved') return 'active';
  if (normalized === 'pending') return 'pending';
  if (normalized === 'rejected') return 'rejected';
  return 'active';
}

function deriveMembershipSource(order = {}) {
  return String(order?.paymentMethod || '') === 'admin_enrollment' ? 'admin' : 'order';
}

async function resolveAcademicYearRef(order = {}) {
  const populatedCourse = order?.course;
  if (populatedCourse && typeof populatedCourse === 'object' && populatedCourse.academicYearRef !== undefined) {
    return populatedCourse.academicYearRef || null;
  }

  if (!order?.course) return null;
  const course = await Course.findById(order.course).select('academicYearRef');
  return course?.academicYearRef || null;
}

async function deactivateCurrentMemberships({
  studentId,
  courseId,
  actorId = null,
  note = '',
  status = 'dropped',
  legacyOrderId = null,
  rejectedReason = ''
} = {}) {
  if (!studentId || !courseId) return { matchedCount: 0, modifiedCount: 0 };

  return StudentMembership.updateMany(
    {
      student: studentId,
      course: courseId,
      isCurrent: true
    },
    {
      $set: {
        status,
        isCurrent: false,
        leftAt: new Date(),
        createdBy: actorId || null,
        note: String(note || '').trim(),
        rejectedReason: status === 'rejected' ? String(rejectedReason || '').trim() : '',
        legacyOrder: legacyOrderId || null
      }
    }
  );
}

async function syncStudentMembershipFromOrder(order, { actorId = null, note = '' } = {}) {
  if (!order?.user || !order?.course) return null;

  const membershipStatus = deriveMembershipStatus(order.status);
  if (membershipStatus !== 'active') {
    await deactivateCurrentMemberships({
      studentId: order.user,
      courseId: order.course,
      actorId,
      note,
      status: membershipStatus,
      legacyOrderId: order._id,
      rejectedReason: membershipStatus === 'rejected' ? order.rejectedReason : ''
    });
    return null;
  }

  const academicYear = await resolveAcademicYearRef(order);
  const basePatch = {
    status: 'active',
    source: deriveMembershipSource(order),
    academicYear,
    isCurrent: true,
    leftAt: null,
    legacyOrder: order._id,
    note: String(note || '').trim(),
    rejectedReason: ''
  };
  if (actorId) basePatch.createdBy = actorId;

  try {
    let item = await StudentMembership.findOne({
      student: order.user,
      course: order.course,
      isCurrent: true
    });

    if (!item) {
      item = new StudentMembership({
        student: order.user,
        course: order.course,
        joinedAt: order.createdAt || new Date(),
        ...basePatch
      });
    } else {
      Object.assign(item, basePatch);
      if (!item.joinedAt) item.joinedAt = order.createdAt || new Date();
    }

    await item.save();
    return item;
  } catch (error) {
    if (error?.code !== 11000) throw error;

    const item = await StudentMembership.findOne({
      student: order.user,
      course: order.course,
      isCurrent: true
    });
    if (!item) throw error;

    Object.assign(item, basePatch);
    if (!item.joinedAt) item.joinedAt = order.createdAt || new Date();
    await item.save();
    return item;
  }
}

module.exports = {
  deriveMembershipStatus,
  deriveMembershipSource,
  deactivateCurrentMemberships,
  syncStudentMembershipFromOrder
};
