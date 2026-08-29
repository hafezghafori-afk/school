import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import useSiteSettings from '../hooks/useSiteSettings';
import { normalizeBrandName } from '../utils/brand';
import { getOfficialPrintLogoImageClass, getPrintLogoUrls } from '../utils/printLogos';
import { formatAfghanStoredDateLabel } from '../utils/afghanDate';
import { API_BASE } from '../config/api';
import './SawanehPrint.css';

const authHeaders = () => {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

const GRADE_LABELS = ['اول', 'دوم', 'سوم', 'چهارم', 'پنجم', 'ششم', 'هفتم', 'هشتم', 'نهم', 'دهم', 'یازدهم', 'دوازدهم'];
const gradeLabel = (n) => (n >= 1 && n <= 12 ? GRADE_LABELS[n - 1] : '');
const gradeNumber = (value) => {
  const m = String(value == null ? '' : value).match(/\d+/);
  const n = m ? Number(m[0]) : null;
  return n >= 1 && n <= 12 ? n : null;
};

const MOTHER_TONGUE = { dari: 'دری', pashto: 'پشتو', other: 'سایر' };
const RELATION = {
  brother: 'برادر', paternal_uncle: 'کاکا', maternal_uncle: 'ماما',
  paternal_cousin: 'پسر کاکا', maternal_cousin: 'پسر ماما', other: 'سایر'
};
// اقاربِ فرمِ رسمی — ۵ ستونِ ثابت به همان ترتیب
const RELATIVES_5 = [
  ['brother', 'برادر'], ['paternal_uncle', 'کاکا'], ['maternal_uncle', 'ماما'],
  ['paternal_cousin', 'پسر کاکا'], ['maternal_cousin', 'پسر ماما']
];
const HEALTH = { good: 'خوب', needs_followup: 'نیازمند پیگیری', chronic_condition: 'بیماری مزمن', '': '' };
const SEPARATION_REASON = {
  transfer: 'تبدیلی', dropout: 'ترک تحصیل', expulsion: 'اخراج',
  graduation: 'فراغت', death: 'وفات', other: 'سایر', '': ''
};
const TIER = { aali: 'اعلی', ali: 'عالی', motawaset: 'متوسط', nakam: 'ناکام', pending: '—' };
const PROMOTION = {
  kamyab: 'کامیاب', kamyab_makeup: 'کامیاب (با حق چاره‌جویی)',
  mashroot: 'مشروط', nakam_senf: 'ناکام صنف', pending: '—'
};
const PROVINCES = {
  kabul: 'کابل', herat: 'هرات', kandahar: 'کندهار', balkh: 'بلخ', nangarhar: 'ننگرهار',
  badakhshan: 'بدخشان', takhar: 'تخار', samangan: 'سمنگان', kunduz: 'قندوز', baghlan: 'بغلان',
  farah: 'فراه', nimroz: 'نیمروز', helmand: 'هلمند', ghor: 'غور', daykundi: 'دایکوندی',
  uruzgan: 'اروزگان', zabul: 'زابل', paktika: 'پکتیکا', khost: 'خوست', paktia: 'پکتیا',
  logar: 'لوگر', parwan: 'پروان', kapisa: 'کاپیسا', panjshir: 'پنجشیر', badghis: 'بادغیس',
  faryab: 'فاریاب', jowzjan: 'جوزجان', saripul: 'سرپل', bamyan: 'بامیان', ghazni: 'غزنی',
  wardak: 'میدان وردک', laghman: 'لغمان', kunar: 'کنر', nuristan: 'نورستان'
};
const provinceLabel = (v) => PROVINCES[String(v || '').toLowerCase()] || v || '';

const dash = (v) => (v === 0 ? '۰' : (v || '—'));
const dateLabel = (iso, local) => local || (iso ? formatAfghanStoredDateLabel(iso) : '') || '';

const Field = ({ label, value }) => (
  <div className="sp-field">
    <span className="sp-field-label">{label}</span>
    <span className="sp-field-value">{value || <span className="sp-blank" />}</span>
  </div>
);

const Letterhead = ({ settings }) => {
  const { schoolLogoUrl, ministryLogoUrl } = getPrintLogoUrls(settings || {});
  const schoolName = normalizeBrandName(settings?.brandName) || 'اناثیه ایمان';
  return (
    <header className="sp-letterhead">
      <div className="sp-logo">
        {schoolLogoUrl ? <img className={getOfficialPrintLogoImageClass(schoolLogoUrl)} src={schoolLogoUrl} alt="" /> : <span>لوگو مکتب</span>}
      </div>
      <div className="sp-letterhead-text">
        <span>امارت اسلامی افغانستان</span>
        <span>وزارت معارف</span>
        <span>ریاست معارف شهر کابل</span>
        <span>{`مدیریت ${schoolName}`}</span>
        <strong className="sp-doc-title">کارت سوانح متعلمین / محصلین</strong>
      </div>
      <div className="sp-logo">
        {ministryLogoUrl ? <img className={getOfficialPrintLogoImageClass(ministryLogoUrl)} src={ministryLogoUrl} alt="" /> : <span>لوگو وزارت</span>}
      </div>
    </header>
  );
};

const Signatures = ({ left, right }) => (
  <div className="sp-signatures">
    <div><span className="sp-sign-line" />{right}</div>
    <div><span className="sp-sign-line" />{left}</div>
  </div>
);

const splitBirth = (iso, local) => {
  const label = local || (iso ? dateLabel(iso) : '');
  const parts = String(label || '').trim().split(/\s+/);
  if (parts.length === 3) return { year: parts[0], month: parts[1], day: parts[2] };
  return { year: label, month: '', day: '' };
};

const CardSheet = ({ settings, student, card, blank }) => {
  const p = student?.personalInfo || {};
  const idn = student?.identification || {};
  const fam = student?.familyInfo || {};
  const contact = student?.contactInfo || {};
  const b = (v) => (blank ? '' : (v ?? ''));
  const origin = card?.originAddress || {};
  const current = card?.currentSameAsOrigin ? origin : (card?.currentAddress || {});
  const remarkByGrade = new Map((card?.supervisorRemarks || []).map((r) => [Number(r.grade), r]));
  const relByRelation = (k) => (card?.relatives || []).find((r) => r.relation === k)?.name || '';
  const sep = card?.separation || {};
  const bd = splitBirth(p.birthDate);
  const enroll = blank ? [] : (card?.enrollmentHistory || []);
  const corrections = blank ? [] : (card?.nameCorrections || []);
  const padRows = (arr, min) => Array.from({ length: Math.max(0, min - arr.length) });

  return (
    <section className="sp-sheet sp-asheet">
      <Letterhead settings={settings} />
      <div className="sp-btitle">کارت سوانح متعلمین / محصلین</div>

      {/* ۲ و ۳ — شهرت متعلم (راست) + معلومات پدر/ولی و عکس (چپ) */}
      <div className="sp-two sp-atop">
        <div className="sp-abox">
          <div className="sp-abox-h">شهرت متعلم</div>
          <div className="sp-grid sp-grid-3">
            <Field label="نام" value={b([p.firstNameDari, p.lastNameDari].filter(Boolean).join(' '))} />
            <Field label="نام پدر" value={b(p.fatherName)} />
            <Field label="نام پدر کلان" value={b(p.grandfatherName)} />
          </div>
          <div className="sp-abox-h">شهرت متعلم به انگلیسی برویت تذکره</div>
          <div className="sp-grid sp-grid-3">
            <Field label="Name" value={b(p.firstName)} />
            <Field label="Last name" value={b(p.lastName)} />
            <Field label="Father name" value={b(p.fatherNameEnglish)} />
          </div>
          <div className="sp-grid sp-grid-2">
            <Field label="تابعیت" value={b(p.nationality || 'افغان')} />
            <Field label="جنسیت" value={b(p.gender === 'female' ? 'اناث' : p.gender === 'male' ? 'ذکور' : '')} />
          </div>
        </div>

        <div className="sp-abox">
          <div className="sp-abox-h">معلومات در مورد پدر / ولی متعلم</div>
          <div className="sp-arow-photo">
            <div className="sp-grid sp-grid-1 sp-grow">
              <Field label="محل بود و باش" value={b(fam.fatherResidence)} />
              <Field label="وظیفه" value={b(fam.fatherOccupation)} />
              <Field label="محل وظیفه" value={b(fam.fatherWorkplace)} />
              <Field label="نمبر تلفون" value={b(fam.fatherLandline)} />
              <Field label="نمبر مبایل" value={b(fam.fatherPhone)} />
              <Field label="نمبر تماس خودِ متعلم" value={b(contact.mobile)} />
            </div>
            <div className="sp-photo">عکس<br />۳×۴</div>
          </div>
        </div>
      </div>

      {/* ۴ — توضیحات در صورت اصلاح شهرت متعلم */}
      <div className="sp-asec-h">توضیحات در صورت اصلاح شهرت متعلم</div>
      <table className="sp-table sp-atbl">
        <thead><tr><th>مورد</th><th>قبلی</th><th>جدید</th><th>نمبر مکتوب</th><th>تاریخ</th></tr></thead>
        <tbody>
          {corrections.map((r, i) => (
            <tr key={i}><td>{r.field}</td><td>{r.oldValue}</td><td>{r.newValue}</td><td>{r.letterNo}</td><td>{dateLabel(r.date, r.dateLocal)}</td></tr>
          ))}
          {padRows(corrections, 2).map((_, i) => <tr key={`c${i}`}><td>&nbsp;</td><td /><td /><td /><td /></tr>)}
        </tbody>
      </table>

      {/* ۵ و ۶ و ۷ — شمولیت (چپ) + سکونت اصلی/فعلی (راست) */}
      <div className="sp-two sp-atop">
        <div className="sp-abox">
          <div className="sp-abox-h">شمولیت (نمبر اساس متعلم در مکاتب)</div>
          <table className="sp-table sp-atbl">
            <thead><tr><th>نام مدرسه</th><th>نمبر اساس</th><th>صنف</th><th>تاریخ</th><th>نمبر مکتوب</th></tr></thead>
            <tbody>
              {enroll.map((r, i) => (
                <tr key={i}>
                  <td>{r.schoolName}</td><td>{r.asasNumber}</td>
                  <td>{r.grade ? gradeLabel(r.grade) : ''}</td><td>{dateLabel(r.date, r.dateLocal)}</td><td>{r.letterNo}</td>
                </tr>
              ))}
              {padRows(enroll, 4).map((_, i) => <tr key={`e${i}`}><td>&nbsp;</td><td /><td /><td /><td /></tr>)}
            </tbody>
          </table>
        </div>
        <div className="sp-abox">
          <div className="sp-abox-h">سکونت اصلی</div>
          <div className="sp-grid sp-grid-3">
            <Field label="ولایت" value={b(provinceLabel(origin.province))} />
            <Field label="ولسوالی / ناحیه" value={b(origin.district)} />
            <Field label="قریه / گذر" value={b(origin.villageOrStreet)} />
          </div>
          <div className="sp-abox-h">سکونت فعلی</div>
          <div className="sp-grid sp-grid-3">
            <Field label="ولایت" value={b(provinceLabel(current.province))} />
            <Field label="ولسوالی / ناحیه" value={b(current.district)} />
            <Field label="قریه / گذر" value={b(current.villageOrStreet)} />
          </div>
        </div>
      </div>

      {/* ۸ و ۹ — معلومات تذکره + تاریخ تولد */}
      <div className="sp-two sp-atop">
        <div className="sp-abox">
          <div className="sp-abox-h">معلومات تذکره هویت متعلم</div>
          <div className="sp-grid sp-grid-3">
            <Field label="نمبر" value={b(idn.tazkiraNumber)} />
            <Field label="صفحه" value={b(idn.tazkiraPage)} />
            <Field label="جلد" value={b(idn.tazkiraVolume)} />
          </div>
        </div>
        <div className="sp-abox">
          <div className="sp-abox-h">تاریخ تولد متعلم</div>
          <div className="sp-grid sp-grid-3">
            <Field label="روز" value={b(bd.day)} />
            <Field label="ماه" value={b(bd.month)} />
            <Field label="سال" value={b(bd.year)} />
          </div>
        </div>
      </div>

      {/* ۱۰ — منفک شدن متعلم */}
      <div className="sp-asec-h">منفک شدن متعلم</div>
      <div className="sp-grid sp-grid-5">
        <Field label="تاریخ" value={b(sep.isSeparated ? dateLabel(sep.date, sep.dateLocal) : '')} />
        <Field label="نمبر مکتوب" value={b(sep.isSeparated ? sep.letterNo : '')} />
        <Field label="صنف" value={b(sep.isSeparated && sep.grade ? gradeLabel(sep.grade) : '')} />
        <Field label="علت" value={b(sep.isSeparated ? (SEPARATION_REASON[sep.reason] || sep.reasonText) : '')} />
        <Field label="جریمه" value={b(sep.isSeparated && sep.penaltyAmount ? String(sep.penaltyAmount) : '')} />
      </div>

      {/* ۱۱ — زبان مادری */}
      <div className="sp-asec-h">زبان مادری</div>
      <div className="sp-grid sp-grid-3">
        <Field label="زبان مادری" value={b(MOTHER_TONGUE[card?.motherTongue] || '')} />
        <Field label="لسان سوم" value={b(card?.thirdLanguage)} />
        <Field label="" value="" />
      </div>

      {/* ۱۲ — اقارب نزدیک متعلم (۵ ستون) */}
      <div className="sp-asec-h">اقارب نزدیک متعلم</div>
      <table className="sp-table sp-atbl sp-arel">
        <thead><tr>{RELATIVES_5.map(([k, l]) => <th key={k}>{l}</th>)}</tr></thead>
        <tbody><tr>{RELATIVES_5.map(([k]) => <td key={k}>{blank ? '' : relByRelation(k)}</td>)}</tr></tbody>
      </table>

      {/* ۱۳ — نظریات نگران صنف / اداره مدرسه (۱۲ صنف) */}
      <div className="sp-asec-h">نظریات نگران صنف / اداره مدرسه / دارالعلوم در مورد متعلم</div>
      <table className="sp-table sp-atbl sp-arem">
        <thead><tr><th className="sp-arem-g">صنف</th><th className="sp-arem-n">اسم نگران</th><th>نظریات</th></tr></thead>
        <tbody>
          {GRADE_LABELS.map((label, i) => {
            const r = blank ? null : remarkByGrade.get(i + 1);
            return (
              <tr key={label}>
                <td>{label}</td><td>{r?.supervisorName || ''}</td><td>{r?.remark || ''}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* ۱۴ — وضع صحی */}
      <div className="sp-grid sp-grid-1 sp-ahealth">
        <Field label="وضع صحی" value={b(HEALTH[card?.healthStatus || ''] || '')} />
      </div>

      <Signatures right="امضای نگران" left="امضای سرمعلم و مهر مکتب" />
    </section>
  );
};

// ردیف‌های فرم B به همان ترتیبِ فرمِ رسمیِ وزارت معارف (sawaneh 1.pdf)
const FORM_B_ROWS = [
  ['tafsir', 'تفسیر شریف / قرآن‌کریم'],
  ['hifz+tajweed', 'حفظ / تجوید'],
  ['hadith', 'حدیث شریف'],
  ['usul_hadith', 'اصول حدیث'],
  ['usul_fiqh', 'اصول فقه'],
  ['fiqh', 'فقه'],
  ['aqaid', 'عقاید'],
  ['sirat', 'سیرت‌النبی'],
  ['akhlaq', 'اخلاق و آداب اسلامی'],
  ['sarf', 'صرف'],
  ['nahw', 'نحو'],
  ['arabic', 'عربی'],
  ['pashto', 'پشتو'],
  ['dari', 'دری'],
  ['science', 'ساینس'],
  ['social', 'اجتماعیات'],
  ['math', 'ریاضی'],
  ['english', 'انگلیسی'],
  ['computer', 'کمپیوتر'],
  ['mantiq', 'منطق'],
  ['balaghat', 'بلاغت'],
  ['handasa', 'هندسه / رسم'],
  ['physical_ed', 'تربیت بدنی / تدبیر منزل'],
  ['tahzib', 'تهذیب']
];
const FORM_B_GRADES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];
const NOTE_PAIRS = [[1, 7], [2, 8], [3, 9], [4, 10], [5, 11], [6, 12]];
const faDigit = (n) => new Intl.NumberFormat('fa-AF', { useGrouping: false }).format(n);

// جدولِ تجمیعیِ چند‌ساله — عینِ فرمِ رسمی: ردیف‌ها = مضامین، ستون‌ها = صنوف ۱ تا ۱۴
const TranscriptSheet = ({ settings, student, transcripts, blank }) => {
  const p = student?.personalInfo || {};
  const byGrade = new Map();
  (blank ? [] : (transcripts || [])).forEach((t) => byGrade.set(Number(t.grade), t));
  const schoolName = normalizeBrandName(settings?.brandName)
    || (transcripts || []).find((t) => t.schoolNameSnapshot)?.schoolNameSnapshot
    || 'اناثیه ایمان';

  const rowFor = (t, key) => (t?.rows || []).find((r) => r.subjectKey === key);
  const cell = (grade, key) => {
    const t = byGrade.get(grade);
    if (!t) return '';
    for (const k of key.split('+')) {
      const r = rowFor(t, k);
      if (r && r.annualMark != null) return faDigit(r.annualMark);
    }
    return '';
  };
  const summaryCell = (grade, kind) => {
    const t = byGrade.get(grade);
    if (!t) return '';
    if (kind === 'total') return t.totalObtained != null ? faDigit(t.totalObtained) : '';
    if (kind === 'avg') return t.average != null ? faDigit(t.average) : '';
    if (kind === 'result') return PROMOTION[t.promotionStatus] || '';
    if (kind === 'tier') return TIER[t.resultTier] || '';
    return '';
  };
  const attCell = (grade, k) => {
    const a = byGrade.get(grade)?.attendance;
    return a && a[k] != null ? faDigit(a[k]) : '';
  };

  return (
    <section className="sp-sheet sp-bsheet">
      <Letterhead settings={settings} />
      <div className="sp-btitle">نتیجه امتحانات متعلم</div>

      <div className="sp-bhead">
        <span>نام متعلم: <b>{[p.firstNameDari, p.lastNameDari].filter(Boolean).join(' ') || '—'}</b></span>
        <span>ولد: <b>{p.fatherName || '—'}</b></span>
        <span>نمبر اساس: <b>{student?.asasNumber || '—'}</b></span>
        <span>تذکره: <b>{student?.identification?.tazkiraNumber || '—'}</b></span>
      </div>

      <div className="sp-btable-wrap">
        <table className="sp-btable">
          <colgroup>
            <col className="sp-bcol-subj" />
            {FORM_B_GRADES.map((g) => <col key={g} className="sp-bcol-grade" />)}
            <col className="sp-bcol-note" />
          </colgroup>
          <thead>
            <tr>
              <th className="sp-browlabel sp-bschool">
                اسم مدرسه / دارالعلوم:&nbsp;<span className="sp-bschool-name">{schoolName}</span>
              </th>
              {FORM_B_GRADES.map((g) => <th key={g} className="sp-bmeta" />)}
              <th rowSpan={3} className="sp-bnote-head">ملاحظات</th>
            </tr>
            <tr>
              <th className="sp-browlabel">سال ها</th>
              {FORM_B_GRADES.map((g) => (
                <th key={g} className="sp-bmeta">{blank ? '' : (byGrade.get(g)?.yearLabel || '')}</th>
              ))}
            </tr>
            <tr className="sp-bgradehdr">
              <th className="sp-bcorner">
                <svg className="sp-bcorner-line" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                  <line x1="100" y1="0" x2="0" y2="100" stroke="#111" strokeWidth="1" vectorEffect="non-scaling-stroke" />
                </svg>
                <span className="sp-bcorner-top">صنوف</span>
                <span className="sp-bcorner-bot">مضامین</span>
              </th>
              {FORM_B_GRADES.map((g) => <th key={g}>{faDigit(g)}</th>)}
            </tr>
          </thead>
          <tbody>
            {FORM_B_ROWS.map(([key, label]) => (
              <tr key={key}>
                <td className="sp-bsubj">{label}</td>
                {FORM_B_GRADES.map((g) => <td key={g}>{cell(g, key)}</td>)}
                <td />
              </tr>
            ))}
            <tr className="sp-bsum"><td className="sp-bsubj">مجموعه</td>{FORM_B_GRADES.map((g) => <td key={g}>{summaryCell(g, 'total')}</td>)}<td /></tr>
            <tr className="sp-bsum"><td className="sp-bsubj">اوسط نمرات</td>{FORM_B_GRADES.map((g) => <td key={g}>{summaryCell(g, 'avg')}</td>)}<td /></tr>
            <tr className="sp-bsum"><td className="sp-bsubj">نتیجه</td>{FORM_B_GRADES.map((g) => <td key={g}>{summaryCell(g, 'result')}</td>)}<td /></tr>
            <tr className="sp-bsum"><td className="sp-bsubj">درجه</td>{FORM_B_GRADES.map((g) => <td key={g}>{summaryCell(g, 'tier')}</td>)}<td /></tr>
            <tr className="sp-batt"><td className="sp-bsubj">ایام سال تعلیمی</td>{FORM_B_GRADES.map((g) => <td key={g}>{attCell(g, 'schoolDays')}</td>)}<td /></tr>
            <tr className="sp-batt"><td className="sp-bsubj">حاضر</td>{FORM_B_GRADES.map((g) => <td key={g}>{attCell(g, 'present')}</td>)}<td /></tr>
            <tr className="sp-batt"><td className="sp-bsubj">غیرحاضر</td>{FORM_B_GRADES.map((g) => <td key={g}>{attCell(g, 'absent')}</td>)}<td /></tr>
            <tr className="sp-batt"><td className="sp-bsubj">مریض</td>{FORM_B_GRADES.map((g) => <td key={g}>{attCell(g, 'sick')}</td>)}<td /></tr>
            <tr className="sp-batt"><td className="sp-bsubj">رخصت</td>{FORM_B_GRADES.map((g) => <td key={g}>{attCell(g, 'leave')}</td>)}<td /></tr>
          </tbody>
        </table>
      </div>

      <div className="sp-bsign">
        <span className="sp-sign-cell"><span className="sp-sign-line" />امضای نگران</span>
        <span className="sp-sign-cell"><span className="sp-sign-line" />امضای سرمعلم و مهر مکتب</span>
      </div>

      <div className="sp-bnotes-title">توضیحات در مورد امتحانات متعلم</div>
      <table className="sp-btable sp-bnotes">
        <tbody>
          {NOTE_PAIRS.map(([a, b]) => (
            <tr key={a}>
              <td className="sp-bnote-label">{gradeLabel(a)}</td>
              <td className="sp-bnote-text">{blank ? '' : (byGrade.get(a)?.examNotes || '')}</td>
              <td className="sp-bnote-label">{gradeLabel(b)}</td>
              <td className="sp-bnote-text">{blank ? '' : (byGrade.get(b)?.examNotes || '')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
};

const SawanehPrint = () => {
  const { studentId } = useParams();
  const [params] = useSearchParams();
  const { settings } = useSiteSettings();
  const form = params.get('form') || 'full';
  const blank = params.get('blank') === '1';

  const [student, setStudent] = useState(null);
  const [card, setCard] = useState(null);
  const [transcripts, setTranscripts] = useState([]);
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const cardRes = await fetch(`${API_BASE}/api/sawaneh/cards/${studentId}`, { headers: authHeaders() });
        const cardData = await cardRes.json();
        if (!cardRes.ok || !cardData.success) throw new Error(cardData.message || 'خطا در دریافت کارت سوانح');
        if (!alive) return;
        setCard(cardData.data);
        setStudent(cardData.data.studentId && typeof cardData.data.studentId === 'object' ? cardData.data.studentId : null);

        if (form !== 'card') {
          const tRes = await fetch(`${API_BASE}/api/sawaneh/transcripts/${studentId}`, { headers: authHeaders() });
          const tData = await tRes.json();
          if (alive && tRes.ok && tData.success) setTranscripts(Array.isArray(tData.data) ? tData.data : []);
        }
      } catch (err) {
        if (alive) setError(err.message || 'خطا در بارگذاری');
      } finally {
        if (alive) setReady(true);
      }
    })();
    return () => { alive = false; };
  }, [studentId, form]);

  useEffect(() => {
    if (ready && !error) {
      const timer = setTimeout(() => window.print(), 500);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [ready, error]);

  const hasTranscripts = transcripts.length > 0;

  if (!ready) return <div className="sp-loading">در حال آماده‌سازی چاپ…</div>;
  if (error) return <div className="sp-loading sp-error">{error}</div>;

  return (
    <div className="sawaneh-print" dir="rtl">
      <div className="sp-toolbar no-print">
        <button type="button" onClick={() => window.print()}>چاپ</button>
        <button type="button" onClick={() => window.close()}>بستن</button>
        <span>{blank ? 'فرم خام' : 'با معلومات'}</span>
      </div>

      {form !== 'transcript' && (
        <CardSheet settings={settings} student={student} card={card} blank={blank} />
      )}

      {form !== 'card' && (
        (blank || hasTranscripts) ? (
          <TranscriptSheet settings={settings} student={student} transcripts={transcripts} blank={blank} />
        ) : (
          <section className="sp-sheet"><p className="sp-muted">برای این شاگرد سوانح تعلیمی ساخته نشده است.</p></section>
        )
      )}
    </div>
  );
};

export default SawanehPrint;
