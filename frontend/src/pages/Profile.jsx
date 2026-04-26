import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import './Profile.css';

import { API_BASE } from '../config/api';
import { formatAfghanDate } from '../utils/afghanDate';
import useExpandableList from '../hooks/useExpandableList';

const getAuthHeaders = () => {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

const roleLabel = (user) => {
  const orgRole = String(user?.orgRole || '').trim().toLowerCase();
  if (orgRole === 'finance_manager') return 'مدیر مالی';
  if (orgRole === 'finance_lead') return 'آمریت مالی';
  if (orgRole === 'school_manager') return 'مدیر مکتب';
  if (orgRole === 'academic_manager') return 'مدیر تدریسی';
  if (orgRole === 'head_teacher') return 'سر معلم مکتب';
  if (orgRole === 'general_president') return 'ریاست عمومی';
  if (orgRole === 'parent') return 'والد/سرپرست';
  if (orgRole === 'instructor') return 'استاد';
  if (orgRole === 'student') return 'شاگرد';

  const role = String(user?.role || user || '').trim().toLowerCase();
  if (role === 'admin') return 'ادمین';
  if (role === 'parent') return 'والد/سرپرست';
  if (role === 'instructor') return 'استاد';
  return 'شاگرد';
};



const ACTIVITY_LABELS = {
  remove_avatar: '\u062d\u0630\u0641 \u0639\u06a9\u0633 \u067e\u0631\u0648\u0641\u0627\u06cc\u0644',
  upload_avatar: '\u0628\u0627\u0631\u06af\u0630\u0627\u0631\u06cc \u0639\u06a9\u0633 \u067e\u0631\u0648\u0641\u0627\u06cc\u0644',
  update_profile: '\u0628\u0647\u200c\u0631\u0648\u0632\u0631\u0633\u0627\u0646\u06cc \u067e\u0631\u0648\u0641\u0627\u06cc\u0644',
  approve_profile_update_request: '\u062a\u0627\u06cc\u06cc\u062f \u062f\u0631\u062e\u0648\u0627\u0633\u062a \u062a\u063a\u06cc\u06cc\u0631 \u067e\u0631\u0648\u0641\u0627\u06cc\u0644',
  reject_profile_update_request: '\u0631\u062f \u062f\u0631\u062e\u0648\u0627\u0633\u062a \u062a\u063a\u06cc\u06cc\u0631 \u067e\u0631\u0648\u0641\u0627\u06cc\u0644',
  admin_create_user: '\u0627\u06cc\u062c\u0627\u062f \u06a9\u0627\u0631\u0628\u0631 \u062c\u062f\u06cc\u062f',
  admin_change_role: '\u062a\u063a\u06cc\u06cc\u0631 \u0646\u0642\u0634 \u06a9\u0627\u0631\u0628\u0631',
  admin_update_permissions: '\u0628\u0647\u200c\u0631\u0648\u0632\u0631\u0633\u0627\u0646\u06cc \u0645\u062c\u0648\u0632\u0647\u0627',
  create_schedule: '\u0627\u06cc\u062c\u0627\u062f \u0628\u0631\u0646\u0627\u0645\u0647',
  copy_schedule_week: '\u06a9\u0627\u067e\u06cc \u0628\u0631\u0646\u0627\u0645\u0647 \u0647\u0641\u062a\u06af\u06cc',
  create_course: '\u0627\u06cc\u062c\u0627\u062f \u0635\u0646\u0641',
  finance_create_bill: '\u0627\u06cc\u062c\u0627\u062f \u0628\u0644 \u0645\u0627\u0644\u06cc',
  finance_approve_receipt: '\u062a\u0627\u06cc\u06cc\u062f \u0631\u0633\u06cc\u062f \u0645\u0627\u0644\u06cc',
  finance_add_adjustment: '\u062b\u0628\u062a \u062a\u0639\u062f\u06cc\u0644 \u0645\u0627\u0644\u06cc',
  finance_run_reminders: '\u0627\u062c\u0631\u0627\u06cc \u06cc\u0627\u062f\u0622\u0648\u0631\u06cc\u200c\u0647\u0627\u06cc \u0645\u0627\u0644\u06cc',
  finance_set_installments: '\u062a\u0646\u0638\u06cc\u0645 \u0627\u0642\u0633\u0627\u0637 \u0645\u0627\u0644\u06cc',
  finance_upsert_fee_plan: '\u0628\u0647\u200c\u0631\u0648\u0632\u0631\u0633\u0627\u0646\u06cc \u0637\u0631\u062d \u0641\u06cc\u0633',
};

const formatActivityAction = (value) => {
  const key = String(value || '').trim();
  if (!key) return '\u0641\u0639\u0627\u0644\u06cc\u062a \u0633\u06cc\u0633\u062a\u0645\u06cc';
  return ACTIVITY_LABELS[key] || '\u0641\u0639\u0627\u0644\u06cc\u062a \u0633\u06cc\u0633\u062a\u0645\u06cc';
};

const adminMenuShortcuts = [
  { key: 'home', title: 'خانه', icon: 'fa-house' },
  { key: 'education', title: 'آموزش', icon: 'fa-graduation-cap' },
  { key: 'virtual', title: 'سیستم مجازی', icon: 'fa-video' },
  { key: 'news', title: 'اخبار و اعلانات', icon: 'fa-bullhorn' },
  { key: 'gallery', title: 'گالری', icon: 'fa-images' },
  { key: 'about', title: 'درباره ما', icon: 'fa-circle-info' },
  { key: 'contact', title: 'تماس با ما', icon: 'fa-phone' },
  { key: 'auth', title: 'ورود', icon: 'fa-right-to-bracket' }
];

const ACTIVITY_PREVIEW_COUNT = 3;
const PROFILE_ACTIVITY_EXPANDED_KEY = 'profileActivityExpanded';
const ACTIVITY_RANGE_OPTIONS = [
  { key: 'today', label: 'امروز' },
  { key: '7d', label: '7 روز' },
  { key: '30d', label: '30 روز' }
];

const isSameDay = (left, right) => (
  left.getFullYear() === right.getFullYear()
  && left.getMonth() === right.getMonth()
  && left.getDate() === right.getDate()
);

const normalizeText = (value) => String(value || '').trim();
const normalizeEmail = (value) => normalizeText(value).toLowerCase();
const ACTIVE_TEACHER_ASSIGNMENT_STATUSES = new Set(['active', 'planned', 'pending']);

const sanitizeSubjectValue = (subjectValue, emailValue) => {
  const subject = normalizeText(subjectValue);
  if (!subject) return '';
  if (normalizeEmail(subject) === normalizeEmail(emailValue)) return '';
  return subject;
};

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

const getAcademicYearLabel = (academicYear) => normalizeText(academicYear?.title) || 'سال تعلیمی';
const toFaNumber = (value) => Number(value || 0).toLocaleString('fa-AF');

export default function Profile() {
  const location = useLocation();
  const [user, setUser] = useState(null);
  const [activity, setActivity] = useState([]);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [grade, setGrade] = useState('');
  const [subject, setSubject] = useState('');
  const [bio, setBio] = useState('');
  const [message, setMessage] = useState('');
  const [formErrors, setFormErrors] = useState({});
  const [avatarFile, setAvatarFile] = useState(null);
  const [avatarPreview, setAvatarPreview] = useState('');
  const [cropModal, setCropModal] = useState(false);
  const [cropImageUrl, setCropImageUrl] = useState('');
  const [cropFileName, setCropFileName] = useState('');
  const [cropMimeType, setCropMimeType] = useState('image/jpeg');
  const [cropImageMeta, setCropImageMeta] = useState({ width: 0, height: 0 });
  const [cropZoom, setCropZoom] = useState(1);
  const [cropX, setCropX] = useState(0);
  const [cropY, setCropY] = useState(0);
  const [cropProcessing, setCropProcessing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarRemoving, setAvatarRemoving] = useState(false);
  const [editProfileModal, setEditProfileModal] = useState(false);
  const [editBaseline, setEditBaseline] = useState({
    name: '',
    email: '',
    grade: '',
    subject: '',
    bio: ''
  });
  const [passwordModal, setPasswordModal] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [profileUpdateRequest, setProfileUpdateRequest] = useState(null);
  const [activityRange, setActivityRange] = useState('7d');
  const [executiveSummary, setExecutiveSummary] = useState(null);
  const [executiveLoading, setExecutiveLoading] = useState(false);
  const [executiveError, setExecutiveError] = useState('');
  const [teacherAssignments, setTeacherAssignments] = useState([]);
  const [teacherAssignmentSummary, setTeacherAssignmentSummary] = useState(null);
  const [teacherAssignmentsLoading, setTeacherAssignmentsLoading] = useState(false);
  const [teacherAssignmentsError, setTeacherAssignmentsError] = useState('');

  const isGeneralPresident = useMemo(() => {
    if (user?.role !== 'admin') return false;
    const orgRole = String(user?.orgRole || '').trim().toLowerCase();
    const adminLevel = String(user?.adminLevel || '').trim().toLowerCase();
    return orgRole === 'general_president' || adminLevel === 'general_president';
  }, [user]);

  const isInstructorUser = useMemo(() => {
    const role = String(user?.role || '').trim().toLowerCase();
    const orgRole = String(user?.orgRole || '').trim().toLowerCase();
    return role === 'instructor' || orgRole === 'instructor';
  }, [user?.orgRole, user?.role]);

  const filteredActivity = useMemo(() => {
    const now = new Date();
    return activity.filter((item) => {
      const createdAt = new Date(item?.createdAt);
      if (Number.isNaN(createdAt.getTime())) return false;
      if (activityRange === 'today') return isSameDay(createdAt, now);
      if (activityRange === '30d') return createdAt >= new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000));
      return createdAt >= new Date(now.getTime() - (7 * 24 * 60 * 60 * 1000));
    });
  }, [activity, activityRange]);

  const {
    isExpanded: showAllActivity,
    toggleExpanded: toggleActivityExpanded,
    hasMore: hasMoreActivity,
    hiddenCount: hiddenActivityCount,
    visibleItems: visibleActivity
  } = useExpandableList(filteredActivity, {
    previewCount: ACTIVITY_PREVIEW_COUNT,
    storageKey: PROFILE_ACTIVITY_EXPANDED_KEY
  });

  const loadExecutiveSummary = useCallback(async () => {
    try {
      setExecutiveLoading(true);
      setExecutiveError('');
      const res = await fetch(`${API_BASE}/api/admin/alerts`, { headers: { ...getAuthHeaders() } });
      const data = await res.json();
      if (!data?.success) {
        setExecutiveSummary(null);
        setExecutiveError(data?.message || 'خطا در دریافت وضعیت مدیریتی');
        return;
      }
      setExecutiveSummary({
        summary: data.summary || {},
        alertsCount: Array.isArray(data.alerts) ? data.alerts.length : 0,
        alerts: Array.isArray(data.alerts) ? data.alerts : []
      });
    } catch {
      setExecutiveSummary(null);
      setExecutiveError('خطا در دریافت وضعیت مدیریتی');
    } finally {
      setExecutiveLoading(false);
    }
  }, []);

  const loadProfile = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/users/me`, { headers: { ...getAuthHeaders() } });
      const data = await res.json();
      if (!data?.success) {
        setMessage(data?.message || 'خطا در دریافت پروفایل');
        return;
      }
      setUser(data.user);
      try {
        localStorage.setItem(
          'effectivePermissions',
          JSON.stringify(Array.isArray(data.user?.effectivePermissions) ? data.user.effectivePermissions : [])
        );
        localStorage.setItem('orgRole', data.user?.orgRole || '');
        localStorage.setItem('adminLevel', data.user?.adminLevel || '');
      } catch {
        // ignore storage errors
      }
      setName(data.user?.name || '');
      setEmail(data.user?.email || '');
      setGrade(data.user?.grade || '');
      setSubject(data.user?.subject || '');
      setBio(data.user?.bio || '');
    } catch {
      setMessage('خطا در اتصال به سرور');
    }
  };

  const loadActivity = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/users/me/activity`, { headers: { ...getAuthHeaders() } });
      const data = await res.json();
      setActivity(data?.items || []);
    } catch {
      setActivity([]);
    }
  };

  const loadProfileUpdateRequest = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/users/me/profile-update-request`, {
        headers: { ...getAuthHeaders() }
      });
      const data = await res.json();
      if (data?.success) setProfileUpdateRequest(data.item || null);
    } catch {
      setProfileUpdateRequest(null);
    }
  };

  const loadTeacherAssignments = useCallback(async (teacherId) => {
    const normalizedTeacherId = normalizeText(teacherId);
    if (!normalizedTeacherId) {
      setTeacherAssignments([]);
      setTeacherAssignmentSummary(null);
      setTeacherAssignmentsError('');
      return;
    }

    try {
      setTeacherAssignmentsLoading(true);
      setTeacherAssignmentsError('');
      const res = await fetch(`${API_BASE}/api/teacher-assignments/teacher/${encodeURIComponent(normalizedTeacherId)}`, {
        headers: { ...getAuthHeaders() }
      });
      const data = await res.json();
      if (!data?.success) {
        setTeacherAssignments([]);
        setTeacherAssignmentSummary(null);
        setTeacherAssignmentsError(data?.message || 'خطا در دریافت مضامین و صنف‌های استاد');
        return;
      }

      const assignments = Array.isArray(data?.data?.assignments) ? data.data.assignments : [];
      const activeAssignments = assignments.filter((item) => (
        ACTIVE_TEACHER_ASSIGNMENT_STATUSES.has(String(item?.status || '').trim().toLowerCase())
      ));

      setTeacherAssignments(activeAssignments);
      setTeacherAssignmentSummary(data?.data?.summary || null);
    } catch {
      setTeacherAssignments([]);
      setTeacherAssignmentSummary(null);
      setTeacherAssignmentsError('خطا در دریافت مضامین و صنف‌های استاد');
    } finally {
      setTeacherAssignmentsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProfile();
    loadActivity();
    loadProfileUpdateRequest();
  }, []);

  useEffect(() => {
    if (!isGeneralPresident) {
      setExecutiveSummary(null);
      setExecutiveError('');
      return;
    }
    loadExecutiveSummary();
  }, [isGeneralPresident, loadExecutiveSummary]);

  useEffect(() => {
    if (!isInstructorUser || !user?._id) {
      setTeacherAssignments([]);
      setTeacherAssignmentSummary(null);
      setTeacherAssignmentsLoading(false);
      setTeacherAssignmentsError('');
      return;
    }
    loadTeacherAssignments(user._id);
  }, [isInstructorUser, loadTeacherAssignments, user?._id]);

  useEffect(() => {
    if (!isGeneralPresident) return undefined;
    const intervalId = window.setInterval(() => {
      loadExecutiveSummary();
    }, 60 * 1000);
    return () => window.clearInterval(intervalId);
  }, [isGeneralPresident, loadExecutiveSummary]);

  useEffect(() => {
    if (location.hash === '#password') {
      setPasswordModal(true);
    }
  }, [location.hash]);

  useEffect(() => {
    return () => {
      if (avatarPreview) URL.revokeObjectURL(avatarPreview);
    };
  }, [avatarPreview]);

  useEffect(() => {
    return () => {
      if (cropImageUrl) URL.revokeObjectURL(cropImageUrl);
    };
  }, [cropImageUrl]);

  const getImageMeta = (file) => new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      resolve({ objectUrl, width: img.width, height: img.height });
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('invalid_image'));
    };
    img.src = objectUrl;
  });

  const handleSave = async () => {
    setMessage('');
    const nextErrors = {};
    const trimmedName = String(name || '').trim();
    const trimmedEmail = String(email || '').trim().toLowerCase();
    const bioWords = String(bio || '').trim().split(/\s+/).filter(Boolean).length;
    if (trimmedName.length < 2) {
      nextErrors.name = 'نام باید حداقل 2 حرف باشد.';
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      nextErrors.email = 'ایمیل معتبر نیست.';
    }
    if (bioWords > 250) {
      nextErrors.bio = 'تعداد کلمات نباید بیشتر از 250 باشد.';
    }
    setFormErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      setMessage('لطفاً خطاهای فرم را اصلاح کنید.');
      return;
    }
    try {
      setSaving(true);
      const res = await fetch(`${API_BASE}/api/users/me`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({
          name: trimmedName,
          email: trimmedEmail,
          grade: String(grade || '').trim(),
          subject: String(subject || '').trim(),
          bio: String(bio || '').trim()
        })
      });
      const data = await res.json();
      if (!data?.success) {
        setMessage(data?.message || 'ذخیره پروفایل ناموفق بود.');
        return;
      }
      if (data?.requiresApproval) {
        setProfileUpdateRequest(data.request || null);
        setMessage(data?.message || 'درخواست شما ثبت شد و پس از تایید ادمین اعمال می‌شود.');
      } else {
        setUser((prev) => ({
          ...prev,
          ...(data.user || {}),
          permissions: data.user?.permissions || prev?.permissions || [],
          effectivePermissions: data.user?.effectivePermissions || prev?.effectivePermissions || []
        }));
        localStorage.setItem('userName', data.user?.name || '');
        setMessage('پروفایل به‌روزرسانی شد.');
      }
      setEditProfileModal(false);
    } catch {
      setMessage('خطا در ذخیره پروفایل');
    } finally {
      setSaving(false);
    }
  };

  const openEditProfileModal = () => {
    const cleanSubject = sanitizeSubjectValue(user?.subject || '', user?.email || '');
    const baseline = {
      name: user?.name || '',
      email: user?.email || '',
      grade: user?.grade || '',
      subject: cleanSubject,
      bio: user?.bio || ''
    };
    setFormErrors({});
    setName(baseline.name);
    setEmail(baseline.email);
    setGrade(baseline.grade);
    setSubject(baseline.subject);
    setBio(baseline.bio);
    setEditBaseline(baseline);
    setEditProfileModal(true);
  };

  const restoreEditBaseline = () => {
    setName(editBaseline.name);
    setEmail(editBaseline.email);
    setGrade(editBaseline.grade);
    setSubject(editBaseline.subject);
    setBio(editBaseline.bio);
    setFormErrors({});
  };

  const selectAvatar = async (file) => {
    if (!file) return;
    setFormErrors((prev) => ({ ...prev, avatar: undefined }));
    if (!file.type?.startsWith('image/')) {
      setFormErrors((prev) => ({ ...prev, avatar: 'فقط فایل تصویری قابل قبول است.' }));
      setMessage('فقط فایل تصویری قابل قبول است.');
      return;
    }
    if (file.size > 3 * 1024 * 1024) {
      setFormErrors((prev) => ({ ...prev, avatar: 'حجم فایل باید کمتر از 3MB باشد.' }));
      setMessage('حجم فایل باید کمتر از 3MB باشد.');
      return;
    }
    try {
      const meta = await getImageMeta(file);
      if (cropImageUrl) URL.revokeObjectURL(cropImageUrl);
      setCropImageUrl(meta.objectUrl);
      setCropImageMeta({ width: meta.width, height: meta.height });
      setCropFileName(file.name);
      setCropMimeType(file.type === 'image/png' ? 'image/png' : 'image/jpeg');
      setCropZoom(1);
      setCropX(0);
      setCropY(0);
      setCropModal(true);
      setMessage('تصویر انتخاب شد. در صورت نیاز برش دهید و روی "اعمال برش" بزنید.');
    } catch {
      setFormErrors((prev) => ({ ...prev, avatar: 'خواندن فایل امکان‌پذیر نیست. فایل دیگری انتخاب کنید.' }));
      setMessage('خواندن فایل امکان‌پذیر نیست.');
    }
  };

  const applyManualCrop = async () => {
    if (!cropImageUrl || !cropImageMeta.width || !cropImageMeta.height) {
      setFormErrors((prev) => ({ ...prev, avatar: 'مقدار برش معتبر نیست.' }));
      return;
    }
    try {
      setCropProcessing(true);
      const img = new Image();
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
        img.src = cropImageUrl;
      });

      const outSize = 512;
      const canvas = document.createElement('canvas');
      canvas.width = outSize;
      canvas.height = outSize;
      const ctx = canvas.getContext('2d');

      const iw = cropImageMeta.width;
      const ih = cropImageMeta.height;
      const baseScale = Math.max(outSize / iw, outSize / ih);
      const finalScale = baseScale * cropZoom;
      const drawW = iw * finalScale;
      const drawH = ih * finalScale;
      const maxShiftX = Math.max(0, (drawW - outSize) / 2);
      const maxShiftY = Math.max(0, (drawH - outSize) / 2);
      const shiftX = (cropX / 100) * maxShiftX;
      const shiftY = (cropY / 100) * maxShiftY;
      const dx = (outSize - drawW) / 2 + shiftX;
      const dy = (outSize - drawH) / 2 + shiftY;

      ctx.drawImage(img, dx, dy, drawW, drawH);

      const blob = await new Promise((resolve) => {
        canvas.toBlob(resolve, cropMimeType, 0.92);
      });
      if (!blob) {
        setFormErrors((prev) => ({ ...prev, avatar: 'ایجاد فایل برش‌خورده ممکن نشد.' }));
        return;
      }

      const croppedFile = new File([blob], cropFileName || 'avatar.jpg', { type: cropMimeType });
      if (avatarPreview) URL.revokeObjectURL(avatarPreview);
      setAvatarFile(croppedFile);
      setAvatarPreview(URL.createObjectURL(croppedFile));
      setCropModal(false);
      setMessage('برش انجام شد. اکنون روی "بارگذاری عکس" بزنید.');
    } catch {
      setFormErrors((prev) => ({ ...prev, avatar: 'برش تصویر انجام نشد. دوباره تلاش کنید.' }));
      setMessage('برش تصویر انجام نشد.');
    } finally {
      setCropProcessing(false);
    }
  };

  const handleAvatarUpload = async () => {
    if (!avatarFile) {
      setMessage('فایلی برای بارگذاری انتخاب نشده است.');
      return;
    }
    setMessage('');
    try {
      setAvatarUploading(true);
      const form = new FormData();
      form.append('avatar', avatarFile);
      const res = await fetch(`${API_BASE}/api/users/me/avatar`, {
        method: 'PUT',
        headers: { ...getAuthHeaders() },
        body: form
      });
      const data = await res.json();
      if (!data?.success) {
        setMessage(data?.message || 'بارگذاری عکس ناموفق بود.');
        return;
      }
      setUser(prev => ({ ...prev, avatarUrl: data.user?.avatarUrl || prev?.avatarUrl }));
      localStorage.setItem('avatarUrl', data.user?.avatarUrl || '');
      window.dispatchEvent(new Event('avatar-updated'));
      setAvatarFile(null);
      setAvatarPreview('');
      setMessage('عکس پروفایل به‌روزرسانی شد.');
    } catch {
      setMessage('خطا در بارگذاری عکس');
    } finally {
      setAvatarUploading(false);
    }
  };

  const handleAvatarRemove = async () => {
    if (!user?.avatarUrl && !avatarPreview) {
      setMessage('عکسی برای حذف وجود ندارد.');
      return;
    }
    setMessage('');
    try {
      setAvatarRemoving(true);
      const res = await fetch(`${API_BASE}/api/users/me/avatar`, {
        method: 'DELETE',
        headers: { ...getAuthHeaders() }
      });
      const data = await res.json();
      if (!data?.success) {
        setMessage(data?.message || 'حذف عکس ناموفق بود.');
        return;
      }
      setUser(prev => ({ ...prev, avatarUrl: '' }));
      setAvatarFile(null);
      setAvatarPreview('');
      localStorage.setItem('avatarUrl', '');
      window.dispatchEvent(new Event('avatar-updated'));
      setMessage('عکس پروفایل حذف شد.');
    } catch {
      setMessage('خطا در حذف عکس پروفایل');
    } finally {
      setAvatarRemoving(false);
    }
  };

  const handlePassword = async () => {
    setMessage('');
    try {
      const res = await fetch(`${API_BASE}/api/users/me/password`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ currentPassword, newPassword })
      });
      const data = await res.json();
      if (!data?.success) {
        setMessage(data?.message || 'تغییر رمز عبور ناموفق بود.');
        return;
      }
      setPasswordModal(false);
      setCurrentPassword('');
      setNewPassword('');
      setMessage('رمز عبور با موفقیت تغییر کرد.');
    } catch {
      setMessage('خطا در تغییر رمز عبور');
    }
  };

  const roleClass = user?.role === 'admin' ? 'role-admin' : isInstructorUser ? 'role-instructor' : 'role-student';
  const displaySubject = useMemo(
    () => sanitizeSubjectValue(user?.subject || '', user?.email || '') || 'ثبت نشده',
    [user?.email, user?.subject]
  );
  const canManageContent = useMemo(() => {
    if (user?.role !== 'admin') return false;
    const permissions = Array.isArray(user?.effectivePermissions)
      ? user.effectivePermissions
      : Array.isArray(user?.permissions)
        ? user.permissions
        : [];
    return permissions.includes('manage_content');
  }, [user]);
  const assignedClassLabels = useMemo(
    () => uniqueLabels(teacherAssignments.map((item) => getClassLabel(item?.classId))),
    [teacherAssignments]
  );
  const assignedSubjectLabels = useMemo(
    () => uniqueLabels(teacherAssignments.map((item) => getSubjectLabel(item?.subjectId))),
    [teacherAssignments]
  );
  const assignmentCards = useMemo(
    () => teacherAssignments.map((item) => ({
      id: item?._id || `${getClassLabel(item?.classId)}-${getSubjectLabel(item?.subjectId)}`,
      classLabel: getClassLabel(item?.classId),
      subjectLabel: getSubjectLabel(item?.subjectId),
      academicYearLabel: getAcademicYearLabel(item?.academicYearId),
      weeklyPeriods: Number(item?.weeklyPeriods || 0)
    })),
    [teacherAssignments]
  );
  const displayGradeValue = useMemo(() => {
    if (assignedClassLabels.length) return assignedClassLabels.join('، ');
    return user?.grade || 'ثبت نشده';
  }, [assignedClassLabels, user?.grade]);
  const displaySubjectValue = useMemo(() => {
    if (assignedSubjectLabels.length) return assignedSubjectLabels.join('، ');
    return displaySubject;
  }, [assignedSubjectLabels, displaySubject]);
  const totalWeeklyPeriods = useMemo(() => {
    if (teacherAssignmentSummary?.totalWeeklyPeriods != null) {
      return Number(teacherAssignmentSummary.totalWeeklyPeriods || 0);
    }
    return assignmentCards.reduce((sum, item) => sum + Number(item.weeklyPeriods || 0), 0);
  }, [assignmentCards, teacherAssignmentSummary?.totalWeeklyPeriods]);
  const bioWords = String(bio || '').trim().split(/\s+/).filter(Boolean).length;
  const requestStatusLabel = profileUpdateRequest?.status === 'approved'
    ? 'تایید شده'
    : profileUpdateRequest?.status === 'rejected'
      ? 'رد شده'
      : 'در انتظار تایید';
  const requestStatusClass = profileUpdateRequest?.status === 'approved'
    ? 'status-approved'
    : profileUpdateRequest?.status === 'rejected'
      ? 'status-rejected'
      : 'status-pending';

  const executiveCards = useMemo(() => {
    const pendingProfile = Number(executiveSummary?.summary?.pendingProfile || 0);
    const pendingAccess = Number(executiveSummary?.summary?.pendingAccessRequests || 0);
    const alertsCount = Number(executiveSummary?.alertsCount || 0);
    const hasHighAlert = Array.isArray(executiveSummary?.alerts)
      && executiveSummary.alerts.some((item) => String(item?.level || '').toLowerCase() === 'high');
    const hasMediumAlert = Array.isArray(executiveSummary?.alerts)
      && executiveSummary.alerts.some((item) => String(item?.level || '').toLowerCase() === 'medium');
    const alertsPriority = hasHighAlert ? 'high' : hasMediumAlert ? 'medium' : 'low';
    const priorityLabel = {
      high: 'بحرانی',
      medium: 'متوسط',
      low: 'عادی'
    };
    const priorityOrder = {
      high: 3,
      medium: 2,
      low: 1
    };

    const cards = [
      {
        key: 'profile',
        title: 'درخواست تغییر مشخصات',
        count: pendingProfile,
        priority: pendingProfile > 0 ? 'medium' : 'low',
        icon: 'fa-id-card',
        actionLabel: pendingProfile > 0 ? 'بررسی درخواست‌ها' : 'موردی نیست',
        href: '/admin#profile-requests'
      },
      {
        key: 'access',
        title: 'درخواست‌های دسترسی',
        count: pendingAccess,
        priority: pendingAccess > 0 ? 'medium' : 'low',
        icon: 'fa-key',
        actionLabel: pendingAccess > 0 ? 'اقدام فوری' : 'موردی نیست',
        href: '/admin-users#access-requests'
      },
      {
        key: 'alerts',
        title: 'هشدارهای مدیریتی',
        count: alertsCount,
        priority: alertsPriority,
        icon: 'fa-triangle-exclamation',
        actionLabel: alertsCount > 0 ? 'مشاهده داشبورد' : 'موردی نیست',
        href: '/admin'
      }
    ].map((card) => ({
      ...card,
      priorityLabel: priorityLabel[card.priority] || priorityLabel.low
    }));

    cards.sort((left, right) => {
      const byPriority = (priorityOrder[right.priority] || 0) - (priorityOrder[left.priority] || 0);
      if (byPriority !== 0) return byPriority;
      return (right.count || 0) - (left.count || 0);
    });

    return cards;
  }, [executiveSummary]);

  const hasCriticalExecutiveAlert = useMemo(
    () => executiveCards.some((card) => card.priority === 'high' && card.count > 0),
    [executiveCards]
  );

  const profileChanges = useMemo(() => {
    const rows = [
      {
        key: 'name',
        label: 'نام کامل',
        tone: 'medium',
        before: normalizeText(editBaseline.name),
        after: normalizeText(name)
      },
      {
        key: 'email',
        label: 'ایمیل',
        tone: 'high',
        before: normalizeEmail(editBaseline.email),
        after: normalizeEmail(email)
      },
      {
        key: 'grade',
        label: 'صنف/پایه',
        tone: 'low',
        before: normalizeText(editBaseline.grade),
        after: normalizeText(grade)
      },
      {
        key: 'subject',
        label: 'مضامین',
        tone: 'low',
        before: normalizeText(editBaseline.subject),
        after: normalizeText(subject)
      },
      {
        key: 'bio',
        label: 'بیو',
        tone: 'low',
        before: normalizeText(editBaseline.bio),
        after: normalizeText(bio)
      }
    ];
    return rows.filter((item) => item.before !== item.after);
  }, [bio, editBaseline, email, grade, name, subject]);

  const hasProfileChanges = profileChanges.length > 0;

  return (
    <div className="profile-page">
      <div className="profile-card">
        <div className="card-back">
          <button type="button" onClick={() => window.history.back()}>بازگشت</button>
        </div>

        <div className="profile-head">
          <div className="profile-avatar" id="avatar">
            {avatarPreview ? (
              <img src={avatarPreview} alt="avatar preview" />
            ) : user?.avatarUrl ? (
              <img src={`${API_BASE}/${user.avatarUrl}`} alt="avatar" />
            ) : (
              <div className="profile-avatar-fallback">{(user?.name || 'U').charAt(0)}</div>
            )}
          </div>
          <div className="profile-head-meta">
            <h3>عکس پروفایل</h3>
            <span className={`profile-role ${roleClass}`}>{roleLabel(user)}</span>
            <label className="profile-upload">
              انتخاب عکس جدید
              <input type="file" accept="image/*" onChange={(e) => selectAvatar(e.target.files?.[0])} />
            </label>
            {!!avatarFile && <div className="profile-upload-note">فایل انتخاب شده: {avatarFile.name}</div>}
            {formErrors.avatar && <div className="field-error">{formErrors.avatar}</div>}
            <div className="profile-upload-actions">
              <button type="button" className="upload-btn" onClick={handleAvatarUpload} disabled={!avatarFile || avatarUploading}>
                {avatarUploading ? 'در حال ارسال...' : 'بارگذاری عکس'}
              </button>
              <button type="button" className="remove-btn" onClick={handleAvatarRemove} disabled={avatarRemoving || (!user?.avatarUrl && !avatarPreview)}>
                {avatarRemoving ? 'در حال حذف...' : 'حذف عکس'}
              </button>
            </div>
          </div>
        </div>

        <div className="profile-info">
          <div>
            <span>نام کامل</span>
            <strong>{user?.name || '---'}</strong>
          </div>
          <div>
            <span>ایمیل</span>
            <strong className="profile-value-email">{user?.email || '---'}</strong>
          </div>
          <div>
            <span>نقش/سطح</span>
            <strong>{roleLabel(user)}</strong>
          </div>
          <div>
            <span>صنف/پایه</span>
            <strong>{displayGradeValue}</strong>
          </div>
          <div>
            <span>مضامین</span>
            <strong>{displaySubjectValue}</strong>
          </div>
        </div>

        {isInstructorUser && (
          <div className="profile-teacher-assignments">
            <div className="profile-teacher-assignments-head">
              <div>
                <h3>صنف‌ها و مضامین واگذارشده</h3>
                <p>این بخش از تخصیص رسمی استاد خوانده می‌شود.</p>
              </div>
              <span>{teacherAssignmentsLoading ? 'در حال دریافت...' : `${toFaNumber(assignmentCards.length)} تخصیص`}</span>
            </div>

            {teacherAssignmentsError && (
              <div className="profile-assignment-empty profile-assignment-error">{teacherAssignmentsError}</div>
            )}

            {!teacherAssignmentsError && teacherAssignmentsLoading && (
              <div className="profile-assignment-empty">در حال دریافت مضامین و صنف‌های استاد...</div>
            )}

            {!teacherAssignmentsError && !teacherAssignmentsLoading && !assignmentCards.length && (
              <div className="profile-assignment-empty">
                هنوز برای این استاد در بخش تخصیص استاد، صنف یا مضمون فعالی ثبت نشده است.
              </div>
            )}

            {!teacherAssignmentsError && !teacherAssignmentsLoading && assignmentCards.length > 0 && (
              <>
                <div className="profile-assignment-summary">
                  <span>صنف‌ها: <strong>{toFaNumber(assignedClassLabels.length)}</strong></span>
                  <span>مضامین: <strong>{toFaNumber(assignedSubjectLabels.length)}</strong></span>
                  <span>ساعت هفتگی: <strong>{toFaNumber(totalWeeklyPeriods)}</strong></span>
                </div>

                <div className="profile-assignment-grid">
                  {assignmentCards.map((item) => (
                    <article key={item.id} className="profile-assignment-card">
                      <strong>{item.subjectLabel}</strong>
                      <span>{item.classLabel}</span>
                      <div className="profile-assignment-meta">
                        <small>{item.academicYearLabel}</small>
                        <small>{toFaNumber(item.weeklyPeriods)} ساعت در هفته</small>
                      </div>
                    </article>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        <div className="profile-quick-actions">
          <button type="button" onClick={openEditProfileModal}>ویرایش مشخصات</button>
          <button type="button" className="ghost" onClick={() => setPasswordModal(true)}>
            تغییر رمز عبور
          </button>
        </div>

        {isGeneralPresident && (
          <div className="profile-executive-desk">
            <div className="profile-executive-head">
              <h3>میز کار ریاست عمومی</h3>
              <button type="button" onClick={loadExecutiveSummary} disabled={executiveLoading}>
                {executiveLoading ? 'در حال تازه‌سازی...' : 'تازه‌سازی'}
              </button>
            </div>
            <p>نمای فوری موارد در انتظار تصمیم و بررسی مدیریتی. تازه‌سازی خودکار هر 60 ثانیه انجام می‌شود.</p>
            {hasCriticalExecutiveAlert && (
              <div className="profile-executive-banner" role="status" aria-live="polite">
                موارد بحرانی نیازمند اقدام فوری هستند.
              </div>
            )}
            <div className="profile-executive-grid">
              {executiveCards.map((card) => (
                <div key={card.key} className={`profile-executive-card tone-${card.priority}`}>
                  <div className="profile-executive-card-head">
                    <i className={`fa ${card.icon}`} aria-hidden="true" />
                    <span>{card.title}</span>
                  </div>
                  <strong>{card.count}</strong>
                  <div className={`profile-executive-priority tone-${card.priority}`}>{card.priorityLabel}</div>
                  <Link
                    to={card.href}
                    className={`profile-executive-action ${card.count <= 0 ? 'is-disabled' : ''}`}
                    aria-disabled={card.count <= 0 ? 'true' : 'false'}
                    tabIndex={card.count <= 0 ? -1 : 0}
                    onClick={(event) => {
                      if (card.count <= 0) event.preventDefault();
                    }}
                  >
                    {card.actionLabel}
                  </Link>
                </div>
              ))}
            </div>
            {executiveError && <div className="profile-message">{executiveError}</div>}
          </div>
        )}

        {user?.role === 'student' && profileUpdateRequest && (
          <div className={`profile-request-card ${requestStatusClass}`}>
            <strong>وضعیت درخواست ویرایش مشخصات: {requestStatusLabel}</strong>
            <div>تاریخ: {formatAfghanDate(profileUpdateRequest.createdAt, {
              year: 'numeric',
              month: 'long',
              day: 'numeric'
            }) || '-'}</div>
            {profileUpdateRequest?.status === 'rejected' && !!profileUpdateRequest?.rejectionReason && (
              <div>دلیل رد: {profileUpdateRequest.rejectionReason}</div>
            )}
          </div>
        )}

        <div id="password" />

        {message && <div className="profile-message">{message}</div>}

        <div className="profile-divider" />

        {user?.role === 'admin' && canManageContent && (
          <div className="profile-admin-menu-manager">
            <h3>مدیریت منوهای سایت</h3>
            <p>برای هر منو وارد تنظیمات اختصاصی همان بخش شوید.</p>
            <div className="profile-admin-menu-grid">
              {adminMenuShortcuts.map((item) => (
                <Link
                  key={item.key}
                  className="profile-admin-menu-link"
                  to={`/admin-settings?menu=${item.key}`}
                >
                  <i className={`fa ${item.icon}`} aria-hidden="true" />
                  <span>{item.title}</span>
                </Link>
              ))}
            </div>
          </div>
        )}

        {user?.role === 'admin' && !canManageContent && (
          <div className="profile-message">
            دسترسی «مدیریت منوها» برای این ادمین فعال نیست. مجوز `manage_content` را از بخش مدیریت کاربران فعال کنید.
          </div>
        )}

        <div className="activity-head-row">
          <h3 className="activity-title">فعالیت‌های اخیر</h3>
          <div className="profile-activity-filters">
            {ACTIVITY_RANGE_OPTIONS.map((option) => (
              <button
                key={option.key}
                type="button"
                className={`profile-activity-filter ${activityRange === option.key ? 'is-active' : ''}`}
                onClick={() => setActivityRange(option.key)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
        <div className="profile-activity">
          {!filteredActivity.length && <div className="profile-message">در بازه انتخابی فعالیتی برای نمایش نیست.</div>}
          {visibleActivity.map((item, index) => (
            <div
              key={item._id}
              className={`profile-activity-item ${showAllActivity && index >= ACTIVITY_PREVIEW_COUNT ? 'is-revealed' : ''}`}
              style={showAllActivity && index >= ACTIVITY_PREVIEW_COUNT
                ? { animationDelay: `${Math.min(index - ACTIVITY_PREVIEW_COUNT, 6) * 40}ms` }
                : undefined}
            >
              <span>{formatActivityAction(item.action)}</span>
              <span>{formatAfghanDate(item.createdAt, {
                year: 'numeric',
                month: 'long',
                day: 'numeric'
              }) || '-'}</span>
            </div>
          ))}
          {hasMoreActivity && (
            <button
              type="button"
              className="profile-activity-toggle"
              onClick={toggleActivityExpanded}
            >
              {showAllActivity ? 'نمایش کمتر' : `نمایش ${hiddenActivityCount} فعالیت بیشتر`}
            </button>
          )}
        </div>
      </div>

      {cropModal && (
        <div className="modal-backdrop">
          <div className="modal-card cropper-modal">
            <h3>برش عکس پروفایل</h3>
            <div className="cropper-preview">
              <img
                src={cropImageUrl}
                alt="crop preview"
                style={{
                  transform: `translate(${cropX}%, ${cropY}%) scale(${cropZoom})`
                }}
              />
            </div>

            <div className="cropper-control">
              <label>زوم</label>
              <input
                type="range"
                min="1"
                max="2.4"
                step="0.01"
                value={cropZoom}
                onChange={(e) => setCropZoom(Number(e.target.value))}
              />
            </div>

            <div className="cropper-control">
              <label>جابجایی افقی</label>
              <input
                type="range"
                min="-100"
                max="100"
                step="1"
                value={cropX}
                onChange={(e) => setCropX(Number(e.target.value))}
              />
            </div>

            <div className="cropper-control">
              <label>جابجایی عمودی</label>
              <input
                type="range"
                min="-100"
                max="100"
                step="1"
                value={cropY}
                onChange={(e) => setCropY(Number(e.target.value))}
              />
            </div>

            <div className="modal-actions">
              <button type="button" onClick={applyManualCrop} disabled={cropProcessing}>
                {cropProcessing ? 'در حال پردازش...' : 'اعمال برش'}
              </button>
              <button
                type="button"
                className="ghost"
                onClick={() => {
                  setCropModal(false);
                  setCropX(0);
                  setCropY(0);
                  setCropZoom(1);
                }}
              >
                لغو
              </button>
            </div>
          </div>
        </div>
      )}

      {editProfileModal && (
        <div className="modal-backdrop">
          <div className="modal-card profile-edit-modal">
            <h3>ویرایش مشخصات</h3>

            <label>نام کامل</label>
            <input
              className={formErrors.name ? 'input-invalid' : ''}
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setFormErrors((prev) => ({ ...prev, name: undefined }));
              }}
            />
            {formErrors.name && <div className="field-error">{formErrors.name}</div>}

            <label>ایمیل</label>
            <input
              className={formErrors.email ? 'input-invalid' : ''}
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setFormErrors((prev) => ({ ...prev, email: undefined }));
              }}
            />
            {formErrors.email && <div className="field-error">{formErrors.email}</div>}

            <label>صنف/پایه</label>
            <input value={grade} onChange={(e) => setGrade(e.target.value)} placeholder="مثال: صنف 10 ب" />

            <label>مضامین</label>
            <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="مثال: ریاضی، فیزیک" />

            <label>بیو (حداکثر 250 کلمه)</label>
            <textarea
              className={formErrors.bio ? 'input-invalid' : ''}
              rows="5"
              value={bio}
              onChange={(e) => {
                setBio(e.target.value);
                setFormErrors((prev) => ({ ...prev, bio: undefined }));
              }}
              placeholder="در این بخش خلاصه مشخصات شخصی، تجربه و توضیحات لازم را وارد کنید..."
            />
            {formErrors.bio && <div className="field-error">{formErrors.bio}</div>}
            <div className="profile-word-count">{bioWords}/250 کلمه</div>

            <div className="profile-change-preview">
              <strong>پیش‌نمایش تغییرات</strong>
              {!hasProfileChanges && <div className="profile-change-empty">هنوز تغییری اعمال نشده است.</div>}
              {hasProfileChanges && (
                <div className="profile-change-list">
                  {profileChanges.map((item) => (
                    <div
                      key={item.key}
                      className={`profile-change-row tone-${item.tone || 'low'}`}
                    >
                      <span>{item.label}</span>
                      <p>{item.before || 'ثبت نشده'} {'->'} {item.after || 'ثبت نشده'}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="modal-actions">
              <button type="button" className="ghost" onClick={restoreEditBaseline} disabled={!hasProfileChanges || saving}>
                بازگردانی به مقادیر قبلی
              </button>
              <button type="button" onClick={handleSave} disabled={saving || !hasProfileChanges}>{saving ? 'در حال ذخیره...' : 'ذخیره تغییرات'}</button>
              <button type="button" className="ghost" onClick={() => setEditProfileModal(false)}>
                انصراف
              </button>
            </div>
          </div>
        </div>
      )}

      {passwordModal && (
        <div className="modal-backdrop">
          <div className="modal-card">
            <h3>تغییر رمز عبور</h3>
            <label>رمز فعلی</label>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
            />
            <label>رمز جدید</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
            <div className="profile-message">رمز جدید باید حداقل 6 کاراکتر باشد.</div>
            <div className="modal-actions">
              <button type="button" onClick={handlePassword}>ثبت</button>
              <button type="button" className="ghost" onClick={() => setPasswordModal(false)}>
                لغو
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
