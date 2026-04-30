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
import {
  DEFAULT_SCHOOL_ID,
  getAuthHeaders,
  persistActiveSchoolId,
  readStoredSchoolId,
  repairDisplayText,
  resolveActiveSchoolContext
} from './adminWorkspaceUtils';
import './AfghanSchoolManagement.css';
import './StudentRegistration.css';

const PROVINCES = [
  { value: 'kabul', label: 'Ú©Ø§Ø¨Ù„' },
  { value: 'herat', label: 'Ù‡Ø±Ø§Øª' },
  { value: 'kandahar', label: 'Ú©Ù†Ø¯Ù‡Ø§Ø±' },
  { value: 'balkh', label: 'Ø¨Ù„Ø®' },
  { value: 'nangarhar', label: 'Ù†Ù†Ú¯Ø±Ù‡Ø§Ø±' },
  { value: 'badakhshan', label: 'Ø¨Ø¯Ø®Ø´Ø§Ù†' },
  { value: 'takhar', label: 'ØªØ®Ø§Ø±' },
  { value: 'samangan', label: 'Ø³Ù…Ù†Ú¯Ø§Ù†' },
  { value: 'kunduz', label: 'Ù‚Ù†Ø¯ÙˆØ²' },
  { value: 'baghlan', label: 'Ø¨ØºÙ„Ø§Ù†' },
  { value: 'farah', label: 'ÙØ±Ø§Ù‡' },
  { value: 'nimroz', label: 'Ù†ÛŒÙ…Ø±ÙˆØ²' },
  { value: 'helmand', label: 'Ù‡Ù„Ù…Ù†Ø¯' },
  { value: 'ghor', label: 'ØºÙˆØ±' },
  { value: 'daykundi', label: 'Ø¯Ø§ÛŒÚ©Ù†Ø¯ÛŒ' },
  { value: 'uruzgan', label: 'Ø§Ø±Ø²Ú¯Ø§Ù†' },
  { value: 'zabul', label: 'Ø²Ø§Ø¨Ù„' },
  { value: 'paktika', label: 'Ù¾Ú©ØªÛŒÚ©Ø§' },
  { value: 'khost', label: 'Ø®ÙˆØ³Øª' },
  { value: 'paktia', label: 'Ù¾Ú©ØªÛŒØ§' },
  { value: 'logar', label: 'Ù„ÙˆÚ¯Ø±' },
  { value: 'parwan', label: 'Ù¾Ø±ÙˆØ§Ù†' },
  { value: 'kapisa', label: 'Ú©Ø§Ù¾ÛŒØ³Ø§' },
  { value: 'panjshir', label: 'Ù¾Ù†Ø¬Ø´ÛŒØ±' },
  { value: 'badghis', label: 'Ø¨Ø§Ø¯ØºÛŒØ³' },
  { value: 'faryab', label: 'ÙØ§Ø±ÛŒØ§Ø¨' },
  { value: 'jowzjan', label: 'Ø¬ÙˆØ²Ø¬Ø§Ù†' },
  { value: 'saripul', label: 'Ø³Ø±Ù¾Ù„' }
];

const BLOOD_TYPES = ['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'];

const trimValue = (value) => String(value || '').trim();
const displayText = (value) => repairDisplayText(value);

async function fetchStudentRegistrationJson(path, headers = {}) {
  const response = await fetch(path, {
    headers: {
      ...headers,
      'Cache-Control': 'no-cache'
    },
    cache: 'no-store'
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok || data?.success === false) {
    throw new Error(displayText(data?.message || data?.error || `Ø¯Ø±Ø®ÙˆØ§Ø³Øª Ù†Ø§Ù…ÙˆÙÙ‚ Ø¨ÙˆØ¯ (${response.status})`));
  }
  return data || { success: true, data: [] };
}

const getEntityId = (value) => {
  if (!value) return '';
  if (typeof value === 'object') return trimValue(value._id || value.id);
  return trimValue(value);
};

const normalizeShiftCode = (rawValue = '') => {
  const value = trimValue(rawValue).toLowerCase();
  if (!value) return 'morning';
  if (value.includes('afternoon') || value.includes('Ø¨Ø¹Ø¯') || value.includes('Ø¹ØµØ±')) return 'afternoon';
  if (value.includes('evening') || value.includes('Ø´Ø¨')) return 'evening';
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
  const district = trimValue(formData.city) || trimValue(formData.address) || 'Ù†Ø§Ù…Ø´Ø®Øµ';
  const emergencyName = trimValue(formData.emergencyContact) || trimValue(formData.guardianName) || trimValue(formData.fatherName);
  const emergencyPhone = trimValue(formData.emergencyPhone) || trimValue(formData.guardianPhone) || trimValue(formData.fatherPhone) || trimValue(formData.phone);
  const emergencyRelation = trimValue(formData.guardianRelation) || 'Ø³Ø±Ù¾Ø±Ø³Øª';
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
      motherName: trimValue(formData.motherName) || 'Ø«Ø¨Øª Ù†Ø´Ø¯Ù‡',
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
        ? [{ allergen: trimValue(formData.allergies), reaction: 'Ø«Ø¨Øª Ø´Ø¯Ù‡', severity: 'mild' }]
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
        trimValue(formData.transportation) ? `ØªØ±Ø§Ù†Ø³Ù¾ÙˆØ±Øª: ${trimValue(formData.transportation)}` : '',
        trimValue(formData.lunchProgram) ? `Ø¨Ø±Ù†Ø§Ù…Ù‡ Ù†Ø§Ù‡Ø§Ø±: ${trimValue(formData.lunchProgram)}` : ''
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
  const [schoolId, setSchoolId] = useState(() => readStoredSchoolId() || DEFAULT_SCHOOL_ID);
  const [activeSchoolContext, setActiveSchoolContext] = useState(null);
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
  const [referenceLoading, setReferenceLoading] = useState(true);
  const [errors, setErrors] = useState({});
  const [submitStatus, setSubmitStatus] = useState({ type: '', text: '' });
  const [lastRegisteredStudent, setLastRegisteredStudent] = useState(null);
  const requiresSchoolSelection = Boolean(activeSchoolContext?.requiresSelection || !activeSchoolContext?.schoolId);

  const defaultAcademicYearId = useMemo(
    () => academicYears.find((item) => item.isCurrent)?._id || academicYears[0]?._id || '',
    [academicYears]
  );

  const classLabelById = useMemo(() => {
    const mapping = new Map();
    classes.forEach((item) => {
      mapping.set(String(item._id), item.title || item.titleDari || item.name || item.code || 'ØµÙ†Ù Ù†Ø§Ù…Ø´Ø®Øµ');
    });
    return mapping;
  }, [classes]);

  const yearLabelById = useMemo(() => {
    const mapping = new Map();
    academicYears.forEach((item) => {
      mapping.set(String(item._id), item.title || item.code || 'Ø³Ø§Ù„ ØªØ¹Ù„ÛŒÙ…ÛŒ');
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
      setReferenceLoading(true);
      try {
        const schoolContext = await resolveActiveSchoolContext();
        setActiveSchoolContext(schoolContext);
        const effectiveSchoolId = schoolContext.schoolId || DEFAULT_SCHOOL_ID;
        setSchoolId(effectiveSchoolId);

        if (schoolContext.requiresSelection || !schoolContext.schoolId) {
          setAcademicYears([]);
          setClasses([]);
          setShifts([]);
          toast.error('Ø§ÙˆÙ„ ÛŒÚ© Ù…Ú©ØªØ¨ ÙØ¹Ø§Ù„ Ùˆ Ù…Ø¹ØªØ¨Ø± Ø§Ù†ØªØ®Ø§Ø¨ ÛŒØ§ Ø§ÛŒØ¬Ø§Ø¯ Ú©Ù†ÛŒØ¯.');
          return;
        }

        const headers = getAuthHeaders();
        const [yearsData, classesData, shiftsData] = await Promise.all([
          fetchStudentRegistrationJson(`/api/academic-years/school/${effectiveSchoolId}`, headers),
          fetchStudentRegistrationJson(`/api/school-classes/school/${effectiveSchoolId}`, headers),
          fetchStudentRegistrationJson(`/api/shifts/school/${effectiveSchoolId}`, headers)
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
        toast.error(displayText(error.message || 'Ø®Ø·Ø§ Ø¯Ø± Ø¯Ø±ÛŒØ§ÙØª Ø§Ø·Ù„Ø§Ø¹Ø§Øª Ø§ÙˆÙ„ÛŒÙ‡ Ø«Ø¨Øª Ø´Ø§Ú¯Ø±Ø¯.'));
      } finally {
        setReferenceLoading(false);
      }
    };

    loadInitialData();
  }, [toast]);

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

    if (!formData.firstName.trim()) nextErrors.firstName = 'Ù†Ø§Ù… Ø´Ø§Ú¯Ø±Ø¯ Ø§Ù„Ø²Ø§Ù…ÛŒ Ø§Ø³Øª.';
    if (!formData.lastName.trim()) nextErrors.lastName = 'ØªØ®Ù„Øµ Ø´Ø§Ú¯Ø±Ø¯ Ø§Ù„Ø²Ø§Ù…ÛŒ Ø§Ø³Øª.';
    if (!formData.fatherName.trim()) nextErrors.fatherName = 'Ù†Ø§Ù… Ù¾Ø¯Ø± Ø§Ù„Ø²Ø§Ù…ÛŒ Ø§Ø³Øª.';
    if (!formData.nationalId.trim()) nextErrors.nationalId = 'Ø´Ù…Ø§Ø±Ù‡ ØªØ°Ú©Ø±Ù‡ Ø§Ù„Ø²Ø§Ù…ÛŒ Ø§Ø³Øª.';

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleFileChange = (key, file) => {
    setStudentFiles((prev) => ({ ...prev, [key]: file }));
  };

  const handleActiveSchoolSelect = (value) => {
    if (!value) return;
    persistActiveSchoolId(value);
    setSchoolId(value);
    setActiveSchoolContext((current) => ({
      ...(current || {}),
      schoolId: value,
      requiresSelection: false
    }));
    window.location.reload();
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const submitIntent = event.nativeEvent?.submitter?.value === 'assign' ? 'assign' : 'save';
    setSubmitStatus({ type: 'info', text: 'Ø¯Ø± Ø­Ø§Ù„ Ø¨Ø±Ø±Ø³ÛŒ Ù…Ø¹Ù„ÙˆÙ…Ø§Øª ÙØ±Ù…...' });

    if (requiresSchoolSelection) {
      const message = 'Ø§ÙˆÙ„ ÛŒÚ© Ù…Ú©ØªØ¨ ÙØ¹Ø§Ù„ Ùˆ Ù…Ø¹ØªØ¨Ø± Ø§Ù†ØªØ®Ø§Ø¨ ÛŒØ§ Ø§ÛŒØ¬Ø§Ø¯ Ú©Ù†ÛŒØ¯.';
      setSubmitStatus({ type: 'error', text: message });
      toast.error(message);
      return;
    }

    if (!validateForm()) {
      const message = 'ÙØ±Ù… ØªÚ©Ù…ÛŒÙ„ Ù†ÛŒØ³Øª. Ù„Ø·ÙØ§Ù‹ ÙÛŒÙ„Ø¯Ù‡Ø§ÛŒ Ù¾ÛŒØ§Ù…â€ŒØ¯Ø§Ø± Ø±Ø§ Ø¨Ø±Ø±Ø³ÛŒ Ùˆ ØªÚ©Ù…ÛŒÙ„ Ú©Ù†ÛŒØ¯.';
      setSubmitStatus({ type: 'error', text: message });
      toast.error(message);
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
        const message = 'Ø¨Ø±Ø§ÛŒ Ø«Ø¨Øª Ø´Ø§Ú¯Ø±Ø¯ØŒ ØµÙ†Ù Ø¨Ø§ÛŒØ¯ Ø¨Ù‡ ÛŒÚ© Ù…Ú©ØªØ¨ Ù…Ø¹ØªØ¨Ø± ÙˆØµÙ„ Ø¨Ø§Ø´Ø¯.';
        setSubmitStatus({ type: 'error', text: message });
        toast.error(message);
        return;
      }

      setSubmitStatus({ type: 'info', text: 'Ø¯Ø± Ø­Ø§Ù„ Ø§Ø±Ø³Ø§Ù„ Ù…Ø¹Ù„ÙˆÙ…Ø§Øª Ø¨Ù‡ Ø³Ø±ÙˆØ±...' });
      const response = await fetch('/api/afghan-students', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders()
        },
        body: JSON.stringify({ ...payload, registeredBy })
      });

      const responseText = await response.text();
      let data = null;
      try {
        data = responseText ? JSON.parse(responseText) : null;
      } catch {
        data = null;
      }

      if (!response.ok || data?.success === false) {
        const message = displayText(data?.message || data?.error || responseText || `Ø«Ø¨Øª Ø´Ø§Ú¯Ø±Ø¯ Ù†Ø§Ù…ÙˆÙÙ‚ Ø¨ÙˆØ¯ (${response.status}).`);
        setSubmitStatus({ type: 'error', text: message });
        toast.error(message);
        return;
      }

      const createdStudent = data.data || data.student || data.item || data._doc || {};
      const candidateRef = createdStudent._id ? `afghan:${createdStudent._id}` : '';
      const displayName = [
        createdStudent.personalInfo?.firstName || formData.firstName,
        createdStudent.personalInfo?.lastName || formData.lastName
      ].filter(Boolean).join(' ');

      const summary = {
        id: createdStudent._id || '',
        candidateRef,
        displayName: displayName || 'Ø´Ø§Ú¯Ø±Ø¯ Ø¬Ø¯ÛŒØ¯',
        nationalId: createdStudent.identification?.tazkiraNumber || formData.nationalId,
        classTitle: classLabelById.get(String(formData.classId)) || '',
        academicYearTitle: yearLabelById.get(String(formData.academicYearId)) || ''
      };

      setLastRegisteredStudent(summary);
      setErrors({});
      setSubmitStatus({ type: 'success', text: `Ø´Ø§Ú¯Ø±Ø¯ ${summary.displayName} Ø¨Ø§ Ù…ÙˆÙÙ‚ÛŒØª Ø«Ø¨Øª Ø´Ø¯.` });
      setFormData(createEmptyForm(defaultAcademicYearId));
      setStudentFiles({ tazkira: null, fatherTazkira: null, photo: null, seParcha: null });

      if (submitIntent === 'assign' && candidateRef) {
        toast.success('Ø´Ø§Ú¯Ø±Ø¯ Ø«Ø¨Øª Ø´Ø¯. Ø¯Ø± Ø­Ø§Ù„ Ø§Ù†ØªÙ‚Ø§Ù„ Ø¨Ù‡ ØªØ®ØµÛŒØµ ØµÙ†Ù...');
        openEnrollmentDesk(candidateRef);
        return;
      }

      toast.success('Ø´Ø§Ú¯Ø±Ø¯ Ø¨Ø§ Ù…ÙˆÙÙ‚ÛŒØª Ø«Ø¨Øª Ø´Ø¯. Ù…ÛŒâ€ŒØªÙˆØ§Ù†ÛŒØ¯ Ø«Ø¨Øª Ø¨Ø¹Ø¯ÛŒ Ø±Ø§ Ø§Ø¯Ø§Ù…Ù‡ Ø¯Ù‡ÛŒØ¯.');
    } catch (error) {
      console.error('Error registering student:', error);
      const message = displayText(error?.message || 'Ø®Ø·Ø§ Ø¯Ø± Ø«Ø¨Øª Ø´Ø§Ú¯Ø±Ø¯.');
      setSubmitStatus({ type: 'error', text: message });
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="school-management" style={{ minHeight: '100vh' }}>
      <form className="school-form" onSubmit={handleSubmit} noValidate style={{ maxWidth: 900, margin: '40px auto', background: 'white', borderRadius: 12, boxShadow: '0 2px 10px rgba(0,0,0,0.08)', padding: 32 }}>
        <h2 style={{ textAlign: 'center', color: '#2c3e50', marginBottom: 8 }}>Ø«Ø¨Øª Ø´Ø§Ú¯Ø±Ø¯ Ø¬Ø¯ÛŒØ¯</h2>
        <p className="form-subtitle" style={{ textAlign: 'center', color: '#666', marginBottom: 24 }}>Ù…Ø¹Ù„ÙˆÙ…Ø§Øª Ø´Ø§Ú¯Ø±Ø¯ Ø±Ø§ ÙˆØ§Ø±Ø¯ Ú©Ù†ÛŒØ¯ Ùˆ Ù¾Ø³ Ø§Ø² ØªÚ©Ù…ÛŒÙ„ØŒ Ø°Ø®ÛŒØ±Ù‡ Ù†Ù…Ø§ÛŒÛŒØ¯.</p>
        {requiresSchoolSelection && (
          <div className="student-registration-alert" role="alert">
            Ø§ÙˆÙ„ ÛŒÚ© Ù…Ú©ØªØ¨ ÙØ¹Ø§Ù„ Ùˆ Ù…Ø¹ØªØ¨Ø± Ø§Ù†ØªØ®Ø§Ø¨ ÛŒØ§ Ø§ÛŒØ¬Ø§Ø¯ Ú©Ù†ÛŒØ¯. Ø«Ø¨Øª Ø´Ø§Ú¯Ø±Ø¯ Ø¨Ø¯ÙˆÙ† Ù…Ú©ØªØ¨ ÙˆØ§Ù‚Ø¹ÛŒ Ø¯Ø± Ø¯ÛŒØªØ§Ø¨ÛŒØ³ Ø°Ø®ÛŒØ±Ù‡ Ù†Ù…ÛŒâ€ŒØ´ÙˆØ¯.
            {Array.isArray(activeSchoolContext?.schools) && activeSchoolContext.schools.length > 0 && (
              <select
                className="student-registration-school-select"
                defaultValue=""
                onChange={(event) => handleActiveSchoolSelect(event.target.value)}
              >
                <option value="">Ø§Ù†ØªØ®Ø§Ø¨ Ù…Ú©ØªØ¨ ÙØ¹Ø§Ù„</option>
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
            <strong>Ù…Ú©ØªØ¨ ÙØ¹Ø§Ù„: {activeSchoolContext.school.nameDari || activeSchoolContext.school.name || 'Ù…Ú©ØªØ¨'}</strong>
            <span>Ú©Ø¯: {activeSchoolContext.school.schoolCode || '-'}</span>
            <span>Ø´Ø§Ú¯Ø±Ø¯Ø§Ù†: {Number(activeSchoolContext.scopeSummary?.students?.count || 0).toLocaleString('fa-AF')}</span>
            <span>Ø§Ø³ØªØ§Ø¯Ø§Ù†: {Number(activeSchoolContext.scopeSummary?.teachers?.count || 0).toLocaleString('fa-AF')}</span>
            <span>ØµÙ†Ùâ€ŒÙ‡Ø§: {Number(activeSchoolContext.scopeSummary?.classes?.count || 0).toLocaleString('fa-AF')}</span>
            <span>Ø´Ù‚Ù‡â€ŒÙ‡Ø§: {Number(activeSchoolContext.scopeSummary?.sheetTemplates?.count || 0).toLocaleString('fa-AF')}</span>
            <span>Ø³Ø§Ù„ Ù…Ø§Ù„ÛŒ: {Number(activeSchoolContext.scopeSummary?.financialYears?.count || 0).toLocaleString('fa-AF')}</span>
          </div>
        )}
        {!!submitStatus.text && (
          <div className={`student-registration-submit-status ${submitStatus.type || 'info'}`} role="status">
            {submitStatus.text}
          </div>
        )}

        {/* Ù…Ø´Ø®ØµØ§Øª Ø´Ø®ØµÛŒ */}
        <div className="form-section">
          <h3 style={{ color: '#3498db', marginBottom: 12 }}>Ù…Ø´Ø®ØµØ§Øª Ø´Ø®ØµÛŒ</h3>
          {/* Ø¨Ø§Ø±Ú¯Ø°Ø§Ø±ÛŒ Ø§Ø³Ù†Ø§Ø¯ Ø´Ø§Ú¯Ø±Ø¯ - Ù‚Ø·Ø§Ø± Ø§ÙÙ‚ÛŒ */}
          <div style={{ display: 'flex', flexDirection: 'row', gap: 24, marginTop: 16, marginBottom: 8, justifyContent: 'center' }}>
            <div className="form-group" style={{ minWidth: 170 }}>
              <label>ØªØ°Ú©Ø±Ù‡ Ø´Ø§Ú¯Ø±Ø¯<br /><span style={{ fontSize: 12, color: '#888' }}>(JPG, PNG, PDF)</span></label>
              <input type="file" accept=".jpg,.jpeg,.png,.pdf" onChange={e => handleFileChange('tazkira', e.target.files?.[0])} />
            </div>
            <div className="form-group" style={{ minWidth: 170 }}>
              <label>ØªØ°Ú©Ø±Ù‡ Ù¾Ø¯Ø±<br /><span style={{ fontSize: 12, color: '#888' }}>(JPG, PNG, PDF)</span></label>
              <input type="file" accept=".jpg,.jpeg,.png,.pdf" onChange={e => handleFileChange('fatherTazkira', e.target.files?.[0])} />
            </div>
            <div className="form-group" style={{ minWidth: 170 }}>
              <label>Ø¹Ú©Ø³ Ø´Ø§Ú¯Ø±Ø¯<br /><span style={{ fontSize: 12, color: '#888' }}>(JPG, PNG)</span></label>
              <input type="file" accept=".jpg,.jpeg,.png" onChange={e => handleFileChange('photo', e.target.files?.[0])} />
            </div>
          </div>
          <div className="form-grid">
            <div className="form-group">
              <label htmlFor="firstName">Ù†Ø§Ù… *</label>
              <input id="firstName" value={formData.firstName} onChange={e => handleInputChange('firstName', e.target.value)} required className={errors.firstName ? 'border-red-500' : ''} />
              {errors.firstName && <span className="text-red-500">{errors.firstName}</span>}
            </div>
            <div className="form-group">
              <label htmlFor="lastName">ØªØ®Ù„Øµ *</label>
              <input id="lastName" value={formData.lastName} onChange={e => handleInputChange('lastName', e.target.value)} required className={errors.lastName ? 'border-red-500' : ''} />
              {errors.lastName && <span className="text-red-500">{errors.lastName}</span>}
            </div>
            <div className="form-group">
              <label htmlFor="fatherName">Ù†Ø§Ù… Ù¾Ø¯Ø± *</label>
              <input id="fatherName" value={formData.fatherName} onChange={e => handleInputChange('fatherName', e.target.value)} required className={errors.fatherName ? 'border-red-500' : ''} />
              {errors.fatherName && <span className="text-red-500">{errors.fatherName}</span>}
            </div>
            <div className="form-group">
              <label htmlFor="grandfatherName">Ù†Ø§Ù… Ù¾Ø¯Ø±Ú©Ù„Ø§Ù†</label>
              <input id="grandfatherName" value={formData.grandfatherName} onChange={e => handleInputChange('grandfatherName', e.target.value)} />
            </div>
            <div className="form-group">
              <label htmlFor="nationalId">Ø´Ù…Ø§Ø±Ù‡ ØªØ°Ú©Ø±Ù‡ *</label>
              <input id="nationalId" value={formData.nationalId} onChange={e => handleInputChange('nationalId', e.target.value)} required className={errors.nationalId ? 'border-red-500' : ''} />
              {errors.nationalId && <span className="text-red-500">{errors.nationalId}</span>}
            </div>
            <div className="form-group">
              <label htmlFor="birthDate">ØªØ§Ø±ÛŒØ® ØªÙˆÙ„Ø¯ *</label>
              <input id="birthDate" type="date" value={formData.birthDate} onChange={e => handleInputChange('birthDate', e.target.value)} required className={errors.birthDate ? 'border-red-500' : ''} />
              {errors.birthDate && <span className="text-red-500">{errors.birthDate}</span>}
            </div>
            <div className="form-group">
              <label htmlFor="gender">Ø¬Ù†Ø³ÛŒØª *</label>
              <select id="gender" value={formData.gender} onChange={e => handleInputChange('gender', e.target.value)} required className={errors.gender ? 'border-red-500' : ''}>
                <option value="">Ø§Ù†ØªØ®Ø§Ø¨ Ú©Ù†ÛŒØ¯</option>
                <option value="male">Ø°Ú©ÙˆØ±</option>
                <option value="female">Ø§Ù†Ø§Ø«</option>
              </select>
              {errors.gender && <span className="text-red-500">{errors.gender}</span>}
            </div>
            <div className="form-group">
              <label htmlFor="bloodType">Ú¯Ø±ÙˆÙ¾ Ø®ÙˆÙ†ÛŒ</label>
              <select id="bloodType" value={formData.bloodType} onChange={e => handleInputChange('bloodType', e.target.value)}>
                <option value="">Ø§Ù†ØªØ®Ø§Ø¨ Ú©Ù†ÛŒØ¯</option>
                {BLOOD_TYPES.map(type => <option key={type} value={type}>{type}</option>)}
              </select>
            </div>
          </div>
        </div>

        {/* Ø§Ø·Ù„Ø§Ø¹Ø§Øª ØªØ¹Ù„ÛŒÙ…ÛŒ */}
        <div className="form-section">
          <h3 style={{ color: '#3498db', marginBottom: 12 }}>Ø§Ø·Ù„Ø§Ø¹Ø§Øª ØªØ¹Ù„ÛŒÙ…ÛŒ</h3>
          <div className="form-grid">
            <div className="form-group">
              <label htmlFor="academicYearId">Ø³Ø§Ù„ ØªØ¹Ù„ÛŒÙ…ÛŒ *</label>
              <select id="academicYearId" value={formData.academicYearId} onChange={e => handleInputChange('academicYearId', e.target.value)} required className={errors.academicYearId ? 'border-red-500' : ''}>
                <option value="">Ø§Ù†ØªØ®Ø§Ø¨ Ú©Ù†ÛŒØ¯</option>
                {academicYears.map(year => <option key={year._id} value={year._id}>{year.title || year.code}</option>)}
              </select>
              {errors.academicYearId && <span className="text-red-500">{errors.academicYearId}</span>}
            </div>
            <div className="form-group">
              <label htmlFor="classId">ØµÙ†Ù *</label>
              <select id="classId" value={formData.classId} onChange={e => handleInputChange('classId', e.target.value)} required className={errors.classId ? 'border-red-500' : ''}>
                <option value="">Ø§Ù†ØªØ®Ø§Ø¨ Ú©Ù†ÛŒØ¯</option>
                {classes.map(item => <option key={item._id} value={item._id}>{classLabelById.get(String(item._id))}</option>)}
              </select>
              {errors.classId && <span className="text-red-500">{errors.classId}</span>}
            </div>
            <div className="form-group">
              <label htmlFor="shiftId">Ù†ÙˆØ¨Øª *</label>
              <select id="shiftId" value={formData.shiftId} onChange={e => handleInputChange('shiftId', e.target.value)} required className={errors.shiftId ? 'border-red-500' : ''}>
                <option value="">Ø§Ù†ØªØ®Ø§Ø¨ Ú©Ù†ÛŒØ¯</option>
                {shifts.map(item => <option key={item._id} value={item._id}>{item.name || item.title || 'Ù†ÙˆØ¨Øª'}</option>)}
              </select>
              {errors.shiftId && <span className="text-red-500">{errors.shiftId}</span>}
            </div>
            <div className="form-group">
              <label htmlFor="enrollmentDate">ØªØ§Ø±ÛŒØ® Ø«Ø¨Øªâ€ŒÙ†Ø§Ù…</label>
              <input id="enrollmentDate" type="date" value={formData.enrollmentDate} onChange={e => handleInputChange('enrollmentDate', e.target.value)} />
            </div>
            <div className="form-group">
              <label htmlFor="previousSchool">Ù…Ú©ØªØ¨ Ù‚Ø¨Ù„ÛŒ</label>
              <input id="previousSchool" value={formData.previousSchool} onChange={e => handleInputChange('previousSchool', e.target.value)} />
            </div>
            <div className="form-group">
              <label htmlFor="previousGrade">ØµÙ†Ù Ù‚Ø¨Ù„ÛŒ</label>
              <input id="previousGrade" value={formData.previousGrade} onChange={e => handleInputChange('previousGrade', e.target.value)} />
            </div>
            {/* Ø³Ù‡ Ù¾Ø§Ø±Ú†Ù‡ ÙÙ‚Ø· Ø¨Ø±Ø§ÛŒ Ø´Ø§Ú¯Ø±Ø¯Ø§Ù† ØªØ¨Ø¯ÛŒÙ„ÛŒ */}
            {(formData.previousSchool.trim() || formData.previousGrade.trim()) && (
              <div className="form-group" style={{ minWidth: 170 }}>
                <label>Ø³Ù‡ Ù¾Ø§Ø±Ú†Ù‡<br /><span style={{ fontSize: 12, color: '#888' }}>(ÙˆÛŒÚ˜Ù‡ Ø´Ø§Ú¯Ø±Ø¯Ø§Ù† ØªØ¨Ø¯ÛŒÙ„ÛŒ) (PDF, JPG, PNG)</span></label>
                <input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={e => handleFileChange('seParcha', e.target.files?.[0])} />
                {errors.seParcha && <span className="text-red-500">{errors.seParcha}</span>}
              </div>
            )}
          </div>
        </div>

        {/* Ø®Ø§Ù†ÙˆØ§Ø¯Ù‡ Ùˆ Ø³Ø±Ù¾Ø±Ø³Øª */}
        <div className="form-section">
          <h3 style={{ color: '#3498db', marginBottom: 12 }}>Ù…Ø¹Ù„ÙˆÙ…Ø§Øª Ø®Ø§Ù†ÙˆØ§Ø¯Ù‡ Ùˆ Ø³Ø±Ù¾Ø±Ø³Øª</h3>
          <div className="form-grid">
            <div className="form-group">
              <label htmlFor="fatherPhone">Ø´Ù…Ø§Ø±Ù‡ ØªÙ…Ø§Ø³ Ù¾Ø¯Ø± *</label>
              <input id="fatherPhone" value={formData.fatherPhone} onChange={e => handleInputChange('fatherPhone', e.target.value)} required className={errors.fatherPhone ? 'border-red-500' : ''} />
              {errors.fatherPhone && <span className="text-red-500">{errors.fatherPhone}</span>}
            </div>
            <div className="form-group">
              <label htmlFor="fatherOccupation">Ù…Ø³Ù„Ú© Ù¾Ø¯Ø±</label>
              <input id="fatherOccupation" value={formData.fatherOccupation} onChange={e => handleInputChange('fatherOccupation', e.target.value)} />
            </div>
            <div className="form-group">
              <label htmlFor="motherName">Ù†Ø§Ù… Ù…Ø§Ø¯Ø±</label>
              <input id="motherName" value={formData.motherName} onChange={e => handleInputChange('motherName', e.target.value)} />
            </div>
            <div className="form-group">
              <label htmlFor="motherPhone">Ø´Ù…Ø§Ø±Ù‡ ØªÙ…Ø§Ø³ Ù…Ø§Ø¯Ø±</label>
              <input id="motherPhone" value={formData.motherPhone} onChange={e => handleInputChange('motherPhone', e.target.value)} />
            </div>
            <div className="form-group">
              <label htmlFor="motherOccupation">Ù…Ø³Ù„Ú© Ù…Ø§Ø¯Ø±</label>
              <input id="motherOccupation" value={formData.motherOccupation} onChange={e => handleInputChange('motherOccupation', e.target.value)} />
            </div>
            <div className="form-group">
              <label htmlFor="guardianName">Ù†Ø§Ù… Ø³Ø±Ù¾Ø±Ø³Øª</label>
              <input id="guardianName" value={formData.guardianName} onChange={e => handleInputChange('guardianName', e.target.value)} />
            </div>
            <div className="form-group">
              <label htmlFor="guardianPhone">Ø´Ù…Ø§Ø±Ù‡ ØªÙ…Ø§Ø³ Ø³Ø±Ù¾Ø±Ø³Øª</label>
              <input id="guardianPhone" value={formData.guardianPhone} onChange={e => handleInputChange('guardianPhone', e.target.value)} />
            </div>
            <div className="form-group">
              <label htmlFor="guardianRelation">Ù†Ø³Ø¨Øª Ø³Ø±Ù¾Ø±Ø³Øª</label>
              <input id="guardianRelation" value={formData.guardianRelation} onChange={e => handleInputChange('guardianRelation', e.target.value)} />
            </div>
          </div>
        </div>

        {/* ØµØ­ÛŒ Ùˆ Ø§Ø¶Ø§ÙÛŒ */}
        <div className="form-section">
          <h3 style={{ color: '#3498db', marginBottom: 12 }}>Ù…Ø¹Ù„ÙˆÙ…Ø§Øª ØµØ­ÛŒ Ùˆ Ø§Ø¶Ø§ÙÛŒ</h3>
          <div className="form-grid">
            <div className="form-group">
              <label htmlFor="medicalConditions">Ø­Ø§Ù„Ø§Øª ØµØ­ÛŒ Ù…Ø²Ù…Ù†</label>
              <textarea id="medicalConditions" rows={3} value={formData.medicalConditions} onChange={e => handleInputChange('medicalConditions', e.target.value)} />
            </div>
            <div className="form-group">
              <label htmlFor="allergies">Ø­Ø³Ø§Ø³ÛŒØªâ€ŒÙ‡Ø§</label>
              <textarea id="allergies" rows={3} value={formData.allergies} onChange={e => handleInputChange('allergies', e.target.value)} />
            </div>
            <div className="form-group">
              <label htmlFor="emergencyContact">Ù†Ø§Ù… Ø§Ø¶Ø·Ø±Ø§Ø±ÛŒ</label>
              <input id="emergencyContact" value={formData.emergencyContact} onChange={e => handleInputChange('emergencyContact', e.target.value)} />
            </div>
            <div className="form-group">
              <label htmlFor="emergencyPhone">Ø´Ù…Ø§Ø±Ù‡ Ø§Ø¶Ø·Ø±Ø§Ø±ÛŒ</label>
              <input id="emergencyPhone" value={formData.emergencyPhone} onChange={e => handleInputChange('emergencyPhone', e.target.value)} />
            </div>
            <div className="form-group">
              <label htmlFor="transportation">Ù†ÙˆØ¹ ØªØ±Ø§Ù†Ø³Ù¾ÙˆØ±Øª</label>
              <select id="transportation" value={formData.transportation} onChange={e => handleInputChange('transportation', e.target.value)}>
                <option value="">Ø§Ù†ØªØ®Ø§Ø¨ Ú©Ù†ÛŒØ¯</option>
                <option value="walking">Ù¾ÛŒØ§Ø¯Ù‡</option>
                <option value="school_bus">ØªØ±Ø§Ù†Ø³Ù¾ÙˆØ±Øª Ù…Ú©ØªØ¨</option>
                <option value="private">Ø´Ø®ØµÛŒ</option>
                <option value="parent">Ø¨Ø§ ÙˆØ§Ù„Ø¯ÛŒÙ†</option>
              </select>
            </div>
            <div className="form-group">
              <label htmlFor="lunchProgram">Ø¨Ø±Ù†Ø§Ù…Ù‡ Ù†Ø§Ù‡Ø§Ø±</label>
              <select id="lunchProgram" value={formData.lunchProgram} onChange={e => handleInputChange('lunchProgram', e.target.value)}>
                <option value="">Ø§Ù†ØªØ®Ø§Ø¨ Ú©Ù†ÛŒØ¯</option>
                <option value="included">Ø´Ø§Ù…Ù„ Ù†Ø§Ù‡Ø§Ø±</option>
                <option value="excluded">Ø´Ø§Ù…Ù„ Ù†ÛŒØ³Øª</option>
                <option value="special">Ø±Ú˜ÛŒÙ… Ø®Ø§Øµ</option>
              </select>
            </div>
            <div className="form-group">
              <label htmlFor="specialNeeds">Ù†ÛŒØ§Ø²Ù‡Ø§ÛŒ Ø®Ø§Øµ</label>
              <input id="specialNeeds" value={formData.specialNeeds} onChange={e => handleInputChange('specialNeeds', e.target.value)} />
            </div>
            <div className="form-group">
              <label htmlFor="notes">ÛŒØ§Ø¯Ø¯Ø§Ø´Øªâ€ŒÙ‡Ø§</label>
              <textarea id="notes" rows={4} value={formData.notes} onChange={e => handleInputChange('notes', e.target.value)} />
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 16, marginTop: 32, flexWrap: 'wrap', justifyContent: 'center' }}>
          <button type="submit" value="save" className="add-btn" disabled={loading || referenceLoading || requiresSchoolSelection}>
            {loading ? 'Ø¯Ø± Ø­Ø§Ù„ Ø°Ø®ÛŒØ±Ù‡...' : 'Ø«Ø¨Øª Ø´Ø§Ú¯Ø±Ø¯'}
          </button>
          <button type="submit" value="assign" className="save-btn" disabled={loading || referenceLoading || requiresSchoolSelection}>
            {loading ? 'Ø¯Ø± Ø­Ø§Ù„ Ù¾Ø±Ø¯Ø§Ø²Ø´...' : 'Ø«Ø¨Øª Ùˆ ØªØ®ØµÛŒØµ ØµÙ†Ù'}
          </button>
          <button type="button" className="cancel-btn" onClick={() => window.history.back()}>
            Ø§Ù†ØµØ±Ø§Ù
          </button>
        </div>
      </form>
    </div>
  );
};

export default StudentRegistration;

