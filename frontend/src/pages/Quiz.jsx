import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import './Quiz.css';

import { API_BASE } from '../config/api';

const normalizeQuizQuestion = (item = {}) => {
  const text = String(item?.text || item?.questionText || '').trim();
  const correctIndex = Number.isInteger(item?.correctIndex)
    ? item.correctIndex
    : Number(item?.correctIndex ?? item?.correctAnswer ?? 0) || 0;

  return {
    ...item,
    text,
    options: Array.isArray(item?.options) ? item.options : [],
    correctIndex
  };
};

export default function Quiz() {
  const { courseId: identifier } = useParams();
  const [quiz, setQuiz] = useState(null);
  const [course, setCourse] = useState(null);
  const [answers, setAnswers] = useState({});
  const [result, setResult] = useState(null);
  const [message, setMessage] = useState('');

  const loadQuiz = async () => {
    try {
      setMessage('');
      setResult(null);
      setAnswers({});

      const courseRes = await fetch(`${API_BASE}/api/education/public-school-classes/${identifier}`);
      const courseData = await courseRes.json();
      if (!courseData?.success) {
        setCourse(null);
        setQuiz(null);
        setMessage(courseData?.message || 'ØµÙ†Ù Ù¾ÛŒØ¯Ø§ Ù†Ø´Ø¯.');
        return;
      }

      const courseItem = courseData?.item || null;
      setCourse(courseItem);
      const subject = courseItem?.tags?.[0] || courseItem?.title || '';
      if (!subject) {
        setQuiz(null);
        setMessage('مضمونی برای آزمون یافت نشد.');
        return;
      }

      const classId = courseItem?.classId
        || courseItem?.schoolClassRef?._id
        || courseItem?.schoolClassRef
        || courseItem?.schoolClass?.id
        || courseItem?.schoolClass?._id
        || '';
      const compatibilityCourseId = courseItem?.courseId
        || courseItem?.legacyCourseId
        || ((courseItem?._id && courseItem._id !== classId) ? courseItem._id : '');
      const params = new URLSearchParams();
      if (classId) params.set('classId', classId);
      if (compatibilityCourseId) params.set('courseId', compatibilityCourseId);

      const quizRes = await fetch(`${API_BASE}/api/quizzes/subject/${encodeURIComponent(subject)}${params.toString() ? `?${params.toString()}` : ''}`);
      const quizData = await quizRes.json();
      if (!quizData?.success) {
        setQuiz(null);
        setMessage(quizData?.message || 'آزمون پیدا نشد.');
        return;
      }
      const nextQuiz = quizData.quiz || null;
      setQuiz(nextQuiz ? {
        ...nextQuiz,
        questions: Array.isArray(nextQuiz.questions) ? nextQuiz.questions.map(normalizeQuizQuestion) : []
      } : null);
      setMessage('');
    } catch {
      setCourse(null);
      setQuiz(null);
      setMessage('خطا در دریافت آزمون');
    }
  };

  useEffect(() => {
    loadQuiz();
  }, [identifier]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!quiz) return;
    let score = 0;
    quiz.questions.forEach((item, idx) => {
      const selected = answers[idx];
      if (selected === item.correctIndex) score += 1;
    });
    setResult({ score, total: quiz.questions.length });
  };

  if (message) {
    return (
      <div className="quiz-page">
        <div className="quiz-card">
          <div className="card-back">
            <button type="button" onClick={() => window.history.back()}>بازگشت</button>
          </div>
          <h2>آزمون</h2>
          <p>{message}</p>
        </div>
      </div>
    );
  }

  if (!quiz) {
    return (
      <div className="quiz-page">
        <div className="quiz-card">
          <div className="card-back">
            <button type="button" onClick={() => window.history.back()}>بازگشت</button>
          </div>
          <p>در حال بارگذاری...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="quiz-page">
      <div className="quiz-card">
        <div className="card-back">
          <button type="button" onClick={() => window.history.back()}>بازگشت</button>
        </div>
        <div className="quiz-header">
          <div>
            <h2>آزمون {quiz.subject}</h2>
            <p>{course?.title || 'صنف'} - تعداد سوالات {quiz.questions.length}</p>
          </div>
          <span className="quiz-badge">آنلاین</span>
        </div>

        <form className="quiz-form" onSubmit={handleSubmit}>
          {quiz.questions.map((item, idx) => (
            <div key={idx} className="quiz-question">
              <h3>{item.text}</h3>
              <div className="quiz-options">
                {item.options.map((opt, optIdx) => (
                  <label key={optIdx} className={answers[idx] === optIdx ? 'active' : ''}>
                    <input
                      type="radio"
                      name={`q-${idx}`}
                      checked={answers[idx] === optIdx}
                      onChange={() => setAnswers((prev) => ({ ...prev, [idx]: optIdx }))}
                    />
                    {opt}
                  </label>
                ))}
              </div>
            </div>
          ))}
          <button type="submit">ثبت آزمون</button>
          {result && (
            <div className="quiz-result">
              نتیجه: {result.score} از {result.total}
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
