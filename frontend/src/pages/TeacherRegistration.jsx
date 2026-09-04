import React, { useEffect, useMemo, useRef, useState } from 'react';
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
import './AfghanSchoolManagement.css';
import './StudentRegistration.css';

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
const POSITIONS_BY_ADMIN_LEVEL = {
  general_president: ['teacher', 'principal', 'vice_principal', 'admin_staff', 'support_staff'],
  principal: ['teacher', 'vice_principal', 'admin_staff', 'support_staff']
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
const toNumberOrUndefined = (value) => {
  const trimmed = trimValue(value);
  if (!trimmed) return undefined;
  const num = Number(trimmed);
  return Number.isFinite(num) ? num : undefined;
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

  const [schoolId, setSchoolId] = useState(() => readStoredSchoolId() || DEFAULT_SCHOOL_ID);
  const [activeSchoolContext, setActiveSchoolContext] = useState(null);
  const [referenceLoading, setReferenceLoading] = useState(true);

  const [formData, setFormData] = useState(() => createEmptyForm());
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [submitStatus, setSubmitStatus] = useState({ type: '', text: '' });
  const [lastRegisteredTeacher, setLastRegisteredTeacher] = useState(null);

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
    if (candidate && !trimValue(formData.email)) {
      handleInputChange('email', candidate.email);
    }
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

    if (requiresSchoolSelection) {
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
      setSubmitStatus({ type: 'info', text: 'در حال ارسال معلومات به سرور...' });
      const response = await postJson('/api/afghan-teachers', payload);
      const createdTeacher = response?.data || response?.teacher || {};
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
      const message = displayText(error?.message || 'ثبت پرونده ناموفق بود.');
      setSubmitStatus({ type: 'error', text: message });
      toastRef.current.error(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="school-management" style={{ minHeight: '100vh' }}>
      <form className="school-form" onSubmit={handleSubmit} noValidate style={{ maxWidth: 900, margin: '40px auto', background: 'white', borderRadius: 12, boxShadow: '0 2px 10px rgba(0,0,0,0.08)', padding: 32 }}>
        <h2 style={{ textAlign: 'center', color: '#2c3e50', marginBottom: 8 }}>ثبت پروندهٔ کارکنان مکتب</h2>
        <p className="form-subtitle" style={{ textAlign: 'center', color: '#666', marginBottom: 24 }}>
          پروندهٔ رسمی استاد یا کارمند (اداری/خدماتی) مکتب را وارد کنید. این پرونده جدا از حساب کاربری
          (ورود به سیستم) است؛ اگر شخص از قبل حساب کاربری دارد، آن را از بخش پایین انتخاب کنید تا پرونده به همان حساب وصل شود.
        </p>

        {requiresSchoolSelection && !referenceLoading && (
          <div className="student-registration-alert" role="alert">
            اول یک مکتب فعال و معتبر انتخاب یا ایجاد کنید. ثبت پرونده بدون مکتب واقعی در دیتابیس ذخیره نمی‌شود.
            {Array.isArray(activeSchoolContext?.schools) && activeSchoolContext.schools.length > 0 && (
              <select
                className="student-registration-school-select"
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
          <div className="student-registration-school-context">
            <strong>مکتب فعال: {activeSchoolContext.school.nameDari || activeSchoolContext.school.name || 'مکتب'}</strong>
            {Array.isArray(activeSchoolContext?.schools) && activeSchoolContext.schools.length > 1 && (
              <select
                className="student-registration-school-select student-registration-school-switcher"
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
          <div className={`student-registration-submit-status ${submitStatus.type || 'info'}`} role="status">
            {submitStatus.text}
          </div>
        )}

        {!!lastRegisteredTeacher && (
          <div className="student-registration-submit-status success" role="status">
            آخرین ثبت: {lastRegisteredTeacher.displayName}{lastRegisteredTeacher.linked ? ' (وصل به حساب کاربری موجود)' : ''}
          </div>
        )}

        {/* اتصال به حساب کاربری موجود */}
        <div className="form-section">
          <h3 style={{ color: '#3498db', marginBottom: 4 }}>اتصال به حساب کاربری موجود (اختیاری)</h3>
          <p style={{ fontSize: 13, color: '#888', marginTop: 0, marginBottom: 12 }}>
            اگر این استاد از قبل حساب کاربری (ورود به سیستم) دارد اما هیچ پروندهٔ رسمی برایش ثبت نشده،
            او را از این لیست انتخاب کنید تا پروندهٔ جدید مستقیماً به همان حساب وصل شود — به‌جای ساخت حساب تکراری.
          </p>
          {orphanLoading ? (
            <p style={{ fontSize: 13, color: '#888' }}>در حال بارگذاری حساب‌های بدون پرونده...</p>
          ) : orphanCandidates.length === 0 ? (
            <p style={{ fontSize: 13, color: '#2e7d32' }}>در حال حاضر هیچ حساب استاد بدون پروندهٔ رسمی پیدا نشد.</p>
          ) : (
            <div className="form-grid">
              <div className="form-group full-width">
                <label htmlFor="orphanSearch">جستجوی حساب (نام یا ایمیل) — {orphanCandidates.length.toLocaleString('fa-AF')} حساب بدون پرونده</label>
                <input
                  id="orphanSearch"
                  value={orphanSearch}
                  onChange={(e) => setOrphanSearch(e.target.value)}
                  placeholder="نام یا ایمیل را تایپ کنید..."
                />
              </div>
              <div className="form-group full-width">
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
                <div className="form-group full-width" style={{ fontSize: 13, color: '#2e7d32' }}>
                  انتخاب شد: {selectedCandidate.name || 'بدون نام'} ({selectedCandidate.email || 'بدون ایمیل'})
                </div>
              )}
            </div>
          )}
        </div>

        {/* مشخصات شخصی */}
        <div className="form-section">
          <h3 style={{ color: '#3498db', marginBottom: 12 }}>مشخصات شخصی</h3>
          <div className="form-grid">
            <div className="form-group">
              <label htmlFor="firstName">نام *</label>
              <input id="firstName" value={formData.firstName} onChange={(e) => handleInputChange('firstName', e.target.value)} required className={errors.firstName ? 'border-red-500' : ''} />
              {errors.firstName && <span className="text-red-500">{errors.firstName}</span>}
            </div>
            <div className="form-group">
              <label htmlFor="lastName">تخلص *</label>
              <input id="lastName" value={formData.lastName} onChange={(e) => handleInputChange('lastName', e.target.value)} required className={errors.lastName ? 'border-red-500' : ''} />
              {errors.lastName && <span className="text-red-500">{errors.lastName}</span>}
            </div>
            <div className="form-group">
              <label htmlFor="firstNameDari">نام به انگلیسی</label>
              <input id="firstNameDari" dir="ltr" value={formData.firstNameDari} onChange={(e) => handleInputChange('firstNameDari', e.target.value)} placeholder={formData.firstName} />
            </div>
            <div className="form-group">
              <label htmlFor="lastNameDari">تخلص به انگلیسی</label>
              <input id="lastNameDari" dir="ltr" value={formData.lastNameDari} onChange={(e) => handleInputChange('lastNameDari', e.target.value)} placeholder={formData.lastName} />
            </div>
            <div className="form-group">
              <label htmlFor="fatherName">نام پدر *</label>
              <input id="fatherName" value={formData.fatherName} onChange={(e) => handleInputChange('fatherName', e.target.value)} required className={errors.fatherName ? 'border-red-500' : ''} />
              {errors.fatherName && <span className="text-red-500">{errors.fatherName}</span>}
            </div>
            <div className="form-group">
              <label htmlFor="gender">جنسیت *</label>
              <select id="gender" value={formData.gender} onChange={(e) => handleInputChange('gender', e.target.value)} required className={errors.gender ? 'border-red-500' : ''}>
                <option value="">انتخاب کنید</option>
                <option value="male">ذکور</option>
                <option value="female">اناث</option>
              </select>
              {errors.gender && <span className="text-red-500">{errors.gender}</span>}
            </div>
            <div className="form-group">
              <label htmlFor="birthDate">تاریخ تولد *</label>
              <AfghanDateInput id="birthDate" value={formData.birthDate} onChange={(value) => handleInputChange('birthDate', value)} required inputClassName={errors.birthDate ? 'border-red-500' : ''} showGregorianEquivalent />
              {errors.birthDate && <span className="text-red-500">{errors.birthDate}</span>}
            </div>
            <div className="form-group">
              <label htmlFor="birthPlace">محل تولد *</label>
              <input id="birthPlace" value={formData.birthPlace} onChange={(e) => handleInputChange('birthPlace', e.target.value)} required className={errors.birthPlace ? 'border-red-500' : ''} />
              {errors.birthPlace && <span className="text-red-500">{errors.birthPlace}</span>}
            </div>
            <div className="form-group">
              <label htmlFor="tazkiraNumber">شماره تذکره *</label>
              <input id="tazkiraNumber" value={formData.tazkiraNumber} onChange={(e) => handleInputChange('tazkiraNumber', e.target.value)} required className={errors.tazkiraNumber ? 'border-red-500' : ''} />
              {errors.tazkiraNumber && <span className="text-red-500">{errors.tazkiraNumber}</span>}
            </div>
            <div className="form-group">
              <label htmlFor="teacherLicenseNumber">
                <input type="checkbox" checked={formData.hasTeacherLicense} onChange={(e) => handleInputChange('hasTeacherLicense', e.target.checked)} style={{ width: 'auto', marginLeft: 6 }} />
                جواز تدریس دارد
              </label>
              {formData.hasTeacherLicense && (
                <input id="teacherLicenseNumber" placeholder="شماره جواز تدریس" value={formData.teacherLicenseNumber} onChange={(e) => handleInputChange('teacherLicenseNumber', e.target.value)} />
              )}
            </div>
          </div>
        </div>

        {/* اطلاعات تماس و آدرس */}
        <div className="form-section">
          <h3 style={{ color: '#3498db', marginBottom: 12 }}>اطلاعات تماس و آدرس</h3>
          <div className="form-grid">
            <div className="form-group">
              <label htmlFor="mobile">شماره موبایل *</label>
              <input id="mobile" value={formData.mobile} onChange={(e) => handleInputChange('mobile', e.target.value)} required className={errors.mobile ? 'border-red-500' : ''} />
              {errors.mobile && <span className="text-red-500">{errors.mobile}</span>}
            </div>
            <div className="form-group">
              <label htmlFor="phone">شماره تماس بدیل</label>
              <input id="phone" value={formData.phone} onChange={(e) => handleInputChange('phone', e.target.value)} />
            </div>
            <div className="form-group">
              <label htmlFor="email">ایمیل</label>
              <input id="email" type="email" value={formData.email} onChange={(e) => handleInputChange('email', e.target.value)} />
            </div>
            <div className="form-group">
              <label htmlFor="province">ولایت *</label>
              <select id="province" value={formData.province} onChange={(e) => handleInputChange('province', e.target.value)} required className={errors.province ? 'border-red-500' : ''}>
                <option value="">انتخاب کنید</option>
                {PROVINCES.map((province) => <option key={province.value} value={province.value}>{province.label}</option>)}
              </select>
              {errors.province && <span className="text-red-500">{errors.province}</span>}
            </div>
            <div className="form-group">
              <label htmlFor="district">ولسوالی/ناحیه *</label>
              <input id="district" value={formData.district} onChange={(e) => handleInputChange('district', e.target.value)} required className={errors.district ? 'border-red-500' : ''} />
              {errors.district && <span className="text-red-500">{errors.district}</span>}
            </div>
            <div className="form-group">
              <label htmlFor="village">قریه/گذر</label>
              <input id="village" value={formData.village} onChange={(e) => handleInputChange('village', e.target.value)} />
            </div>
            <div className="form-group full-width">
              <label htmlFor="address">آدرس کامل *</label>
              <input id="address" value={formData.address} onChange={(e) => handleInputChange('address', e.target.value)} required className={errors.address ? 'border-red-500' : ''} />
              {errors.address && <span className="text-red-500">{errors.address}</span>}
            </div>
          </div>
        </div>

        {/* اطلاعات تحصیلی */}
        <div className="form-section">
          <h3 style={{ color: '#3498db', marginBottom: 12 }}>
            اطلاعات تحصیلی{isNonTeaching ? ' (اختیاری برای کارمند اداری/خدماتی)' : ''}
          </h3>
          <div className="form-grid">
            <div className="form-group">
              <label htmlFor="highestEducation">سطح تحصیلات {isNonTeaching ? '' : '*'}</label>
              <select id="highestEducation" value={formData.highestEducation} onChange={(e) => handleInputChange('highestEducation', e.target.value)} className={errors.highestEducation ? 'border-red-500' : ''}>
                <option value="">انتخاب کنید</option>
                {HIGHEST_EDUCATION_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
              {errors.highestEducation && <span className="text-red-500">{errors.highestEducation}</span>}
            </div>
            <div className="form-group">
              <label htmlFor="fieldOfStudy">رشتهٔ تحصیلی {isNonTeaching ? '' : '*'}</label>
              <input id="fieldOfStudy" value={formData.fieldOfStudy} onChange={(e) => handleInputChange('fieldOfStudy', e.target.value)} className={errors.fieldOfStudy ? 'border-red-500' : ''} />
              {errors.fieldOfStudy && <span className="text-red-500">{errors.fieldOfStudy}</span>}
            </div>
            <div className="form-group">
              <label htmlFor="university">دانشگاه/موسسه {isNonTeaching ? '' : '*'}</label>
              <input id="university" value={formData.university} onChange={(e) => handleInputChange('university', e.target.value)} className={errors.university ? 'border-red-500' : ''} />
              {errors.university && <span className="text-red-500">{errors.university}</span>}
            </div>
            <div className="form-group">
              <label htmlFor="graduationYear">سال فراغت {isNonTeaching ? '' : '*'}</label>
              <input id="graduationYear" type="number" value={formData.graduationYear} onChange={(e) => handleInputChange('graduationYear', e.target.value)} className={errors.graduationYear ? 'border-red-500' : ''} />
              {errors.graduationYear && <span className="text-red-500">{errors.graduationYear}</span>}
            </div>
          </div>
        </div>

        {/* اطلاعات شغلی */}
        <div className="form-section">
          <h3 style={{ color: '#3498db', marginBottom: 12 }}>اطلاعات شغلی</h3>
          <div className="form-grid">
            <div className="form-group">
              <label htmlFor="employeeId">شماره/کد کارمندی *</label>
              <input id="employeeId" value={formData.employeeId} onChange={(e) => handleInputChange('employeeId', e.target.value)} required className={errors.employeeId ? 'border-red-500' : ''} />
              {errors.employeeId && <span className="text-red-500">{errors.employeeId}</span>}
            </div>
            <div className="form-group">
              <label htmlFor="position">سمت *</label>
              <select id="position" value={formData.position} onChange={(e) => handleInputChange('position', e.target.value)} required className={errors.position ? 'border-red-500' : ''}>
                {allowedPositions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
              {errors.position && <span className="text-red-500">{errors.position}</span>}
              {allowedPositions.length < POSITION_OPTIONS.length && (
                <span style={{ fontSize: 12, color: '#888' }}>ثبت مدیر و صاحب امتیاز فقط از حساب ریاست عمومی امکان‌پذیر است.</span>
              )}
            </div>
            {isNonTeaching && (
              <>
                <div className="form-group">
                  <label htmlFor="jobTitle">عنوان وظیفه *</label>
                  <input id="jobTitle" value={formData.jobTitle} onChange={(e) => handleInputChange('jobTitle', e.target.value)} placeholder="مثال: محاسب، نگهبان، راننده" className={errors.jobTitle ? 'border-red-500' : ''} />
                  {errors.jobTitle && <span className="text-red-500">{errors.jobTitle}</span>}
                </div>
                <div className="form-group">
                  <label htmlFor="department">بخش/دیپارتمنت</label>
                  <input id="department" value={formData.department} onChange={(e) => handleInputChange('department', e.target.value)} placeholder="مثال: محاسبه، حراست، ترانسپورت، نظافت" />
                </div>
              </>
            )}
            {canFlagOwner && (
              <div className="form-group full-width" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input id="isOwner" type="checkbox" checked={formData.isOwner} onChange={(e) => handleInputChange('isOwner', e.target.checked)} style={{ width: 'auto' }} />
                <label htmlFor="isOwner" style={{ margin: 0 }}>این مدیر، صاحب امتیاز مکتب است (owner)</label>
              </div>
            )}
            <div className="form-group">
              <label htmlFor="employmentType">نوع استخدام *</label>
              <select id="employmentType" value={formData.employmentType} onChange={(e) => handleInputChange('employmentType', e.target.value)} required className={errors.employmentType ? 'border-red-500' : ''}>
                {EMPLOYMENT_TYPE_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
              {errors.employmentType && <span className="text-red-500">{errors.employmentType}</span>}
            </div>
            <div className="form-group">
              <label htmlFor="workSchedule">نوع اوقات کاری</label>
              <select id="workSchedule" value={formData.workSchedule} onChange={(e) => handleInputChange('workSchedule', e.target.value)}>
                {WORK_SCHEDULE_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label htmlFor="hireDate">تاریخ آغاز به کار *</label>
              <AfghanDateInput id="hireDate" value={formData.hireDate} onChange={(value) => handleInputChange('hireDate', value)} required inputClassName={errors.hireDate ? 'border-red-500' : ''} showGregorianEquivalent />
              {errors.hireDate && <span className="text-red-500">{errors.hireDate}</span>}
            </div>
          </div>
        </div>

        {/* اطلاعات مالی — R2: فقط ریاست عمومی */}
        {canEditFinance ? (
          <div className="form-section">
            <h3 style={{ color: '#3498db', marginBottom: 12 }}>اطلاعات مالی</h3>
            <div className="form-grid">
              <div className="form-group">
                <label htmlFor="salaryBase">معاش اساسی (افغانی) *</label>
                <input id="salaryBase" type="number" min="0" value={formData.salaryBase} onChange={(e) => handleInputChange('salaryBase', e.target.value)} required className={errors.salaryBase ? 'border-red-500' : ''} />
                {errors.salaryBase && <span className="text-red-500">{errors.salaryBase}</span>}
              </div>
              <div className="form-group">
                <label htmlFor="salaryHousing">بدل کرایه خانه</label>
                <input id="salaryHousing" type="number" min="0" value={formData.salaryHousing} onChange={(e) => handleInputChange('salaryHousing', e.target.value)} />
              </div>
              <div className="form-group">
                <label htmlFor="salaryTransport">بدل ترانسپورت</label>
                <input id="salaryTransport" type="number" min="0" value={formData.salaryTransport} onChange={(e) => handleInputChange('salaryTransport', e.target.value)} />
              </div>
              <div className="form-group">
                <label htmlFor="salaryOther">سایر امتیازات</label>
                <input id="salaryOther" type="number" min="0" value={formData.salaryOther} onChange={(e) => handleInputChange('salaryOther', e.target.value)} />
              </div>
            </div>
          </div>
        ) : (
          <div className="form-section">
            <h3 style={{ color: '#3498db', marginBottom: 12 }}>اطلاعات مالی</h3>
            <p style={{ fontSize: 13, color: '#888', margin: 0 }}>
              بخش مالی (معاش و حساب بانکی) توسط مدیریت مالی روی همین پرونده تکمیل می‌شود.
            </p>
          </div>
        )}

        <button type="submit" disabled={loading || referenceLoading} style={{ width: '100%', marginTop: 12 }}>
          {loading ? 'در حال ثبت...' : 'ثبت پروندهٔ کارمند'}
        </button>
      </form>
    </div>
  );
};

export default TeacherRegistration;
