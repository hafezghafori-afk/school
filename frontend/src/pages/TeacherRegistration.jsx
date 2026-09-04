import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import AfghanDateInput from '../components/ui/AfghanDateInput';
import { useToast } from '../components/ui/toast';
import {
  DEFAULT_SCHOOL_ID,
  fetchJson,
  getAuthHeaders,
  persistActiveSchoolId,
  postJson,
  readStoredSchoolId,
  repairDisplayText,
  resolveActiveSchoolContext
} from './adminWorkspaceUtils';
import './TeacherRegistration.css';

const PROVINCES = [
  { value: 'kabul', label: 'کابل' },
  { value: 'herat', label: 'هرات' },
  { value: 'kandahar', label: 'کندهار' },
  { value: 'balkh', label: 'بلخ' },
  { value: 'nangarhar', label: 'ننگرهار' },
  { value: 'badakhshan', label: 'بدخشان' },
  { value: 'takhar', label: 'تخار' },
  { value: 'samangan', label: 'سمنگان' },
  { value: 'kunduz', label: 'قندوز' },
  { value: 'baghlan', label: 'بغلان' },
  { value: 'farah', label: 'فراه' },
  { value: 'nimroz', label: 'نیمروز' },
  { value: 'helmand', label: 'هلمند' },
  { value: 'ghor', label: 'غور' },
  { value: 'daykundi', label: 'دایکندی' },
  { value: 'uruzgan', label: 'ارزگان' },
  { value: 'zabul', label: 'زابل' },
  { value: 'paktika', label: 'پکتیکا' },
  { value: 'khost', label: 'خوست' },
  { value: 'paktia', label: 'پکتیا' },
  { value: 'logar', label: 'لوگر' },
  { value: 'parwan', label: 'پروان' },
  { value: 'kapisa', label: 'کاپیسا' },
  { value: 'panjshir', label: 'پنجشیر' },
  { value: 'badghis', label: 'بادغیس' },
  { value: 'faryab', label: 'فاریاب' },
  { value: 'jowzjan', label: 'جوزجان' },
  { value: 'saripul', label: 'سرپل' },
  { value: 'bamyan', label: 'بامیان' },
  { value: 'ghazni', label: 'غزنی' },
  { value: 'wardak', label: 'میدان وردک' },
  { value: 'laghman', label: 'لغمان' },
  { value: 'kunar', label: 'کنر' },
  { value: 'nuristan', label: 'نورستان' }
];

const HIGHEST_EDUCATION_OPTIONS = [
  { value: 'high_school', label: 'لیسه' },
  { value: 'bachelor', label: 'لیسانس' },
  { value: 'master', label: 'ماستری' },
  { value: 'phd', label: 'دوکتورا' },
  { value: 'other', label: 'سایر' }
];

const POSITION_OPTIONS = [
  { value: 'teacher', label: 'استاد' },
  { value: 'principal', label: 'مدیر مکتب' },
  { value: 'vice_principal', label: 'معاون مکتب' },
  { value: 'admin_staff', label: 'کارمند اداری' },
  { value: 'support_staff', label: 'کارمند خدماتی' }
];

// R2 — top-down registration. Only ریاست عمومی can register a principal / owner
// and fill the financial section; مدیر مکتب registers teaching + non-teaching
// staff without finance; every other admin level can register teachers only.
// Admin-level keys here are the values stored in localStorage('adminLevel')
// (see AdminPanel.jsx's ADMIN_LEVEL_LABELS) — 'school_manager' is the مدیر
// مکتب level; 'principal' is only a *position* value in employmentInfo.position.
const POSITIONS_BY_ADMIN_LEVEL = {
  general_president: ['teacher', 'principal', 'vice_principal', 'admin_staff', 'support_staff'],
  school_manager: ['teacher', 'vice_principal', 'admin_staff', 'support_staff']
};
const DEFAULT_ALLOWED_POSITIONS = ['teacher'];

// Positions that are non-teaching staff — they carry a free-text job title and a
// department instead of subjects/classes.
const NON_TEACHING_POSITIONS = new Set(['admin_staff', 'support_staff']);

const readAdminLevel = () => {
  if (typeof window === 'undefined') return '';
  try {
    return String(
      window.localStorage.getItem('adminLevel') || window.localStorage.getItem('orgRole') || ''
    ).trim();
  } catch {
    return '';
  }
};

const EMPLOYMENT_TYPE_OPTIONS = [
  { value: 'permanent', label: 'دایمی' },
  { value: 'contract', label: 'قراردادی' },
  { value: 'temporary', label: 'موقت' },
  { value: 'volunteer', label: 'رضاکار' }
];

const WORK_SCHEDULE_OPTIONS = [
  { value: 'full_time', label: 'وقت کامل' },
  { value: 'part_time', label: 'نیمه‌وقت' },
  { value: 'flexible', label: 'انعطاف‌پذیر' }
];

const trimValue = (value) => String(value || '').trim();
const displayText = (value) => repairDisplayText(value);

// حساب کاربری فقط نام و ایمیل دارد (نه تذکره/تولد/آدرس/تحصیلات/معاش — آن‌ها فقط
// در پروندهٔ رسمی هستند)، پس با انتخابِ حساب فقط همین دو مورد قابلِ خانه‌پرکردن‌اند.
const splitPersonName = (value = '') => {
  const parts = String(value || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return { first: '', last: '' };
  if (parts.length === 1) return { first: parts[0], last: '' };
  return { first: parts[0], last: parts.slice(1).join(' ') };
};
const toNumberOrUndefined = (value) => {
  const trimmed = trimValue(value);
  if (!trimmed) return undefined;
  const num = Number(trimmed);
  return Number.isFinite(num) ? num : undefined;
};

const toDateInputValue = (value) => (value ? String(value).slice(0, 10) : '');

// Inverse of buildTeacherPayload — maps a fetched AfghanTeacher record (edit
// mode) back onto the flat formData shape the form's inputs are bound to.
const populateFormFromTeacher = (teacher = {}) => {
  const p = teacher.personalInfo || {};
  const idf = teacher.identification || {};
  const c = teacher.contactInfo || {};
  const edu = teacher.educationInfo || {};
  const emp = teacher.employmentInfo || {};
  const fin = teacher.financialInfo || {};
  const salary = fin.salary || {};
  const bank = fin.bankAccount || {};
  const linkedUserId = teacher.linkedUserId?._id || teacher.linkedUserId || '';
  return {
    firstName: p.firstName || '', lastName: p.lastName || '', firstNameDari: p.firstNameDari || '', lastNameDari: p.lastNameDari || '',
    firstNamePashto: p.firstNamePashto || '', lastNamePashto: p.lastNamePashto || '', fatherName: p.fatherName || '', gender: p.gender || '',
    birthDate: toDateInputValue(p.birthDate), birthPlace: p.birthPlace || '', nationality: p.nationality || 'Afghan',

    tazkiraNumber: idf.tazkiraNumber || '', hasTeacherLicense: Boolean(idf.hasTeacherLicense), teacherLicenseNumber: idf.teacherLicenseNumber || '', teacherLicenseExpiry: toDateInputValue(idf.teacherLicenseExpiry),

    phone: c.phone || '', mobile: c.mobile || '', email: c.email || '', province: c.province || '', district: c.district || '', village: c.village || '', address: c.address || '',

    highestEducation: edu.highestEducation || '', fieldOfStudy: edu.fieldOfStudy || '', university: edu.university || '', graduationYear: edu.graduationYear || '', gpa: edu.gpa ?? '',
    hasTeachingCertificate: Boolean(edu.hasTeachingCertificate), teachingCertificateType: edu.teachingCertificateType || '', teachingCertificateYear: edu.teachingCertificateYear || '',

    employeeId: emp.employeeId || '', position: emp.position || 'teacher', employmentType: emp.employmentType || 'permanent', hireDate: toDateInputValue(emp.hireDate),
    contractExpiry: toDateInputValue(emp.contractExpiry), workSchedule: emp.workSchedule || 'full_time', jobTitle: emp.jobTitle || '', department: emp.department || '',
    isOwner: Boolean(teacher.isOwner),

    salaryBase: salary.base ?? '', salaryHousing: salary.housing ?? '', salaryTransport: salary.transport ?? '', salaryOther: salary.other ?? '',
    bankName: bank.bankName || '', accountNumber: bank.accountNumber || '', accountHolder: bank.accountHolder || '', receivesBonus: Boolean(fin.receivesBonus), bonusCriteria: fin.bonusCriteria || '',

    linkedUserId: linkedUserId ? String(linkedUserId) : ''
  };
};

const createEmptyForm = () => ({
  firstName: '', lastName: '', firstNameDari: '', lastNameDari: '',
  firstNamePashto: '', lastNamePashto: '', fatherName: '', gender: '',
  birthDate: '', birthPlace: '', nationality: 'Afghan',

  tazkiraNumber: '', hasTeacherLicense: false, teacherLicenseNumber: '', teacherLicenseExpiry: '',

  phone: '', mobile: '', email: '', province: '', district: '', village: '', address: '',

  highestEducation: '', fieldOfStudy: '', university: '', graduationYear: '', gpa: '',
  hasTeachingCertificate: false, teachingCertificateType: '', teachingCertificateYear: '',

  employeeId: '', position: 'teacher', employmentType: 'permanent', hireDate: '',
  contractExpiry: '', workSchedule: 'full_time',
  jobTitle: '', department: '', isOwner: false,

  salaryBase: '', salaryHousing: '', salaryTransport: '', salaryOther: '',
  bankName: '', accountNumber: '', accountHolder: '', receivesBonus: false, bonusCriteria: '',

  linkedUserId: ''
});

const buildTeacherPayload = ({ formData, schoolId }) => ({
  personalInfo: {
    firstName: trimValue(formData.firstName),
    lastName: trimValue(formData.lastName),
    firstNameDari: trimValue(formData.firstNameDari) || trimValue(formData.firstName),
    lastNameDari: trimValue(formData.lastNameDari) || trimValue(formData.lastName),
    firstNamePashto: trimValue(formData.firstNamePashto),
    lastNamePashto: trimValue(formData.lastNamePashto),
    fatherName: trimValue(formData.fatherName),
    gender: formData.gender,
    birthDate: formData.birthDate,
    birthPlace: trimValue(formData.birthPlace),
    nationality: trimValue(formData.nationality) || 'Afghan'
  },
  identification: {
    tazkiraNumber: trimValue(formData.tazkiraNumber),
    hasTeacherLicense: Boolean(formData.hasTeacherLicense),
    teacherLicenseNumber: trimValue(formData.teacherLicenseNumber),
    teacherLicenseExpiry: formData.teacherLicenseExpiry || undefined
  },
  contactInfo: {
    phone: trimValue(formData.phone),
    mobile: trimValue(formData.mobile),
    email: trimValue(formData.email),
    province: formData.province,
    district: trimValue(formData.district),
    village: trimValue(formData.village),
    address: trimValue(formData.address)
  },
  educationInfo: {
    highestEducation: formData.highestEducation || undefined,
    fieldOfStudy: trimValue(formData.fieldOfStudy) || undefined,
    university: trimValue(formData.university) || undefined,
    graduationYear: toNumberOrUndefined(formData.graduationYear),
    gpa: toNumberOrUndefined(formData.gpa),
    hasTeachingCertificate: Boolean(formData.hasTeachingCertificate),
    teachingCertificateType: trimValue(formData.teachingCertificateType),
    teachingCertificateYear: toNumberOrUndefined(formData.teachingCertificateYear)
  },
  employmentInfo: {
    currentSchool: schoolId,
    employeeId: trimValue(formData.employeeId),
    position: formData.position,
    employmentType: formData.employmentType,
    hireDate: formData.hireDate,
    contractExpiry: formData.contractExpiry || undefined,
    workSchedule: formData.workSchedule || 'full_time',
    jobTitle: NON_TEACHING_POSITIONS.has(formData.position) ? trimValue(formData.jobTitle) : '',
    department: NON_TEACHING_POSITIONS.has(formData.position) ? trimValue(formData.department) : ''
  },
  isOwner: formData.position === 'principal' ? Boolean(formData.isOwner) : false,
  financialInfo: {
    salary: {
      base: toNumberOrUndefined(formData.salaryBase) || 0,
      housing: toNumberOrUndefined(formData.salaryHousing) || 0,
      transport: toNumberOrUndefined(formData.salaryTransport) || 0,
      other: toNumberOrUndefined(formData.salaryOther) || 0
    },
    bankAccount: {
      bankName: trimValue(formData.bankName),
      accountNumber: trimValue(formData.accountNumber),
      accountHolder: trimValue(formData.accountHolder)
    },
    receivesBonus: Boolean(formData.receivesBonus),
    bonusCriteria: trimValue(formData.bonusCriteria)
  },
  linkedUserId: formData.linkedUserId || undefined
});

const TeacherRegistration = () => {
  const toast = useToast();
  const toastRef = useRef(toast);
  useEffect(() => { toastRef.current = toast; }, [toast]);

  const { id: editId } = useParams();
  const isEditMode = Boolean(editId);
  const navigate = useNavigate();

  const [schoolId, setSchoolId] = useState(() => readStoredSchoolId() || DEFAULT_SCHOOL_ID);
  const [activeSchoolContext, setActiveSchoolContext] = useState(null);
  const [referenceLoading, setReferenceLoading] = useState(true);

  const [formData, setFormData] = useState(() => createEmptyForm());
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [submitStatus, setSubmitStatus] = useState({ type: '', text: '' });
  const [lastRegisteredTeacher, setLastRegisteredTeacher] = useState(null);

  const [editLoading, setEditLoading] = useState(isEditMode);
  const [editLoadError, setEditLoadError] = useState('');
  const [editDisplayName, setEditDisplayName] = useState('');

  useEffect(() => {
    if (!isEditMode) return;
    let cancelled = false;
    const loadForEdit = async () => {
      setEditLoading(true);
      setEditLoadError('');
      try {
        const response = await fetchJson(`/api/afghan-teachers/${editId}`);
        const teacher = response?.teacher || response?.data || {};
        if (cancelled) return;
        if (!teacher?._id) throw new Error('پرونده پیدا نشد.');
        setFormData(populateFormFromTeacher(teacher));
        setEditDisplayName([teacher.personalInfo?.firstNameDari, teacher.personalInfo?.lastNameDari].filter(Boolean).join(' '));
        const recordSchoolId = teacher.employmentInfo?.currentSchool?._id || teacher.employmentInfo?.currentSchool;
        if (recordSchoolId) setSchoolId(String(recordSchoolId));
      } catch (error) {
        if (!cancelled) setEditLoadError(displayText(error?.message || 'دریافتِ پروندهٔ کارمند ناموفق بود.'));
      } finally {
        if (!cancelled) setEditLoading(false);
      }
    };
    loadForEdit();
    return () => { cancelled = true; };
  }, [isEditMode, editId]);

  // حساب‌های استاد که یک حساب کاربری (ورود به سیستم) دارند اما به هیچ پروندهٔ رسمی استاد وصل نیستند.
  const [orphanCandidates, setOrphanCandidates] = useState([]);
  const [orphanLoading, setOrphanLoading] = useState(true);
  const [orphanSearch, setOrphanSearch] = useState('');

  const requiresSchoolSelection = Boolean(activeSchoolContext?.requiresSelection || !activeSchoolContext?.schoolId);

  // R2 — the registrant's admin level decides which سمت‌ها can be created here and
  // whether the financial section is theirs to fill.
  const adminLevel = useMemo(() => readAdminLevel(), []);
  const allowedPositions = useMemo(() => {
    const values = POSITIONS_BY_ADMIN_LEVEL[adminLevel] || DEFAULT_ALLOWED_POSITIONS;
    return POSITION_OPTIONS.filter((item) => values.includes(item.value));
  }, [adminLevel]);
  const canEditFinance = adminLevel === 'general_president';
  const isNonTeaching = NON_TEACHING_POSITIONS.has(formData.position);
  const canFlagOwner = adminLevel === 'general_president' && formData.position === 'principal';

  // Keep the selected سمت inside what this registrant is allowed to create.
  useEffect(() => {
    if (allowedPositions.length === 0) return;
    if (!allowedPositions.some((item) => item.value === formData.position)) {
      setFormData((prev) => ({ ...prev, position: allowedPositions[0].value }));
    }
  }, [allowedPositions, formData.position]);

  useEffect(() => {
    const loadInitialData = async () => {
      setReferenceLoading(true);
      try {
        const schoolContext = await resolveActiveSchoolContext();
        setActiveSchoolContext(schoolContext);
        if (schoolContext?.schoolId) {
          setSchoolId(schoolContext.schoolId);
        }
      } catch (error) {
        toastRef.current.error(displayText(error?.message || 'دریافت اطلاعات مکتب فعال ناموفق بود.'));
      } finally {
        setReferenceLoading(false);
      }
    };
    loadInitialData();
  }, []);

  useEffect(() => {
    const loadOrphanCandidates = async () => {
      setOrphanLoading(true);
      try {
        const [usersRes, teachersRes] = await Promise.all([
          fetchJson('/api/admin/users'),
          fetchJson('/api/afghan-teachers/?limit=1000&status=active')
        ]);
        const linkedUserIds = new Set(
          (teachersRes?.teachers || [])
            .map((item) => trimValue(item?.linkedUserId?._id || item?.linkedUserId))
            .filter(Boolean)
        );
        const candidates = (usersRes?.items || [])
          .filter((item) => (item?.role === 'instructor' || item?.orgRole === 'instructor') && item?.status !== 'inactive')
          .filter((item) => !linkedUserIds.has(trimValue(item?._id)))
          .map((item) => ({ _id: item._id, name: item.name || '', email: item.email || '' }));
        setOrphanCandidates(candidates);
      } catch (error) {
        // این بخش کمکی است؛ اگر بارگذاری نشود، فرم همچنان بدون اتصال به حساب قابل استفاده است.
        setOrphanCandidates([]);
      } finally {
        setOrphanLoading(false);
      }
    };
    loadOrphanCandidates();
  }, []);

  const filteredOrphanCandidates = useMemo(() => {
    const query = trimValue(orphanSearch).toLowerCase();
    if (!query) return orphanCandidates;
    return orphanCandidates.filter((item) => (
      item.name.toLowerCase().includes(query) || item.email.toLowerCase().includes(query)
    ));
  }, [orphanCandidates, orphanSearch]);

  const selectedCandidate = useMemo(
    () => orphanCandidates.find((item) => item._id === formData.linkedUserId) || null,
    [orphanCandidates, formData.linkedUserId]
  );

  const handleInputChange = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => (prev[field] ? { ...prev, [field]: undefined } : prev));
  };

  const handleActiveSchoolSelect = (value) => {
    if (!value) return;
    persistActiveSchoolId(value);
    setSchoolId(value);
    setActiveSchoolContext((current) => ({ ...(current || {}), schoolId: value, requiresSelection: false }));
    window.location.reload();
  };

  const handleSelectCandidate = (userId) => {
    handleInputChange('linkedUserId', userId);
    const candidate = orphanCandidates.find((item) => item._id === userId);
    if (!candidate) return;

    // حسابِ کاربری فقط «نام» و «ایمیل» را نگه می‌دارد (نه تذکره/تولد/آدرس/تحصیلات —
    // این‌ها فقط بعد از ساختِ پروندهٔ رسمی وجود خواهند داشت)، پس همین دو با انتخابِ
    // حساب اتوماتیک خانه‌پری می‌شوند — بدون رونویسیِ چیزی که از قبل تایپ شده.
    const { first, last } = splitPersonName(candidate.name);
    setFormData((prev) => ({
      ...prev,
      email: trimValue(prev.email) ? prev.email : candidate.email,
      firstName: trimValue(prev.firstName) ? prev.firstName : first,
      lastName: trimValue(prev.lastName) ? prev.lastName : last
    }));
    setErrors((prev) => {
      if (!prev.email && !prev.firstName && !prev.lastName) return prev;
      const next = { ...prev };
      delete next.email;
      delete next.firstName;
      delete next.lastName;
      return next;
    });
  };

  const validateForm = () => {
    const nextErrors = {};
    if (!formData.firstName.trim()) nextErrors.firstName = 'نام الزامی است.';
    if (!formData.lastName.trim()) nextErrors.lastName = 'تخلص الزامی است.';
    if (!formData.fatherName.trim()) nextErrors.fatherName = 'نام پدر الزامی است.';
    if (!formData.gender) nextErrors.gender = 'جنسیت الزامی است.';
    if (!formData.birthDate) nextErrors.birthDate = 'تاریخ تولد الزامی است.';
    if (formData.birthDate && new Date(formData.birthDate) > new Date()) {
      nextErrors.birthDate = 'تاریخ تولد نمی‌تواند در آینده باشد.';
    }
    if (!formData.birthPlace.trim()) nextErrors.birthPlace = 'محل تولد الزامی است.';
    if (!formData.tazkiraNumber.trim()) nextErrors.tazkiraNumber = 'شماره تذکره الزامی است.';
    if (!formData.mobile.trim()) nextErrors.mobile = 'شماره موبایل الزامی است.';
    if (!formData.province) nextErrors.province = 'ولایت الزامی است.';
    if (!formData.district.trim()) nextErrors.district = 'ولسوالی/ناحیه الزامی است.';
    if (!formData.address.trim()) nextErrors.address = 'آدرس الزامی است.';
    if (!isNonTeaching) {
      if (!formData.highestEducation) nextErrors.highestEducation = 'سطح تحصیلات الزامی است.';
      if (!formData.fieldOfStudy.trim()) nextErrors.fieldOfStudy = 'رشتهٔ تحصیلی الزامی است.';
      if (!formData.university.trim()) nextErrors.university = 'نام دانشگاه/موسسه الزامی است.';
      if (!formData.graduationYear) nextErrors.graduationYear = 'سال فراغت الزامی است.';
    }
    if (!formData.employeeId.trim()) nextErrors.employeeId = 'شماره/کد کارمندی الزامی است.';
    if (!formData.position) nextErrors.position = 'سمت الزامی است.';
    if (!formData.employmentType) nextErrors.employmentType = 'نوع استخدام الزامی است.';
    if (!formData.hireDate) nextErrors.hireDate = 'تاریخ آغاز به کار الزامی است.';
    if (canEditFinance && !trimValue(formData.salaryBase)) nextErrors.salaryBase = 'معاش اساسی الزامی است.';
    if (isNonTeaching && !trimValue(formData.jobTitle)) nextErrors.jobTitle = 'عنوان وظیفه الزامی است.';

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSubmitStatus({ type: 'info', text: 'در حال بررسی معلومات فرم...' });

    if (!isEditMode && requiresSchoolSelection) {
      const message = 'اول یک مکتب فعال و معتبر انتخاب یا ایجاد کنید.';
      setSubmitStatus({ type: 'error', text: message });
      toastRef.current.error(message);
      return;
    }

    if (!validateForm()) {
      const message = 'فرم تکمیل نیست. لطفاً فیلدهای پیام‌دار را بررسی و تکمیل کنید.';
      setSubmitStatus({ type: 'error', text: message });
      toastRef.current.error(message);
      return;
    }

    setLoading(true);
    try {
      const payload = buildTeacherPayload({ formData, schoolId });

      if (isEditMode) {
        setSubmitStatus({ type: 'info', text: 'در حال ذخیرهٔ تغییرات...' });
        await fetchJson(`/api/afghan-teachers/${editId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        toast.success('تغییراتِ پروندهٔ کارمند ذخیره شد.');
        navigate('/school-staff');
        return;
      }

      setSubmitStatus({ type: 'info', text: 'در حال ارسال معلومات به سرور...' });
      const response = await postJson('/api/afghan-teachers', payload);
      const createdTeacher = response?.teacher || response?.data || {};
      const displayName = [
        createdTeacher?.personalInfo?.firstNameDari || formData.firstNameDari || formData.firstName,
        createdTeacher?.personalInfo?.lastNameDari || formData.lastNameDari || formData.lastName
      ].filter(Boolean).join(' ');

      setLastRegisteredTeacher({
        id: createdTeacher?._id || '',
        displayName: displayName || 'استاد جدید',
        linked: Boolean(formData.linkedUserId)
      });
      setErrors({});
      setFormData(createEmptyForm());
      setOrphanCandidates((prev) => prev.filter((item) => item._id !== formData.linkedUserId));

      const linkedNotice = formData.linkedUserId
        ? ' این پروندهٔ رسمی به حساب کاربری موجود وصل شد؛ آن حساب دیگر «یتیم» نیست.'
        : '';
      setSubmitStatus({ type: 'success', text: `پروندهٔ ${displayName} با موفقیت ثبت شد.${linkedNotice}` });
      toast.success(`پرونده با موفقیت ثبت شد.${linkedNotice}`);
    } catch (error) {
      const message = displayText(error?.message || (isEditMode ? 'ذخیرهٔ تغییرات ناموفق بود.' : 'ثبت پرونده ناموفق بود.'));
      setSubmitStatus({ type: 'error', text: message });
      toastRef.current.error(message);
    } finally {
      setLoading(false);
    }
  };

  if (isEditMode && editLoading) {
    return (
      <div className="staff-registration">
        <div className="staff-shell">در حال بارگذاریِ پروندهٔ کارمند...</div>
      </div>
    );
  }

  if (isEditMode && editLoadError) {
    return (
      <div className="staff-registration">
        <div className="staff-shell">
          <div className="staff-banner error" role="alert">{editLoadError}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="staff-registration">
      <div className="staff-hero">
        <div className="staff-hero-inner">
          <div className="staff-hero-icon">{isEditMode ? '✏️' : '🧑‍💼'}</div>
          <div>
            <h1>{isEditMode ? `ویرایشِ پروندهٔ ${editDisplayName || 'کارمند'}` : 'ثبت پروندهٔ کارکنان مکتب'}</h1>
            <p>
              {isEditMode
                ? 'معلوماتِ این پروندهٔ رسمی را ویرایش و ذخیره کنید.'
                : 'پروندهٔ رسمی استاد یا کارمند (اداری/خدماتی) مکتب را وارد کنید. اگر شخص از قبل حساب کاربری دارد، آن را از بخش پایین انتخاب کنید تا پرونده به همان حساب وصل شود.'}
            </p>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit} noValidate>
        {!isEditMode && requiresSchoolSelection && !referenceLoading && (
          <div className="staff-banner warn" role="alert">
            اول یک مکتب فعال و معتبر انتخاب یا ایجاد کنید. ثبت پرونده بدون مکتب واقعی در دیتابیس ذخیره نمی‌شود.
            {Array.isArray(activeSchoolContext?.schools) && activeSchoolContext.schools.length > 0 && (
              <select
                className="staff-select"
                defaultValue=""
                onChange={(event) => handleActiveSchoolSelect(event.target.value)}
              >
                <option value="">انتخاب مکتب فعال</option>
                {activeSchoolContext.schools.map((school) => (
                  <option key={school._id || school.id} value={school._id || school.id}>
                    {school.nameDari || school.name || school.schoolCode}
                  </option>
                ))}
              </select>
            )}
          </div>
        )}
        {!requiresSchoolSelection && activeSchoolContext?.school && (
          <div className="staff-banner context">
            <strong>مکتب فعال: {activeSchoolContext.school.nameDari || activeSchoolContext.school.name || 'مکتب'}</strong>
            {Array.isArray(activeSchoolContext?.schools) && activeSchoolContext.schools.length > 1 && (
              <select
                className="staff-select"
                value={schoolId}
                onChange={(event) => handleActiveSchoolSelect(event.target.value)}
              >
                {activeSchoolContext.schools.map((school) => (
                  <option key={school._id || school.id} value={school._id || school.id}>
                    {school.nameDari || school.name || school.schoolCode}
                  </option>
                ))}
              </select>
            )}
          </div>
        )}

        {!!submitStatus.text && (
          <div className={`staff-banner ${submitStatus.type || 'info'}`} role="status">
            {submitStatus.text}
          </div>
        )}

        {!!lastRegisteredTeacher && (
          <div className="staff-banner success" role="status">
            آخرین ثبت: {lastRegisteredTeacher.displayName}{lastRegisteredTeacher.linked ? ' (وصل به حساب کاربری موجود)' : ''}
          </div>
        )}

        {/* اتصال به حساب کاربری موجود — فقط در حالتِ ثبتِ جدید؛ در ویرایش دست‌نخورده می‌ماند */}
        {!isEditMode && (
          <section className="staff-card">
            <div className="staff-card__head">
              <h2>اتصال به حساب کاربری موجود (اختیاری)</h2>
              <p>
                اگر این استاد از قبل حساب کاربری (ورود به سیستم) دارد اما هیچ پروندهٔ رسمی برایش ثبت نشده،
                او را از این لیست انتخاب کنید تا پروندهٔ جدید مستقیماً به همان حساب وصل شود — به‌جای ساخت حساب تکراری.
                با انتخاب، «نام» و «ایمیل» خودکار پر می‌شود؛ حساب کاربری چیزِ دیگری (تذکره، تولد، آدرس، تحصیلات، معاش...) نگه نمی‌دارد — بقیهٔ فورم را خودتان تکمیل کنید.
              </p>
            </div>
            {orphanLoading ? (
              <p className="staff-orphan-msg">در حال بارگذاری حساب‌های بدون پرونده...</p>
            ) : orphanCandidates.length === 0 ? (
              <p className="staff-orphan-msg">در حال حاضر هیچ حساب استاد بدون پروندهٔ رسمی پیدا نشد.</p>
            ) : (
              <div className="staff-grid">
                <div className="staff-field staff-field--full">
                  <label htmlFor="orphanSearch">جستجوی حساب (نام یا ایمیل) — {orphanCandidates.length.toLocaleString('fa-AF')} حساب بدون پرونده</label>
                  <input
                    id="orphanSearch"
                    value={orphanSearch}
                    onChange={(e) => setOrphanSearch(e.target.value)}
                    placeholder="نام یا ایمیل را تایپ کنید..."
                  />
                </div>
                <div className="staff-field staff-field--full">
                  <label htmlFor="linkedUserId">حساب کاربری</label>
                  <select
                    id="linkedUserId"
                    value={formData.linkedUserId}
                    onChange={(e) => handleSelectCandidate(e.target.value)}
                  >
                    <option value="">— بدون اتصال؛ فقط پروندهٔ رسمی جدید بساز —</option>
                    {filteredOrphanCandidates.map((item) => (
                      <option key={item._id} value={item._id}>
                        {item.name || 'بدون نام'} {item.email ? `— ${item.email}` : ''}
                      </option>
                    ))}
                  </select>
                </div>
                {selectedCandidate && (
                  <div className="staff-field staff-field--full">
                    <span className="staff-orphan-picked">انتخاب شد: {selectedCandidate.name || 'بدون نام'} ({selectedCandidate.email || 'بدون ایمیل'})</span>
                  </div>
                )}
              </div>
            )}
          </section>
        )}

        {/* مشخصات شخصی */}
        <section className="staff-card">
          <div className="staff-card__head"><h2>مشخصات شخصی</h2></div>
          <div className="staff-grid">
            <div className="staff-field">
              <label htmlFor="firstName">نام *</label>
              <input id="firstName" value={formData.firstName} onChange={(e) => handleInputChange('firstName', e.target.value)} required className={errors.firstName ? 'has-error' : ''} />
              {errors.firstName && <span className="staff-error">{errors.firstName}</span>}
            </div>
            <div className="staff-field">
              <label htmlFor="lastName">تخلص *</label>
              <input id="lastName" value={formData.lastName} onChange={(e) => handleInputChange('lastName', e.target.value)} required className={errors.lastName ? 'has-error' : ''} />
              {errors.lastName && <span className="staff-error">{errors.lastName}</span>}
            </div>
            <div className="staff-field">
              <label htmlFor="firstNameDari">نام به انگلیسی</label>
              <input id="firstNameDari" dir="ltr" value={formData.firstNameDari} onChange={(e) => handleInputChange('firstNameDari', e.target.value)} placeholder={formData.firstName} />
            </div>
            <div className="staff-field">
              <label htmlFor="lastNameDari">تخلص به انگلیسی</label>
              <input id="lastNameDari" dir="ltr" value={formData.lastNameDari} onChange={(e) => handleInputChange('lastNameDari', e.target.value)} placeholder={formData.lastName} />
            </div>
            <div className="staff-field">
              <label htmlFor="fatherName">نام پدر *</label>
              <input id="fatherName" value={formData.fatherName} onChange={(e) => handleInputChange('fatherName', e.target.value)} required className={errors.fatherName ? 'has-error' : ''} />
              {errors.fatherName && <span className="staff-error">{errors.fatherName}</span>}
            </div>
            <div className="staff-field">
              <label htmlFor="gender">جنسیت *</label>
              <select id="gender" value={formData.gender} onChange={(e) => handleInputChange('gender', e.target.value)} required className={errors.gender ? 'has-error' : ''}>
                <option value="">انتخاب کنید</option>
                <option value="male">ذکور</option>
                <option value="female">اناث</option>
              </select>
              {errors.gender && <span className="staff-error">{errors.gender}</span>}
            </div>
            <div className="staff-field">
              <label htmlFor="birthDate">تاریخ تولد *</label>
              <AfghanDateInput id="birthDate" value={formData.birthDate} onChange={(value) => handleInputChange('birthDate', value)} required inputClassName={errors.birthDate ? 'has-error' : ''} showGregorianEquivalent />
              {errors.birthDate && <span className="staff-error">{errors.birthDate}</span>}
            </div>
            <div className="staff-field">
              <label htmlFor="birthPlace">محل تولد *</label>
              <input id="birthPlace" value={formData.birthPlace} onChange={(e) => handleInputChange('birthPlace', e.target.value)} required className={errors.birthPlace ? 'has-error' : ''} />
              {errors.birthPlace && <span className="staff-error">{errors.birthPlace}</span>}
            </div>
            <div className="staff-field">
              <label htmlFor="tazkiraNumber">شماره تذکره *</label>
              <input id="tazkiraNumber" value={formData.tazkiraNumber} onChange={(e) => handleInputChange('tazkiraNumber', e.target.value)} required className={errors.tazkiraNumber ? 'has-error' : ''} />
              {errors.tazkiraNumber && <span className="staff-error">{errors.tazkiraNumber}</span>}
            </div>
            <div className="staff-field">
              <div className="staff-checkbox-field">
                <input id="hasTeacherLicense" type="checkbox" checked={formData.hasTeacherLicense} onChange={(e) => handleInputChange('hasTeacherLicense', e.target.checked)} />
                <label htmlFor="hasTeacherLicense">جواز تدریس دارد</label>
              </div>
              {formData.hasTeacherLicense && (
                <input id="teacherLicenseNumber" placeholder="شماره جواز تدریس" value={formData.teacherLicenseNumber} onChange={(e) => handleInputChange('teacherLicenseNumber', e.target.value)} />
              )}
            </div>
          </div>
        </section>

        {/* اطلاعات تماس و آدرس */}
        <section className="staff-card">
          <div className="staff-card__head"><h2>اطلاعات تماس و آدرس</h2></div>
          <div className="staff-grid">
            <div className="staff-field">
              <label htmlFor="mobile">شماره موبایل *</label>
              <input id="mobile" value={formData.mobile} onChange={(e) => handleInputChange('mobile', e.target.value)} required className={errors.mobile ? 'has-error' : ''} />
              {errors.mobile && <span className="staff-error">{errors.mobile}</span>}
            </div>
            <div className="staff-field">
              <label htmlFor="phone">شماره تماس بدیل</label>
              <input id="phone" value={formData.phone} onChange={(e) => handleInputChange('phone', e.target.value)} />
            </div>
            <div className="staff-field">
              <label htmlFor="email">ایمیل</label>
              <input id="email" type="email" value={formData.email} onChange={(e) => handleInputChange('email', e.target.value)} />
            </div>
            <div className="staff-field">
              <label htmlFor="province">ولایت *</label>
              <select id="province" value={formData.province} onChange={(e) => handleInputChange('province', e.target.value)} required className={errors.province ? 'has-error' : ''}>
                <option value="">انتخاب کنید</option>
                {PROVINCES.map((province) => <option key={province.value} value={province.value}>{province.label}</option>)}
              </select>
              {errors.province && <span className="staff-error">{errors.province}</span>}
            </div>
            <div className="staff-field">
              <label htmlFor="district">ولسوالی/ناحیه *</label>
              <input id="district" value={formData.district} onChange={(e) => handleInputChange('district', e.target.value)} required className={errors.district ? 'has-error' : ''} />
              {errors.district && <span className="staff-error">{errors.district}</span>}
            </div>
            <div className="staff-field">
              <label htmlFor="village">قریه/گذر</label>
              <input id="village" value={formData.village} onChange={(e) => handleInputChange('village', e.target.value)} />
            </div>
            <div className="staff-field staff-field--full">
              <label htmlFor="address">آدرس کامل *</label>
              <input id="address" value={formData.address} onChange={(e) => handleInputChange('address', e.target.value)} required className={errors.address ? 'has-error' : ''} />
              {errors.address && <span className="staff-error">{errors.address}</span>}
            </div>
          </div>
        </section>

        {/* اطلاعات تحصیلی */}
        <section className="staff-card">
          <div className="staff-card__head">
            <h2>اطلاعات تحصیلی</h2>
            {isNonTeaching && <p>اختیاری برای کارمند اداری/خدماتی</p>}
          </div>
          <div className="staff-grid">
            <div className="staff-field">
              <label htmlFor="highestEducation">سطح تحصیلات {isNonTeaching ? '' : '*'}</label>
              <select id="highestEducation" value={formData.highestEducation} onChange={(e) => handleInputChange('highestEducation', e.target.value)} className={errors.highestEducation ? 'has-error' : ''}>
                <option value="">انتخاب کنید</option>
                {HIGHEST_EDUCATION_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
              {errors.highestEducation && <span className="staff-error">{errors.highestEducation}</span>}
            </div>
            <div className="staff-field">
              <label htmlFor="fieldOfStudy">رشتهٔ تحصیلی {isNonTeaching ? '' : '*'}</label>
              <input id="fieldOfStudy" value={formData.fieldOfStudy} onChange={(e) => handleInputChange('fieldOfStudy', e.target.value)} className={errors.fieldOfStudy ? 'has-error' : ''} />
              {errors.fieldOfStudy && <span className="staff-error">{errors.fieldOfStudy}</span>}
            </div>
            <div className="staff-field">
              <label htmlFor="university">دانشگاه/موسسه {isNonTeaching ? '' : '*'}</label>
              <input id="university" value={formData.university} onChange={(e) => handleInputChange('university', e.target.value)} className={errors.university ? 'has-error' : ''} />
              {errors.university && <span className="staff-error">{errors.university}</span>}
            </div>
            <div className="staff-field">
              <label htmlFor="graduationYear">سال فراغت {isNonTeaching ? '' : '*'}</label>
              <input id="graduationYear" type="number" value={formData.graduationYear} onChange={(e) => handleInputChange('graduationYear', e.target.value)} className={errors.graduationYear ? 'has-error' : ''} />
              {errors.graduationYear && <span className="staff-error">{errors.graduationYear}</span>}
            </div>
          </div>
        </section>

        {/* اطلاعات شغلی */}
        <section className="staff-card">
          <div className="staff-card__head"><h2>اطلاعات شغلی</h2></div>
          <div className="staff-grid">
            <div className="staff-field">
              <label htmlFor="employeeId">شماره/کد کارمندی *</label>
              <input id="employeeId" value={formData.employeeId} onChange={(e) => handleInputChange('employeeId', e.target.value)} required className={errors.employeeId ? 'has-error' : ''} />
              {errors.employeeId && <span className="staff-error">{errors.employeeId}</span>}
            </div>
            <div className="staff-field">
              <label htmlFor="position">سمت *</label>
              <select id="position" value={formData.position} onChange={(e) => handleInputChange('position', e.target.value)} required className={errors.position ? 'has-error' : ''}>
                {allowedPositions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
              {errors.position && <span className="staff-error">{errors.position}</span>}
              {allowedPositions.length < POSITION_OPTIONS.length && (
                <span className="staff-hint">ثبت مدیر و صاحب امتیاز فقط از حساب ریاست عمومی امکان‌پذیر است.</span>
              )}
            </div>
            {isNonTeaching && (
              <>
                <div className="staff-field">
                  <label htmlFor="jobTitle">عنوان وظیفه *</label>
                  <input id="jobTitle" value={formData.jobTitle} onChange={(e) => handleInputChange('jobTitle', e.target.value)} placeholder="مثال: محاسب، نگهبان، راننده" className={errors.jobTitle ? 'has-error' : ''} />
                  {errors.jobTitle && <span className="staff-error">{errors.jobTitle}</span>}
                </div>
                <div className="staff-field">
                  <label htmlFor="department">بخش/دیپارتمنت</label>
                  <input id="department" value={formData.department} onChange={(e) => handleInputChange('department', e.target.value)} placeholder="مثال: محاسبه، حراست، ترانسپورت، نظافت" />
                </div>
              </>
            )}
            {canFlagOwner && (
              <div className="staff-field staff-field--full">
                <div className="staff-owner-field">
                  <input id="isOwner" type="checkbox" checked={formData.isOwner} onChange={(e) => handleInputChange('isOwner', e.target.checked)} />
                  <label htmlFor="isOwner">این مدیر، صاحب امتیاز مکتب است (owner)</label>
                </div>
              </div>
            )}
            <div className="staff-field">
              <label htmlFor="employmentType">نوع استخدام *</label>
              <select id="employmentType" value={formData.employmentType} onChange={(e) => handleInputChange('employmentType', e.target.value)} required className={errors.employmentType ? 'has-error' : ''}>
                {EMPLOYMENT_TYPE_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
              {errors.employmentType && <span className="staff-error">{errors.employmentType}</span>}
            </div>
            <div className="staff-field">
              <label htmlFor="workSchedule">نوع اوقات کاری</label>
              <select id="workSchedule" value={formData.workSchedule} onChange={(e) => handleInputChange('workSchedule', e.target.value)}>
                {WORK_SCHEDULE_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
            </div>
            <div className="staff-field">
              <label htmlFor="hireDate">تاریخ آغاز به کار *</label>
              <AfghanDateInput id="hireDate" value={formData.hireDate} onChange={(value) => handleInputChange('hireDate', value)} required inputClassName={errors.hireDate ? 'has-error' : ''} showGregorianEquivalent />
              {errors.hireDate && <span className="staff-error">{errors.hireDate}</span>}
            </div>
          </div>
        </section>

        {/* اطلاعات مالی — R2: فقط ریاست عمومی */}
        {canEditFinance ? (
          <section className="staff-card">
            <div className="staff-card__head"><h2>اطلاعات مالی</h2></div>
            <div className="staff-grid">
              <div className="staff-field">
                <label htmlFor="salaryBase">معاش اساسی (افغانی) *</label>
                <input id="salaryBase" type="number" min="0" value={formData.salaryBase} onChange={(e) => handleInputChange('salaryBase', e.target.value)} required className={errors.salaryBase ? 'has-error' : ''} />
                {errors.salaryBase && <span className="staff-error">{errors.salaryBase}</span>}
              </div>
              <div className="staff-field">
                <label htmlFor="salaryHousing">بدل کرایه خانه</label>
                <input id="salaryHousing" type="number" min="0" value={formData.salaryHousing} onChange={(e) => handleInputChange('salaryHousing', e.target.value)} />
              </div>
              <div className="staff-field">
                <label htmlFor="salaryTransport">بدل ترانسپورت</label>
                <input id="salaryTransport" type="number" min="0" value={formData.salaryTransport} onChange={(e) => handleInputChange('salaryTransport', e.target.value)} />
              </div>
              <div className="staff-field">
                <label htmlFor="salaryOther">سایر امتیازات</label>
                <input id="salaryOther" type="number" min="0" value={formData.salaryOther} onChange={(e) => handleInputChange('salaryOther', e.target.value)} />
              </div>
            </div>
          </section>
        ) : (
          <section className="staff-card">
            <div className="staff-card__head"><h2>اطلاعات مالی</h2></div>
            <p className="staff-note">بخش مالی (معاش و حساب بانکی) توسط مدیریت مالی روی همین پرونده تکمیل می‌شود.</p>
          </section>
        )}

        <div className="staff-footer">
          <button type="submit" className="staff-btn-primary" disabled={loading || (!isEditMode && referenceLoading)}>
            {loading ? (isEditMode ? 'در حال ذخیره...' : 'در حال ثبت...') : (isEditMode ? 'ذخیرهٔ تغییرات' : 'ثبت پروندهٔ کارمند')}
          </button>
        </div>
      </form>
    </div>
  );
};

export default TeacherRegistration;
