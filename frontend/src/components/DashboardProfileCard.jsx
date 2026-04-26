import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import './DashboardProfileCard.css';

const roleLabel = (user = {}) => {
  const orgRole = String(user?.orgRole || '').trim().toLowerCase();
  if (orgRole === 'finance_manager') return '\u0645\u062f\u06cc\u0631 \u0645\u0627\u0644\u06cc';
  if (orgRole === 'finance_lead') return '\u0622\u0645\u0631\u06cc\u062a \u0645\u0627\u0644\u06cc';
  if (orgRole === 'school_manager') return '\u0645\u062f\u06cc\u0631 \u0645\u06a9\u062a\u0628';
  if (orgRole === 'academic_manager') return '\u0645\u062f\u06cc\u0631 \u062a\u062f\u0631\u06cc\u0633\u06cc';
  if (orgRole === 'head_teacher') return '\u0633\u0631 \u0645\u0639\u0644\u0645 \u0645\u06a9\u062a\u0628';
  if (orgRole === 'general_president') return '\u0631\u06cc\u0627\u0633\u062a \u0639\u0645\u0648\u0645\u06cc';
  if (orgRole === 'parent') return '\u0648\u0627\u0644\u062f/\u0633\u0631\u067e\u0631\u0633\u062a';
  if (orgRole === 'instructor') return '\u0627\u0633\u062a\u0627\u062f';
  if (orgRole === 'student') return '\u0634\u0627\u06af\u0631\u062f';

  const role = String(user?.role || user || '').trim().toLowerCase();
  if (role === 'admin') return '\u0627\u062f\u0645\u06cc\u0646';
  if (role === 'parent') return '\u0648\u0627\u0644\u062f/\u0633\u0631\u067e\u0631\u0633\u062a';
  if (role === 'instructor') return '\u0627\u0633\u062a\u0627\u062f';
  return '\u0634\u0627\u06af\u0631\u062f';
};

const getAvatarSource = (apiBase, avatarUrl) => {
  if (!avatarUrl) return '';
  return `${apiBase}/${String(avatarUrl).replace(/^\/+/, '')}`;
};

const getAuthHeaders = () => {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

const ACTIVE_TEACHER_ASSIGNMENT_STATUSES = new Set(['active', 'planned', 'pending']);

const normalizeText = (value) => String(value || '').trim();

const uniqueLabels = (items = []) => Array.from(new Set(
  items
    .map((item) => normalizeText(item))
    .filter(Boolean)
));

const getSubjectLabel = (subject) => (
  normalizeText(subject?.nameDari)
  || normalizeText(subject?.name)
  || normalizeText(subject?.namePashto)
  || normalizeText(subject?.code)
  || 'مضمون'
);

const getClassLabel = (schoolClass) => (
  normalizeText(schoolClass?.title)
  || [normalizeText(schoolClass?.gradeLevel), normalizeText(schoolClass?.section)].filter(Boolean).join(' ')
  || 'صنف'
);

const toFaNumber = (value) => Number(value || 0).toLocaleString('fa-AF');

export default function DashboardProfileCard({
  user,
  fallbackName,
  apiBase,
  variant = 'card'
}) {
  const normalizedApiBase = typeof apiBase === 'string' ? apiBase : '';
  const name = user?.name || fallbackName || '\u06a9\u0627\u0631\u0628\u0631';
  const initial = String(name).trim().charAt(0) || 'U';
  const [open, setOpen] = useState(false);
  const [popoverStyle, setPopoverStyle] = useState({});
  const [teacherAssignments, setTeacherAssignments] = useState([]);
  const [teacherAssignmentsLoading, setTeacherAssignmentsLoading] = useState(false);
  const [teacherAssignmentsError, setTeacherAssignmentsError] = useState('');
  const wrapperRef = useRef(null);
  const triggerRef = useRef(null);
  const compactMode = variant === 'dropdown';
  const avatarSource = getAvatarSource(normalizedApiBase, user?.avatarUrl);
  const isInstructorUser = useMemo(() => {
    const role = String(user?.role || '').trim().toLowerCase();
    const orgRole = String(user?.orgRole || '').trim().toLowerCase();
    return role === 'instructor' || orgRole === 'instructor';
  }, [user?.orgRole, user?.role]);
  const assignedClassLabels = useMemo(
    () => uniqueLabels(teacherAssignments.map((item) => getClassLabel(item?.classId))),
    [teacherAssignments]
  );
  const assignedSubjectLabels = useMemo(
    () => uniqueLabels(teacherAssignments.map((item) => getSubjectLabel(item?.subjectId))),
    [teacherAssignments]
  );
  const assignmentPreviewItems = useMemo(
    () => teacherAssignments.slice(0, 4).map((item) => ({
      id: item?._id || `${getClassLabel(item?.classId)}-${getSubjectLabel(item?.subjectId)}`,
      classLabel: getClassLabel(item?.classId),
      subjectLabel: getSubjectLabel(item?.subjectId)
    })),
    [teacherAssignments]
  );

  const handleLogout = () => {
    localStorage.clear();
    window.location.href = '/';
  };

  useEffect(() => {
    const teacherId = String(user?._id || user?.id || '').trim();
    if (compactMode || !isInstructorUser || !teacherId) {
      setTeacherAssignments([]);
      setTeacherAssignmentsLoading(false);
      setTeacherAssignmentsError('');
      return;
    }

    let cancelled = false;

    const loadTeacherAssignments = async () => {
      try {
        setTeacherAssignmentsLoading(true);
        setTeacherAssignmentsError('');
        const response = await fetch(`${normalizedApiBase}/api/teacher-assignments/teacher/${encodeURIComponent(teacherId)}`, {
          headers: { ...getAuthHeaders() }
        });
        const data = await response.json().catch(() => ({}));
        if (cancelled) return;

        if (!data?.success) {
          setTeacherAssignments([]);
          setTeacherAssignmentsError(data?.message || 'اطلاعات تخصیص استاد دریافت نشد.');
          return;
        }

        const items = Array.isArray(data?.data?.assignments) ? data.data.assignments : [];
        setTeacherAssignments(items.filter((item) => (
          ACTIVE_TEACHER_ASSIGNMENT_STATUSES.has(String(item?.status || '').trim().toLowerCase())
        )));
      } catch {
        if (cancelled) return;
        setTeacherAssignments([]);
        setTeacherAssignmentsError('اطلاعات تخصیص استاد دریافت نشد.');
      } finally {
        if (!cancelled) {
          setTeacherAssignmentsLoading(false);
        }
      }
    };

    loadTeacherAssignments();
    return () => {
      cancelled = true;
    };
  }, [compactMode, isInstructorUser, normalizedApiBase, user?._id, user?.id]);

  const updatePopoverPosition = useCallback(() => {
    if (!compactMode || !open) return;

    const triggerEl = triggerRef.current;
    if (!triggerEl || typeof window === 'undefined') return;

    const viewportWidth = window.innerWidth || 1280;
    const viewportHeight = window.innerHeight || 720;
    const edgeGap = 10;
    const preferredWidth = 320;
    const minWidth = 260;

    const triggerRect = triggerEl.getBoundingClientRect();
    const width = Math.max(minWidth, Math.min(preferredWidth, viewportWidth - edgeGap * 2));

    let left = triggerRect.right - width;
    if (left < edgeGap) left = edgeGap;
    const maxLeft = viewportWidth - width - edgeGap;
    if (left > maxLeft) left = maxLeft;

    let top = triggerRect.bottom + 10;
    let maxHeight = Math.min(420, Math.floor(viewportHeight - top - edgeGap));

    if (maxHeight < 220) {
      const upwardSpace = Math.floor(triggerRect.top - edgeGap - 10);
      if (upwardSpace > 220) {
        maxHeight = Math.min(420, upwardSpace);
        top = Math.max(edgeGap, triggerRect.top - maxHeight - 10);
      } else {
        maxHeight = Math.max(200, Math.floor(viewportHeight - top - edgeGap));
      }
    }

    setPopoverStyle({
      position: 'fixed',
      top: `${top}px`,
      left: `${left}px`,
      width: `${width}px`,
      maxHeight: `${Math.max(200, maxHeight)}px`
    });
  }, [compactMode, open]);

  useEffect(() => {
    if (!compactMode || !open) return undefined;

    const handlePointerDown = (event) => {
      if (!wrapperRef.current?.contains(event.target)) {
        setOpen(false);
      }
    };

    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [compactMode, open]);

  useEffect(() => {
    if (!compactMode || !open) return undefined;

    updatePopoverPosition();

    const handleWindowChange = () => updatePopoverPosition();
    window.addEventListener('resize', handleWindowChange);
    window.addEventListener('scroll', handleWindowChange, true);
    return () => {
      window.removeEventListener('resize', handleWindowChange);
      window.removeEventListener('scroll', handleWindowChange, true);
    };
  }, [compactMode, open, updatePopoverPosition]);

  const assignmentSection = !compactMode && isInstructorUser ? (
    <div className="dash-profile-assignment-box">
      <div className="dash-profile-assignment-head">
        <strong>صنف‌ها و مضامین</strong>
        <span>{teacherAssignmentsLoading ? '...' : `${toFaNumber(teacherAssignments.length)} تخصیص`}</span>
      </div>

      {teacherAssignmentsError ? (
        <div className="dash-profile-assignment-empty error">{teacherAssignmentsError}</div>
      ) : null}

      {!teacherAssignmentsError && teacherAssignmentsLoading ? (
        <div className="dash-profile-assignment-empty">در حال دریافت تخصیص‌ها...</div>
      ) : null}

      {!teacherAssignmentsError && !teacherAssignmentsLoading && !teacherAssignments.length ? (
        <div className="dash-profile-assignment-empty">هنوز مضمون یا صنفی برای این استاد ثبت نشده است.</div>
      ) : null}

      {!teacherAssignmentsError && !teacherAssignmentsLoading && teacherAssignments.length > 0 ? (
        <>
          <div className="dash-profile-assignment-summary">
            <div>
              <span>صنف‌ها</span>
              <strong>{assignedClassLabels.join('، ')}</strong>
            </div>
            <div>
              <span>مضامین</span>
              <strong>{assignedSubjectLabels.join('، ')}</strong>
            </div>
          </div>

          <div className="dash-profile-assignment-list">
            {assignmentPreviewItems.map((item) => (
              <div key={item.id} className="dash-profile-assignment-item">
                <strong>{item.subjectLabel}</strong>
                <span>{item.classLabel}</span>
              </div>
            ))}
          </div>
        </>
      ) : null}
    </div>
  ) : null;

  if (compactMode) {
    return (
      <div ref={wrapperRef} className="dash-profile-menu">
        <button
          ref={triggerRef}
          type="button"
          className={`dash-profile-trigger${open ? ' is-open' : ''}`}
          onClick={() => setOpen((current) => !current)}
          aria-haspopup="menu"
          aria-expanded={open}
        >
          {avatarSource ? (
            <img className="dash-profile-avatar" src={avatarSource} alt="avatar" />
          ) : (
            <div className="dash-profile-avatar-fallback">{initial}</div>
          )}
          <span className="dash-profile-trigger-copy">
            <strong>{name}</strong>
            <span>{roleLabel(user)}</span>
          </span>
          <span className="dash-profile-trigger-chevron" aria-hidden="true">▾</span>
        </button>

        {open ? (
          <div className="dash-profile-dropdown dash-profile-dropdown--floating" role="menu" style={popoverStyle}>
            <div className="dash-profile-dropdown__head">
              {avatarSource ? (
                <img className="dash-profile-avatar" src={avatarSource} alt="avatar" />
              ) : (
                <div className="dash-profile-avatar-fallback">{initial}</div>
              )}
              <div className="dash-profile-dropdown__meta">
                <strong>{name}</strong>
                <span>{roleLabel(user)}</span>
                <small>{user?.email || '\u0627\u0633\u062a\u0627\u062f'}</small>
              </div>
            </div>

            {assignmentSection}

            <div className="dash-profile-dropdown__actions">
              <Link to="/profile" className="dash-profile-btn" role="menuitem" onClick={() => setOpen(false)}>
                {'\u062d\u0633\u0627\u0628 \u06a9\u0627\u0631\u0628\u0631\u06cc'}
              </Link>
              <Link
                to="/profile#password"
                className="dash-profile-btn ghost"
                role="menuitem"
                onClick={() => setOpen(false)}
              >
                {'\u062a\u063a\u06cc\u06cc\u0631 \u0631\u0645\u0632'}
              </Link>
              <button type="button" className="dash-profile-btn danger" role="menuitem" onClick={handleLogout}>
                {'\u062e\u0631\u0648\u062c'}
              </button>
            </div>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="dash-profile-card">
      <div className="dash-profile-head">
        {avatarSource ? (
          <img className="dash-profile-avatar" src={avatarSource} alt="avatar" />
        ) : (
          <div className="dash-profile-avatar-fallback">{initial}</div>
        )}
        <div className="dash-profile-meta">
          <strong>{name}</strong>
          <span>{roleLabel(user)}</span>
        </div>
      </div>
      {assignmentSection}
      <div className="dash-profile-actions">
        <Link to="/profile" className="dash-profile-btn">{'\u062d\u0633\u0627\u0628 \u06a9\u0627\u0631\u0628\u0631\u06cc'}</Link>
        <Link to="/profile#password" className="dash-profile-btn ghost">{'\u062a\u063a\u06cc\u06cc\u0631 \u0631\u0645\u0632'}</Link>
        <button type="button" className="dash-profile-btn danger" onClick={handleLogout}>{'\u062e\u0631\u0648\u062c'}</button>
      </div>
    </div>
  );
}
