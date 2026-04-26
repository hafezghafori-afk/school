const mongoose = require('mongoose');

const Course = require('../models/Course');
const SchoolClass = require('../models/SchoolClass');

const normalizeText = (value = '') => String(value || '').trim();
const isObjectId = (value) => mongoose.isValidObjectId(normalizeText(value));

function serializeSchoolClassLite(value = null) {
  if (!value) return null;
  return {
    _id: value._id || value.id || value,
    id: value._id || value.id || value,
    title: value.title || '',
    code: value.code || '',
    gradeLevel: value.gradeLevel || '',
    section: value.section || ''
  };
}

async function resolveClassCourseReference({ classId = '', courseId = '' } = {}) {
  const normalizedClassId = isObjectId(classId) ? normalizeText(classId) : '';
  const normalizedCourseId = isObjectId(courseId) ? normalizeText(courseId) : '';
  let schoolClass = null;
  let course = null;

  if (normalizedClassId) {
    schoolClass = await SchoolClass.findById(normalizedClassId).select('_id legacyCourseId title code gradeLevel section');
    if (!schoolClass) {
      return { error: 'Class is invalid.' };
    }
    if (schoolClass.legacyCourseId) {
      course = await Course.findById(schoolClass.legacyCourseId).select('_id schoolClassRef title category');
    }
    if (!course) {
      course = await Course.findOne({ schoolClassRef: schoolClass._id, kind: 'academic_class' })
        .sort({ isActive: -1, createdAt: -1 })
        .select('_id schoolClassRef title category');
    }
  }

  if (normalizedCourseId) {
    const linkedCourse = await Course.findById(normalizedCourseId).select('_id schoolClassRef title category');
    if (!linkedCourse) {
      return { error: 'Course is invalid.' };
    }
    if (course && String(course._id || '') !== String(linkedCourse._id || '')) {
      return { error: 'classId and courseId do not match.' };
    }
    course = course || linkedCourse;
    if (!schoolClass && linkedCourse.schoolClassRef) {
      schoolClass = await SchoolClass.findById(linkedCourse.schoolClassRef).select('_id legacyCourseId title code gradeLevel section');
    }
    if (!schoolClass) {
      schoolClass = await SchoolClass.findOne({ legacyCourseId: linkedCourse._id }).select('_id legacyCourseId title code gradeLevel section');
    }
  }

  return {
    schoolClass,
    course,
    classId: schoolClass?._id ? String(schoolClass._id) : '',
    courseId: course?._id ? String(course._id) : ''
  };
}

module.exports = {
  normalizeText,
  isObjectId,
  resolveClassCourseReference,
  serializeSchoolClassLite
};
