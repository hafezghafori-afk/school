import React, { useEffect, useState } from 'react';
import './QuizBuilder.css';

import { API_BASE } from '../config/api';

const getAuthHeaders = () => {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

const getCompatCourseId = (item = {}) => (
  String(item?.courseId || item?.legacyCourseId || item?._id || '').trim()
);

const getCourseClassId = (item = {}) => (
  String(item?.classId || item?.schoolClass?._id || item?.schoolClass?.id || '').trim()
);

const getCourseLabel = (item = {}) => (
  item?.schoolClass?.title
  || item?.title
  || ''
);

const normalizeCourseOptions = (items = [], source = 'courseAccess') => items
  .map((item) => {
    if (source === 'schoolClass') {
      const classId = String(item?.id || item?._id || '').trim();
      return {
        ...item,
        classId: classId || null,
        courseId: String(item?.legacyCourseId || '').trim(),
        schoolClass: {
          _id: classId || null,
          id: classId || null,
          title: item?.title || ''
        }
      };
    }

    return {
      ...item,
      classId: String(item?.classId || item?.schoolClass?._id || item?.schoolClass?.id || '').trim(),
      courseId: String(item?.courseId || item?._id || '').trim(),
      schoolClass: item?.schoolClass || null
    };
  })
  .filter((item) => item.courseId || item.classId);

export default function QuizBuilder() {
  const [courses, setCourses] = useState([]);
  const [courseId, setCourseId] = useState('');
  const [subject, setSubject] = useState('');
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState(['', '', '', '']);
  const [correctIndex, setCorrectIndex] = useState(0);
  const [questions, setQuestions] = useState([]);
  const [message, setMessage] = useState('');

  const loadCourses = async () => {
    try {
      const role = String(localStorage.getItem('role') || '').trim().toLowerCase();
      const isInstructor = role === 'instructor';
      const res = await fetch(`${API_BASE}${isInstructor ? '/api/education/instructor/courses' : '/api/education/school-classes?status=active'}`, {
        headers: { ...getAuthHeaders() }
      });
      const data = await res.json();
      if (!data?.success) {
        setCourses([]);
        setCourseId('');
        return;
      }

      const nextCourses = normalizeCourseOptions(data?.items || [], isInstructor ? 'courseAccess' : 'schoolClass');
      setCourses(nextCourses);
      setCourseId((prev) => {
        if (nextCourses.some((course) => String(getCompatCourseId(course)) === String(prev))) {
          return prev;
        }
        return getCompatCourseId(nextCourses[0]) || '';
      });
    } catch {
      setCourses([]);
      setCourseId('');
    }
  };

  useEffect(() => {
    loadCourses();
  }, []);

  const addQuestion = () => {
    if (!question.trim()) return;
    const filteredOptions = options.map((opt) => opt.trim()).filter(Boolean);
    if (filteredOptions.length < 2) {
      setMessage('حداقل دو گزینه لازم است.');
      return;
    }
    setQuestions((prev) => [
      ...prev,
      { text: question, options: filteredOptions, correctIndex }
    ]);
    setQuestion('');
    setOptions(['', '', '', '']);
    setCorrectIndex(0);
    setMessage('');
  };

  const handleSave = async () => {
    if (!courseId || !subject || !questions.length) {
      setMessage('صنف، مضمون و سوالات لازم است.');
      return;
    }

    const selectedCourse = courses.find((item) => String(getCompatCourseId(item)) === String(courseId)) || null;
    const classId = getCourseClassId(selectedCourse);

    try {
      const res = await fetch(`${API_BASE}/api/quizzes/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({
          classId,
          courseId,
          subject,
          questions
        })
      });
      const data = await res.json();
      if (!data?.success) {
        setMessage(data?.message || 'ذخیره آزمون ناموفق بود.');
        return;
      }
      setMessage('آزمون ذخیره شد.');
      setQuestions([]);
      setSubject('');
    } catch {
      setMessage('خطا در ذخیره آزمون');
    }
  };

  return (
    <div className="quizbuilder-page">
      <div className="quizbuilder-card">
        <div className="card-back">
          <button type="button" onClick={() => window.history.back()}>بازگشت</button>
        </div>
        <h2>سازنده آزمون</h2>
        <p>برای هر مضمون سوالات خود را اضافه کنید.</p>

        <label>انتخاب صنف</label>
        <select value={courseId} onChange={(e) => setCourseId(e.target.value)}>
          {!courses.length && <option value="">No classes found</option>}
          {courses.map((course) => (
            <option key={getCompatCourseId(course) || getCourseClassId(course) || course._id} value={getCompatCourseId(course) || getCourseClassId(course) || course._id}>{getCourseLabel(course)}</option>
          ))}
        </select>

        <label>نام مضمون</label>
        <input value={subject} onChange={(e) => setSubject(e.target.value)} />

        <div className="qb-question">
          <label>سوال</label>
          <input value={question} onChange={(e) => setQuestion(e.target.value)} />
          {options.map((opt, idx) => (
            <input
              key={idx}
              placeholder={`گزینه ${idx + 1}`}
              value={opt}
              onChange={(e) => {
                const val = e.target.value;
                setOptions((prev) => prev.map((current, index) => (index === idx ? val : current)));
              }}
            />
          ))}
          <label>گزینه درست</label>
          <select value={correctIndex} onChange={(e) => setCorrectIndex(Number(e.target.value))}>
            {options.map((_, idx) => (
              <option key={idx} value={idx}>{`گزینه ${idx + 1}`}</option>
            ))}
          </select>
          <button type="button" onClick={addQuestion}>افزودن سوال</button>
        </div>

        <div className="qb-list">
          {questions.map((item, idx) => (
            <div key={idx} className="qb-item">
              <strong>{item.text}</strong>
              <div>{item.options.join(' | ')}</div>
            </div>
          ))}
        </div>

        <button type="button" onClick={handleSave}>ذخیره آزمون</button>
        {message && <div className="qb-message">{message}</div>}
      </div>
    </div>
  );
}
