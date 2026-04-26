import React, { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Textarea } from '../components/ui/textarea';
import { Badge } from '../components/ui/badge';
import {
  AlertCircle,
  BookOpen,
  CheckCircle,
  Phone,
  Save,
  User,
  Users,
  X
} from '../components/ui/icons';
import { useToast } from '../components/ui/toast';
import './AfghanSchoolManagement.css';

const getAuthHeaders = () => {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

const DEFAULT_SCHOOL_ID = 'default-school-id';

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
  { value: 'saripul', label: 'سرپل' }
];

const BLOOD_TYPES = ['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'];

const trimValue = (value) => String(value || '').trim();

const getEntityId = (value) => {
  if (!value) return '';
  if (typeof value === 'object') return trimValue(value._id || value.id);
  return trimValue(value);
};

const normalizeShiftCode = (rawValue = '') => {
  const value = trimValue(rawValue).toLowerCase();
  if (!value) return 'morning';
  if (value.includes('afternoon') || value.includes('بعد') || value.includes('عصر')) return 'afternoon';
  if (value.includes('evening') || value.includes('شب')) return 'evening';
  return 'morning';
};

const gradeFromClass = (schoolClass = {}) => {
  const numericGrade = Number(schoolClass?.gradeLevel || String(schoolClass?.code || '').match(/\d+/)?.[0] || 1);
  const boundedGrade = Number.isFinite(numericGrade) ? Math.min(12, Math.max(1, numericGrade)) : 1;
  return `grade${boundedGrade}`;
};

const buildStudentPayload = ({ formData, selectedClass, selectedShift, selectedYear, schoolId }) => {
  const classSchoolId = getEntityId(selectedClass?.schoolId);
  const yearSchoolId = getEntityId(selectedYear?.schoolId);
  const directSchoolId = schoolId && schoolId !== DEFAULT_SCHOOL_ID ? schoolId : '';
  const currentSchool = classSchoolId || yearSchoolId || directSchoolId;
  const district = trimValue(formData.city) || trimValue(formData.address) || 'نامشخص';
  const emergencyName = trimValue(formData.emergencyContact) || trimValue(formData.guardianName) || trimValue(formData.fatherName);
  const emergencyPhone = trimValue(formData.emergencyPhone) || trimValue(formData.guardianPhone) || trimValue(formData.fatherPhone) || trimValue(formData.phone);
  const emergencyRelation = trimValue(formData.guardianRelation) || 'سرپرست';
  const shiftCode = normalizeShiftCode(selectedClass?.shift || selectedShift?.code || selectedShift?.name || selectedShift?.title);
  const previousSchoolName = trimValue(formData.previousSchool);
  const previousGrade = trimValue(formData.previousGrade);

  return {
    personalInfo: {
      firstName: trimValue(formData.firstName),
      lastName: trimValue(formData.lastName),
      firstNameDari: trimValue(formData.firstName),
      lastNameDari: trimValue(formData.lastName),
      fatherName: trimValue(formData.fatherName),
      grandfatherName: trimValue(formData.grandfatherName),
      gender: formData.gender,
      birthDate: formData.birthDate,
      birthPlace: district,
      nationality: 'Afghan'
    },
    identification: {
      tazkiraNumber: trimValue(formData.nationalId)
    },
    familyInfo: {
      fatherOccupation: trimValue(formData.fatherOccupation),
      fatherPhone: trimValue(formData.fatherPhone),
      motherName: trimValue(formData.motherName) || 'ثبت نشده',
      motherOccupation: trimValue(formData.motherOccupation),
      motherPhone: trimValue(formData.motherPhone),
      guardianName: trimValue(formData.guardianName),
      guardianRelation: trimValue(formData.guardianRelation) ? 'other' : undefined,
      guardianPhone: trimValue(formData.guardianPhone)
    },
    contactInfo: {
      phone: trimValue(formData.phone),
      mobile: trimValue(formData.phone),
      email: trimValue(formData.email),
      province: formData.province,
      district,
      address: trimValue(formData.address),
      emergencyContact: {
        name: emergencyName,
        relation: emergencyRelation,
        phone: emergencyPhone
      }
    },
    academicInfo: {
      currentSchool,
      currentGrade: gradeFromClass(selectedClass),
      currentSection: trimValue(selectedClass?.section),
      currentShift: shiftCode,
      enrollmentDate: formData.enrollmentDate || new Date().toISOString(),
      enrollmentType: previousSchoolName ? 'transfer' : 'new',
      previousSchool: previousSchoolName || previousGrade
        ? {
            name: previousSchoolName,
            lastGrade: previousGrade,
            type: 'private'
          }
        : undefined,
      attendanceRecord: {
        totalDays: 0,
        presentDays: 0,
        absentDays: 0,
        lateDays: 0
      }
    },
    medicalInfo: {
      bloodGroup: formData.bloodType || undefined,
      hasMedicalConditions: Boolean(trimValue(formData.medicalConditions)),
      medicalConditions: trimValue(formData.medicalConditions)
        ? [{ condition: trimValue(formData.medicalConditions), severity: 'mild' }]
        : [],
      allergies: trimValue(formData.allergies)
        ? [{ allergen: trimValue(formData.allergies), reaction: 'ثبت شده', severity: 'mild' }]
        : [],
      physicalDisabilities: {
        hasDisability: Boolean(trimValue(formData.specialNeeds)),
        type: trimValue(formData.specialNeeds) ? 'other' : undefined,
        needsSpecialSupport: Boolean(trimValue(formData.specialNeeds))
      }
    },
    status: 'active',
    verificationStatus: 'verified',
    registrationType: 'manual',
    notes: {
      general: [
        trimValue(formData.notes),
        trimValue(formData.transportation) ? `ترانسپورت: ${trimValue(formData.transportation)}` : '',
        trimValue(formData.lunchProgram) ? `برنامه ناهار: ${trimValue(formData.lunchProgram)}` : ''
      ].filter(Boolean).join('\n')
    }
  };
};

const createEmptyForm = (academicYearId = '') => ({
  firstName: '',
  lastName: '',
  fatherName: '',
  grandfatherName: '',
  nationalId: '',
  birthDate: '',
  gender: '',
  bloodType: '',
  phone: '',
  email: '',
  address: '',
  city: '',
  province: '',
  previousSchool: '',
  previousGrade: '',
  enrollmentDate: '',
  academicYearId,
  classId: '',
  shiftId: '',
  fatherPhone: '',
  fatherOccupation: '',
  motherName: '',
  motherPhone: '',
  motherOccupation: '',
  guardianName: '',
  guardianPhone: '',
  guardianRelation: '',
  medicalConditions: '',
  allergies: '',
  emergencyContact: '',
  emergencyPhone: '',
  transportation: '',
  lunchProgram: '',
  specialNeeds: '',
  notes: ''
});


const StudentRegistration = () => {
  const toast = useToast();
  const schoolId = localStorage.getItem('schoolId') || localStorage.getItem('school_id') || localStorage.getItem('selectedSchoolId') || DEFAULT_SCHOOL_ID;
  const registeredBy = localStorage.getItem('userId') || '';

  const [formData, setFormData] = useState(() => createEmptyForm());
  const [studentFiles, setStudentFiles] = useState({
    tazkira: null,
    fatherTazkira: null,
    photo: null,
    seParcha: null
  });
  const [academicYears, setAcademicYears] = useState([]);
  const [classes, setClasses] = useState([]);
  const [shifts, setShifts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});
  const [lastRegisteredStudent, setLastRegisteredStudent] = useState(null);

  const defaultAcademicYearId = useMemo(
    () => academicYears.find((item) => item.isCurrent)?._id || academicYears[0]?._id || '',
    [academicYears]
  );

  const classLabelById = useMemo(() => {
    const mapping = new Map();
    classes.forEach((item) => {
      mapping.set(String(item._id), item.title || item.titleDari || item.name || item.code || 'صنف نامشخص');
    });
    return mapping;
  }, [classes]);

  const yearLabelById = useMemo(() => {
    const mapping = new Map();
    academicYears.forEach((item) => {
      mapping.set(String(item._id), item.title || item.code || 'سال تعلیمی');
    });
    return mapping;
  }, [academicYears]);

  const selectedClass = useMemo(
    () => classes.find((item) => String(item._id) === String(formData.classId)) || null,
    [classes, formData.classId]
  );

  const selectedShift = useMemo(
    () => shifts.find((item) => String(item._id) === String(formData.shiftId)) || null,
    [shifts, formData.shiftId]
  );

  const selectedYear = useMemo(
    () => academicYears.find((item) => String(item._id) === String(formData.academicYearId)) || null,
    [academicYears, formData.academicYearId]
  );

  useEffect(() => {
    const loadInitialData = async () => {
      try {
        const headers = getAuthHeaders();
        const [yearsResponse, classesResponse, shiftsResponse] = await Promise.all([
          fetch(`/api/academic-years/school/${schoolId}`, { headers }),
          fetch(`/api/school-classes/school/${schoolId}`, { headers }),
          fetch(`/api/shifts/school/${schoolId}`, { headers })
        ]);

        const [yearsData, classesData, shiftsData] = await Promise.all([
          yearsResponse.json(),
          classesResponse.json(),
          shiftsResponse.json()
        ]);

        const yearItems = yearsData.success ? yearsData.data || [] : [];
        const activeYears = yearItems.filter((item) => item.status === 'active');
        const visibleYears = activeYears.length ? activeYears : yearItems;

        setAcademicYears(visibleYears);
        setClasses(classesData.success ? classesData.data || [] : []);
        setShifts(shiftsData.success ? shiftsData.data || [] : []);

        const initialYearId = visibleYears.find((item) => item.isCurrent)?._id || visibleYears[0]?._id || '';
        setFormData((current) => ({
          ...current,
          academicYearId: current.academicYearId || initialYearId
        }));
      } catch (error) {
        console.error('Failed to load student registration references:', error);
        toast.error('خطا در دریافت اطلاعات اولیه ثبت شاگرد.');
      }
    };

    loadInitialData();
  }, [schoolId, toast]);

  const handleInputChange = (field, value) => {
    setFormData((current) => {
      const next = { ...current, [field]: value };
      if (field === 'classId') {
        const classItem = classes.find((item) => String(item._id) === String(value));
        const classShiftId = getEntityId(classItem?.shiftId);
        const classAcademicYearId = getEntityId(classItem?.academicYearId);
        if (classShiftId) next.shiftId = classShiftId;
        if (classAcademicYearId) next.academicYearId = classAcademicYearId;
      }
      return next;
    });
    if (errors[field]) {
      setErrors((current) => ({ ...current, [field]: '' }));
    }
  };

  const openEnrollmentDesk = (candidateRef) => {
    if (!candidateRef) return;
    window.location.assign(`/admin-education?section=enrollments&candidate=${encodeURIComponent(candidateRef)}`);
  };

  const validateForm = () => {
    const nextErrors = {};

    if (!formData.firstName.trim()) nextErrors.firstName = 'نام شاگرد الزامی است.';
    if (!formData.lastName.trim()) nextErrors.lastName = 'تخلص شاگرد الزامی است.';
    if (!formData.fatherName.trim()) nextErrors.fatherName = 'نام پدر الزامی است.';
    if (!formData.nationalId.trim()) nextErrors.nationalId = 'شماره تذکره الزامی است.';
    if (!formData.birthDate) nextErrors.birthDate = 'تاریخ تولد الزامی است.';
    if (!formData.gender) nextErrors.gender = 'جنسیت الزامی است.';
    if (!formData.phone.trim()) nextErrors.phone = 'شماره تماس شاگرد الزامی است.';
    if (!formData.address.trim()) nextErrors.address = 'آدرس الزامی است.';
    if (!formData.province) nextErrors.province = 'ولایت الزامی است.';
    if (!formData.academicYearId) nextErrors.academicYearId = 'سال تعلیمی الزامی است.';
    if (!formData.classId) nextErrors.classId = 'صنف الزامی است.';
    if (!formData.shiftId) nextErrors.shiftId = 'نوبت الزامی است.';
    if (!formData.fatherPhone.trim()) nextErrors.fatherPhone = 'شماره تماس پدر الزامی است.';
    if (
      formData.classId &&
      !getEntityId(selectedClass?.schoolId) &&
      !getEntityId(selectedYear?.schoolId) &&
      (!schoolId || schoolId === DEFAULT_SCHOOL_ID)
    ) {
      nextErrors.classId = 'صنف انتخاب‌شده به مکتب معتبر وصل نیست.';
    }
    // اگر شاگرد تبدیلی است، سه پارچه الزامی باشد
    if ((formData.previousSchool.trim() || formData.previousGrade.trim()) && !studentFiles.seParcha) {
      nextErrors.seParcha = 'بارگذاری سه پارچه برای شاگردان تبدیلی الزامی است.';
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleFileChange = (key, file) => {
    setStudentFiles((prev) => ({ ...prev, [key]: file }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const submitIntent = event.nativeEvent?.submitter?.value === 'assign' ? 'assign' : 'save';

    if (!validateForm()) {
      toast.error('لطفاً همه فیلدهای الزامی را تکمیل کنید.');
      return;
    }

    setLoading(true);
    try {
      const payload = buildStudentPayload({
        formData,
        selectedClass,
        selectedShift,
        selectedYear,
        schoolId
      });

      if (!payload.academicInfo.currentSchool) {
        toast.error('برای ثبت شاگرد، صنف باید به یک مکتب معتبر وصل باشد.');
        return;
      }

      const formDataToSend = new FormData();
      formDataToSend.append('payload', JSON.stringify({ ...payload, registeredBy }));
      if (studentFiles.tazkira) formDataToSend.append('tazkira', studentFiles.tazkira);
      if (studentFiles.fatherTazkira) formDataToSend.append('fatherTazkira', studentFiles.fatherTazkira);
      if (studentFiles.photo) formDataToSend.append('photo', studentFiles.photo);
      if (studentFiles.seParcha) formDataToSend.append('seParcha', studentFiles.seParcha);

      const response = await fetch('/api/afghan-students', {
        method: 'POST',
        headers: {
          ...getAuthHeaders()
        },
        body: formDataToSend
      });

      const data = await response.json();

      if (!data.success) {
        toast.error(data.message || 'ثبت شاگرد ناموفق بود.');
        return;
      }

      const createdStudent = data.data || {};
      const candidateRef = createdStudent._id ? `afghan:${createdStudent._id}` : '';
      const displayName = [
        createdStudent.personalInfo?.firstName || formData.firstName,
        createdStudent.personalInfo?.lastName || formData.lastName
      ].filter(Boolean).join(' ');

      const summary = {
        id: createdStudent._id || '',
        candidateRef,
        displayName: displayName || 'شاگرد جدید',
        nationalId: createdStudent.identification?.tazkiraNumber || formData.nationalId,
        classTitle: classLabelById.get(String(formData.classId)) || '',
        academicYearTitle: yearLabelById.get(String(formData.academicYearId)) || ''
      };

      setLastRegisteredStudent(summary);
      setErrors({});
      setFormData(createEmptyForm(defaultAcademicYearId));
      setStudentFiles({ tazkira: null, fatherTazkira: null, photo: null, seParcha: null });

      if (submitIntent === 'assign' && candidateRef) {
        toast.success('شاگرد ثبت شد. در حال انتقال به تخصیص صنف...');
        openEnrollmentDesk(candidateRef);
        return;
      }

      toast.success('شاگرد با موفقیت ثبت شد. می‌توانید ثبت بعدی را ادامه دهید.');
    } catch (error) {
      console.error('Error registering student:', error);
      toast.error('خطا در ثبت شاگرد.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="school-management" style={{ minHeight: '100vh' }}>
      <form className="school-form" onSubmit={handleSubmit} style={{ maxWidth: 900, margin: '40px auto', background: 'white', borderRadius: 12, boxShadow: '0 2px 10px rgba(0,0,0,0.08)', padding: 32 }}>
        <h2 style={{ textAlign: 'center', color: '#2c3e50', marginBottom: 8 }}>ثبت شاگرد جدید</h2>
        <p className="form-subtitle" style={{ textAlign: 'center', color: '#666', marginBottom: 24 }}>معلومات شاگرد را وارد کنید و پس از تکمیل، ذخیره نمایید.</p>

        {/* مشخصات شخصی */}
        <div className="form-section">
          <h3 style={{ color: '#3498db', marginBottom: 12 }}>مشخصات شخصی</h3>
          {/* بارگذاری اسناد شاگرد - قطار افقی */}
          <div style={{ display: 'flex', flexDirection: 'row', gap: 24, marginTop: 16, marginBottom: 8, justifyContent: 'center' }}>
            <div className="form-group" style={{ minWidth: 170 }}>
              <label>تذکره شاگرد<br /><span style={{ fontSize: 12, color: '#888' }}>(JPG, PNG, PDF)</span></label>
              <input type="file" accept=".jpg,.jpeg,.png,.pdf" onChange={e => handleFileChange('tazkira', e.target.files?.[0])} />
            </div>
            <div className="form-group" style={{ minWidth: 170 }}>
              <label>تذکره پدر<br /><span style={{ fontSize: 12, color: '#888' }}>(JPG, PNG, PDF)</span></label>
              <input type="file" accept=".jpg,.jpeg,.png,.pdf" onChange={e => handleFileChange('fatherTazkira', e.target.files?.[0])} />
            </div>
            <div className="form-group" style={{ minWidth: 170 }}>
              <label>عکس شاگرد<br /><span style={{ fontSize: 12, color: '#888' }}>(JPG, PNG)</span></label>
              <input type="file" accept=".jpg,.jpeg,.png" onChange={e => handleFileChange('photo', e.target.files?.[0])} />
            </div>
          </div>
          <div className="form-grid">
            <div className="form-group">
              <label htmlFor="firstName">نام *</label>
              <input id="firstName" value={formData.firstName} onChange={e => handleInputChange('firstName', e.target.value)} required className={errors.firstName ? 'border-red-500' : ''} />
              {errors.firstName && <span className="text-red-500">{errors.firstName}</span>}
            </div>
            <div className="form-group">
              <label htmlFor="lastName">تخلص *</label>
              <input id="lastName" value={formData.lastName} onChange={e => handleInputChange('lastName', e.target.value)} required className={errors.lastName ? 'border-red-500' : ''} />
              {errors.lastName && <span className="text-red-500">{errors.lastName}</span>}
            </div>
            <div className="form-group">
              <label htmlFor="fatherName">نام پدر *</label>
              <input id="fatherName" value={formData.fatherName} onChange={e => handleInputChange('fatherName', e.target.value)} required className={errors.fatherName ? 'border-red-500' : ''} />
              {errors.fatherName && <span className="text-red-500">{errors.fatherName}</span>}
            </div>
            <div className="form-group">
              <label htmlFor="grandfatherName">نام پدرکلان</label>
              <input id="grandfatherName" value={formData.grandfatherName} onChange={e => handleInputChange('grandfatherName', e.target.value)} />
            </div>
            <div className="form-group">
              <label htmlFor="nationalId">شماره تذکره *</label>
              <input id="nationalId" value={formData.nationalId} onChange={e => handleInputChange('nationalId', e.target.value)} required className={errors.nationalId ? 'border-red-500' : ''} />
              {errors.nationalId && <span className="text-red-500">{errors.nationalId}</span>}
            </div>
            <div className="form-group">
              <label htmlFor="birthDate">تاریخ تولد *</label>
              <input id="birthDate" type="date" value={formData.birthDate} onChange={e => handleInputChange('birthDate', e.target.value)} required className={errors.birthDate ? 'border-red-500' : ''} />
              {errors.birthDate && <span className="text-red-500">{errors.birthDate}</span>}
            </div>
            <div className="form-group">
              <label htmlFor="gender">جنسیت *</label>
              <select id="gender" value={formData.gender} onChange={e => handleInputChange('gender', e.target.value)} required className={errors.gender ? 'border-red-500' : ''}>
                <option value="">انتخاب کنید</option>
                <option value="male">ذکور</option>
                <option value="female">اناث</option>
              </select>
              {errors.gender && <span className="text-red-500">{errors.gender}</span>}
            </div>
            <div className="form-group">
              <label htmlFor="bloodType">گروپ خونی</label>
              <select id="bloodType" value={formData.bloodType} onChange={e => handleInputChange('bloodType', e.target.value)}>
                <option value="">انتخاب کنید</option>
                {BLOOD_TYPES.map(type => <option key={type} value={type}>{type}</option>)}
              </select>
            </div>
          </div>
        </div>

        {/* اطلاعات تعلیمی */}
        <div className="form-section">
          <h3 style={{ color: '#3498db', marginBottom: 12 }}>اطلاعات تعلیمی</h3>
          <div className="form-grid">
            <div className="form-group">
              <label htmlFor="academicYearId">سال تعلیمی *</label>
              <select id="academicYearId" value={formData.academicYearId} onChange={e => handleInputChange('academicYearId', e.target.value)} required className={errors.academicYearId ? 'border-red-500' : ''}>
                <option value="">انتخاب کنید</option>
                {academicYears.map(year => <option key={year._id} value={year._id}>{year.title || year.code}</option>)}
              </select>
              {errors.academicYearId && <span className="text-red-500">{errors.academicYearId}</span>}
            </div>
            <div className="form-group">
              <label htmlFor="classId">صنف *</label>
              <select id="classId" value={formData.classId} onChange={e => handleInputChange('classId', e.target.value)} required className={errors.classId ? 'border-red-500' : ''}>
                <option value="">انتخاب کنید</option>
                {classes.map(item => <option key={item._id} value={item._id}>{classLabelById.get(String(item._id))}</option>)}
              </select>
              {errors.classId && <span className="text-red-500">{errors.classId}</span>}
            </div>
            <div className="form-group">
              <label htmlFor="shiftId">نوبت *</label>
              <select id="shiftId" value={formData.shiftId} onChange={e => handleInputChange('shiftId', e.target.value)} required className={errors.shiftId ? 'border-red-500' : ''}>
                <option value="">انتخاب کنید</option>
                {shifts.map(item => <option key={item._id} value={item._id}>{item.name || item.title || 'نوبت'}</option>)}
              </select>
              {errors.shiftId && <span className="text-red-500">{errors.shiftId}</span>}
            </div>
            <div className="form-group">
              <label htmlFor="enrollmentDate">تاریخ ثبت‌نام</label>
              <input id="enrollmentDate" type="date" value={formData.enrollmentDate} onChange={e => handleInputChange('enrollmentDate', e.target.value)} />
            </div>
            <div className="form-group">
              <label htmlFor="previousSchool">مکتب قبلی</label>
              <input id="previousSchool" value={formData.previousSchool} onChange={e => handleInputChange('previousSchool', e.target.value)} />
            </div>
            <div className="form-group">
              <label htmlFor="previousGrade">صنف قبلی</label>
              <input id="previousGrade" value={formData.previousGrade} onChange={e => handleInputChange('previousGrade', e.target.value)} />
            </div>
            {/* سه پارچه فقط برای شاگردان تبدیلی */}
            {(formData.previousSchool.trim() || formData.previousGrade.trim()) && (
              <div className="form-group" style={{ minWidth: 170 }}>
                <label>سه پارچه<br /><span style={{ fontSize: 12, color: '#888' }}>(ویژه شاگردان تبدیلی) (PDF, JPG, PNG)</span></label>
                <input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={e => handleFileChange('seParcha', e.target.files?.[0])} />
                {errors.seParcha && <span className="text-red-500">{errors.seParcha}</span>}
              </div>
            )}
          </div>
        </div>

        {/* خانواده و سرپرست */}
        <div className="form-section">
          <h3 style={{ color: '#3498db', marginBottom: 12 }}>معلومات خانواده و سرپرست</h3>
          <div className="form-grid">
            <div className="form-group">
              <label htmlFor="fatherPhone">شماره تماس پدر *</label>
              <input id="fatherPhone" value={formData.fatherPhone} onChange={e => handleInputChange('fatherPhone', e.target.value)} required className={errors.fatherPhone ? 'border-red-500' : ''} />
              {errors.fatherPhone && <span className="text-red-500">{errors.fatherPhone}</span>}
            </div>
            <div className="form-group">
              <label htmlFor="fatherOccupation">مسلک پدر</label>
              <input id="fatherOccupation" value={formData.fatherOccupation} onChange={e => handleInputChange('fatherOccupation', e.target.value)} />
            </div>
            <div className="form-group">
              <label htmlFor="motherName">نام مادر</label>
              <input id="motherName" value={formData.motherName} onChange={e => handleInputChange('motherName', e.target.value)} />
            </div>
            <div className="form-group">
              <label htmlFor="motherPhone">شماره تماس مادر</label>
              <input id="motherPhone" value={formData.motherPhone} onChange={e => handleInputChange('motherPhone', e.target.value)} />
            </div>
            <div className="form-group">
              <label htmlFor="motherOccupation">مسلک مادر</label>
              <input id="motherOccupation" value={formData.motherOccupation} onChange={e => handleInputChange('motherOccupation', e.target.value)} />
            </div>
            <div className="form-group">
              <label htmlFor="guardianName">نام سرپرست</label>
              <input id="guardianName" value={formData.guardianName} onChange={e => handleInputChange('guardianName', e.target.value)} />
            </div>
            <div className="form-group">
              <label htmlFor="guardianPhone">شماره تماس سرپرست</label>
              <input id="guardianPhone" value={formData.guardianPhone} onChange={e => handleInputChange('guardianPhone', e.target.value)} />
            </div>
            <div className="form-group">
              <label htmlFor="guardianRelation">نسبت سرپرست</label>
              <input id="guardianRelation" value={formData.guardianRelation} onChange={e => handleInputChange('guardianRelation', e.target.value)} />
            </div>
          </div>
        </div>

        {/* صحی و اضافی */}
        <div className="form-section">
          <h3 style={{ color: '#3498db', marginBottom: 12 }}>معلومات صحی و اضافی</h3>
          <div className="form-grid">
            <div className="form-group">
              <label htmlFor="medicalConditions">حالات صحی مزمن</label>
              <textarea id="medicalConditions" rows={3} value={formData.medicalConditions} onChange={e => handleInputChange('medicalConditions', e.target.value)} />
            </div>
            <div className="form-group">
              <label htmlFor="allergies">حساسیت‌ها</label>
              <textarea id="allergies" rows={3} value={formData.allergies} onChange={e => handleInputChange('allergies', e.target.value)} />
            </div>
            <div className="form-group">
              <label htmlFor="emergencyContact">نام اضطراری</label>
              <input id="emergencyContact" value={formData.emergencyContact} onChange={e => handleInputChange('emergencyContact', e.target.value)} />
            </div>
            <div className="form-group">
              <label htmlFor="emergencyPhone">شماره اضطراری</label>
              <input id="emergencyPhone" value={formData.emergencyPhone} onChange={e => handleInputChange('emergencyPhone', e.target.value)} />
            </div>
            <div className="form-group">
              <label htmlFor="transportation">نوع ترانسپورت</label>
              <select id="transportation" value={formData.transportation} onChange={e => handleInputChange('transportation', e.target.value)}>
                <option value="">انتخاب کنید</option>
                <option value="walking">پیاده</option>
                <option value="school_bus">ترانسپورت مکتب</option>
                <option value="private">شخصی</option>
                <option value="parent">با والدین</option>
              </select>
            </div>
            <div className="form-group">
              <label htmlFor="lunchProgram">برنامه ناهار</label>
              <select id="lunchProgram" value={formData.lunchProgram} onChange={e => handleInputChange('lunchProgram', e.target.value)}>
                <option value="">انتخاب کنید</option>
                <option value="included">شامل ناهار</option>
                <option value="excluded">شامل نیست</option>
                <option value="special">رژیم خاص</option>
              </select>
            </div>
            <div className="form-group">
              <label htmlFor="specialNeeds">نیازهای خاص</label>
              <input id="specialNeeds" value={formData.specialNeeds} onChange={e => handleInputChange('specialNeeds', e.target.value)} />
            </div>
            <div className="form-group">
              <label htmlFor="notes">یادداشت‌ها</label>
              <textarea id="notes" rows={4} value={formData.notes} onChange={e => handleInputChange('notes', e.target.value)} />
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 16, marginTop: 32, flexWrap: 'wrap', justifyContent: 'center' }}>
          <button type="submit" value="save" className="add-btn" disabled={loading}>
            {loading ? 'در حال ذخیره...' : 'ثبت شاگرد'}
          </button>
          <button type="submit" value="assign" className="save-btn" disabled={loading}>
            {loading ? 'در حال پردازش...' : 'ثبت و تخصیص صنف'}
          </button>
          <button type="button" className="cancel-btn" onClick={() => window.history.back()}>
            انصراف
          </button>
        </div>
      </form>
    </div>
  );
};

export default StudentRegistration;
