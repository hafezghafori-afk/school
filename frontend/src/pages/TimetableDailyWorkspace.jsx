import React, { useCallback, useEffect, useState } from 'react';
import usePageMeta from '../hooks/usePageMeta';
import DailyTimetableBoard from './DailyTimetableBoard';
import { toast } from 'react-hot-toast';
import {
  clearDailyTimetableDraft,
  isValidObjectId,
  readDailyTimetableDraft,
  resolveTimetableSchoolId,
  writeDailyTimetableDraft
} from '../utils/dailyTimetableDraft';
import './TimetableDailyWorkspace.css';

const getAuthHeaders = () => {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

export default function TimetableDailyWorkspace({
  metaTitle = 'جدول روزانه‌ی استادان',
  metaDescription = 'نمای ساده و روزانه‌ی تقسیم اوقات استادان.'
}) {
  usePageMeta({
    title: metaTitle,
    description: metaDescription
  });

  const [classes, setClasses] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [teacherAssignments, setTeacherAssignments] = useState([]);
  const [persistedDraft, setPersistedDraft] = useState(null);
  const [loading, setLoading] = useState(true);

  const schoolId = resolveTimetableSchoolId();
  const hasConcreteSchoolId = isValidObjectId(schoolId);
  const canLoadSchoolData = hasConcreteSchoolId || schoolId === 'default-school-id';
  const canPersistDraft = canLoadSchoolData;

  const persistDraftToServer = useCallback(async (draftPayload = {}) => {
    const localDraft = writeDailyTimetableDraft({ ...draftPayload, schoolId });
    if (!canLoadSchoolData) {
      setPersistedDraft(localDraft);
      return localDraft;
    }

    try {
      const response = await fetch('/api/timetables/daily-draft', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders()
        },
        body: JSON.stringify({
          ...draftPayload,
          schoolId
        })
      });
      const data = await response.json();
      if (!response.ok || !data?.success) {
        throw new Error(data?.message || 'Failed to save daily timetable draft.');
      }

      const normalized = writeDailyTimetableDraft(data.item || localDraft || { ...draftPayload, schoolId });
      setPersistedDraft(normalized);
      return normalized;
    } catch (error) {
      console.error('Error saving daily timetable draft to server:', error);
      setPersistedDraft(localDraft);
      return localDraft;
    }
  }, [canLoadSchoolData, schoolId]);

  const publishDraftToServer = useCallback(async (draftPayload = persistedDraft || readDailyTimetableDraft() || {}) => {
    const localDraft = writeDailyTimetableDraft({ ...draftPayload, schoolId });
    if (!localDraft?.items?.length) {
      const error = new Error('ابتدا باید حداقل یک زنگ برای نشر ثبت شود.');
      toast.error(error.message);
      throw error;
    }

    if (!canLoadSchoolData) {
      const error = new Error('شناسه مکتب برای نشر تقسیم اوقات در دسترس نیست.');
      toast.error(error.message);
      throw error;
    }

    try {
      const response = await fetch('/api/timetables/daily-draft/publish', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders()
        },
        body: JSON.stringify({
          schoolId,
          activeClassId: localDraft.activeClassId || '',
          selectedDay: localDraft.selectedDay || '',
          items: Array.isArray(localDraft.items) ? localDraft.items : []
        })
      });
      const data = await response.json();
      if (!response.ok || !data?.success) {
        throw new Error(data?.message || 'Failed to publish daily timetable draft.');
      }

      const normalized = writeDailyTimetableDraft(data.item || localDraft);
      setPersistedDraft(normalized);
      toast.success('تقسیم اوقات نشر شد.');
      return normalized;
    } catch (error) {
      console.error('Error publishing daily timetable draft:', error);
      toast.error(error?.message || 'نشر تقسیم اوقات ناموفق بود.');
      throw error;
    }
  }, [canLoadSchoolData, persistedDraft, schoolId]);

  const clearPersistedDraft = useCallback(async () => {
    clearDailyTimetableDraft();
    setPersistedDraft(null);

    if (!canPersistDraft) return;

    try {
      const response = await fetch(`/api/timetables/daily-draft?schoolId=${encodeURIComponent(schoolId)}`, {
        method: 'DELETE',
        headers: { ...getAuthHeaders() }
      });
      const data = await response.json().catch(() => null);
      if (response.ok && data?.success && data?.item) {
        const normalized = writeDailyTimetableDraft(data.item);
        setPersistedDraft(normalized);
        return normalized;
      }
    } catch (error) {
      console.error('Error deleting daily timetable draft from server:', error);
    }
    return null;
  }, [canPersistDraft, schoolId]);

  useEffect(() => {
    let isMounted = true;

    const loadCollection = async (primaryPath, fallbackPath = '') => {
      try {
        const response = await fetch(primaryPath, { headers: { ...getAuthHeaders() } });
        const data = await response.json();
        let items = Array.isArray(data?.data) ? data.data : Array.isArray(data?.items) ? data.items : [];

        if (!items.length && fallbackPath && schoolId !== 'default-school-id') {
          const fallbackResponse = await fetch(fallbackPath, { headers: { ...getAuthHeaders() } });
          const fallbackData = await fallbackResponse.json();
          items = Array.isArray(fallbackData?.data)
            ? fallbackData.data
            : Array.isArray(fallbackData?.items)
              ? fallbackData.items
              : [];
        }

        return items;
      } catch (error) {
        console.error(`Error loading collection from ${primaryPath}:`, error);
        return [];
      }
    };

    const loadRegisteredSubjects = async () => {
      const educationItems = await loadCollection('/api/education/subjects');
      if (educationItems.length) return educationItems;

      return loadCollection(
        `/api/subjects/school/${schoolId}`,
        '/api/subjects/school/default-school-id'
      );
    };

    const loadPersistedDraft = async () => {
      const localDraft = readDailyTimetableDraft();
      if (!canPersistDraft) return localDraft;

      try {
        const response = await fetch(`/api/timetables/daily-draft?schoolId=${encodeURIComponent(schoolId)}`, {
          headers: { ...getAuthHeaders() }
        });
        const data = await response.json();

        if (response.ok && data?.success && data?.item) {
          return writeDailyTimetableDraft(data.item);
        }

        if (localDraft?.isCustomized) {
          return persistDraftToServer(localDraft);
        }

        return localDraft;
      } catch (error) {
        console.error('Error loading daily timetable draft from server:', error);
        return localDraft;
      }
    };

    const loadTimetableInputs = async () => {
      if (!canLoadSchoolData) {
        if (isMounted) {
          setPersistedDraft(readDailyTimetableDraft());
          setLoading(false);
        }
        return;
      }

      try {
        const [classItems, teacherItems, subjectItems, assignmentItems, draftItem] = await Promise.all([
          loadCollection(
            `/api/school-classes/school/${schoolId}`,
            '/api/school-classes/school/default-school-id'
          ),
          loadCollection(`/api/users/school/${schoolId}?role=teacher`),
          loadRegisteredSubjects(),
          loadCollection(`/api/teacher-assignments/school/${schoolId}`),
          loadPersistedDraft()
        ]);

        if (!isMounted) return;

        setClasses(classItems);
        setTeachers(teacherItems);
        setSubjects(subjectItems);
        setTeacherAssignments(assignmentItems);
        setPersistedDraft(draftItem || null);
      } catch (error) {
        console.error('Error loading timetable workspace inputs:', error);
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    loadTimetableInputs();

    return () => {
      isMounted = false;
    };
  }, [canLoadSchoolData, canPersistDraft, persistDraftToServer, schoolId]);

  if (loading) {
    return (
      <section className="tt-daily-page">
        <div className="tt-daily-page-glow tt-daily-page-glow--one" />
        <div className="tt-daily-page-glow tt-daily-page-glow--two" />
        <div className="tt-daily-wrap">
          <div className="tt-daily-loading">
            در حال آماده‌سازی جدول روزانه...
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="tt-daily-page">
      <div className="tt-daily-page-glow tt-daily-page-glow--one" />
      <div className="tt-daily-page-glow tt-daily-page-glow--two" />
      <div className="tt-daily-wrap">
        <DailyTimetableBoard
          teachers={teachers}
          subjects={subjects}
          classes={classes}
          teacherAssignments={teacherAssignments}
          defaultActiveClassId={classes[0]?._id || ''}
          persistedDraft={persistedDraft}
          onPersistDraft={persistDraftToServer}
          onPublishDraft={publishDraftToServer}
          onClearDraft={clearPersistedDraft}
          editable
        />
      </div>
    </section>
  );
}
