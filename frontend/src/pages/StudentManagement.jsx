import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Badge } from '../components/ui/badge';
import AfghanDateInput from '../components/ui/AfghanDateInput';
import { 
  Users, 
  Search, 
  Filter, 
  Plus, 
  Eye, 
  Edit, 
  Trash2, 
  Download,
  RefreshCw,
  Calendar,
  Phone,
  Mail,
  MapPin,
  BookOpen,
  UserPlus,
  X
} from "../components/ui/icons";
import { useToast } from "../components/ui/toast";
import { formatAfghanDateTime, formatAfghanStoredDateLabel, toGregorianDateInputValue } from '../utils/afghanDate';
import { getAuthHeaders, repairDisplayText } from './adminWorkspaceUtils';
import './StudentManagement.css';

const getText = (value, fallback = '') => repairDisplayText(value || fallback);
const getLatinText = (value) => {
  const normalized = getText(value);
  return /[A-Za-z]/.test(normalized) ? normalized : '';
};

const provinceOptions = [
  { value: 'kabul', label: 'کابل' },
  { value: 'herat', label: 'هرات' },
  { value: 'kandahar', label: 'قندهار' },
  { value: 'balkh', label: 'بلخ' },
  { value: 'nangarhar', label: 'ننگرهار' },
  { value: 'badakhshan', label: 'بدخشان' },
  { value: 'takhar', label: 'تخار' },
  { value: 'samangan', label: 'سمنگان' },
  { value: 'kunduz', label: 'کندز' },
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

const provinceAliases = new Map([
  ...provinceOptions.map((item) => [item.value, item.value]),
  ...provinceOptions.map((item) => [item.label, item.value]),
  ['کندوز', 'kunduz'],
  ['دای کندی', 'daykundi'],
  ['دایکوندی', 'daykundi'],
  ['جوزجان', 'jowzjan'],
  ['ساری پل', 'saripul'],
  ['میدان وردک', 'wardak'],
  ['وردک', 'wardak']
]);

const normalizeProvinceValue = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  return provinceAliases.get(raw) || provinceAliases.get(raw.toLowerCase()) || raw;
};

const getProvinceLabel = (value) => {
  const normalized = normalizeProvinceValue(value);
  return provinceOptions.find((item) => item.value === normalized)?.label || getText(value);
};

const gradeOptions = Array.from({ length: 12 }, (_, index) => ({
  value: `grade${index + 1}`,
  label: `صنف ${index + 1}`
}));

const shiftOptions = [
  { value: 'morning', label: 'صبح' },
  { value: 'afternoon', label: 'بعد از ظهر' },
  { value: 'evening', label: 'شب' }
];

const enrollmentTypeOptions = [
  { value: 'new', label: 'ثبت جدید' },
  { value: 'transfer', label: 'تبدیلی آمد' },
  { value: 're_admission', label: 'ثبت دوباره' }
];

const relationOptions = [
  { value: 'father', label: 'پدر' },
  { value: 'mother', label: 'مادر' },
  { value: 'uncle', label: 'کاکا/ماما' },
  { value: 'brother', label: 'برادر' },
  { value: 'sister', label: 'خواهر' },
  { value: 'grandparent', label: 'پدرکلان/مادرکلان' },
  { value: 'other', label: 'دیگر' }
];

const bloodGroupOptions = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

const readApiResponse = async (response) => {
  try {
    return await response.json();
  } catch {
    return { success: false, message: 'پاسخ سرور قابل خواندن نیست.' };
  }
};

const readStudentAsasNumber = (student = {}) => {
  const financialMemberships = Array.isArray(student.financialMemberships) ? student.financialMemberships : [];
  const onlineEnrollments = Array.isArray(student.onlineEnrollments) ? student.onlineEnrollments : [];
  return getText(
    student.asasNumber
    || student.admissionNo
    || student.studentCore?.admissionNo
    || financialMemberships.find((item) => item?.admissionNo)?.admissionNo
    || onlineEnrollments.find((item) => item?.asasNumber)?.asasNumber
  );
};

const readStudentIdentifier = (student = {}) => getText(
  readStudentAsasNumber(student)
  || student.studentIdentifier
  || student.registrationId
  || student.studentCode
);

const readStudentTazkira = (student = {}) => getText(
  student.identification?.tazkiraNumber
  || student.nationalId
  || student.tazkiraNumber
);

function readEntityId(value) {
  if (!value) return '';
  if (typeof value === 'object') return String(value._id || value.id || '').trim();
  return String(value || '').trim();
}

const normalizeAfghanStudent = (student = {}) => {
  const personalInfo = student.personalInfo || {};
  const identification = student.identification || {};
  const familyInfo = student.familyInfo || {};
  const contactInfo = student.contactInfo || {};
  const academicInfo = student.academicInfo || {};
  const medicalInfo = student.medicalInfo || {};
  const previousSchool = academicInfo.previousSchool || {};

  return {
    ...student,
    profileId: student._id || '',
    firstName: getText(personalInfo.firstNameDari || personalInfo.firstName),
    lastName: getText(personalInfo.lastNameDari || personalInfo.lastName),
    firstNameEnglish: getLatinText(personalInfo.firstName),
    lastNameEnglish: getLatinText(personalInfo.lastName),
    fatherName: getText(personalInfo.fatherName),
    fatherNameEnglish: getLatinText(personalInfo.fatherNameEnglish),
    grandfatherName: getText(personalInfo.grandfatherName),
    birthPlace: getText(personalInfo.birthPlace),
    nationality: getText(personalInfo.nationality || 'Afghan'),
    nationalId: readStudentTazkira(student),
    asasNumber: readStudentAsasNumber(student),
    studentIdentifier: readStudentIdentifier(student),
    tazkiraVolume: getText(identification.tazkiraVolume),
    tazkiraPage: getText(identification.tazkiraPage),
    birthCertificateNumber: getText(identification.birthCertificateNumber),
    birthDate: toGregorianDateInputValue(personalInfo.birthDate),
    gender: personalInfo.gender || student.gender || '',
    bloodType: medicalInfo.bloodGroup || student.bloodType || '',
    hasMedicalConditions: Boolean(medicalInfo.hasMedicalConditions),
    phone: contactInfo.phone || contactInfo.mobile || '',
    email: contactInfo.email || '',
    address: getText(contactInfo.address),
    city: getText(contactInfo.district),
    village: getText(contactInfo.village),
    province: normalizeProvinceValue(contactInfo.province),
    currentGrade: academicInfo.currentGrade || '',
    currentSection: getText(academicInfo.currentSection),
    currentShift: academicInfo.currentShift || '',
    classIdValue: readEntityId(academicInfo.currentClassId || academicInfo.classId || student.classId),
    shiftIdValue: readEntityId(academicInfo.shiftId || student.shiftId),
    academicYearIdValue: readEntityId(academicInfo.academicYearId || student.academicYearId),
    enrollmentDate: toGregorianDateInputValue(academicInfo.enrollmentDate),
    enrollmentType: academicInfo.enrollmentType || 'new',
    classId: {
      _id: readEntityId(academicInfo.currentClassId || academicInfo.classId || student.classId || ''),
      title: getText(
        student.classId?.title
        || academicInfo.currentClassId?.title
        || academicInfo.classId?.title
        || academicInfo.classTitle
        || academicInfo.currentSection
        || academicInfo.currentGrade
        || '---'
      )
    },
    academicYearId: {
      _id: readEntityId(academicInfo.academicYearId || student.academicYearId || ''),
      title: getText(student.academicYearId?.title || academicInfo.academicYearId?.title || academicInfo.academicYearTitle || '---')
    },
    shiftId: {
      _id: readEntityId(academicInfo.shiftId || student.shiftId || ''),
      name: getText(student.shiftId?.name || academicInfo.shiftId?.nameDari || academicInfo.shiftId?.name || academicInfo.currentShift || '---')
    },
    previousSchool: getText(previousSchool.name),
    previousSchoolType: previousSchool.type || '',
    previousGrade: getText(previousSchool.lastGrade),
    transferReason: getText(previousSchool.transferReason),
    fatherPhone: familyInfo.fatherPhone || '',
    fatherOccupation: getText(familyInfo.fatherOccupation),
    motherName: getText(familyInfo.motherName),
    motherPhone: familyInfo.motherPhone || '',
    motherOccupation: getText(familyInfo.motherOccupation),
    guardianName: getText(familyInfo.guardianName),
    guardianRelation: familyInfo.guardianRelation || '',
    guardianPhone: familyInfo.guardianPhone || '',
    familySize: familyInfo.familySize || '',
    medicalConditions: Array.isArray(medicalInfo.medicalConditions)
      ? medicalInfo.medicalConditions.map((item) => getText(item.condition)).filter(Boolean).join('، ')
      : getText(medicalInfo.medicalConditions),
    allergies: Array.isArray(medicalInfo.allergies)
      ? medicalInfo.allergies.map((item) => getText(item.allergen)).filter(Boolean).join('، ')
      : getText(medicalInfo.allergies),
    emergencyContact: getText(contactInfo.emergencyContact?.name),
    emergencyRelation: getText(contactInfo.emergencyContact?.relation),
    emergencyPhone: contactInfo.emergencyContact?.phone || '',
    generalNotes: getText(student.notes?.general),
    academicNotes: getText(student.notes?.academic),
    behavioralNotes: getText(student.notes?.behavioral)
  };
};

const makeKey = (value) => {
  if (!value) return '';
  if (typeof value === 'object') return String(value._id || value.id || '').trim();
  return String(value || '').trim();
};

const normalizeLookupText = (value) => repairDisplayText(value || '').trim().toLowerCase();

const normalizeStudentSearchText = (value = '') => repairDisplayText(String(value || ''))
  .normalize('NFKC')
  .replace(/[\u064B-\u065F\u0670]/g, '')
  .replace(/[يى]/g, 'ی')
  .replace(/ك/g, 'ک')
  .replace(/[ۀة]/g, 'ه')
  .replace(/[۰-۹]/g, (digit) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)))
  .replace(/[٠-٩]/g, (digit) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)))
  .replace(/[\u200B-\u200D\uFEFF]/g, '')
  .toLocaleLowerCase('fa-AF')
  .replace(/\s+/g, ' ')
  .trim();

const getStudentScopeIds = (student = {}, scope = 'class') => {
  const ids = new Set();
  const add = (value) => {
    const id = makeKey(value);
    if (id) ids.add(id);
  };

  if (scope === 'class') {
    add(student.classId?._id || student.classId?.id || student.classIdValue);
    add(student.academicInfo?.currentClassId || student.academicInfo?.classId);
    (student.financialMemberships || []).forEach((item) => add(item.classId));
    (student.educationEnrollments || []).forEach((item) => add(item.classId || item.schoolClass?.id || item.schoolClass?._id));
    (student.onlineEnrollments || []).forEach((item) => add(item.academicContext?.classId));
  } else if (scope === 'academicYear') {
    add(student.academicYearId?._id || student.academicYearId?.id || student.academicYearIdValue);
    add(student.academicInfo?.academicYearId);
    (student.financialMemberships || []).forEach((item) => add(item.academicYearId || item.academicYear));
    (student.educationEnrollments || []).forEach((item) => add(item.academicYear?._id || item.academicYear?.id || item.academicYearId || item.schoolClass?.academicYear?.id));
    (student.onlineEnrollments || []).forEach((item) => add(item.academicContext?.academicYearId));
  } else if (scope === 'shift') {
    add(student.shiftId?._id || student.shiftId?.id || student.shiftIdValue);
    add(student.academicInfo?.shiftId);
    (student.financialMemberships || []).forEach((item) => add(item.shiftId));
    (student.educationEnrollments || []).forEach((item) => add(item.shiftId || item.schoolClass?.shiftId));
    (student.onlineEnrollments || []).forEach((item) => add(item.academicContext?.shiftId));
  }

  return ids;
};

const buildStudentSearchText = (student = {}) => normalizeStudentSearchText([
  student.firstName,
  student.lastName,
  `${student.firstName || ''} ${student.lastName || ''}`,
  student.fatherName,
  student.grandfatherName,
  student.nationalId,
  student.studentIdentifier,
  student.registrationId,
  student.asasNumber,
  student.admissionNo,
  student.studentCode,
  student.phone,
  student.email,
  student.classId?.title,
  student.academicYearId?.title,
  student.shiftId?.name,
  student.currentGrade,
  student.currentSection,
  ...(student.financialMemberships || []).flatMap((item) => [item.studentName, item.admissionNo, item.classTitle, item.academicYearTitle]),
  ...(student.educationEnrollments || []).flatMap((item) => [item.studentName, item.user?.name, item.schoolClass?.title, item.course?.title]),
  ...(student.onlineEnrollments || []).flatMap((item) => [item.studentName, item.registrationId, item.asasNumber, item.phone, item.email])
].filter(Boolean).join(' '));

const resolveOptionId = (items = [], value = '', fields = []) => {
  const directValue = makeKey(value);
  if (!directValue) return '';
  const byId = items.find((item) => makeKey(item._id || item.id) === directValue);
  if (byId) return makeKey(byId._id || byId.id);
  const normalizedValue = normalizeLookupText(value);
  const byText = items.find((item) => fields.some((field) => normalizeLookupText(item?.[field]) === normalizedValue));
  return byText ? makeKey(byText._id || byText.id) : '';
};

const resolveShiftId = ({ student = {}, shifts = [], classes = [], classIdValue = '' } = {}) => {
  const direct = makeKey(student.shiftId?._id || student.shiftIdValue || student.academicInfo?.shiftId || student.shiftId || '');
  if (direct && shifts.some((item) => makeKey(item._id || item.id) === direct)) return direct;

  const classItem = classes.find((item) => makeKey(item._id || item.id) === makeKey(classIdValue || student.classId?._id || student.classIdValue));
  const classShiftId = makeKey(classItem?.shiftId);
  if (classShiftId && shifts.some((item) => makeKey(item._id || item.id) === classShiftId)) return classShiftId;

  const candidates = [
    student.shiftId?.name,
    student.shiftId?.title,
    student.currentShift,
    student.academicInfo?.currentShift,
    classItem?.shift,
    student.shiftName
  ];
  for (const candidate of candidates) {
    const resolved = resolveOptionId(shifts, candidate, ['name', 'code', 'title', 'nameDari', 'namePashto']);
    if (resolved) return resolved;
  }
  return direct;
};

const normalizeShiftCode = (value = '') => {
  const normalized = normalizeLookupText(value);
  if (!normalized) return '';
  if (normalized.includes('afternoon') || normalized.includes('عصر') || normalized.includes('بعد')) return 'afternoon';
  if (normalized.includes('evening') || normalized.includes('شب')) return 'evening';
  if (normalized.includes('morning') || normalized.includes('صبح')) return 'morning';
  return ['morning', 'afternoon', 'evening'].includes(normalized) ? normalized : '';
};

const studentKeys = (student = {}) => [
  student.profileId,
  student._id,
  student.id,
  student.linkedUserId,
  student.userId,
  student.studentId,
  student.studentCoreId,
  student.afghanStudentId,
  student.registrationId,
  student.asasNumber,
  student.studentIdentifier,
  student.nationalId
].map(makeKey).filter(Boolean);

const addSourceTag = (student, tag) => {
  if (!tag) return;
  const current = Array.isArray(student.sourceTags) ? student.sourceTags : [];
  if (!current.includes(tag)) student.sourceTags = [...current, tag];
};

const findStudentRow = (rows, index, keys = []) => {
  for (const key of keys.map(makeKey).filter(Boolean)) {
    const found = index.get(key);
    if (found) return found;
  }
  return null;
};

const indexStudentRow = (index, student) => {
  studentKeys(student).forEach((key) => index.set(key, student));
};

const mergeFinancialMemberships = (rows, memberships = []) => {
  const index = new Map();
  rows.forEach((student) => indexStudentRow(index, student));

  memberships.forEach((membership) => {
    const keys = [
      membership.student,
      membership.studentId,
      membership.userId,
      membership.studentCoreId,
      membership.afghanStudentId,
      membership.admissionNo
    ];
    let row = findStudentRow(rows, index, keys);

    if (!row) {
      row = {
        _id: makeKey(membership.student || membership.studentId || membership.studentCoreId || membership._id),
        profileId: makeKey(membership.afghanStudentId || ''),
        firstName: repairDisplayText(membership.studentName || '').split(' ')[0] || repairDisplayText(membership.studentName || ''),
        lastName: repairDisplayText(membership.studentName || '').split(' ').slice(1).join(' '),
        fatherName: repairDisplayText(membership.fatherName || ''),
        nationalId: '',
        admissionNo: repairDisplayText(membership.admissionNo || ''),
        studentIdentifier: repairDisplayText(membership.admissionNo || ''),
        phone: membership.primaryPhone || '',
        email: membership.studentEmail || '',
        status: membership.status || 'active',
        classId: { _id: membership.classId || '', title: repairDisplayText(membership.classTitle || '') },
        academicYearId: { _id: membership.academicYearId || '', title: repairDisplayText(membership.academicYearTitle || '') },
        shiftId: { _id: makeKey(membership.shiftId || ''), name: repairDisplayText(membership.shiftName || '') },
        createdAt: membership.createdAt || membership.startDate || new Date().toISOString()
      };
      rows.push(row);
    }

    row.financialMemberships = [...(row.financialMemberships || []), membership];
    row.profileId = row.profileId || makeKey(membership.afghanStudentId || '');
    row.admissionNo = row.admissionNo || repairDisplayText(membership.admissionNo || '');
    row.studentIdentifier = readStudentIdentifier(row);
    row.financeStatus = membership.status || row.financeStatus || '';
    row.membershipType = membership.membershipType || row.membershipType || '';
    if (!row.classId?._id && membership.classId) row.classId = { _id: membership.classId, title: repairDisplayText(membership.classTitle || '') };
    if (!row.shiftId?._id && (membership.shiftId || membership.shiftName)) row.shiftId = { _id: makeKey(membership.shiftId || ''), name: repairDisplayText(membership.shiftName || '') };
    if (!row.academicYearId?._id && membership.academicYearId) row.academicYearId = { _id: membership.academicYearId, title: repairDisplayText(membership.academicYearTitle || '') };
    addSourceTag(row, 'financial');
    indexStudentRow(index, row);
  });

  return rows;
};

const mergeEducationEnrollments = (rows, enrollments = []) => {
  const index = new Map();
  rows.forEach((student) => indexStudentRow(index, student));

  enrollments.forEach((enrollment) => {
    const userId = enrollment.user?._id || enrollment.user?.id || enrollment.linkedUserId || enrollment.studentId || '';
    let row = findStudentRow(rows, index, [userId, enrollment.linkedUserId, enrollment.studentCoreId, enrollment.afghanStudentId, enrollment.linkedStudentId]);

    if (!row) {
      const fullName = repairDisplayText(enrollment.user?.name || enrollment.studentName || '');
      row = {
        _id: makeKey(userId || enrollment._id),
        profileId: makeKey(enrollment.afghanStudentId || enrollment.linkedStudentId || ''),
        firstName: fullName.split(' ')[0] || fullName,
        lastName: fullName.split(' ').slice(1).join(' '),
        fatherName: '',
        nationalId: '',
        phone: '',
        email: enrollment.user?.email || '',
        status: enrollment.status === 'approved' ? 'active' : (enrollment.status || 'inactive'),
        classId: { _id: enrollment.classId || enrollment.schoolClass?.id || '', title: repairDisplayText(enrollment.schoolClass?.title || enrollment.course?.title || '') },
        academicYearId: { _id: enrollment.academicYear?._id || enrollment.academicYear?.id || '', title: repairDisplayText(enrollment.academicYear?.title || enrollment.schoolClass?.academicYear?.title || '') },
        shiftId: { _id: enrollment.schoolClass?.shiftId || '', name: repairDisplayText(enrollment.schoolClass?.shift || '') },
        createdAt: enrollment.createdAt || enrollment.joinedAt || new Date().toISOString()
      };
      rows.push(row);
    }

    row.educationEnrollments = [...(row.educationEnrollments || []), enrollment];
    row.profileId = row.profileId || makeKey(enrollment.afghanStudentId || enrollment.linkedStudentId || '');
    row.educationStatus = enrollment.status || row.educationStatus || '';
    if (!row.classId?._id && (enrollment.classId || enrollment.schoolClass?.id)) {
      row.classId = { _id: enrollment.classId || enrollment.schoolClass?.id || '', title: repairDisplayText(enrollment.schoolClass?.title || enrollment.course?.title || '') };
    }
    if (!row.shiftId?._id && (enrollment.schoolClass?.shiftId || enrollment.schoolClass?.shift)) {
      row.shiftId = { _id: makeKey(enrollment.schoolClass.shiftId || ''), name: repairDisplayText(enrollment.schoolClass.shift || '') };
    }
    if (!row.academicYearId?._id && enrollment.academicYear) {
      row.academicYearId = { _id: enrollment.academicYear?._id || enrollment.academicYear?.id || '', title: repairDisplayText(enrollment.academicYear?.title || '') };
    }
    addSourceTag(row, 'education');
    indexStudentRow(index, row);
  });

  return rows;
};

const applyFallback = (row, field, value) => {
  const nextValue = getText(value);
  if (!nextValue) return;
  if (!getText(row[field])) row[field] = nextValue;
};

const applyFallbackRaw = (row, field, value) => {
  if (!value) return;
  if (!row[field]) row[field] = value;
};

const mergeOnlineEnrollmentRecords = (rows, enrollments = []) => {
  const index = new Map();
  rows.forEach((student) => indexStudentRow(index, student));

  enrollments.forEach((enrollment) => {
    const keys = [
      enrollment.linkedStudentId,
      enrollment.linkedUserId,
      enrollment.asasNumber,
      enrollment.registrationId,
      enrollment._id
    ];
    let row = findStudentRow(rows, index, keys);

    if (!row) {
      const fullName = repairDisplayText(enrollment.studentName || '');
      row = {
        _id: makeKey(enrollment.linkedStudentId || enrollment.linkedUserId || enrollment._id),
        profileId: makeKey(enrollment.linkedStudentId || ''),
        firstName: fullName.split(' ')[0] || fullName,
        lastName: fullName.split(' ').slice(1).join(' '),
        status: enrollment.status === 'approved' ? 'active' : (enrollment.status || 'inactive'),
        createdAt: enrollment.createdAt || new Date().toISOString()
      };
      rows.push(row);
    }

    row.onlineEnrollments = [...(row.onlineEnrollments || []), enrollment];
    row.profileId = row.profileId || makeKey(enrollment.linkedStudentId || '');
    row.linkedUserId = row.linkedUserId || makeKey(enrollment.linkedUserId || '');
    row.registrationId = row.registrationId || enrollment.registrationId || '';
    row.asasNumber = row.asasNumber || enrollment.asasNumber || '';
    row.studentIdentifier = readStudentIdentifier(row);
    applyFallback(row, 'nationalId', enrollment.nationalId || enrollment.tazkiraNumber);
    applyFallback(row, 'fatherName', enrollment.fatherName);
    applyFallback(row, 'motherName', enrollment.motherName);
    applyFallbackRaw(row, 'birthDate', toGregorianDateInputValue(enrollment.birthDate) || enrollment.birthDate);
    applyFallback(row, 'birthPlace', enrollment.district || enrollment.birthPlace);
    applyFallback(row, 'phone', enrollment.phone);
    applyFallback(row, 'email', enrollment.email);
    applyFallback(row, 'address', enrollment.address);
    applyFallback(row, 'city', enrollment.district);
    applyFallbackRaw(row, 'province', normalizeProvinceValue(enrollment.province || ''));
    applyFallback(row, 'previousSchool', enrollment.previousSchool);
    applyFallback(row, 'emergencyPhone', enrollment.emergencyPhone);
    applyFallback(row, 'generalNotes', enrollment.notes);
    applyFallbackRaw(row, 'gender', enrollment.gender);
    applyFallbackRaw(row, 'enrollmentDate', toGregorianDateInputValue(enrollment.academicContext?.enrollmentDate || enrollment.approvedAt || enrollment.createdAt));
    if (!row.currentGrade && enrollment.grade) row.currentGrade = enrollment.grade;
    if (!row.classId?._id && enrollment.academicContext?.classId) row.classId = { _id: makeKey(enrollment.academicContext.classId), title: '' };
    if (!row.academicYearId?._id && enrollment.academicContext?.academicYearId) row.academicYearId = { _id: makeKey(enrollment.academicContext.academicYearId), title: '' };
    if (!row.shiftId?._id && enrollment.academicContext?.shiftId) row.shiftId = { _id: makeKey(enrollment.academicContext.shiftId), name: '' };
    addSourceTag(row, 'online-enrollment');
    indexStudentRow(index, row);
  });

  return rows;
};

const getStudentUpdatePayload = (data = {}) => data.data || data.student || data._doc || data;

const trimFormValue = (value) => String(value ?? '').trim();

const setRequiredPayloadValue = (payload, key, value) => {
  payload[key] = typeof value === 'string' ? value.trim() : value;
};

const setOptionalPayloadValue = (payload, key, value) => {
  const trimmed = trimFormValue(value);
  if (trimmed) payload[key] = trimmed;
};

const setOptionalPayloadRawValue = (payload, key, value) => {
  if (value !== undefined && value !== null && value !== '') payload[key] = value;
};

const updateStudentRowFromProfile = (rows, updatedProfile) => {
  if (!updatedProfile || !updatedProfile._id) return rows;
  const normalized = normalizeAfghanStudent(updatedProfile);
  addSourceTag(normalized, 'profile');
  const keys = new Set(studentKeys(normalized));
  let replaced = false;

  const nextRows = rows.map((row) => {
    const matches = studentKeys(row).some((key) => keys.has(key));
    if (!matches) return row;
    replaced = true;
    return {
      ...row,
      ...normalized,
      financialMemberships: row.financialMemberships || normalized.financialMemberships,
      educationEnrollments: row.educationEnrollments || normalized.educationEnrollments,
      sourceTags: Array.from(new Set([...(row.sourceTags || []), ...(normalized.sourceTags || [])]))
    };
  });

  return replaced ? nextRows : [normalized, ...nextRows];
};

const StudentManagement = () => {
  const toast = useToast();
  const [students, setStudents] = useState([]);
  const [filteredStudents, setFilteredStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [showDetails, setShowDetails] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [filters, setFilters] = useState({
    academicYearId: '',
    classId: '',
    shiftId: '',
    gender: '',
    status: '',
    search: ''
  });
  const [studentPage, setStudentPage] = useState(1);
  const [editForm, setEditForm] = useState({
    registrationType: 'new',
    firstName: '',
    lastName: '',
    firstNameEnglish: '',
    lastNameEnglish: '',
    fatherName: '',
    fatherNameEnglish: '',
    grandfatherName: '',
    birthDate: '',
    birthPlace: '',
    nationality: 'Afghan',
    nationalId: '',
    studentIdentifier: '',
    tazkiraVolume: '',
    tazkiraPage: '',
    birthCertificateNumber: '',
    gender: '',
    phone: '',
    email: '',
    address: '',
    city: '',
    village: '',
    province: '',
    emergencyContact: '',
    emergencyPhone: '',
    academicYearId: '',
    classId: '',
    shiftId: '',
    currentGrade: '',
    currentSection: '',
    currentShift: '',
    enrollmentDate: '',
    enrollmentType: 'new',
    previousSchool: '',
    previousSchoolType: '',
    previousGrade: '',
    transferReason: '',
    fatherPhone: '',
    fatherOccupation: '',
    motherName: '',
    motherPhone: '',
    motherOccupation: '',
    guardianName: '',
    guardianRelation: '',
    guardianPhone: '',
    familySize: '',
    bloodType: '',
    hasMedicalConditions: false,
    medicalConditions: '',
    allergies: '',
    transportation: '',
    lunchProgram: '',
    specialNeeds: '',
    notes: '',
    generalNotes: '',
    academicNotes: '',
    behavioralNotes: '',
    status: 'active'
  });
  const [editFeedback, setEditFeedback] = useState({ type: '', message: '' });
  
  const [academicYears, setAcademicYears] = useState([]);
  const [classes, setClasses] = useState([]);
  const [shifts, setShifts] = useState([]);
  const [actionLoading, setActionLoading] = useState(null);

  const schoolId = localStorage.getItem('schoolId') || localStorage.getItem('school_id') || localStorage.getItem('selectedSchoolId') || '';

  const cleanStatusOptions = [
    { value: 'active', label: 'فعال', color: 'student-status active' },
    { value: 'inactive', label: 'غیرفعال', color: 'student-status inactive' },
    { value: 'graduated', label: 'فارغ‌التحصیل', color: 'student-status graduated' },
    { value: 'transferred', label: 'انتقال‌شده', color: 'student-status transferred' },
    { value: 'suspended', label: 'معلق', color: 'student-status suspended' }
  ];

  const statusOptions = [
    { value: 'active', label: 'فعال', color: 'bg-green-100 text-green-800' },
    { value: 'inactive', label: 'غیرفعال', color: 'bg-gray-100 text-gray-800' },
    { value: 'graduated', label: 'فارغ‌التحصیل', color: 'bg-blue-100 text-blue-800' },
    { value: 'transferred', label: 'انتقال‌شده', color: 'bg-yellow-100 text-yellow-800' },
    { value: 'suspended', label: 'معلق', color: 'bg-red-100 text-red-800' }
  ];

  useEffect(() => {
    fetchStudents();
    fetchAcademicYears();
    fetchClasses();
    fetchShifts();
  }, []);

  useEffect(() => {
    applyFilters();
  }, [students, filters]);

  useEffect(() => {
    setStudentPage(1);
  }, [filters]);

  const fetchStudents = async () => {
    setLoading(true);
    try {
      const query = schoolId ? `?schoolId=${encodeURIComponent(schoolId)}` : '';
      const headers = { ...getAuthHeaders(), 'Cache-Control': 'no-cache' };
      const [studentResult, financeResult, educationResult, onlineEnrollmentResult] = await Promise.allSettled([
        fetch(`/api/afghan-students${query}`, { headers, cache: 'no-store' }).then((res) => res.json()),
        fetch('/api/finance/admin/student-memberships', { headers, credentials: 'include', cache: 'no-store' }).then((res) => res.ok ? res.json() : { success: false, items: [] }),
        fetch('/api/education/student-enrollments', { headers, credentials: 'include', cache: 'no-store' }).then((res) => res.ok ? res.json() : { success: false, items: [] }),
        fetch('/api/enrollments/admin', { headers, credentials: 'include', cache: 'no-store' }).then((res) => res.ok ? res.json() : { success: false, items: [] })
      ]);

      const data = studentResult.status === 'fulfilled' ? studentResult.value : { success: false };
      const financeData = financeResult.status === 'fulfilled' ? financeResult.value : { items: [] };
      const educationData = educationResult.status === 'fulfilled' ? educationResult.value : { items: [] };
      const onlineEnrollmentData = onlineEnrollmentResult.status === 'fulfilled' ? onlineEnrollmentResult.value : { items: [] };
      
      if (data.success) {
        const items = Array.isArray(data.data?.students) ? data.data.students : (Array.isArray(data.data) ? data.data : []);
        const normalized = items.map((item) => {
          const row = normalizeAfghanStudent(item);
          addSourceTag(row, 'profile');
          return row;
        });
        const withFinance = mergeFinancialMemberships(normalized, financeData.items || []);
        const withEducation = mergeEducationEnrollments(withFinance, educationData.items || []);
        const withOnlineEnrollments = mergeOnlineEnrollmentRecords(withEducation, onlineEnrollmentData.items || []);
        setStudents(withOnlineEnrollments);
      } else {
        // اگر API ناموفق بود، از داده‌های نمونه استفاده کن
        const mockData = [
          {
            _id: '1',
            firstName: 'علی',
            lastName: 'احمدی',
            fatherName: 'رحیم',
            nationalId: '123456789',
            phone: '0771234567',
            email: 'ali@example.com',
            gender: 'male',
            status: 'active',
            province: 'kabul',
            classId: { _id: 'class1', title: 'صنف ۱۰ الف' },
            academicYearId: { _id: 'year1', title: '1403-1404' },
            shiftId: { _id: 'shift1', name: 'صبح' },
            previousSchool: '',
            previousGrade: '',
            createdAt: new Date().toISOString()
          },
          {
            _id: '2',
            firstName: 'فاطمه',
            lastName: 'محمدی',
            fatherName: 'حسین',
            nationalId: '987654321',
            phone: '0779876543',
            email: 'fatima@example.com',
            gender: 'female',
            status: 'active',
            province: 'kabul',
            classId: { _id: 'class2', title: 'صنف ۱۰ ب' },
            academicYearId: { _id: 'year1', title: '1403-1404' },
            shiftId: { _id: 'shift2', name: 'عصر' },
            previousSchool: '',
            previousGrade: '',
            createdAt: new Date().toISOString()
          }
        ];
        setStudents(mockData);
      }
    } catch (error) {
      console.error('Error fetching students:', error);
      // در صورت خطا نیز، از داده‌های نمونه استفاده کن
      const mockData = [
        {
          _id: '1',
          firstName: 'علی',
          lastName: 'احمدی',
          fatherName: 'رحیم',
          nationalId: '123456789',
          phone: '0771234567',
          email: 'ali@example.com',
          gender: 'male',
          status: 'active',
          province: 'kabul',
          classId: { _id: 'class1', title: 'صنف ۱۰ الف' },
          academicYearId: { _id: 'year1', title: '1403-1404' },
          shiftId: { _id: 'shift1', name: 'صبح' },
          previousSchool: '',
          previousGrade: '',
          createdAt: new Date().toISOString()
        }
      ];
      setStudents(mockData);
    } finally {
      setLoading(false);
    }
  };

  const fetchAcademicYears = async () => {
    if (!schoolId) {
      setAcademicYears([]);
      return;
    }
    try {
      const response = await fetch(`/api/academic-years/school/${schoolId}`, { headers: getAuthHeaders() });
      const data = await response.json();
      
      if (data.success) {
        setAcademicYears((Array.isArray(data.data) ? data.data : []).filter((year) => year.status !== 'archived'));
      } else {
        setAcademicYears([
            // داده‌های نمونه
          { _id: 'year1', title: '1403-1404', status: 'active' },
          { _id: 'year2', title: '1404-1405', status: 'active' }
        ]);
      }
    } catch (error) {
      console.error('Error fetching academic years:', error);
        // داده‌های نمونه
      setAcademicYears([
        { _id: 'year1', title: '1403-1404', status: 'active' }
      ]);
    }
  };

  const fetchClasses = async () => {
    if (!schoolId) {
      setClasses([]);
      return;
    }
    try {
      const response = await fetch(`/api/school-classes/school/${schoolId}`, { headers: getAuthHeaders() });
      const data = await response.json();
      
      if (data.success) {
        setClasses(data.data);
      } else {
        setClasses([
            // داده‌های نمونه
          { _id: 'class1', title: 'صنف ۱۰ الف' },
          { _id: 'class2', title: 'صنف ۱۰ ب' },
          { _id: 'class3', title: 'صنف ۱۱ الف' }
        ]);
      }
    } catch (error) {
      console.error('Error fetching classes:', error);
        // داده‌های نمونه
      setClasses([
        { _id: 'class1', title: 'صنف ۱۰ الف' },
        { _id: 'class2', title: 'صنف ۱۰ ب' }
      ]);
    }
  };

  const fetchShifts = async () => {
    if (!schoolId) {
      setShifts([]);
      return;
    }
    try {
      const response = await fetch(`/api/shifts/school/${schoolId}`, { headers: getAuthHeaders() });
      const data = await response.json();
      
      if (data.success) {
        setShifts(data.data);
      } else {
        setShifts([
            // داده‌های نمونه
          { _id: 'shift1', name: 'صبح' },
          { _id: 'shift2', name: 'عصر' }
        ]);
      }
    } catch (error) {
      console.error('Error fetching shifts:', error);
        // داده‌های نمونه
      setShifts([
        { _id: 'shift1', name: 'صبح' },
        { _id: 'shift2', name: 'عصر' }
      ]);
    }
  };

  const applyFilters = () => {
    let filtered = [...students];

    // فیلتر بر اساس سال تعلیمی
    if (filters.academicYearId) {
      filtered = filtered.filter((student) => getStudentScopeIds(student, 'academicYear').has(filters.academicYearId));
    }

    // فیلتر بر اساس صنف
    if (filters.classId) {
      filtered = filtered.filter((student) => getStudentScopeIds(student, 'class').has(filters.classId));
    }

    // فیلتر بر اساس نوبت
    if (filters.shiftId) {
      filtered = filtered.filter((student) => getStudentScopeIds(student, 'shift').has(filters.shiftId));
    }

    // فیلتر بر اساس جنسیت
    if (filters.gender) {
      filtered = filtered.filter((student) => String(student.gender || '').trim().toLowerCase() === filters.gender);
    }

    // فیلتر بر اساس وضعیت
    if (filters.status) {
      filtered = filtered.filter((student) => String(student.status || '').trim().toLowerCase() === filters.status);
    }

    // جستجو
    const searchText = normalizeStudentSearchText(filters.search);
    if (searchText) {
      const searchTokens = searchText.split(' ').filter(Boolean);
      filtered = filtered.filter((student) => {
        const studentSearchText = buildStudentSearchText(student);
        return searchTokens.every((token) => studentSearchText.includes(token));
      });
    }

    setFilteredStudents(filtered);
  };

  const handleDelete = async (studentId) => {
    if (!confirm('آیا از حذف این شاگرد مطمئن هستید؟')) return;

    setActionLoading(studentId);
    try {
      const response = await fetch(`/api/afghan-students/${studentId}`, {
        method: 'DELETE',
        headers: getAuthHeaders()
      });

      const data = await response.json();
      
      if (data.success) {
        toast.success('شاگرد با موفقیت حذف شد.');
        fetchStudents();
      } else {
        toast.error(data.message || 'حذف شاگرد ناموفق بود.');
      }
    } catch (error) {
      console.error('Error deleting student:', error);
      toast.error('حذف شاگرد ناموفق بود.');
    } finally {
      setActionLoading(null);
    }
  };

  const handleViewDetails = (student) => {
    setSelectedStudent(student);
    setShowDetails(true);
  };

  const handleEdit = (student) => {
    const profileId = makeKey(student?.profileId || (student?.sourceTags?.includes('profile') ? student?._id : ''));
    const classIdValue = makeKey(student.classId?._id || student.classIdValue || '');
    const selectedClass = classes.find((item) => makeKey(item._id || item.id) === classIdValue) || {};
    const shiftIdValue = resolveShiftId({ student, shifts, classes, classIdValue });
    const academicYearIdValue = makeKey(student.academicYearId?._id || student.academicYearIdValue || '');
    const registrationType = student.enrollmentType === 'transfer' || student.previousSchool ? 'transfer' : 'new';
    setSelectedStudent({ ...student, profileId });
    setEditForm({
      registrationType,
      firstName: student.firstName || '',
      lastName: student.lastName || '',
      firstNameEnglish: student.firstNameEnglish || '',
      lastNameEnglish: student.lastNameEnglish || '',
      fatherName: student.fatherName || '',
      fatherNameEnglish: student.fatherNameEnglish || '',
      grandfatherName: student.grandfatherName || '',
      birthDate: student.birthDate || '',
      birthPlace: student.birthPlace || '',
      nationality: student.nationality || 'Afghan',
      nationalId: readStudentTazkira(student),
      studentIdentifier: readStudentAsasNumber(student),
      tazkiraVolume: student.tazkiraVolume || '',
      tazkiraPage: student.tazkiraPage || '',
      birthCertificateNumber: student.birthCertificateNumber || '',
      gender: student.gender || '',
      phone: student.phone || '',
      email: student.email || '',
      address: student.address || '',
      city: student.city || student.birthPlace || '',
      village: student.village || '',
      province: normalizeProvinceValue(student.province || ''),
      emergencyContact: student.emergencyContact || '',
      emergencyRelation: student.emergencyRelation || '',
      emergencyPhone: student.emergencyPhone || '',
      academicYearId: academicYearIdValue || makeKey(selectedClass.academicYearId || selectedClass.academicYear?._id || ''),
      classId: classIdValue,
      shiftId: shiftIdValue,
      currentGrade: student.currentGrade || classIdValue || '',
      currentSection: student.currentSection || student.classId?.title || '',
      currentShift: student.currentShift || student.shiftId?.name || selectedClass.shift || shiftIdValue || '',
      enrollmentDate: student.enrollmentDate || '',
      enrollmentType: registrationType,
      previousSchool: student.previousSchool || '',
      previousSchoolType: student.previousSchoolType || '',
      previousGrade: student.previousGrade || '',
      transferReason: student.transferReason || '',
      fatherPhone: student.fatherPhone || '',
      fatherOccupation: student.fatherOccupation || '',
      motherName: student.motherName || '',
      motherPhone: student.motherPhone || '',
      motherOccupation: student.motherOccupation || '',
      guardianName: student.guardianName || '',
      guardianRelation: student.guardianRelation || '',
      guardianPhone: student.guardianPhone || '',
      familySize: student.familySize || '',
      bloodType: student.bloodType || '',
      hasMedicalConditions: Boolean(student.hasMedicalConditions),
      medicalConditions: student.medicalConditions || '',
      allergies: student.allergies || '',
      transportation: student.transportation || '',
      lunchProgram: student.lunchProgram || '',
      specialNeeds: student.specialNeeds || '',
      notes: student.generalNotes || '',
      generalNotes: student.generalNotes || '',
      academicNotes: student.academicNotes || '',
      behavioralNotes: student.behavioralNotes || '',
      status: student.status || 'active'
    });
    setEditFeedback({ type: '', message: '' });
    setShowEdit(true);
  };

  const handleEditFormChange = (field, value) => {
    setEditFeedback({ type: '', message: '' });
    setEditForm((current) => {
      const next = { ...current, [field]: value };
      if (field === 'classId') {
        const classItem = classes.find((item) => makeKey(item._id || item.id) === makeKey(value));
        if (classItem) {
          next.academicYearId = makeKey(classItem.academicYearId || classItem.academicYear?._id || next.academicYearId);
          next.shiftId = makeKey(classItem.shiftId || '') || resolveOptionId(shifts, classItem.shift, ['name', 'code', 'title', 'nameDari', 'namePashto']) || next.shiftId;
          next.currentSection = classItem.section || classItem.title || next.currentSection;
          next.currentShift = normalizeShiftCode(classItem.shift) || next.currentShift;
        }
      }
      if (field === 'shiftId') {
        const shift = shifts.find((item) => makeKey(item._id || item.id) === makeKey(value));
        next.currentShift = normalizeShiftCode(shift?.name || shift?.code || shift?.title) || next.currentShift;
      }
      return next;
    });
  };

  const saveStudentProfile = async () => {
    const profileId = makeKey(selectedStudent?.profileId);
    if (!profileId) {
      toast.info('این ردیف هنوز پروفایل اصلی شاگرد ندارد؛ صنف را از مدیریت آموزش و معلومات مالی را از ممبرشیپ مالی تنظیم کنید.');
      return;
    }
    const normalizedProvince = normalizeProvinceValue(editForm.province);
    if (!editForm.firstName.trim() || !editForm.lastName.trim() || !editForm.fatherName.trim()) {
      toast.error('نام، تخلص و نام پدر برای ذخیره پروفایل ضروری است.');
      return;
    }
    if (!editForm.nationalId.trim()) {
      toast.error('شماره تذکره شاگرد برای جلوگیری از تکرار ضروری است.');
      return;
    }
    if (!editForm.gender) {
      toast.error('جنسیت شاگرد را انتخاب کنید.');
      return;
    }
    if (!normalizedProvince || !provinceOptions.some((item) => item.value === normalizedProvince)) {
      toast.error('ولایت را از لیست انتخاب کنید.');
      return;
    }
    if (!editForm.city.trim() || !editForm.address.trim()) {
      toast.error('ولسوالی/شهر و آدرس برای ذخیره پروفایل ضروری است.');
      return;
    }
    setActionLoading(profileId);
    try {
      const payload = {
        'personalInfo.firstName': editForm.firstNameEnglish.trim() || editForm.firstName.trim(),
        'personalInfo.lastName': editForm.lastNameEnglish.trim() || editForm.lastName.trim(),
        'personalInfo.firstNameDari': editForm.firstName.trim(),
        'personalInfo.lastNameDari': editForm.lastName.trim(),
        'personalInfo.fatherName': editForm.fatherName.trim(),
        'personalInfo.fatherNameEnglish': editForm.fatherNameEnglish.trim(),
        'personalInfo.grandfatherName': editForm.grandfatherName.trim(),
        'personalInfo.gender': editForm.gender,
        'identification.tazkiraNumber': editForm.nationalId.trim(),
        'contactInfo.phone': editForm.phone.trim(),
        'contactInfo.mobile': editForm.phone.trim(),
        'contactInfo.email': editForm.email.trim(),
        'contactInfo.address': editForm.address.trim(),
        'contactInfo.district': editForm.city.trim(),
        'contactInfo.province': normalizedProvince,
        status: editForm.status
      };

      const response = await fetch(`/api/afghan-students/${profileId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify(payload)
      });
      const data = await readApiResponse(response);
      if (!response.ok || !data.success) {
        throw new Error(data.message || 'ذخیره مشخصات ناموفق بود.');
      }
      const updatedProfile = getStudentUpdatePayload(data);
      setStudents((currentRows) => updateStudentRowFromProfile(currentRows, updatedProfile));
      setSelectedStudent((current) => {
        const normalized = updatedProfile?._id ? normalizeAfghanStudent(updatedProfile) : null;
        return normalized ? { ...(current || {}), ...normalized } : current;
      });
      await fetchStudents();
    } catch (error) {
      toast.error(error.message || 'ذخیره مشخصات ناموفق بود.');
    } finally {
      setActionLoading(null);
    }
  };

  const saveStudentProfileComplete = async () => {
    const profileId = makeKey(selectedStudent?.profileId);
    const showEditError = (message) => {
      setEditFeedback({ type: 'error', message });
    };

    if (!profileId) {
      showEditError('این ردیف هنوز پروفایل اصلی شاگرد ندارد. اول باید پروفایل شاگرد ساخته یا وصل شود.');
      return;
    }

    const normalizedProvince = normalizeProvinceValue(editForm.province);
    if (!editForm.firstName.trim() || !editForm.lastName.trim() || !editForm.fatherName.trim()) {
      showEditError('نام، تخلص و نام پدر برای ذخیره پروفایل ضروری است.');
      return;
    }
    if (!editForm.nationalId.trim()) {
      showEditError('شماره تذکره شاگرد برای جلوگیری از تکرار ضروری است.');
      return;
    }
    if (!editForm.gender) {
      showEditError('جنسیت شاگرد را انتخاب کنید.');
      return;
    }
    if (!editForm.birthDate) {
      showEditError('تاریخ تولد شاگرد ضروری است.');
      return;
    }
    if (!normalizedProvince || !provinceOptions.some((item) => item.value === normalizedProvince)) {
      showEditError('ولایت را از لیست انتخاب کنید.');
      return;
    }
    if (!editForm.address.trim()) {
      showEditError('آدرس کامل برای ذخیره پروفایل ضروری است.');
      return;
    }
    if (!editForm.academicYearId) {
      showEditError('سال تعلیمی را انتخاب کنید.');
      return;
    }
    if (!editForm.classId) {
      showEditError('صنف را انتخاب کنید.');
      return;
    }
    if (!editForm.shiftId) {
      showEditError('نوبت را انتخاب کنید.');
      return;
    }
    if (!editForm.fatherPhone.trim()) {
      showEditError('شماره تماس پدر الزامی است.');
      return;
    }
    if (editForm.registrationType === 'transfer' && !editForm.previousSchool.trim()) {
      showEditError('برای تبدیلی آمد، مکتب قبلی الزامی است.');
      return;
    }

    setActionLoading(profileId);
    setEditFeedback({ type: 'info', message: 'در حال ذخیره مشخصات شاگرد...' });
    try {
      const selectedClass = classes.find((item) => makeKey(item._id || item.id) === makeKey(editForm.classId)) || {};
      const selectedShift = shifts.find((item) => makeKey(item._id || item.id) === makeKey(editForm.shiftId)) || {};
      const gradeLevel = Number(selectedClass.gradeLevel || String(selectedClass.code || '').match(/\d+/)?.[0] || 0);
      const currentGrade = gradeLevel ? `grade${gradeLevel}` : editForm.currentGrade || editForm.classId;
      const currentShift = normalizeShiftCode(
        selectedShift.name
        || selectedShift.code
        || selectedShift.title
        || selectedClass.shift
        || editForm.currentShift
      ) || 'morning';
      const district = editForm.city.trim() || editForm.birthPlace.trim() || editForm.address.trim();
      const emergencyName = editForm.emergencyContact.trim() || editForm.guardianName.trim() || editForm.fatherName.trim();
      const emergencyRelation = editForm.guardianRelation.trim() || 'سرپرست';
      const emergencyPhone = editForm.emergencyPhone.trim() || editForm.guardianPhone.trim() || editForm.fatherPhone.trim() || editForm.phone.trim();
      const payload = {};
      setRequiredPayloadValue(payload, 'personalInfo.firstName', editForm.firstNameEnglish.trim() || editForm.firstName);
      setRequiredPayloadValue(payload, 'personalInfo.lastName', editForm.lastNameEnglish.trim() || editForm.lastName);
      setRequiredPayloadValue(payload, 'personalInfo.firstNameDari', editForm.firstName);
      setRequiredPayloadValue(payload, 'personalInfo.lastNameDari', editForm.lastName);
      setRequiredPayloadValue(payload, 'personalInfo.fatherName', editForm.fatherName);
      setOptionalPayloadValue(payload, 'personalInfo.fatherNameEnglish', editForm.fatherNameEnglish);
      setOptionalPayloadValue(payload, 'personalInfo.grandfatherName', editForm.grandfatherName);
      setRequiredPayloadValue(payload, 'personalInfo.gender', editForm.gender);
      setRequiredPayloadValue(payload, 'personalInfo.birthDate', editForm.birthDate);
      setRequiredPayloadValue(payload, 'personalInfo.birthPlace', district);
      setRequiredPayloadValue(payload, 'personalInfo.nationality', editForm.nationality.trim() || 'Afghan');
      setRequiredPayloadValue(payload, 'identification.tazkiraNumber', editForm.nationalId);
      setOptionalPayloadValue(payload, 'contactInfo.phone', editForm.phone);
      setOptionalPayloadValue(payload, 'contactInfo.mobile', editForm.phone);
      setOptionalPayloadValue(payload, 'contactInfo.email', editForm.email);
      setRequiredPayloadValue(payload, 'contactInfo.address', editForm.address);
      setRequiredPayloadValue(payload, 'contactInfo.district', district);
      setRequiredPayloadValue(payload, 'contactInfo.province', normalizedProvince);
      setOptionalPayloadValue(payload, 'contactInfo.emergencyContact.name', emergencyName);
      setOptionalPayloadValue(payload, 'contactInfo.emergencyContact.relation', emergencyRelation);
      setOptionalPayloadValue(payload, 'contactInfo.emergencyContact.phone', emergencyPhone);
      setRequiredPayloadValue(payload, 'academicInfo.academicYearId', editForm.academicYearId);
      setRequiredPayloadValue(payload, 'academicInfo.classId', editForm.classId);
      setRequiredPayloadValue(payload, 'academicInfo.currentClassId', editForm.classId);
      setRequiredPayloadValue(payload, 'academicInfo.shiftId', editForm.shiftId);
      setRequiredPayloadValue(payload, 'academicInfo.currentGrade', currentGrade);
      setOptionalPayloadValue(payload, 'academicInfo.currentSection', selectedClass.section || editForm.currentSection);
      setRequiredPayloadValue(payload, 'academicInfo.currentShift', currentShift);
      setOptionalPayloadValue(payload, 'academicInfo.enrollmentDate', editForm.enrollmentDate);
      setRequiredPayloadValue(payload, 'academicInfo.enrollmentType', editForm.registrationType || 'new');
      setOptionalPayloadValue(payload, 'academicInfo.previousSchool.name', editForm.previousSchool);
      setOptionalPayloadValue(payload, 'academicInfo.previousSchool.lastGrade', editForm.previousGrade);
      if (editForm.registrationType === 'transfer') payload['academicInfo.previousSchool.type'] = editForm.previousSchoolType || 'private';
      setOptionalPayloadValue(payload, 'familyInfo.fatherPhone', editForm.fatherPhone);
      setOptionalPayloadValue(payload, 'familyInfo.fatherOccupation', editForm.fatherOccupation);
      setOptionalPayloadValue(payload, 'familyInfo.motherName', editForm.motherName);
      setOptionalPayloadValue(payload, 'familyInfo.motherPhone', editForm.motherPhone);
      setOptionalPayloadValue(payload, 'familyInfo.motherOccupation', editForm.motherOccupation);
      setOptionalPayloadValue(payload, 'familyInfo.guardianName', editForm.guardianName);
      setOptionalPayloadValue(payload, 'familyInfo.guardianPhone', editForm.guardianPhone);
      setRequiredPayloadValue(payload, 'medicalInfo.hasMedicalConditions', Boolean(editForm.hasMedicalConditions));
      setOptionalPayloadValue(payload, 'notes.general', [editForm.notes, editForm.transportation ? `ترانسپورت: ${editForm.transportation}` : '', editForm.lunchProgram ? `برنامه ناهار: ${editForm.lunchProgram}` : ''].filter(Boolean).join('\n'));
      setRequiredPayloadValue(payload, 'status', editForm.status);

      setOptionalPayloadRawValue(payload, 'familyInfo.guardianRelation', editForm.guardianRelation);
      setOptionalPayloadRawValue(payload, 'medicalInfo.bloodGroup', editForm.bloodType);

      const response = await fetch(`/api/afghan-students/${profileId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify(payload)
      });
      const data = await readApiResponse(response);
      if (!response.ok || !data.success) {
        throw new Error(data.message || 'ذخیره مشخصات ناموفق بود.');
      }

      const updatedProfile = getStudentUpdatePayload(data);
      setStudents((currentRows) => updateStudentRowFromProfile(currentRows, updatedProfile));
      setSelectedStudent((current) => {
        const normalized = updatedProfile?._id ? normalizeAfghanStudent(updatedProfile) : null;
        return normalized ? { ...(current || {}), ...normalized } : current;
      });
      setEditFeedback({ type: 'success', message: 'مشخصات شاگرد با موفقیت ذخیره شد.' });
      await fetchStudents();
    } catch (error) {
      const message = error.message || 'ذخیره مشخصات ناموفق بود.';
      setEditFeedback({ type: 'error', message });
    } finally {
      setActionLoading(null);
    }
  };

  const getStatusColor = (status) => {
    const statusOption = cleanStatusOptions.find(opt => opt.value === status);
    return statusOption ? statusOption.color : 'student-status inactive';
  };

  const getStatusLabel = (status) => {
    const statusOption = cleanStatusOptions.find(opt => opt.value === status);
    return statusOption ? statusOption.label : (status || 'نامشخص');
  };

  const formatDate = (dateString) => {
    return formatAfghanDateTime(dateString, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }) || 'N/A';
  };

  const formatBirthDate = (dateString) => {
    return formatAfghanStoredDateLabel(dateString) || dateString || '---';
  };

  const escapePrintText = (value) => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

  const exportStudentListPdf = async () => {
    const rows = filteredStudents.length ? filteredStudents : students;
    if (!rows.length) {
      toast.info('برای خروجی PDF شاگردی در لیست موجود نیست.');
      return;
    }

    const generatedAt = formatAfghanDateTime(new Date(), {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
    const autoPrint = window.__DISABLE_STUDENT_PDF_AUTO_PRINT__ !== true;
    const tableRows = rows.map((student) => {
      const fullName = `${displayValue(student.firstName, '')} ${displayValue(student.lastName, '')}`.trim() || '---';
      const studentAsasNumber = readStudentAsasNumber(student) || '---';
      const classLabel = student.classId?.title || student.currentSection || student.currentGrade || '---';
      const sources = (student.sourceTags || ['profile']).map((tag) => sourceLabelMap[tag] || tag).join('، ');
      return `
        <tr>
          <td class="student-id">${escapePrintText(studentAsasNumber)}</td>
          <td>${escapePrintText(fullName)}</td>
          <td>${escapePrintText(student.fatherName || '---')}</td>
          <td>${escapePrintText(student.nationalId || '---')}</td>
          <td>${escapePrintText(genderLabelMap[student.gender] || student.gender || '---')}</td>
          <td>${escapePrintText(classLabel)}</td>
          <td>${escapePrintText(getProvinceLabel(student.province) || student.city || '---')}</td>
          <td>${escapePrintText(statusLabelMap[student.status] || student.status || '---')}</td>
          <td>${escapePrintText(sources)}</td>
        </tr>
      `;
    }).join('');

    const printWindow = window.open('about:blank', '_blank', 'width=1100,height=800');
    if (!printWindow) {
      toast.error('پنجره خروجی باز نشد. لطفاً اجازه pop-up را برای سایت فعال کنید.');
      return;
    }

    printWindow.document.open();
    printWindow.document.write('<!doctype html><html lang="fa" dir="rtl"><head><meta charset="utf-8"><title>در حال ساخت PDF</title></head><body style="font-family:\'B Nazanin\',\'B Mitra\',sans-serif;padding:24px">در حال آماده‌سازی فورم PDF...</body></html>');
    printWindow.document.close();

    const fontFileToDataUrl = async (fontPath) => {
      const controller = new AbortController();
      const timeoutId = window.setTimeout(() => controller.abort(), 3000);
      try {
        const response = await fetch(fontPath, { cache: 'force-cache', signal: controller.signal });
        if (!response.ok) throw new Error(`Persian font could not be loaded (${response.status})`);
        const blob = await response.blob();
        return await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = () => reject(reader.error || new Error('Persian font could not be read'));
          reader.readAsDataURL(blob);
        });
      } finally {
        window.clearTimeout(timeoutId);
      }
    };

    let regularFontSource = `${window.location.origin}/fonts/B_Nazanin.ttf`;
    let boldFontSource = `${window.location.origin}/fonts/B_Nazanin_Bold.ttf`;
    try {
      [regularFontSource, boldFontSource] = await Promise.all([
        fontFileToDataUrl('/fonts/B_Nazanin.ttf'),
        fontFileToDataUrl('/fonts/B_Nazanin_Bold.ttf')
      ]);
    } catch (fontError) {
      console.warn('Persian PDF font could not be embedded; using the hosted font files.', fontError);
    }

    if (printWindow.closed) return;

    const printHtml = `
      <!doctype html>
      <html lang="fa" dir="rtl">
        <head>
          <meta charset="utf-8" />
          <title>لیست شاگردان</title>
          <style>
            @page { size: A4 landscape; margin: 12mm; }
            @font-face {
              font-family: 'B Nazanin PDF';
              src: url('${regularFontSource}') format('truetype');
              font-weight: 400;
              font-style: normal;
              font-display: block;
            }
            @font-face {
              font-family: 'B Nazanin PDF';
              src: url('${boldFontSource}') format('truetype');
              font-weight: 700;
              font-style: normal;
              font-display: block;
            }
            * { box-sizing: border-box; }
            html, body, body * { font-family: 'B Nazanin PDF', 'B Nazanin', 'B Mitra', sans-serif !important; }
            body {
              margin: 0;
              color: #111827;
              direction: rtl;
              background: #fff;
            }
            header {
              display: flex;
              justify-content: space-between;
              gap: 16px;
              align-items: flex-start;
              border-bottom: 2px solid #111827;
              padding-bottom: 12px;
              margin-bottom: 16px;
            }
            h1 { margin: 0 0 6px; font-size: 22px; }
            p { margin: 0; color: #4b5563; font-size: 13px; }
            .meta { text-align: left; line-height: 1.8; }
            table { width: 100%; border-collapse: collapse; font-size: 13px; }
            th, td { border: 1px solid #d1d5db; padding: 7px 8px; vertical-align: top; }
            th { background: #f3f4f6; color: #111827; font-weight: 700; }
            .student-id { direction: ltr; text-align: center; font-weight: 700; white-space: nowrap; }
            tbody tr:nth-child(even) td { background: #fafafa; }
            .footer { margin-top: 12px; color: #6b7280; font-size: 12px; }
            @media print {
              body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            }
          </style>
        </head>
        <body>
          <header>
            <div>
              <h1>لیست شاگردان</h1>
              <p>خروجی ${hasActiveFilters ? 'بر اساس فیلترهای فعلی' : 'تمام شاگردان قابل مشاهده'}</p>
            </div>
            <div class="meta">
              <p>تاریخ: ${escapePrintText(generatedAt)}</p>
              <p>تعداد: ${Number(rows.length).toLocaleString('fa-AF-u-ca-persian')}</p>
            </div>
          </header>
          <table>
            <thead>
              <tr>
                <th>شماره اساس شاگرد</th>
                <th>نام شاگرد</th>
                <th>نام پدر</th>
                <th>شماره تذکره</th>
                <th>جنسیت</th>
                <th>صنف</th>
                <th>ولایت/محل</th>
                <th>وضعیت</th>
                <th>منبع</th>
              </tr>
            </thead>
            <tbody>${tableRows}</tbody>
          </table>
          <div class="footer">برای ساخت PDF از پنجره چاپ، گزینه Save as PDF را انتخاب کنید.</div>
          <script>
            window.addEventListener('load', function () {
              window.focus();
              var fontsReady = document.fonts
                ? Promise.race([
                    Promise.all([
                      document.fonts.load('400 13px "B Nazanin PDF"', 'لیست شاگردان'),
                      document.fonts.load('700 13px "B Nazanin PDF"', 'لیست شاگردان'),
                      document.fonts.ready
                    ]),
                    new Promise(function (resolve) { setTimeout(resolve, 3000); })
                  ])
                : Promise.resolve();
              if (${autoPrint ? 'true' : 'false'}) {
                fontsReady.then(function () {
                  setTimeout(function () { window.print(); }, 150);
                });
              }
            });
          </script>
        </body>
      </html>
    `;

    try {
      printWindow.document.open();
      printWindow.document.write(printHtml);
      printWindow.document.close();
      printWindow.focus();
    } catch (error) {
      printWindow.close();
      console.error('Student PDF export failed:', error);
      toast.error('خروجی PDF ساخته نشد. لطفاً دوباره تلاش کنید.');
    }
  };

  if (loading) {
    return <div className="flex justify-center items-center h-64">در حال بارگذاری...</div>;
  }

  const activeCount = students.filter((student) => student.status === 'active').length;
  const maleCount = students.filter((student) => student.gender === 'male').length;
  const femaleCount = students.filter((student) => student.gender === 'female').length;
  const financialMembershipCount = students.filter((student) => student.sourceTags?.includes('financial')).length;
  const educationEnrollmentCount = students.filter((student) => student.sourceTags?.includes('education')).length;
  const hasActiveFilters = Object.values(filters).some(Boolean);
  const studentsPerPage = 10;
  const totalStudentPages = Math.max(1, Math.ceil(filteredStudents.length / studentsPerPage));
  const currentStudentPage = Math.min(studentPage, totalStudentPages);
  const visibleStudents = filteredStudents.slice(
    (currentStudentPage - 1) * studentsPerPage,
    currentStudentPage * studentsPerPage
  );
  const statusLabelMap = {
    active: 'فعال',
    inactive: 'غیرفعال',
    graduated: 'فارغ‌التحصیل',
    transferred: 'انتقال‌شده',
    suspended: 'معلق'
  };
  const genderLabelMap = {
    male: 'پسر',
    female: 'دختر'
  };
  const sourceLabelMap = {
    profile: 'پروفایل شاگرد',
    financial: 'ممبرشیپ مالی',
    education: 'ثبت تدریسی'
  };
  const membershipTypeLabelMap = {
    normal: 'عادی',
    scholarship: 'بورسیه',
    discounted: 'تخفیفی',
    free: 'رایگان'
  };
  const displayValue = (value, fallback = 'ثبت نشده') => {
    const fixed = repairDisplayText(value);
    return fixed || fallback;
  };
  const clearFilters = () => {
    setFilters({
      academicYearId: '',
      classId: '',
      shiftId: '',
      gender: '',
      status: '',
      search: ''
    });
  };

  return (
    <main className="student-management-page" dir="rtl">
      <section className="student-management-hero">
        <div>
          <span className="student-eyebrow">مدیریت شاگردان</span>
          <h1>لیست شاگردان و وضعیت ثبت‌نام</h1>
          <p>یک نمای سبک برای جستجو، فیلتر، بررسی جزئیات و مدیریت سریع معلومات شاگردان.</p>
        </div>
        <div className="student-hero-actions">
          <button type="button" className="student-btn ghost" onClick={fetchStudents}>
            <RefreshCw size={16} />
            تازه‌سازی
          </button>
          <button type="button" className="student-btn ghost" onClick={exportStudentListPdf}>
            <Download size={16} />
            خروجی PDF
          </button>
          <button type="button" className="student-btn primary" onClick={() => window.location.href = '/student-registration'}>
            <UserPlus size={16} />
            ثبت شاگرد
          </button>
        </div>
      </section>

      <section className="student-stat-grid" aria-label="آمار شاگردان">
        <article>
          <span>کل شاگردان</span>
          <strong>{students.length}</strong>
          <small>تمام رکوردهای قابل دسترس</small>
        </article>
        <article>
          <span>فعال</span>
          <strong>{activeCount}</strong>
          <small>در جریان آموزش</small>
        </article>
        <article>
          <span>پسران</span>
          <strong>{maleCount}</strong>
          <small>براساس معلومات ثبت‌شده</small>
        </article>
        <article>
          <span>دختران</span>
          <strong>{femaleCount}</strong>
          <small>براساس معلومات ثبت‌شده</small>
        </article>
        <article>
          <span>ممبرشیپ مالی</span>
          <strong>{financialMembershipCount}</strong>
          <small>شاگردان دارای رکورد مالی</small>
        </article>
        <article>
          <span>ثبت تدریسی</span>
          <strong>{educationEnrollmentCount}</strong>
          <small>معرفی‌شده به صنف/سال</small>
        </article>
      </section>

      <section className="student-filter-panel">
        <div className="student-panel-heading">
          <div>
            <h2>فیلتر و جستجو</h2>
            <p>{filteredStudents.length} نتیجه از {students.length} شاگرد</p>
          </div>
          {hasActiveFilters && (
            <button type="button" className="student-btn subtle" onClick={clearFilters}>
              پاک‌کردن فیلترها
            </button>
          )}
        </div>

        <div className="student-filter-grid">
          <label>
            <span>جستجو</span>
            <div className="student-search-field">
              <Search size={16} />
              <input
                type="search"
                data-testid="student-search-input"
                value={filters.search}
                onChange={(event) => setFilters({ ...filters, search: event.target.value })}
                placeholder="نام، تذکره، تلفن یا ایمیل"
              />
            </div>
          </label>

          <label>
            <span>سال تعلیمی</span>
            <select data-testid="student-year-filter" value={filters.academicYearId} onChange={(event) => setFilters({ ...filters, academicYearId: event.target.value })}>
              <option value="">همه سال‌ها</option>
              {academicYears.map((year) => (
                <option key={year._id} value={year._id}>{displayValue(year.title || year.name)}</option>
              ))}
            </select>
          </label>

          <label>
            <span>صنف</span>
            <select data-testid="student-class-filter" value={filters.classId} onChange={(event) => setFilters({ ...filters, classId: event.target.value })}>
              <option value="">همه صنف‌ها</option>
              {classes.map((classItem) => (
                <option key={classItem._id} value={classItem._id}>{displayValue(classItem.title || classItem.name)}</option>
              ))}
            </select>
          </label>

          <label>
            <span>نوبت</span>
            <select data-testid="student-shift-filter" value={filters.shiftId} onChange={(event) => setFilters({ ...filters, shiftId: event.target.value })}>
              <option value="">همه نوبت‌ها</option>
              {shifts.map((shift) => (
                <option key={shift._id} value={shift._id}>{displayValue(shift.name || shift.title)}</option>
              ))}
            </select>
          </label>

          <label>
            <span>جنسیت</span>
            <select data-testid="student-gender-filter" value={filters.gender} onChange={(event) => setFilters({ ...filters, gender: event.target.value })}>
              <option value="">همه</option>
              <option value="male">پسر</option>
              <option value="female">دختر</option>
            </select>
          </label>

          <label>
            <span>وضعیت</span>
            <select data-testid="student-status-filter" value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value })}>
              <option value="">همه وضعیت‌ها</option>
              {cleanStatusOptions.map((status) => (
                <option key={status.value} value={status.value}>{statusLabelMap[status.value] || displayValue(status.label)}</option>
              ))}
            </select>
          </label>
        </div>
      </section>

      <section className="student-list-panel">
        <div className="student-panel-heading">
          <div>
            <h2>شاگردان</h2>
            <p>نمای فشرده برای بررسی سریع و عملیات ضروری</p>
          </div>
          <span className="student-count-pill">{filteredStudents.length} مورد</span>
        </div>

        {filteredStudents.length === 0 ? (
          <div className="student-empty-state">
            <Users size={34} />
            <h3>شاگردی پیدا نشد</h3>
            <p>فیلترها را تغییر دهید یا شاگرد تازه ثبت کنید.</p>
          </div>
        ) : (
          <>
          <div className="student-table-wrap">
            <table className="student-table">
              <thead>
                <tr>
                  <th>شاگرد</th>
                  <th>صنف و نوبت</th>
                  <th>تماس</th>
                  <th>منبع/عضویت</th>
                  <th>وضعیت</th>
                  <th>ثبت</th>
                  <th>عملیات</th>
                </tr>
              </thead>
              <tbody>
                {visibleStudents.map((student) => {
                  const fullName = `${displayValue(student.firstName, '')} ${displayValue(student.lastName, '')}`.trim() || 'بدون نام';
                  return (
                    <tr key={student._id}>
                      <td>
                        <div className="student-person-cell">
                          <span className="student-avatar">{fullName.charAt(0)}</span>
                          <div>
                            <strong>{fullName}</strong>
                            <small>ولد {displayValue(student.fatherName)} | تذکره: {displayValue(student.nationalId, 'بدون تذکره')} | شماره اساس: {displayValue(readStudentAsasNumber(student), 'ثبت نشده')}</small>
                          </div>
                        </div>
                      </td>
                      <td>
                        <strong>{displayValue(student.classId?.title || student.classId?.name)}</strong>
                        <small>{displayValue(student.shiftId?.name || student.shiftId?.title)} | {displayValue(student.academicYearId?.title || student.academicYearId?.name)}</small>
                      </td>
                      <td>
                        <strong>{displayValue(student.phone)}</strong>
                        <small>{displayValue(student.email, 'ایمیل ثبت نشده')}</small>
                      </td>
                      <td>
                        <div className="student-source-tags">
                          {(student.sourceTags || ['profile']).map((tag) => (
                            <span key={tag}>{sourceLabelMap[tag] || tag}</span>
                          ))}
                        </div>
                        <small>
                          {student.membershipType
                            ? `نوع مالی: ${membershipTypeLabelMap[student.membershipType] || student.membershipType}`
                            : (student.educationStatus ? `ثبت تدریسی: ${statusLabelMap[student.educationStatus] || getStatusLabel(student.educationStatus)}` : 'بدون عضویت ثبت‌شده')}
                        </small>
                      </td>
                      <td>
                        <span className={getStatusColor(student.status)}>
                          {statusLabelMap[student.status] || getStatusLabel(student.status)}
                        </span>
                        <small>{genderLabelMap[student.gender] || displayValue(student.gender, 'جنسیت نامشخص')}</small>
                      </td>
                      <td>
                        <strong>{formatDate(student.createdAt)}</strong>
                        <small>{displayValue(getProvinceLabel(student.province) || student.city, 'محل ثبت نشده')}</small>
                      </td>
                      <td>
                        <div className="student-row-actions">
                          <button type="button" title="جزئیات" onClick={() => handleViewDetails(student)}>
                            <Eye size={15} />
                          </button>
                          <button type="button" title="ویرایش" onClick={() => handleEdit(student)}>
                            <Edit size={15} />
                          </button>
                          <button type="button" title="مدیریت ثبت تدریسی" onClick={() => window.location.href = '/admin-education?section=enrollments'}>
                            <BookOpen size={15} />
                          </button>
                          <button
                            type="button"
                            className="danger"
                            title="حذف"
                            disabled={actionLoading === student._id}
                            onClick={() => handleDelete(student._id)}
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {filteredStudents.length > studentsPerPage ? (
            <div className="student-pagination" aria-label="صفحه‌بندی شاگردان">
              <button
                type="button"
                className="student-btn ghost"
                disabled={currentStudentPage <= 1}
                onClick={() => setStudentPage((page) => Math.max(1, page - 1))}
              >
                قبلی
              </button>
              <span>
                صفحه {currentStudentPage.toLocaleString('fa-AF-u-ca-persian')} از {totalStudentPages.toLocaleString('fa-AF-u-ca-persian')}
              </span>
              <button
                type="button"
                className="student-btn ghost"
                disabled={currentStudentPage >= totalStudentPages}
                onClick={() => setStudentPage((page) => Math.min(totalStudentPages, page + 1))}
              >
                بعدی
              </button>
            </div>
          ) : null}
          </>
        )}
      </section>

      {showEdit && selectedStudent && (
        <div className="student-modal-backdrop" onClick={() => setShowEdit(false)}>
          <section className="student-modal" onClick={(event) => event.stopPropagation()}>
            <header>
              <div>
                <span className="student-eyebrow">ویرایش مشخصات</span>
                <h2>{displayValue(selectedStudent.firstName, '')} {displayValue(selectedStudent.lastName, '')}</h2>
              </div>
              <button type="button" onClick={() => setShowEdit(false)} aria-label="بستن">
                <X size={18} />
              </button>
            </header>

            {!selectedStudent.profileId ? (
              <div className="student-modal-notice">
                این ردیف از ممبرشیپ مالی یا ثبت تدریسی آمده و هنوز پروفایل اصلی شاگرد به آن وصل نیست. مشخصات قابل مشاهده است؛ برای ذخیره مستقیم باید شاگرد از فورم ثبت‌نام/پروفایل اصلی وصل شود.
              </div>
            ) : null}

            {editFeedback.message ? (
              <div className={`student-edit-feedback ${editFeedback.type || 'info'}`}>
                {editFeedback.message}
              </div>
            ) : null}

            <div className="student-edit-grid">
              <div className="student-edit-section-title">مشخصات شخصی</div>
              <label className="required"><span>نام</span>
                <input value={editForm.firstName} onChange={(event) => handleEditFormChange('firstName', event.target.value)} />
              </label>
              <label className="required"><span>تخلص</span>
                <input value={editForm.lastName} onChange={(event) => handleEditFormChange('lastName', event.target.value)} />
              </label>
              <label><span>نام به انگلیسی</span>
                <input dir="ltr" value={editForm.firstNameEnglish} onChange={(event) => handleEditFormChange('firstNameEnglish', event.target.value)} />
              </label>
              <label><span>تخلص به انگلیسی</span>
                <input dir="ltr" value={editForm.lastNameEnglish} onChange={(event) => handleEditFormChange('lastNameEnglish', event.target.value)} />
              </label>
              <label className="required"><span>نام پدر</span>
                <input value={editForm.fatherName} onChange={(event) => handleEditFormChange('fatherName', event.target.value)} />
              </label>
              <label><span>نام پدر به انگلیسی</span>
                <input dir="ltr" value={editForm.fatherNameEnglish} onChange={(event) => handleEditFormChange('fatherNameEnglish', event.target.value)} />
              </label>
              <label>
                <span>نام پدرکلان</span>
                <input value={editForm.grandfatherName} onChange={(event) => handleEditFormChange('grandfatherName', event.target.value)} />
              </label>
              <label className="required"><span>شماره تذکره</span>
                <input value={editForm.nationalId} onChange={(event) => handleEditFormChange('nationalId', event.target.value)} />
              </label>
              <label>
                <span>شماره اساس شاگرد</span>
                <input value={editForm.studentIdentifier || ''} readOnly className="student-readonly-input" />
              </label>
              <label className="required"><span>تاریخ تولد</span>
                <AfghanDateInput
                  value={editForm.birthDate}
                  onChange={(value) => handleEditFormChange('birthDate', value)}
                  required
                  showGregorianEquivalent
                />
              </label>
              <label className="required"><span>جنسیت</span>
                <select value={editForm.gender} onChange={(event) => handleEditFormChange('gender', event.target.value)}>
                  <option value="">انتخاب کنید</option>
                  <option value="male">ذکور</option>
                  <option value="female">اناث</option>
                </select>
              </label>
              <label>
                <span>گروپ خونی</span>
                <select value={editForm.bloodType} onChange={(event) => handleEditFormChange('bloodType', event.target.value)}>
                  <option value="">انتخاب کنید</option>
                  {bloodGroupOptions.map((item) => (
                    <option key={item} value={item}>{item}</option>
                  ))}
                </select>
              </label>

              <div className="student-edit-section-title">اطلاعات تماس و آدرس</div>
              <label className="required"><span>ولایت</span>
                <select value={editForm.province} onChange={(event) => handleEditFormChange('province', event.target.value)}>
                  <option value="">انتخاب کنید</option>
                  {provinceOptions.map((province) => (
                    <option key={province.value} value={province.value}>{province.label}</option>
                  ))}
                </select>
              </label>
              <label><span>ولسوالی/ناحیه</span>
                <input value={editForm.city} onChange={(event) => handleEditFormChange('city', event.target.value)} />
              </label>
              <label className="wide required"><span>آدرس کامل</span>
                <input value={editForm.address} onChange={(event) => handleEditFormChange('address', event.target.value)} />
              </label>
              <label>
                <span>شماره تماس شاگرد/خانه</span>
                <input value={editForm.phone} onChange={(event) => handleEditFormChange('phone', event.target.value)} />
              </label>
              <label>
                <span>ایمیل</span>
                <input value={editForm.email} onChange={(event) => handleEditFormChange('email', event.target.value)} />
              </label>

              <div className="student-edit-section-title">اطلاعات تعلیمی</div>
              <label className="required"><span>نوع ثبت‌نام</span>
                <select value={editForm.registrationType} onChange={(event) => handleEditFormChange('registrationType', event.target.value)}>
                  <option value="new">ثبت‌نام جدید</option>
                  <option value="transfer">تبدیلی آمد</option>
                </select>
              </label>
              <label className="required"><span>سال تعلیمی</span>
                <select value={editForm.academicYearId} onChange={(event) => handleEditFormChange('academicYearId', event.target.value)}>
                  <option value="">انتخاب کنید</option>
                  {academicYears.map((year) => (
                    <option key={year._id} value={year._id}>{year.title || year.name || year.code || 'سال تعلیمی'}</option>
                  ))}
                </select>
              </label>
              <label className="required"><span>صنف</span>
                <select value={editForm.classId} onChange={(event) => handleEditFormChange('classId', event.target.value)}>
                  <option value="">انتخاب کنید</option>
                  {classes.map((item) => (
                    <option key={item._id} value={item._id}>{item.title || item.titleDari || item.name || `صنف ${item.gradeLevel || ''}`}</option>
                  ))}
                </select>
              </label>
              <label className="required">
                <span>نوبت</span>
                <select value={editForm.shiftId} onChange={(event) => handleEditFormChange('shiftId', event.target.value)}>
                  <option value="">انتخاب کنید</option>
                  {shifts.map((item) => (
                    <option key={item._id} value={item._id}>{item.nameDari || item.name || item.title || item.code || 'نوبت'}</option>
                  ))}
                </select>
              </label>
              <label><span>تاریخ ثبت‌نام</span>
                <AfghanDateInput
                  value={editForm.enrollmentDate}
                  onChange={(value) => handleEditFormChange('enrollmentDate', value)}
                  showGregorianEquivalent
                />
              </label>
              {editForm.registrationType === 'transfer' ? (
                <>
                  <label className="required">
                    <span>مکتب قبلی</span>
                    <input value={editForm.previousSchool} onChange={(event) => handleEditFormChange('previousSchool', event.target.value)} />
                  </label>
                  <label>
                    <span>صنف قبلی</span>
                    <input value={editForm.previousGrade} onChange={(event) => handleEditFormChange('previousGrade', event.target.value)} />
                  </label>
                </>
              ) : null}

              <div className="student-edit-section-title">معلومات خانواده و سرپرست</div>
              <label className="required">
                <span>شماره تماس پدر</span>
                <input value={editForm.fatherPhone} onChange={(event) => handleEditFormChange('fatherPhone', event.target.value)} />
              </label>
              <label>
                <span>مسلک پدر</span>
                <input value={editForm.fatherOccupation} onChange={(event) => handleEditFormChange('fatherOccupation', event.target.value)} />
              </label>
              <label>
                <span>نام مادر</span>
                <input value={editForm.motherName} onChange={(event) => handleEditFormChange('motherName', event.target.value)} />
              </label>
              <label>
                <span>شماره تماس مادر</span>
                <input value={editForm.motherPhone} onChange={(event) => handleEditFormChange('motherPhone', event.target.value)} />
              </label>
              <label>
                <span>مسلک مادر</span>
                <input value={editForm.motherOccupation} onChange={(event) => handleEditFormChange('motherOccupation', event.target.value)} />
              </label>
              <label>
                <span>نام سرپرست</span>
                <input value={editForm.guardianName} onChange={(event) => handleEditFormChange('guardianName', event.target.value)} />
              </label>
              <label>
                <span>شماره تماس سرپرست</span>
                <input value={editForm.guardianPhone} onChange={(event) => handleEditFormChange('guardianPhone', event.target.value)} />
              </label>
              <label>
                <span>نسبت سرپرست</span>
                <input value={editForm.guardianRelation} onChange={(event) => handleEditFormChange('guardianRelation', event.target.value)} />
              </label>

              <div className="student-edit-section-title">معلومات صحی و اضافی</div>
              <label className="wide">
                <span>حالات صحی مزمن</span>
                <textarea value={editForm.medicalConditions} onChange={(event) => handleEditFormChange('medicalConditions', event.target.value)} />
              </label>
              <label className="wide">
                <span>حساسیت‌ها</span>
                <textarea value={editForm.allergies} onChange={(event) => handleEditFormChange('allergies', event.target.value)} />
              </label>
              <label>
                <span>نام اضطراری</span>
                <input value={editForm.emergencyContact} onChange={(event) => handleEditFormChange('emergencyContact', event.target.value)} />
              </label>
              <label>
                <span>شماره اضطراری</span>
                <input value={editForm.emergencyPhone} onChange={(event) => handleEditFormChange('emergencyPhone', event.target.value)} />
              </label>
              <label>
                <span>نوع ترانسپورت</span>
                <select value={editForm.transportation} onChange={(event) => handleEditFormChange('transportation', event.target.value)}>
                  <option value="">انتخاب کنید</option>
                  <option value="walking">پیاده</option>
                  <option value="school_bus">ترانسپورت مکتب</option>
                  <option value="private">شخصی</option>
                  <option value="parent">با والدین</option>
                </select>
              </label>
              <label>
                <span>برنامه ناهار</span>
                <select value={editForm.lunchProgram} onChange={(event) => handleEditFormChange('lunchProgram', event.target.value)}>
                  <option value="">انتخاب کنید</option>
                  <option value="included">شامل ناهار</option>
                  <option value="excluded">شامل نیست</option>
                  <option value="special">رژیم خاص</option>
                </select>
              </label>
              <label>
                <span>نیازهای خاص</span>
                <input value={editForm.specialNeeds} onChange={(event) => handleEditFormChange('specialNeeds', event.target.value)} />
              </label>
              <label className="wide">
                <span>یادداشت‌ها</span>
                <textarea value={editForm.notes} onChange={(event) => handleEditFormChange('notes', event.target.value)} />
              </label>
              <label>
                <span>وضعیت پروفایل</span>
                <select value={editForm.status} onChange={(event) => handleEditFormChange('status', event.target.value)}>
                  {cleanStatusOptions.map((status) => (
                    <option key={status.value} value={status.value}>{statusLabelMap[status.value] || displayValue(status.label)}</option>
                  ))}
                </select>
              </label>
            </div>

            <div className="student-modal-actions">
              <button type="button" className="student-btn ghost" onClick={() => setShowEdit(false)}>انصراف</button>
              <button type="button" className="student-btn primary" disabled={actionLoading === selectedStudent.profileId} onClick={saveStudentProfileComplete}>
                {actionLoading === selectedStudent.profileId ? 'در حال ذخیره...' : 'ذخیره مشخصات'}
              </button>
            </div>
          </section>
        </div>
      )}

      {showDetails && selectedStudent && (
        <div className="student-modal-backdrop" onClick={() => setShowDetails(false)}>
          <section className="student-modal" onClick={(event) => event.stopPropagation()}>
            <header>
              <div>
                <span className="student-eyebrow">پرونده شاگرد</span>
                <h2>{displayValue(selectedStudent.firstName, '')} {displayValue(selectedStudent.lastName, '')}</h2>
              </div>
              <button type="button" onClick={() => setShowDetails(false)} aria-label="بستن">
                <X size={18} />
              </button>
            </header>

            <div className="student-detail-grid">
              <article>
                <h3>معلومات شخصی</h3>
                <p><strong>نام پدر:</strong> {displayValue(selectedStudent.fatherName)}</p>
                <p><strong>نام پدرکلان:</strong> {displayValue(selectedStudent.grandfatherName)}</p>
                <p><strong>تذکره:</strong> {displayValue(selectedStudent.nationalId)}</p>
                <p><strong>شماره اساس شاگرد:</strong> {displayValue(readStudentAsasNumber(selectedStudent))}</p>
                <p><strong>تاریخ تولد:</strong> {formatBirthDate(selectedStudent.birthDate)}</p>
                <p><strong>جنسیت:</strong> {genderLabelMap[selectedStudent.gender] || displayValue(selectedStudent.gender)}</p>
              </article>
              <article>
                <h3>تماس و آدرس</h3>
                <p><strong>تلفن:</strong> {displayValue(selectedStudent.phone)}</p>
                <p><strong>ایمیل:</strong> {displayValue(selectedStudent.email)}</p>
                <p><strong>آدرس:</strong> {displayValue(selectedStudent.address)}</p>
                <p><strong>ولایت:</strong> {displayValue(getProvinceLabel(selectedStudent.province))}</p>
                <p><strong>تماس اضطراری:</strong> {displayValue(selectedStudent.emergencyContact)} - {displayValue(selectedStudent.emergencyPhone)}</p>
              </article>
              <article>
                <h3>تعلیم</h3>
                <p><strong>صنف:</strong> {displayValue(selectedStudent.classId?.title || selectedStudent.classId?.name)}</p>
                <p><strong>سال تعلیمی:</strong> {displayValue(selectedStudent.academicYearId?.title || selectedStudent.academicYearId?.name)}</p>
                <p><strong>نوبت:</strong> {displayValue(selectedStudent.shiftId?.name || selectedStudent.shiftId?.title)}</p>
                <p><strong>مکتب قبلی:</strong> {displayValue(selectedStudent.previousSchool)}</p>
                <p><strong>تاریخ ثبت:</strong> {formatDate(selectedStudent.createdAt)}</p>
              </article>
              <article>
                <h3>منبع و ویرایش</h3>
                <p><strong>منبع‌ها:</strong> {(selectedStudent.sourceTags || ['profile']).map((tag) => sourceLabelMap[tag] || tag).join('، ')}</p>
                <p><strong>عضویت مالی:</strong> {selectedStudent.financialMemberships?.length ? `${selectedStudent.financialMemberships.length} رکورد` : 'ندارد'}</p>
                <p><strong>ثبت تدریسی:</strong> {selectedStudent.educationEnrollments?.length ? `${selectedStudent.educationEnrollments.length} رکورد` : 'ندارد'}</p>
                <div className="student-detail-actions">
                  <button type="button" className="student-btn subtle" onClick={() => window.location.href = '/student-registration'}>تغییر مشخصات اصلی</button>
                  <button type="button" className="student-btn subtle" onClick={() => window.location.href = '/admin-education?section=enrollments'}>تغییر صنف/ثبت تدریسی</button>
                  <button type="button" className="student-btn subtle" onClick={() => window.location.href = '/admin-financial-memberships'}>مدیریت مالی</button>
                </div>
              </article>
              <article>
                <h3>خانواده و صحت</h3>
                <p><strong>تلفن پدر:</strong> {displayValue(selectedStudent.fatherPhone)}</p>
                <p><strong>وظیفه پدر:</strong> {displayValue(selectedStudent.fatherOccupation)}</p>
                <p><strong>نام مادر:</strong> {displayValue(selectedStudent.motherName)}</p>
                <p><strong>حالات صحی:</strong> {displayValue(selectedStudent.medicalConditions)}</p>
                <p><strong>حساسیت‌ها:</strong> {displayValue(selectedStudent.allergies)}</p>
              </article>
            </div>
          </section>
        </div>
      )}
    </main>
  );

  return (
    <div className="container mx-auto p-4 space-y-4 max-w-7xl">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">مدیریت شاگردان</h1>
          <p className="text-gray-600 mt-1">نمایش، جستجو و مدیریت شاگردان مکتب</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm">
            <Download className="w-3 h-3 mr-1" />
خروجی Excel
          </Button>
          <Button size="sm" onClick={() => window.location.href = '/student-registration'}>
            <UserPlus className="w-3 h-3 mr-1" />
ثبت شاگرد جدید
          </Button>
        </div>
      </div>

      {/* آمار */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-600">کل شاگردان</p>
                <p className="text-lg font-bold">{students.length}</p>
              </div>
              <Users className="w-6 h-6 text-blue-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-600">شاگردان فعال</p>
                <p className="text-lg font-bold text-green-600">
                  {students.filter(s => s.status === 'active').length}
                </p>
              </div>
              <Users className="w-6 h-6 text-green-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-600">پسران</p>
                <p className="text-lg font-bold text-blue-600">
                  {students.filter(s => s.gender === 'male').length}
                </p>
              </div>
              <Users className="w-6 h-6 text-blue-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-600">دختران</p>
                <p className="text-lg font-bold text-pink-600">
                  {students.filter(s => s.gender === 'female').length}
                </p>
              </div>
              <Users className="w-6 h-6 text-pink-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* فیلترها */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Filter className="w-4 h-4" />
            فیلترها
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            <div>
              <Label htmlFor="academicYearId">سال تعلیمی</Label>
              <Select value={filters.academicYearId} onValueChange={(value) => setFilters(prev => ({ ...prev, academicYearId: value }))}>
                <SelectTrigger>
                  <SelectValue placeholder="انتخاب سال تعلیمی" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">انتخاب سال تعلیمی</SelectItem>
                  {academicYears.map(year => (
                    <SelectItem key={year._id} value={year._id}>{year.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="classId">صنف</Label>
              <Select value={filters.classId} onValueChange={(value) => setFilters(prev => ({ ...prev, classId: value }))}>
                <SelectTrigger>
                  <SelectValue placeholder="انتخاب صنف" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">انتخاب صنف</SelectItem>
                  {classes.map(cls => (
                    <SelectItem key={cls._id} value={cls._id}>{cls.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="shiftId">نوبت</Label>
              <Select value={filters.shiftId} onValueChange={(value) => setFilters(prev => ({ ...prev, shiftId: value }))}>
                <SelectTrigger>
                  <SelectValue placeholder="انتخاب نوبت" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">انتخاب نوبت</SelectItem>
                  {shifts.map(shift => (
                    <SelectItem key={shift._id} value={shift._id}>{shift.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="gender">جنسیت</Label>
              <Select value={filters.gender} onValueChange={(value) => setFilters(prev => ({ ...prev, gender: value }))}>
                <SelectTrigger>
                  <SelectValue placeholder="انتخاب" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">انتخاب</SelectItem>
                  <SelectItem value="male">ذکور</SelectItem>
                  <SelectItem value="female">اناث</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="status">وضعیت</Label>
              <Select value={filters.status} onValueChange={(value) => setFilters(prev => ({ ...prev, status: value }))}>
                <SelectTrigger>
                  <SelectValue placeholder="انتخاب وضعیت" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">انتخاب وضعیت</SelectItem>
                  {statusOptions.map(option => (
                    <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="search">جستجو</Label>
              <div className="relative">
                <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 text-gray-400 w-3 h-3" />
                <Input
                  id="search"
                  placeholder="جستجو بر اساس نام یا شماره..."
                  value={filters.search}
                  onChange={(e) => setFilters(prev => ({ ...prev, search: e.target.value }))}
                  className="pl-8"
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* لیست شاگردان */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between text-base">
            <span className="flex items-center gap-2">
              <Users className="w-4 h-4" />
              لیست شاگردان ({filteredStudents.length})
            </span>
            <Button variant="outline" size="sm" onClick={fetchStudents}>
              <RefreshCw className="w-3 h-3 mr-1" />
              بروزرسانی
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {filteredStudents.length === 0 ? (
            <div className="text-center py-8">
              <Users className="w-8 h-8 text-gray-400 mx-auto mb-3" />
              <h3 className="text-base font-medium text-gray-900 mb-2">هیچ شاگردی یافت نشد</h3>
              <p className="text-sm text-gray-600">
                {students.length === 0 
                  ? 'هنوز هیچ شاگردی ثبت نشده است.' 
                  : 'با فیلترهای فعلی شاگردی پیدا نشد.'}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredStudents.map((student) => (
                <div key={student._id} className="border rounded-lg p-3 hover:bg-gray-50">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                      
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-semibold text-sm">
                            {student.firstName} {student.lastName}
                          </span>
                          <Badge className={getStatusColor(student.status)}>
                            {getStatusLabel(student.status)}
                          </Badge>
                          <Badge variant="outline">
                            {student.gender === 'male' ? 'ذکور' : 'اناث'}
                          </Badge>
                        </div>
                        
                        <div className="flex items-center gap-3 text-xs text-gray-600">
                          <span>نمبر تذکره: {student.nationalId || '---'}</span>
                          <span>شماره اساس شاگرد: {readStudentAsasNumber(student) || '---'}</span>
                          <span>صنف: {student.classId?.title}</span>
                          <span>نوبت: {student.shiftId?.name}</span>
                          <span>سال تعلیمی: {student.academicYearId?.title}</span>
                          <span>تاریخ ثبت: {formatDate(student.createdAt)}</span>
                        </div>

                        <div className="flex items-center gap-3 text-xs text-gray-500 mt-1">
                          <span className="flex items-center gap-1">
                            <Phone className="w-3 h-3" />
                            {student.phone}
                          </span>
                          {student.email && (
                            <span className="flex items-center gap-1">
                              <Mail className="w-3 h-3" />
                              {student.email}
                            </span>
                          )}
                          <span className="flex items-center gap-1">
                            <MapPin className="w-3 h-3" />
                            {getProvinceLabel(student.province)}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleViewDetails(student)}
                      >
                        <Eye className="w-3 h-3 mr-1" />
                        جزئیات
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleEdit(student)}
                      >
                        <Edit className="w-3 h-3 mr-1" />
                        ویرایش
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => handleDelete(student._id)}
                        disabled={actionLoading === student._id}
                      >
                        <Trash2 className="w-3 h-3 mr-1" />
                        {actionLoading === student._id ? 'در حال حذف...' : 'حذف'}
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* جزئیات شاگرد */}
      {showDetails && selectedStudent && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-auto p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold">جزئیات شاگرد</h3>
              <Button variant="outline" onClick={() => setShowDetails(false)}>
                <X className="w-4 h-4" />
              </Button>
            </div>
            
            <div className="space-y-6">
              <div>
              {/* معلومات شخصی */}
                                <h4 className="font-semibold mb-2">معلومات شخصی</h4>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div><strong>نام:</strong> {selectedStudent.firstName} {selectedStudent.lastName}</div>
                  <div><strong>نام پدر:</strong> {selectedStudent.fatherName}</div>
                  <div><strong>نام پدرکلان:</strong> {selectedStudent.grandfatherName}</div>
                  <div><strong>شماره تذکره:</strong> {selectedStudent.nationalId}</div>
                  <div><strong>شماره اساس شاگرد:</strong> {readStudentAsasNumber(selectedStudent) || '---'}</div>
                  <div><strong>تاریخ تولد:</strong> {formatBirthDate(selectedStudent.birthDate)}</div>
                  <div><strong>جنسیت:</strong> {selectedStudent.gender === 'male' ? 'ذکور' : 'اناث'}</div>
                  <div><strong>گروپ خونی:</strong> {selectedStudent.bloodType}</div>
                  <div><strong>وضعیت:</strong> <Badge className={getStatusColor(selectedStudent.status)}>{getStatusLabel(selectedStudent.status)}</Badge></div>
                </div>
              </div>

              <div>
              {/* معلومات تماس */}
                                <h4 className="font-semibold mb-2">معلومات تماس</h4>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div><strong>شماره تماس:</strong> {selectedStudent.phone}</div>
                  <div><strong>ایمیل:</strong> {selectedStudent.email}</div>
                  <div><strong>آدرس:</strong> {selectedStudent.address}</div>
                  <div><strong>شهر:</strong> {selectedStudent.city}</div>
                  <div><strong>ولایت:</strong> {getProvinceLabel(selectedStudent.province)}</div>
                </div>
              </div>

              <div>
              {/* معلومات تعلیمی */}
                                <h4 className="font-semibold mb-2">معلومات تعلیمی</h4>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div><strong>صنف:</strong> {selectedStudent.classId?.title}</div>
                  <div><strong>سال تعلیمی:</strong> {selectedStudent.academicYearId?.title}</div>
                  <div><strong>نوبت:</strong> {selectedStudent.shiftId?.name}</div>
                  <div><strong>مکتب قبلی:</strong> {selectedStudent.previousSchool}</div>
                  <div><strong>صنف قبلی:</strong> {selectedStudent.previousGrade}</div>
                  <div><strong>تاریخ ثبت:</strong> {formatDate(selectedStudent.createdAt)}</div>
                </div>
              </div>

              <div>
              {/* معلومات خانوادگی */}
                                <h4 className="font-semibold mb-2">معلومات خانوادگی</h4>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div><strong>نام پدر:</strong> {selectedStudent.fatherName}</div>
                  <div><strong>شماره تماس پدر:</strong> {selectedStudent.fatherPhone}</div>
                  <div><strong>مسلک پدر:</strong> {selectedStudent.fatherOccupation}</div>
                  <div><strong>نام مادر:</strong> {selectedStudent.motherName}</div>
                  <div><strong>شماره تماس مادر:</strong> {selectedStudent.motherPhone}</div>
                  <div><strong>مسلک مادر:</strong> {selectedStudent.motherOccupation}</div>
                </div>
              </div>

              <div>
              {/* معلومات صحی */}
                                <h4 className="font-semibold mb-2">معلومات صحی</h4>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div><strong>حالات صحی:</strong> {selectedStudent.medicalConditions}</div>
                  <div><strong>حساسیت‌ها:</strong> {selectedStudent.allergies}</div>
                  <div><strong>تماس اضطراری:</strong> {selectedStudent.emergencyContact}</div>
                  <div><strong>شماره اضطراری:</strong> {selectedStudent.emergencyPhone}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default StudentManagement;
