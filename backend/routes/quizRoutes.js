const express = require('express');
const Course = require('../models/Course');
const SchoolClass = require('../models/SchoolClass');
const Quiz = require('../models/Quiz');
const { requireAuth, requireRole, requirePermission } = require('../middleware/auth');
const { logActivity } = require('../utils/activity');

const router = express.Router();

const normalizeText = (value) => String(value || '').trim();
const isObjectId = (value) => /^[a-f\d]{24}$/i.test(normalizeText(value));

const getQuestionText = (item = {}) => normalizeText(item?.text || item?.questionText);

const normalizeQuestion = (item = {}) => {
  const text = getQuestionText(item);
  const options = Array.isArray(item?.options)
    ? item.options.map((option) => normalizeText(option)).filter(Boolean)
    : [];
  const rawAnswer = item?.correctIndex !== undefined ? item.correctIndex : item?.correctAnswer;
  const parsedAnswer = Number(rawAnswer);
  const correctAnswer = Number.isInteger(parsedAnswer) && parsedAnswer >= 0 && parsedAnswer < options.length
    ? parsedAnswer
    : 0;

  return {
    questionText: text,
    options,
    correctAnswer
  };
};

const serializeQuiz = (item) => {
  const plain = item?.toObject ? item.toObject() : item;
  const questions = Array.isArray(plain?.questions) ? plain.questions : [];

  return {
    ...plain,
    courseId: plain?.course?._id || plain?.course || null,
    classId: plain?.classId?._id || plain?.classId || null,
    questions: questions.map((question) => {
      const questionText = normalizeText(question?.questionText || question?.text);
      const correctAnswer = Number.isInteger(question?.correctAnswer)
        ? question.correctAnswer
        : Number(question?.correctAnswer || question?.correctIndex || 0) || 0;

      return {
        ...question,
        text: questionText,
        questionText,
        options: Array.isArray(question?.options) ? question.options : [],
        correctIndex: correctAnswer,
        correctAnswer
      };
    })
  };
};

const resolveQuizClassReference = async ({ classId = '', courseId = '' } = {}) => {
  const normalizedClassId = isObjectId(classId) ? normalizeText(classId) : '';
  const normalizedCourseId = isObjectId(courseId) ? normalizeText(courseId) : '';
  let schoolClass = null;
  let course = null;

  if (normalizedClassId) {
    schoolClass = await SchoolClass.findById(normalizedClassId).select('_id legacyCourseId title');
    if (!schoolClass) {
      return { error: 'Class is invalid.' };
    }
    if (schoolClass.legacyCourseId) {
      course = await Course.findById(schoolClass.legacyCourseId).select('_id schoolClassRef title');
    }
  }

  if (normalizedCourseId) {
    const linkedCourse = await Course.findById(normalizedCourseId).select('_id schoolClassRef title');
    if (!linkedCourse) {
      return { error: 'Course is invalid.' };
    }
    if (course && String(course._id || '') !== String(linkedCourse._id || '')) {
      return { error: 'classId and courseId do not match.' };
    }
    course = course || linkedCourse;
    if (!schoolClass && linkedCourse.schoolClassRef) {
      schoolClass = await SchoolClass.findById(linkedCourse.schoolClassRef).select('_id legacyCourseId title');
    }
  }

  return {
    schoolClass,
    course,
    classId: schoolClass?._id ? String(schoolClass._id) : '',
    courseId: course?._id ? String(course._id) : ''
  };
};

router.post('/create', requireAuth, requireRole(['admin', 'instructor']), requirePermission('manage_content'), async (req, res) => {
  try {
    const classId = normalizeText(req.body?.classId);
    const courseId = normalizeText(req.body?.courseId);
    const subject = normalizeText(req.body?.subject);
    const questions = Array.isArray(req.body?.questions) ? req.body.questions : [];

    if ((!classId && !courseId) || !subject || !questions.length) {
      return res.status(400).json({ success: false, message: 'Class, subject, and questions are required.' });
    }

    const classRef = await resolveQuizClassReference({ classId, courseId });
    if (classRef.error) {
      return res.status(400).json({ success: false, message: classRef.error });
    }
    if (!classRef.classId) {
      return res.status(400).json({ success: false, message: 'Class mapping is required before creating a quiz.' });
    }

    const normalizedQuestions = questions
      .map(normalizeQuestion)
      .filter((question) => question.questionText && question.options.length >= 2);

    if (!normalizedQuestions.length) {
      return res.status(400).json({ success: false, message: 'At least one valid question is required.' });
    }

    const quiz = await Quiz.create({
      course: classRef.courseId || null,
      classId: classRef.classId || null,
      subject,
      questions: normalizedQuestions
    });

    await logActivity({
      req,
      action: 'create_quiz',
      targetType: 'Quiz',
      targetId: quiz._id.toString(),
      meta: {
        subject,
        classId: classRef.classId || '',
        courseId: classRef.courseId || ''
      }
    });

    res.status(201).json({ success: true, quiz: serializeQuiz(quiz) });
  } catch {
    res.status(500).json({ success: false, message: 'Failed to create quiz.' });
  }
});

router.get('/subject/:subject', async (req, res) => {
  try {
    const subject = normalizeText(req.params?.subject);
    const classId = normalizeText(req.query?.classId);
    const courseId = normalizeText(req.query?.courseId);

    if (!subject) {
      return res.status(400).json({ success: false, message: 'Subject is required.' });
    }

    let filter = { subject };
    if (classId || courseId) {
      const classRef = await resolveQuizClassReference({ classId, courseId });
      if (classRef.error) {
        return res.status(400).json({ success: false, message: classRef.error });
      }
      if (!classRef.classId) {
        return res.status(400).json({ success: false, message: 'Class mapping is required for quiz lookup.' });
      }
      filter.classId = classRef.classId;
    }

    const quiz = await Quiz.findOne(filter).sort({ createdAt: -1, updatedAt: -1 });
    if (!quiz) {
      return res.status(404).json({ success: false, message: 'Quiz not found.' });
    }

    res.json({ success: true, quiz: serializeQuiz(quiz) });
  } catch {
    res.status(500).json({ success: false, message: 'Failed to load quiz.' });
  }
});

module.exports = router;
