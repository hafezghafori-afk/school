import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { API_BASE } from '../config/api';
import './SawanehWorkspace.css';

const authHeaders = () => {
  const token = localStorage.getItem('token');
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {})
  };
};

const GRADES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const GRADE_LABELS = ['اول', 'دوم', 'سوم', 'چهارم', 'پنجم', 'ششم', 'هفتم', 'هشتم', 'نهم', 'دهم', 'یازدهم', 'دوازدهم'];

const MOTHER_TONGUES = [
  { value: 'dari', label: 'دری' },
  { value: 'pashto', label: 'پشتو' },
  { value: 'other', label: 'سایر' }
];

const RELATIONS = [
  { value: 'brother', label: 'برادر' },
  { value: 'paternal_uncle', label: 'کاکا' },
  { value: 'maternal_uncle', label: 'ماما' },
  { value: 'paternal_cousin', label: 'پسر کاکا' },
  { value: 'maternal_cousin', label: 'پسر ماما' },
  { value: 'other', label: 'سایر' }
];

const HEALTH_STATUSES = [
  { value: '', label: '—' },
  { value: 'good', label: 'خوب' },
  { value: 'needs_followup', label: 'نیازمند پیگیری' },
  { value: 'chronic_condition', label: 'بیماری مزمن' }
];

const CARD_STATUS_LABELS = {
  missing: 'کارت ندارد',
  draft: 'پیش‌نویس',
  active: 'فعال',
  closed: 'بسته'
};

const SEPARATION_REASONS = {
  transfer: 'تبدیلی',
  dropout: 'ترک تحصیل',
  expulsion: 'اخراج',
  graduation: 'فراغت',
  death: 'وفات',
  other: 'سایر'
};

const TIER_LABELS = {
  aali: 'اعلی', ali: 'عالی', motawaset: 'متوسط', nakam: 'ناکام', pending: 'نامشخص'
};
const PROMOTION_LABELS = {
  kamyab: 'کامیاب',
  kamyab_makeup: 'کامیاب (با حق چاره‌جویی)',
  mashroot: 'مشروط',
  nakam_senf: 'ناکام صنف',
  pending: 'نامشخص'
};
const TRANSCRIPT_STATE_LABELS = { draft: 'پیش‌نویس', finalized: 'نهایی‌شده', locked: 'قفل‌شده' };
const CATEGORY_LABELS = { religious: 'مضامین دینی', general: 'مضامین عمومی', '': 'سایر' };

const gradeNumber = (value) => {
  const match = String(value == null ? '' : value).match(/\d+/);
  if (!match) return null;
  const num = Number(match[0]);
  return num >= 1 && num <= 12 ? num : null;
};

const relationLabel = (value) => RELATIONS.find((item) => item.value === value)?.label || value;
const fmtNum = (value) => new Intl.NumberFormat('fa-AF').format(Number(value) || 0);

const studentDisplayName = (student = {}) => {
  const p = student.personalInfo || {};
  const dari = [p.firstNameDari, p.lastNameDari].filter(Boolean).join(' ').trim();
  return dari || [p.firstName, p.lastName].filter(Boolean).join(' ').trim() || 'بدون نام';
};

const emptyAddress = () => ({ province: '', district: '', villageOrStreet: '' });

const PROVINCE_LABELS = {
  kabul: 'کابل', herat: 'هرات', kandahar: 'کندهار', balkh: 'بلخ', nangarhar: 'ننگرهار',
  badakhshan: 'بدخشان', takhar: 'تخار', samangan: 'سمنگان', kunduz: 'کندز', baghlan: 'بغلان',
  farah: 'فراه', nimroz: 'نیمروز', helmand: 'هلمند', ghor: 'غور', daykundi: 'دایکندی',
  uruzgan: 'ارزگان', zabul: 'زابل', paktika: 'پکتیکا', khost: 'خوست', paktia: 'پکتیا',
  logar: 'لوگر', parwan: 'پروان', kapisa: 'کاپیسا', panjshir: 'پنجشیر', badghis: 'بادغیس',
  faryab: 'فاریاب', jowzjan: 'جوزجان', saripul: 'سرپل', bamyan: 'بامیان', ghazni: 'غزنی',
  wardak: 'وردک', laghman: 'لغمان', kunar: 'کنر', nuristan: 'نورستان'
};
const provinceLabel = (value) => PROVINCE_LABELS[value] || value || '';
const genderLabel = (value) => ({ male: 'ذکور', female: 'اناث' }[value] || value || '');

const contactToAddress = (contactInfo = {}) => ({
  province: contactInfo.province || '',
  district: contactInfo.district || '',
  villageOrStreet: contactInfo.village || contactInfo.address || ''
});

// فیلدهای نام که تغییرشان «نمبر مکتوب» می‌خواهد (قاعدهٔ وزارت — بک‌اند هم اجبار می‌کند)
const STUDENT_NAME_KEYS = [
  'firstNameDari', 'lastNameDari', 'fatherName', 'grandfatherName',
  'firstName', 'lastName', 'fatherNameEnglish'
];

// فیلدهای متنیِ سادهٔ ادیتور (جنسیت/تاریخ تولد/ولایت جدا رندر می‌شوند)
const STUDENT_EDIT_FIELDS = [
  ['firstNameDari', 'نام (دری)'], ['lastNameDari', 'تخلص (دری)'],
  ['fatherName', 'نام پدر'], ['grandfatherName', 'نام پدرکلان'],
  ['firstName', 'نام (انگلیسی)'], ['lastName', 'تخلص (انگلیسی)'], ['fatherNameEnglish', 'نام پدر (انگلیسی)'],
  ['nationality', 'تابعیت'], ['birthPlace', 'محل تولد'],
  ['tazkiraNumber', 'نمبر تذکره'], ['tazkiraVolume', 'جلد تذکره'], ['tazkiraPage', 'صفحهٔ تذکره'],
  ['fatherOccupation', 'مسلک پدر'], ['fatherResidence', 'محل بودوباش پدر'],
  ['fatherWorkplace', 'محل وظیفهٔ پدر'], ['fatherLandline', 'تلفن ثابت پدر'], ['fatherPhone', 'موبایل پدر'],
  ['phone', 'تماس متعلم'], ['mobile', 'موبایل متعلم'],
  ['district', 'سکونت اصلی — ولسوالی/ناحیه'], ['village', 'سکونت اصلی — قریه/گذر'], ['address', 'آدرس کامل']
];

const buildStudentDraft = (student = {}) => {
  const p = student.personalInfo || {};
  const idn = student.identification || {};
  const fam = student.familyInfo || {};
  const ci = student.contactInfo || {};
  return {
    firstNameDari: p.firstNameDari || '', lastNameDari: p.lastNameDari || '',
    fatherName: p.fatherName || '', grandfatherName: p.grandfatherName || '',
    firstName: p.firstName || '', lastName: p.lastName || '', fatherNameEnglish: p.fatherNameEnglish || '',
    gender: p.gender || '', nationality: p.nationality || '', birthPlace: p.birthPlace || '',
    birthDate: p.birthDate ? String(p.birthDate).slice(0, 10) : '',
    tazkiraNumber: idn.tazkiraNumber || '', tazkiraVolume: idn.tazkiraVolume || '', tazkiraPage: idn.tazkiraPage || '',
    fatherOccupation: fam.fatherOccupation || '', fatherResidence: fam.fatherResidence || '',
    fatherWorkplace: fam.fatherWorkplace || '', fatherLandline: fam.fatherLandline || '', fatherPhone: fam.fatherPhone || '',
    phone: ci.phone || '', mobile: ci.mobile || '',
    province: ci.province || '', district: ci.district || '', village: ci.village || '', address: ci.address || ''
  };
};

const shamsiDate = (value) => {
  if (!value) return '';
  try {
    return new Date(value).toLocaleDateString('fa-AF-u-ca-persian', {
      year: 'numeric', month: 'long', day: 'numeric'
    });
  } catch {
    return '';
  }
};

const Ro = ({ label, value }) => (
  <div className="sw-ro-item">
    <span className="sw-ro-label">{label}</span>
    <span className="sw-ro-value">{value || value === 0 ? value : '—'}</span>
  </div>
);

const SawanehWorkspace = () => {
  const navigate = useNavigate();
  const { studentId: routeStudentId } = useParams();

  const [listLoading, setListLoading] = useState(true);
  const [rows, setRows] = useState([]);
  const [listError, setListError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const [selectedId, setSelectedId] = useState(routeStudentId || '');
  const [card, setCard] = useState(null);
  const [cardStudent, setCardStudent] = useState(null);
  const [cardLoading, setCardLoading] = useState(false);
  const [cardError, setCardError] = useState('');
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState('');

  // فرم فیلدهای دستی
  const [form, setForm] = useState(null);
  const [remarkDraft, setRemarkDraft] = useState({ grade: null, remark: '', healthStatus: '' });
  const [remarkSaving, setRemarkSaving] = useState(false);

  const [sepDraft, setSepDraft] = useState({ letterNo: '', penaltyAmount: '', penaltyPaid: false });
  const [sepSaving, setSepSaving] = useState(false);

  // ویرایشِ مشخصاتِ خودِ شاگرد از داخلِ سوانح (برای حساب‌هایی که به «مدیریت شاگردان» دسترسی ندارند)
  const [editStudent, setEditStudent] = useState(false);
  const [studentDraft, setStudentDraft] = useState(null);
  const [nameLetterNo, setNameLetterNo] = useState('');
  const [studentSaving, setStudentSaving] = useState(false);

  // تب سوانح تعلیمی
  const [activeTab, setActiveTab] = useState('card');
  const [transcripts, setTranscripts] = useState([]);
  const [activeYearId, setActiveYearId] = useState('');
  const [transcriptBusy, setTranscriptBusy] = useState(false);
  const [examNotesDraft, setExamNotesDraft] = useState('');

  const flash = useCallback((message) => {
    setToast(message);
    window.setTimeout(() => setToast(''), 3200);
  }, []);

  const fetchList = useCallback(async () => {
    setListLoading(true);
    setListError('');
    try {
      const params = new URLSearchParams({ limit: '200' });
      if (search.trim()) params.set('q', search.trim());
      if (statusFilter !== 'all') params.set('status', statusFilter);
      const res = await fetch(`${API_BASE}/api/sawaneh/cards?${params.toString()}`, {
        headers: authHeaders()
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'خطا در دریافت فهرست');
      }
      setRows(Array.isArray(data.data) ? data.data : []);
    } catch (err) {
      setListError(err.message || 'خطا در اتصال به سرور');
      setRows([]);
    } finally {
      setListLoading(false);
    }
  }, [search, statusFilter]);

  useEffect(() => {
    const handle = window.setTimeout(fetchList, 300);
    return () => window.clearTimeout(handle);
  }, [fetchList]);

  const loadCard = useCallback(async (studentId) => {
    if (!studentId) return;
    setCardLoading(true);
    setCardError('');
    setCard(null);
    setForm(null);
    try {
      const res = await fetch(`${API_BASE}/api/sawaneh/cards/${studentId}`, {
        headers: authHeaders()
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'خطا در دریافت کارت سوانح');
      }
      const nextCard = data.data;
      setCard(nextCard);
      const student = nextCard.studentId && typeof nextCard.studentId === 'object' ? nextCard.studentId : null;
      setCardStudent(student);
      // سکونت اصلی از رکوردِ زندهٔ شاگرد (contactInfo) خوانده می‌شود؛ مقدار ذخیره‌شدهٔ کارت فقط fallback است
      const ciAddr = contactToAddress(student?.contactInfo || {});
      const storedOrigin = nextCard.originAddress || {};
      const originAddress = {
        province: ciAddr.province || storedOrigin.province || '',
        district: ciAddr.district || storedOrigin.district || '',
        villageOrStreet: ciAddr.villageOrStreet || storedOrigin.villageOrStreet || ''
      };
      setForm({
        motherTongue: nextCard.motherTongue || 'dari',
        thirdLanguage: nextCard.thirdLanguage || '',
        healthStatus: nextCard.healthStatus || '',
        currentSameAsOrigin: nextCard.currentSameAsOrigin !== false,
        originAddress,
        currentAddress: { ...emptyAddress(), ...(nextCard.currentAddress || {}) },
        relatives: Array.isArray(nextCard.relatives)
          ? nextCard.relatives.map((item) => ({
            relation: item.relation || 'brother',
            name: item.name || '',
            phone: item.phone || '',
            note: item.note || ''
          }))
          : [],
        status: nextCard.status || 'draft'
      });
      const studentGrade = gradeNumber(
        (nextCard.studentId && nextCard.studentId.academicInfo && nextCard.studentId.academicInfo.currentGrade) || ''
      );
      setRemarkDraft({ grade: studentGrade, remark: '', healthStatus: '' });
      setSepDraft({
        letterNo: nextCard.separation?.letterNo || '',
        penaltyAmount: nextCard.separation?.penaltyAmount ? String(nextCard.separation.penaltyAmount) : '',
        penaltyPaid: Boolean(nextCard.separation?.penaltyPaid)
      });
    } catch (err) {
      setCardError(err.message || 'خطا در اتصال به سرور');
    } finally {
      setCardLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedId) loadCard(selectedId);
  }, [selectedId, loadCard]);

  const selectStudent = (studentId) => {
    setSelectedId(studentId);
    navigate(`/afghan-sawaneh/${studentId}`, { replace: true });
  };

  const updateForm = (patch) => setForm((prev) => ({ ...prev, ...patch }));
  const updateCurrent = (patch) => setForm((prev) => ({
    ...prev,
    currentAddress: { ...prev.currentAddress, ...patch }
  }));

  const addRelative = () => setForm((prev) => ({
    ...prev,
    relatives: [...prev.relatives, { relation: 'brother', name: '', phone: '', note: '' }]
  }));
  const updateRelative = (index, patch) => setForm((prev) => ({
    ...prev,
    relatives: prev.relatives.map((item, idx) => (idx === index ? { ...item, ...patch } : item))
  }));
  const removeRelative = (index) => setForm((prev) => ({
    ...prev,
    relatives: prev.relatives.filter((_, idx) => idx !== index)
  }));

  const saveCard = async () => {
    if (!selectedId || !form) return;
    setSaving(true);
    setCardError('');
    try {
      const payload = {
        motherTongue: form.motherTongue,
        thirdLanguage: form.thirdLanguage,
        healthStatus: form.healthStatus,
        currentSameAsOrigin: form.currentSameAsOrigin,
        originAddress: form.originAddress,
        currentAddress: form.currentSameAsOrigin ? form.originAddress : form.currentAddress,
        relatives: form.relatives.filter((item) => item.name.trim() || item.phone.trim()),
        status: form.status
      };
      const res = await fetch(`${API_BASE}/api/sawaneh/cards/${selectedId}`, {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'ذخیره ناموفق بود');
      }
      setCard(data.data);
      flash('کارت سوانح ذخیره شد.');
      fetchList();
    } catch (err) {
      setCardError(err.message || 'خطا در ذخیره');
    } finally {
      setSaving(false);
    }
  };

  const saveRemark = async () => {
    if (!selectedId || !remarkDraft.grade) return;
    setRemarkSaving(true);
    setCardError('');
    try {
      const res = await fetch(`${API_BASE}/api/sawaneh/cards/${selectedId}/supervisor-remark`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          grade: remarkDraft.grade,
          remark: remarkDraft.remark,
          healthStatus: remarkDraft.healthStatus
        })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'ثبت نظر ناموفق بود');
      }
      setCard(data.data);
      setRemarkDraft((prev) => ({ ...prev, remark: '', healthStatus: '' }));
      flash('نظر نگرانِ صنف ثبت شد.');
      fetchList();
    } catch (err) {
      setCardError(err.message || 'خطا در ثبت نظر');
    } finally {
      setRemarkSaving(false);
    }
  };

  const saveSeparation = async () => {
    if (!selectedId) return;
    setSepSaving(true);
    setCardError('');
    try {
      const res = await fetch(`${API_BASE}/api/sawaneh/cards/${selectedId}/separation`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          letterNo: sepDraft.letterNo,
          penaltyAmount: sepDraft.penaltyAmount === '' ? 0 : Number(sepDraft.penaltyAmount),
          penaltyPaid: sepDraft.penaltyPaid
        })
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || 'ذخیره ناموفق بود');
      setCard(data.data);
      flash('جزئیاتِ منفکی ذخیره شد.');
    } catch (err) {
      setCardError(err.message || 'خطا در ذخیرهٔ منفکی');
    } finally {
      setSepSaving(false);
    }
  };

  const startEditStudent = () => {
    setStudentDraft(buildStudentDraft(cardStudent || {}));
    setNameLetterNo('');
    setCardError('');
    setEditStudent(true);
  };
  const cancelEditStudent = () => {
    setEditStudent(false);
    setStudentDraft(null);
    setNameLetterNo('');
  };
  const updateStudentDraft = (patch) => setStudentDraft((prev) => ({ ...prev, ...patch }));

  const studentNameChanged = Boolean(
    editStudent && studentDraft && cardStudent
    && STUDENT_NAME_KEYS.some((key) => {
      const original = buildStudentDraft(cardStudent)[key] || '';
      return (studentDraft[key] || '').trim() !== original.trim();
    })
  );

  const saveStudent = async () => {
    if (!cardStudent?._id || !studentDraft) return;
    if (studentNameChanged && !nameLetterNo.trim()) {
      setCardError('برای تغییرِ نام/تخلص/نام پدر، «نمبر مکتوب» الزامی است.');
      return;
    }
    setStudentSaving(true);
    setCardError('');
    try {
      const d = studentDraft;
      const payload = {
        'personalInfo.grandfatherName': d.grandfatherName.trim(),
        'personalInfo.fatherNameEnglish': d.fatherNameEnglish.trim(),
        'personalInfo.nationality': d.nationality.trim() || 'Afghan',
        'identification.tazkiraVolume': d.tazkiraVolume.trim(),
        'identification.tazkiraPage': d.tazkiraPage.trim(),
        'familyInfo.fatherOccupation': d.fatherOccupation.trim(),
        'familyInfo.fatherResidence': d.fatherResidence.trim(),
        'familyInfo.fatherWorkplace': d.fatherWorkplace.trim(),
        'familyInfo.fatherLandline': d.fatherLandline.trim(),
        'familyInfo.fatherPhone': d.fatherPhone.trim(),
        'contactInfo.phone': d.phone.trim(),
        'contactInfo.mobile': d.mobile.trim(),
        'contactInfo.village': d.village.trim()
      };
      // فیلدهای الزامیِ مدل: فقط وقتی مقدار دارند فرستاده شوند تا خالی‌کردنِ سهویْ خطای اعتبارسنجی نسازد
      const setRequired = (key, value) => { if (String(value || '').trim()) payload[key] = String(value).trim(); };
      setRequired('personalInfo.firstNameDari', d.firstNameDari);
      setRequired('personalInfo.lastNameDari', d.lastNameDari);
      setRequired('personalInfo.firstName', d.firstName || d.firstNameDari);
      setRequired('personalInfo.lastName', d.lastName || d.lastNameDari);
      setRequired('personalInfo.fatherName', d.fatherName);
      setRequired('personalInfo.gender', d.gender);
      setRequired('personalInfo.birthPlace', d.birthPlace);
      setRequired('personalInfo.birthDate', d.birthDate);
      setRequired('identification.tazkiraNumber', d.tazkiraNumber);
      setRequired('contactInfo.province', d.province);
      setRequired('contactInfo.district', d.district);
      setRequired('contactInfo.address', d.address);
      if (studentNameChanged) payload.nameCorrectionLetterNo = nameLetterNo.trim();

      const res = await fetch(`${API_BASE}/api/afghan-students/${cardStudent._id}`, {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || 'ذخیرهٔ مشخصات شاگرد ناموفق بود');
      flash('مشخصات شاگرد ذخیره شد.');
      setEditStudent(false);
      setStudentDraft(null);
      setNameLetterNo('');
      await loadCard(selectedId);
      fetchList();
    } catch (err) {
      setCardError(err.message || 'خطا در ذخیرهٔ مشخصات شاگرد');
    } finally {
      setStudentSaving(false);
    }
  };

  const remarkByGrade = useMemo(() => {
    const map = new Map();
    (card?.supervisorRemarks || []).forEach((item) => map.set(Number(item.grade), item));
    return map;
  }, [card]);

  // ---- سوانح تعلیمی ----
  const loadTranscripts = useCallback(async (studentId) => {
    if (!studentId) return;
    try {
      const res = await fetch(`${API_BASE}/api/sawaneh/transcripts/${studentId}`, { headers: authHeaders() });
      const data = await res.json();
      if (res.ok && data.success) {
        const list = Array.isArray(data.data) ? data.data : [];
        setTranscripts(list);
        setActiveYearId((prev) => prev || (list[0] ? String(list[0].academicYearId?._id || list[0].academicYearId) : ''));
      } else {
        setTranscripts([]);
      }
    } catch {
      setTranscripts([]);
    }
  }, []);

  useEffect(() => {
    if (selectedId) loadTranscripts(selectedId);
    setActiveYearId('');
    setActiveTab('card');
  }, [selectedId, loadTranscripts]);

  const activeTranscript = useMemo(() => {
    if (!activeYearId) return null;
    return transcripts.find((item) => String(item.academicYearId?._id || item.academicYearId) === String(activeYearId)) || null;
  }, [transcripts, activeYearId]);

  useEffect(() => {
    setExamNotesDraft(activeTranscript?.examNotes || '');
  }, [activeTranscript]);

  const studentYearId = cardStudent?.academicInfo?.academicYearId
    ? String(cardStudent.academicInfo.academicYearId._id || cardStudent.academicInfo.academicYearId)
    : '';

  const runTranscript = async (path, method = 'POST', body) => {
    if (!selectedId) return;
    setTranscriptBusy(true);
    setCardError('');
    try {
      const res = await fetch(`${API_BASE}/api/sawaneh/transcripts/${selectedId}${path}`, {
        method,
        headers: authHeaders(),
        ...(body ? { body: JSON.stringify(body) } : {})
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || 'عملیات ناموفق بود');
      await loadTranscripts(selectedId);
      if (data.data?.academicYearId) {
        setActiveYearId(String(data.data.academicYearId?._id || data.data.academicYearId));
      }
      flash(data.message || 'انجام شد.');
    } catch (err) {
      setCardError(err.message || 'خطا در عملیات سوانح تعلیمی');
    } finally {
      setTranscriptBusy(false);
    }
  };

  const rebuildTranscript = () => {
    const yearId = activeYearId || studentYearId;
    if (!yearId) {
      setCardError('سال تحصیلیِ فعالِ شاگرد مشخص نیست.');
      return;
    }
    runTranscript(`/${yearId}/rebuild`);
  };
  const saveExamNotes = () => activeYearId && runTranscript(`/${activeYearId}`, 'PUT', { examNotes: examNotesDraft });
  const finalizeTranscript = () => activeYearId && runTranscript(`/${activeYearId}/finalize`);
  const reopenTranscript = () => activeYearId && runTranscript(`/${activeYearId}/reopen`);
  const lockTranscript = () => {
    if (!activeYearId) return;
    if (!window.confirm('پس از قفل، سوانح تعلیمیِ این سال غیرقابل تغییر می‌شود. ادامه؟')) return;
    runTranscript(`/${activeYearId}/lock`);
  };

  const openPrint = (printForm, query = {}) => {
    if (!selectedId) return;
    const search = new URLSearchParams({ form: printForm, ...query }).toString();
    window.open(`/afghan-sawaneh/${selectedId}/print?${search}`, '_blank', 'noopener');
  };

  const currentStudentGrade = gradeNumber(cardStudent?.academicInfo?.currentGrade || '');

  return (
    <div className="sawaneh-workspace" dir="rtl">
      <header className="sw-header">
        <div>
          <h1>پرونده‌های سوانح شاگرد</h1>
          <p>کارت سوانح متعلم — مکاتب افغانستان</p>
        </div>
        <div className="sw-header-actions">
          <button type="button" className="sw-btn sw-btn-ghost" onClick={() => navigate('/afghan-sawaneh/reports')}>
            گزارش‌های سوانح
          </button>
          <button type="button" className="sw-btn sw-btn-ghost" onClick={() => navigate('/afghan-dashboard')}>
            بازگشت به داشبورد
          </button>
        </div>
      </header>

      <div className="sw-body">
        <aside className="sw-list">
          <div className="sw-list-controls">
            <input
              type="search"
              placeholder="جستجو: نام، نام پدر، نمبر اساس…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="all">همه</option>
              <option value="missing">کارت ندارد</option>
              <option value="draft">پیش‌نویس</option>
              <option value="active">فعال</option>
            </select>
          </div>

          {listLoading && <div className="sw-muted">در حال بارگذاری…</div>}
          {listError && <div className="sw-error">{listError}</div>}
          {!listLoading && !listError && rows.length === 0 && (
            <div className="sw-muted">شاگردی یافت نشد.</div>
          )}

          <ul>
            {rows.map(({ student, cardStatus, hasCurrentGradeRemark }) => {
              const grade = gradeNumber(student.academicInfo?.currentGrade);
              return (
                <li key={student._id}>
                  <button
                    type="button"
                    className={selectedId === student._id ? 'is-selected' : ''}
                    onClick={() => selectStudent(student._id)}
                  >
                    <span className="sw-list-name">{studentDisplayName(student)}</span>
                    <span className="sw-list-meta">
                      {student.asasNumber ? `اساس ${student.asasNumber}` : 'بدون نمبر اساس'}
                      {grade ? ` · صنف ${GRADE_LABELS[grade - 1]}` : ''}
                    </span>
                    <span className="sw-chips">
                      <span className={`sw-chip sw-chip-${cardStatus}`}>
                        {CARD_STATUS_LABELS[cardStatus] || cardStatus}
                      </span>
                      {cardStatus !== 'missing' && (
                        <span className={`sw-chip ${hasCurrentGradeRemark ? 'sw-chip-ok' : 'sw-chip-warn'}`}>
                          {hasCurrentGradeRemark ? 'نظر صنف: ثبت‌شده' : 'نظر صنف: خالی'}
                        </span>
                      )}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </aside>

        <section className="sw-detail">
          {!selectedId && <div className="sw-placeholder">یک شاگرد را از فهرست انتخاب کنید.</div>}
          {selectedId && cardLoading && <div className="sw-placeholder">در حال بارگذاری کارت…</div>}
          {selectedId && !cardLoading && cardError && <div className="sw-error">{cardError}</div>}

          {selectedId && !cardLoading && card && form && (
            <>
              <div className="sw-card-head">
                <div>
                  <h2>{studentDisplayName(cardStudent || {})}</h2>
                  <p className="sw-muted">
                    {cardStudent?.personalInfo?.fatherName ? `ولد ${cardStudent.personalInfo.fatherName}` : ''}
                    {cardStudent?.asasNumber ? ` · نمبر اساس ${cardStudent.asasNumber}` : ''}
                    {currentStudentGrade ? ` · صنف ${GRADE_LABELS[currentStudentGrade - 1]}` : ''}
                  </p>
                </div>
                {activeTab === 'card' && (
                  <div className="sw-card-head-actions">
                    <label className="sw-status-toggle">
                      وضعیت کارت
                      <select
                        value={form.status}
                        onChange={(event) => updateForm({ status: event.target.value })}
                      >
                        <option value="draft">پیش‌نویس</option>
                        <option value="active">فعال</option>
                      </select>
                    </label>
                    <button type="button" className="sw-btn" onClick={() => openPrint('card')}>چاپ کارت</button>
                    <button type="button" className="sw-btn" onClick={() => openPrint('full')}>چاپ پروندهٔ کامل</button>
                    <button type="button" className="sw-btn sw-btn-primary" onClick={saveCard} disabled={saving}>
                      {saving ? 'در حال ذخیره…' : 'ذخیرهٔ کارت'}
                    </button>
                  </div>
                )}
              </div>

              <div className="sw-tabs">
                <button
                  type="button"
                  className={activeTab === 'card' ? 'is-active' : ''}
                  onClick={() => setActiveTab('card')}
                >
                  کارت سوانح
                </button>
                <button
                  type="button"
                  className={activeTab === 'transcript' ? 'is-active' : ''}
                  onClick={() => setActiveTab('transcript')}
                >
                  سوانح تعلیمی
                </button>
              </div>

              {toast && <div className="sw-toast">{toast}</div>}

              {activeTab === 'transcript' && (
                <div className="sw-transcript">
                  <div className="sw-transcript-bar">
                    <div className="sw-year-chips">
                      {transcripts.length === 0 && <span className="sw-muted">هنوز سوانح تعلیمی ساخته نشده.</span>}
                      {transcripts.map((item) => {
                        const yid = String(item.academicYearId?._id || item.academicYearId);
                        return (
                          <button
                            key={yid}
                            type="button"
                            className={activeYearId === yid ? 'is-active' : ''}
                            onClick={() => setActiveYearId(yid)}
                          >
                            {item.yearLabel || item.academicYearId?.title || 'سال'}
                            {item.grade ? ` · صنف ${GRADE_LABELS[item.grade - 1]}` : ''}
                          </button>
                        );
                      })}
                    </div>
                    <div className="sw-transcript-bar-actions">
                      {activeYearId && (
                        <button type="button" className="sw-btn" onClick={() => openPrint('transcript', { year: activeYearId })}>
                          چاپ سوانح تعلیمی
                        </button>
                      )}
                      <button
                        type="button"
                        className="sw-btn sw-btn-primary"
                        onClick={rebuildTranscript}
                        disabled={transcriptBusy}
                      >
                        {transcriptBusy ? 'در حال پردازش…' : 'به‌روزرسانی از نمرات'}
                      </button>
                    </div>
                  </div>

                  {!activeTranscript && (
                    <p className="sw-muted">
                      برای سالِ جاری «به‌روزرسانی از نمرات» را بزنید تا سوانح تعلیمی از نتایج امتحانات ساخته شود.
                    </p>
                  )}

                  {activeTranscript && (
                    <>
                      <div className="sw-transcript-state">
                        <span className={`sw-chip sw-chip-${activeTranscript.state === 'locked' ? 'closed' : activeTranscript.state === 'finalized' ? 'active' : 'draft'}`}>
                          {TRANSCRIPT_STATE_LABELS[activeTranscript.state]}
                        </span>
                        {activeTranscript.rankProvisional && <span className="sw-hint">رتبه موقتی است</span>}
                        <div className="sw-transcript-actions">
                          {activeTranscript.state === 'draft' && (
                            <button type="button" className="sw-btn" onClick={finalizeTranscript} disabled={transcriptBusy}>نهایی‌سازی</button>
                          )}
                          {activeTranscript.state === 'finalized' && (
                            <>
                              <button type="button" className="sw-btn" onClick={reopenTranscript} disabled={transcriptBusy}>بازگشایی</button>
                              <button type="button" className="sw-btn sw-btn-primary" onClick={lockTranscript} disabled={transcriptBusy}>قفل و مهر</button>
                            </>
                          )}
                        </div>
                      </div>

                      <div className="sw-transcript-cols">
                        <div className="sw-table-wrap">
                          <table>
                            <thead>
                              <tr>
                                <th>مضمون</th>
                                <th>سویه</th>
                                <th>چهارونیم‌ماهه</th>
                                <th>سالانه</th>
                                <th>مجموع</th>
                                <th>وضعیت</th>
                              </tr>
                            </thead>
                            <tbody>
                              {['religious', 'general', ''].map((cat) => {
                                const catRows = (activeTranscript.rows || []).filter((row) => (row.category || '') === cat);
                                if (catRows.length === 0) return null;
                                return (
                                  <React.Fragment key={cat || 'other'}>
                                    <tr className="sw-cat-row"><td colSpan={6}>{CATEGORY_LABELS[cat]}</td></tr>
                                    {catRows.map((row, idx) => (
                                      <tr key={`${cat}-${idx}`} className={row.subjectPassed === false ? 'sw-row-fail' : ''}>
                                        <td>{row.subjectLabel}{row.isManual ? ' ✎' : ''}</td>
                                        <td>{row.sawiyaMark ?? '—'}</td>
                                        <td>{row.midYearMark ?? '—'}</td>
                                        <td>{row.finalMark ?? '—'}</td>
                                        <td>{row.annualMark ?? '—'}</td>
                                        <td>{row.subjectPassed === null || row.subjectPassed === undefined ? '—' : row.subjectPassed ? 'کامیاب' : 'ناکام'}</td>
                                      </tr>
                                    ))}
                                  </React.Fragment>
                                );
                              })}
                              <tr className="sw-sum-row">
                                <td>مجموعه</td>
                                <td colSpan={3} />
                                <td>{fmtNum(activeTranscript.totalObtained)}</td>
                                <td />
                              </tr>
                              <tr className="sw-sum-row">
                                <td>اوسط نمرات</td>
                                <td colSpan={3} />
                                <td>{activeTranscript.average}</td>
                                <td>{TIER_LABELS[activeTranscript.resultTier]}</td>
                              </tr>
                              <tr className="sw-sum-row">
                                <td>نتیجه</td>
                                <td colSpan={3} />
                                <td colSpan={2}>{PROMOTION_LABELS[activeTranscript.promotionStatus]}</td>
                              </tr>
                              <tr className="sw-sum-row">
                                <td>درجه (رتبه در صنف)</td>
                                <td colSpan={3} />
                                <td colSpan={2}>
                                  {activeTranscript.rank
                                    ? `${fmtNum(activeTranscript.rank)} از ${fmtNum(activeTranscript.classSize || 0)}`
                                    : '—'}
                                </td>
                              </tr>
                            </tbody>
                          </table>
                        </div>

                        <div className="sw-attend-card">
                          <h4>حاضری</h4>
                          <dl>
                            <div><dt>ایام سال تعلیمی</dt><dd>{fmtNum(activeTranscript.attendance?.schoolDays)}</dd></div>
                            <div><dt>حاضر</dt><dd>{fmtNum(activeTranscript.attendance?.present)}</dd></div>
                            <div><dt>غیرحاضر</dt><dd>{fmtNum(activeTranscript.attendance?.absent)}</dd></div>
                            <div><dt>مریض</dt><dd>{fmtNum(activeTranscript.attendance?.sick)}</dd></div>
                            <div><dt>رخصت</dt><dd>{fmtNum(activeTranscript.attendance?.leave)}</dd></div>
                          </dl>
                        </div>
                      </div>

                      <label className="sw-exam-notes">
                        توضیحات در مورد امتحانات متعلم
                        <textarea
                          rows={3}
                          value={examNotesDraft}
                          disabled={activeTranscript.state === 'locked'}
                          onChange={(event) => setExamNotesDraft(event.target.value)}
                        />
                        {activeTranscript.state !== 'locked' && (
                          <button type="button" className="sw-btn" onClick={saveExamNotes} disabled={transcriptBusy}>
                            ذخیرهٔ توضیحات
                          </button>
                        )}
                      </label>
                    </>
                  )}
                </div>
              )}

              {activeTab === 'card' && (
              <>
              <section className="sw-section sw-section-wide sw-readonly">
                <div className="sw-ro-head">
                  <h3>معلومات از پروندهٔ شاگرد</h3>
                  <div className="sw-ro-head-actions">
                    {!editStudent && (
                      <>
                        <span className="sw-hint">روی پروندهٔ اصلیِ شاگرد ذخیره می‌شود.</span>
                        <button type="button" className="sw-btn" onClick={startEditStudent}>ویرایش مشخصات</button>
                        {cardStudent?._id && (
                          <button
                            type="button"
                            className="sw-btn sw-btn-ghost"
                            onClick={() => window.open(`/student-management/${cardStudent._id}`, '_blank', 'noopener')}
                          >
                            بازکردن در مدیریت شاگرد
                          </button>
                        )}
                      </>
                    )}
                    {editStudent && (
                      <>
                        <button type="button" className="sw-btn sw-btn-primary" onClick={saveStudent} disabled={studentSaving}>
                          {studentSaving ? 'در حال ذخیره…' : 'ذخیرهٔ مشخصات'}
                        </button>
                        <button type="button" className="sw-btn sw-btn-ghost" onClick={cancelEditStudent} disabled={studentSaving}>
                          انصراف
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {editStudent && studentDraft && (
                  <>
                    <div className="sw-ro-grid sw-ro-edit">
                      {STUDENT_EDIT_FIELDS.map(([key, label]) => (
                        <label className="sw-ro-item" key={key}>
                          <span className="sw-ro-label">{label}</span>
                          <input
                            type="text"
                            value={studentDraft[key]}
                            onChange={(event) => updateStudentDraft({ [key]: event.target.value })}
                          />
                        </label>
                      ))}
                      <label className="sw-ro-item">
                        <span className="sw-ro-label">جنسیت</span>
                        <select value={studentDraft.gender} onChange={(event) => updateStudentDraft({ gender: event.target.value })}>
                          <option value="">—</option>
                          <option value="male">ذکور</option>
                          <option value="female">اناث</option>
                        </select>
                      </label>
                      <label className="sw-ro-item">
                        <span className="sw-ro-label">تاریخ تولد (میلادی)</span>
                        <input
                          type="date"
                          value={studentDraft.birthDate}
                          onChange={(event) => updateStudentDraft({ birthDate: event.target.value })}
                        />
                      </label>
                      <label className="sw-ro-item">
                        <span className="sw-ro-label">سکونت اصلی — ولایت</span>
                        <select value={studentDraft.province} onChange={(event) => updateStudentDraft({ province: event.target.value })}>
                          <option value="">—</option>
                          {Object.entries(PROVINCE_LABELS).map(([value, label]) => (
                            <option key={value} value={value}>{label}</option>
                          ))}
                        </select>
                      </label>
                    </div>
                    {studentNameChanged && (
                      <label className="sw-ro-letter">
                        <span>نمبر مکتوبِ اصلاح شهرت (الزامی)</span>
                        <input
                          type="text"
                          value={nameLetterNo}
                          onChange={(event) => setNameLetterNo(event.target.value)}
                          placeholder="نمبر و تاریخِ مکتوب رسمی"
                        />
                      </label>
                    )}
                    <p className="sw-hint">
                      تغییرِ نام/تخلص/نام پدر بدون «نمبر مکتوب» ثبت نمی‌شود و به‌صورت خودکار در «اصلاح شهرت» کارت درج می‌گردد.
                    </p>
                  </>
                )}

                {!editStudent && (() => {
                  const p = cardStudent?.personalInfo || {};
                  const idn = cardStudent?.identification || {};
                  const fam = cardStudent?.familyInfo || {};
                  const ci = cardStudent?.contactInfo || {};
                  const school = card?.schoolId && typeof card.schoolId === 'object' ? card.schoolId : null;
                  return (
                    <div className="sw-ro-grid">
                      <Ro label="نام (دری)" value={p.firstNameDari} />
                      <Ro label="تخلص (دری)" value={p.lastNameDari} />
                      <Ro label="نام پدر" value={p.fatherName} />
                      <Ro label="نام پدرکلان" value={p.grandfatherName} />
                      <Ro label="نام (انگلیسی)" value={p.firstName} />
                      <Ro label="تخلص (انگلیسی)" value={p.lastName} />
                      <Ro label="نام پدر (انگلیسی)" value={p.fatherNameEnglish} />
                      <Ro label="جنسیت" value={genderLabel(p.gender)} />
                      <Ro label="تابعیت" value={p.nationality} />
                      <Ro label="تاریخ تولد" value={shamsiDate(p.birthDate)} />
                      <Ro label="محل تولد" value={p.birthPlace} />
                      <Ro label="نمبر تذکره" value={idn.tazkiraNumber} />
                      <Ro label="جلد تذکره" value={idn.tazkiraVolume} />
                      <Ro label="صفحهٔ تذکره" value={idn.tazkiraPage} />
                      <Ro label="مسلک پدر" value={fam.fatherOccupation} />
                      <Ro label="محل بودوباش پدر" value={fam.fatherResidence} />
                      <Ro label="محل وظیفهٔ پدر" value={fam.fatherWorkplace} />
                      <Ro label="تلفن ثابت پدر" value={fam.fatherLandline} />
                      <Ro label="موبایل پدر" value={fam.fatherPhone} />
                      <Ro label="تماس متعلم" value={ci.phone} />
                      <Ro label="موبایل متعلم" value={ci.mobile} />
                      <Ro label="سکونت اصلی — ولایت" value={provinceLabel(ci.province)} />
                      <Ro label="سکونت اصلی — ولسوالی/ناحیه" value={ci.district} />
                      <Ro label="سکونت اصلی — قریه/گذر" value={ci.village} />
                      <Ro label="آدرس کامل" value={ci.address} />
                      <Ro label="مکتب" value={school?.nameDari || school?.name} />
                      <Ro label="صنف" value={currentStudentGrade ? GRADE_LABELS[currentStudentGrade - 1] : ''} />
                      <Ro label="نمبر اساس" value={cardStudent?.asasNumber} />
                    </div>
                  );
                })()}
              </section>

              <div className="sw-grid">
                <fieldset className="sw-section">
                  <legend>زبان و وضع صحی</legend>
                  <label>
                    زبان مادری
                    <select
                      value={form.motherTongue}
                      onChange={(event) => updateForm({ motherTongue: event.target.value })}
                    >
                      {MOTHER_TONGUES.map((item) => (
                        <option key={item.value} value={item.value}>{item.label}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    لسان سوم
                    <input
                      type="text"
                      value={form.thirdLanguage}
                      onChange={(event) => updateForm({ thirdLanguage: event.target.value })}
                    />
                  </label>
                  <label>
                    وضع صحی
                    <select
                      value={form.healthStatus}
                      onChange={(event) => updateForm({ healthStatus: event.target.value })}
                    >
                      {HEALTH_STATUSES.map((item) => (
                        <option key={item.value} value={item.value}>{item.label}</option>
                      ))}
                    </select>
                  </label>
                </fieldset>

                <fieldset className="sw-section">
                  <legend>سکونت فعلی</legend>
                  <label className="sw-checkbox">
                    <input
                      type="checkbox"
                      checked={form.currentSameAsOrigin}
                      onChange={(event) => updateForm({ currentSameAsOrigin: event.target.checked })}
                    />
                    مثل سکونت اصلی
                  </label>
                  {form.currentSameAsOrigin && (
                    <p className="sw-hint">
                      {[provinceLabel(form.originAddress.province), form.originAddress.district, form.originAddress.villageOrStreet]
                        .filter(Boolean).join(' — ') || 'همان سکونت اصلیِ رکورد شاگرد'}
                    </p>
                  )}
                  {!form.currentSameAsOrigin && (
                    <>
                      <label>
                        ولایت
                        <input
                          type="text"
                          value={form.currentAddress.province}
                          onChange={(event) => updateCurrent({ province: event.target.value })}
                        />
                      </label>
                      <label>
                        ولسوالی / ناحیه
                        <input
                          type="text"
                          value={form.currentAddress.district}
                          onChange={(event) => updateCurrent({ district: event.target.value })}
                        />
                      </label>
                      <label>
                        قریه / گذر
                        <input
                          type="text"
                          value={form.currentAddress.villageOrStreet}
                          onChange={(event) => updateCurrent({ villageOrStreet: event.target.value })}
                        />
                      </label>
                    </>
                  )}
                </fieldset>
              </div>

              <fieldset className="sw-section sw-section-wide">
                <legend>اقارب نزدیک</legend>
                {form.relatives.length === 0 && <p className="sw-muted">ثبت نشده.</p>}
                {form.relatives.map((relative, index) => (
                  <div className="sw-relative-row" key={index}>
                    <select
                      value={relative.relation}
                      onChange={(event) => updateRelative(index, { relation: event.target.value })}
                    >
                      {RELATIONS.map((item) => (
                        <option key={item.value} value={item.value}>{item.label}</option>
                      ))}
                    </select>
                    <input
                      type="text"
                      placeholder="نام"
                      value={relative.name}
                      onChange={(event) => updateRelative(index, { name: event.target.value })}
                    />
                    <input
                      type="text"
                      placeholder="تماس"
                      value={relative.phone}
                      onChange={(event) => updateRelative(index, { phone: event.target.value })}
                    />
                    <input
                      type="text"
                      placeholder="یادداشت"
                      value={relative.note}
                      onChange={(event) => updateRelative(index, { note: event.target.value })}
                    />
                    <button type="button" className="sw-btn sw-btn-ghost" onClick={() => removeRelative(index)}>
                      حذف
                    </button>
                  </div>
                ))}
                <button type="button" className="sw-btn sw-btn-ghost" onClick={addRelative}>
                  + افزودن اقارب
                </button>
              </fieldset>

              <fieldset className="sw-section sw-section-wide">
                <legend>شمولیت (نمبر اساس در مکاتب)</legend>
                {(card.enrollmentHistory || []).length === 0 && <p className="sw-muted">ثبت نشده.</p>}
                {(card.enrollmentHistory || []).length > 0 && (
                  <div className="sw-table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>نام مدرسه</th>
                          <th>نمبر اساس</th>
                          <th>صنف</th>
                          <th>تاریخ</th>
                          <th>نمبر مکتوب</th>
                          <th>نوع</th>
                        </tr>
                      </thead>
                      <tbody>
                        {card.enrollmentHistory.map((row, index) => (
                          <tr key={index}>
                            <td>{row.schoolName || '—'}</td>
                            <td>{row.asasNumber || '—'}</td>
                            <td>{row.grade ? GRADE_LABELS[row.grade - 1] : '—'}</td>
                            <td>{row.dateLocal || '—'}</td>
                            <td>{row.letterNo || '—'}</td>
                            <td>
                              {row.kind === 'initial' && 'شمولیت اولیه'}
                              {row.kind === 'transfer_in' && 'تبدیلی ورودی'}
                              {row.kind === 're_admission' && 'شمولیت مجدد'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </fieldset>

              {(card.nameCorrections || []).length > 0 && (
                <fieldset className="sw-section sw-section-wide">
                  <legend>اصلاح شهرت</legend>
                  <div className="sw-table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>مورد</th>
                          <th>قبلی</th>
                          <th>جدید</th>
                          <th>نمبر مکتوب</th>
                          <th>تاریخ</th>
                        </tr>
                      </thead>
                      <tbody>
                        {card.nameCorrections.map((row, index) => (
                          <tr key={index}>
                            <td>{row.field}</td>
                            <td>{row.oldValue || '—'}</td>
                            <td>{row.newValue || '—'}</td>
                            <td>{row.letterNo || '—'}</td>
                            <td>{row.dateLocal || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </fieldset>
              )}

              <fieldset className="sw-section sw-section-wide">
                <legend>نظریات نگرانِ صنف و وضع صحی</legend>
                <div className="sw-table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>صنف</th>
                        <th>اسم نگران</th>
                        <th>نظریات</th>
                        <th>وضع صحی</th>
                      </tr>
                    </thead>
                    <tbody>
                      {GRADES.map((grade) => {
                        const entry = remarkByGrade.get(grade);
                        const isEditable = remarkDraft.grade === grade;
                        return (
                          <tr key={grade} className={isEditable ? 'sw-row-active' : ''}>
                            <td>{GRADE_LABELS[grade - 1]}</td>
                            <td>{entry?.supervisorName || '—'}</td>
                            <td>
                              {isEditable ? (
                                <textarea
                                  rows={2}
                                  value={remarkDraft.remark}
                                  placeholder={entry?.remark || 'نظر نگرانِ صنف…'}
                                  onChange={(event) => setRemarkDraft((prev) => ({ ...prev, remark: event.target.value }))}
                                />
                              ) : (
                                entry?.remark || '—'
                              )}
                            </td>
                            <td>
                              {isEditable ? (
                                <select
                                  value={remarkDraft.healthStatus}
                                  onChange={(event) => setRemarkDraft((prev) => ({ ...prev, healthStatus: event.target.value }))}
                                >
                                  {HEALTH_STATUSES.map((item) => (
                                    <option key={item.value} value={item.value}>{item.label}</option>
                                  ))}
                                </select>
                              ) : (
                                HEALTH_STATUSES.find((item) => item.value === (entry?.healthStatus || ''))?.label || '—'
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="sw-remark-actions">
                  <label>
                    صنفِ ثبت نظر
                    <select
                      value={remarkDraft.grade || ''}
                      onChange={(event) => setRemarkDraft((prev) => ({
                        ...prev,
                        grade: Number(event.target.value) || null,
                        remark: '',
                        healthStatus: ''
                      }))}
                    >
                      <option value="">— انتخاب صنف —</option>
                      {GRADES.map((grade) => (
                        <option key={grade} value={grade}>{GRADE_LABELS[grade - 1]}</option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="button"
                    className="sw-btn sw-btn-primary"
                    onClick={saveRemark}
                    disabled={remarkSaving || !remarkDraft.grade || !remarkDraft.remark.trim()}
                  >
                    {remarkSaving ? 'در حال ثبت…' : 'ثبت نظرِ این صنف'}
                  </button>
                  <span className="sw-hint">
                    اگر نگرانِ صنف هستید، فقط صنفِ کلاسِ خودتان قابل ثبت است.
                  </span>
                </div>
              </fieldset>

              {card.separation?.isSeparated && (
                <fieldset className="sw-section sw-section-wide sw-section-danger">
                  <legend>منفک شدن</legend>
                  <div className="sw-separation">
                    <span>علت: {SEPARATION_REASONS[card.separation.reason] || card.separation.reasonText || '—'}</span>
                    <span>صنف: {card.separation.grade ? GRADE_LABELS[card.separation.grade - 1] : '—'}</span>
                    <span>تاریخ: {card.separation.dateLocal || '—'}</span>
                  </div>
                  <div className="sw-relative-row" style={{ gridTemplateColumns: '1fr 1fr auto auto' }}>
                    <label>
                      نمبر مکتوب
                      <input
                        type="text"
                        value={sepDraft.letterNo}
                        onChange={(event) => setSepDraft((prev) => ({ ...prev, letterNo: event.target.value }))}
                      />
                    </label>
                    <label>
                      جریمه
                      <input
                        type="number"
                        min="0"
                        value={sepDraft.penaltyAmount}
                        onChange={(event) => setSepDraft((prev) => ({ ...prev, penaltyAmount: event.target.value }))}
                      />
                    </label>
                    <label className="sw-checkbox">
                      <input
                        type="checkbox"
                        checked={sepDraft.penaltyPaid}
                        onChange={(event) => setSepDraft((prev) => ({ ...prev, penaltyPaid: event.target.checked }))}
                      />
                      پرداخت‌شده
                    </label>
                    <button type="button" className="sw-btn" onClick={saveSeparation} disabled={sepSaving}>
                      {sepSaving ? 'در حال ذخیره…' : 'ذخیرهٔ منفکی'}
                    </button>
                  </div>
                </fieldset>
              )}
              </>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
};

export default SawanehWorkspace;
