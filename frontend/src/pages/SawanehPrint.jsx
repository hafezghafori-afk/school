import React, { useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import useSiteSettings from '../hooks/useSiteSettings';
import { normalizeBrandName, normalizeBrandSubtitle } from '../utils/brand';
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

const Letterhead = ({ settings, title }) => {
  const { schoolLogoUrl, ministryLogoUrl } = getPrintLogoUrls(settings || {});
  const brandName = normalizeBrandName(settings?.brandName);
  const brandSubtitle = normalizeBrandSubtitle(settings?.brandSubtitle);
  return (
    <header className="sp-letterhead">
      <div className="sp-logo">
        {schoolLogoUrl ? <img className={getOfficialPrintLogoImageClass(schoolLogoUrl)} src={schoolLogoUrl} alt="" /> : <span>لوگو مکتب</span>}
      </div>
      <div className="sp-letterhead-text">
        <strong>امارت اسلامی افغانستان — وزارت معارف</strong>
        <span>{brandName}{brandSubtitle ? ` — ${brandSubtitle}` : ''}</span>
        <span className="sp-doc-title">{title}</span>
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

const CardSheet = ({ settings, student, card, blank }) => {
  const p = student?.personalInfo || {};
  const id = student?.identification || {};
  const fam = student?.familyInfo || {};
  const contact = student?.contactInfo || {};
  const b = (v) => (blank ? '' : v);
  const origin = card?.originAddress || {};
  const current = card?.currentSameAsOrigin ? origin : (card?.currentAddress || {});
  const remarkByGrade = new Map((card?.supervisorRemarks || []).map((r) => [Number(r.grade), r]));
  const sep = card?.separation || {};

  return (
    <section className="sp-sheet">
      <Letterhead settings={settings} title="کارت سوانح متعلمی / محصلی" />

      <div className="sp-row-top">
        <div className="sp-grid sp-grow">
          <Field label="نام" value={b([p.firstNameDari, p.lastNameDari].filter(Boolean).join(' '))} />
          <Field label="نام پدر" value={b(p.fatherName)} />
          <Field label="نام پدر کلان" value={b(p.grandfatherName)} />
          <Field label="Name" value={b(p.firstName)} />
          <Field label="Last name" value={b(p.lastName)} />
          <Field label="Father name" value={b(p.fatherNameEnglish)} />
          <Field label="تابعیت" value={b(p.nationality || 'افغان')} />
          <Field label="جنسیت" value={b(p.gender === 'female' ? 'اناث' : p.gender === 'male' ? 'ذکور' : '')} />
        </div>
        <div className="sp-photo">عکس ۳×۴</div>
      </div>

      <h3>معلومات پدر / ولی</h3>
      <div className="sp-grid">
        <Field label="محل بود و باش" value={b(fam.fatherResidence)} />
        <Field label="وظیفه" value={b(fam.fatherOccupation)} />
        <Field label="محل وظیفه" value={b(fam.fatherWorkplace)} />
        <Field label="نمبر تلفن" value={b(fam.fatherLandline)} />
        <Field label="نمبر مبایل" value={b(fam.fatherPhone)} />
        <Field label="نمبر تماس خودِ متعلم" value={b(contact.mobile)} />
      </div>

      <div className="sp-two">
        <div>
          <h3>معلومات تذکرهٔ هویت</h3>
          <div className="sp-grid sp-grid-3">
            <Field label="نمبر" value={b(id.tazkiraNumber)} />
            <Field label="صفحه" value={b(id.tazkiraPage)} />
            <Field label="جلد" value={b(id.tazkiraVolume)} />
          </div>
        </div>
        <div>
          <h3>تاریخ تولد</h3>
          <div className="sp-grid">
            <Field label="تاریخ" value={b(dateLabel(p.birthDate))} />
            <Field label="محل تولد" value={b(p.birthPlace)} />
          </div>
        </div>
      </div>

      <div className="sp-two">
        <div>
          <h3>سکونت اصلی</h3>
          <div className="sp-grid sp-grid-3">
            <Field label="ولایت" value={b(provinceLabel(origin.province))} />
            <Field label="ولسوالی / ناحیه" value={b(origin.district)} />
            <Field label="قریه / گذر" value={b(origin.villageOrStreet)} />
          </div>
        </div>
        <div>
          <h3>سکونت فعلی</h3>
          <div className="sp-grid sp-grid-3">
            <Field label="ولایت" value={b(provinceLabel(current.province))} />
            <Field label="ولسوالی / ناحیه" value={b(current.district)} />
            <Field label="قریه / گذر" value={b(current.villageOrStreet)} />
          </div>
        </div>
      </div>

      <h3>زبان مادری</h3>
      <div className="sp-grid sp-grid-3">
        <Field label="زبان مادری" value={b(MOTHER_TONGUE[card?.motherTongue] || '')} />
        <Field label="لسان سوم" value={b(card?.thirdLanguage)} />
        <Field label="" value="" />
      </div>

      <h3>اقارب نزدیک متعلم</h3>
      <table className="sp-table">
        <thead><tr><th>نسبت</th><th>نام</th><th>نمبر تماس</th><th>ملاحظات</th></tr></thead>
        <tbody>
          {(blank ? [] : (card?.relatives || [])).map((r, i) => (
            <tr key={i}><td>{RELATION[r.relation] || r.relation}</td><td>{r.name}</td><td>{r.phone}</td><td>{r.note}</td></tr>
          ))}
          {Array.from({ length: Math.max(0, 4 - (blank ? 0 : (card?.relatives || []).length)) }).map((_, i) => (
            <tr key={`e${i}`}><td>&nbsp;</td><td /><td /><td /></tr>
          ))}
        </tbody>
      </table>

      <h3>شمولیت (نمبر اساس متعلم در مکاتب)</h3>
      <table className="sp-table">
        <thead><tr><th>نام مدرسه</th><th>نمبر اساس</th><th>صنف</th><th>تاریخ</th><th>نمبر مکتوب</th></tr></thead>
        <tbody>
          {(blank ? [] : (card?.enrollmentHistory || [])).map((r, i) => (
            <tr key={i}>
              <td>{r.schoolName}</td><td>{r.asasNumber}</td>
              <td>{gradeLabel(r.grade)}</td><td>{dateLabel(r.date, r.dateLocal)}</td><td>{r.letterNo}</td>
            </tr>
          ))}
          {Array.from({ length: Math.max(0, 4 - (blank ? 0 : (card?.enrollmentHistory || []).length)) }).map((_, i) => (
            <tr key={`e${i}`}><td>&nbsp;</td><td /><td /><td /><td /></tr>
          ))}
        </tbody>
      </table>

      {!blank && (card?.nameCorrections || []).length > 0 && (
        <>
          <h3>توضیحات در صورت اصلاح شهرت متعلم</h3>
          <table className="sp-table">
            <thead><tr><th>مورد</th><th>قبلی</th><th>جدید</th><th>نمبر مکتوب</th><th>تاریخ</th></tr></thead>
            <tbody>
              {card.nameCorrections.map((r, i) => (
                <tr key={i}><td>{r.field}</td><td>{r.oldValue}</td><td>{r.newValue}</td><td>{r.letterNo}</td><td>{dateLabel(r.date, r.dateLocal)}</td></tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      <h3>نظریات نگرانِ صنف / ادارهٔ مدرسه در مورد متعلم</h3>
      <table className="sp-table">
        <thead><tr><th style={{ width: '12%' }}>صنف</th><th style={{ width: '22%' }}>اسم نگران</th><th>نظریات</th><th style={{ width: '16%' }}>وضع صحی</th></tr></thead>
        <tbody>
          {GRADE_LABELS.map((label, i) => {
            const r = blank ? null : remarkByGrade.get(i + 1);
            return (
              <tr key={label}>
                <td>{label}</td><td>{r?.supervisorName || ''}</td>
                <td>{r?.remark || ''}</td><td>{HEALTH[r?.healthStatus || ''] || ''}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <h3>منفک شدن متعلم</h3>
      <div className="sp-grid">
        <Field label="تاریخ" value={b(sep.isSeparated ? dateLabel(sep.date, sep.dateLocal) : '')} />
        <Field label="نمبر مکتوب" value={b(sep.isSeparated ? sep.letterNo : '')} />
        <Field label="صنف" value={b(sep.isSeparated ? gradeLabel(sep.grade) : '')} />
        <Field label="علت" value={b(sep.isSeparated ? (SEPARATION_REASON[sep.reason] || sep.reasonText) : '')} />
        <Field label="جریمه" value={b(sep.isSeparated && sep.penaltyAmount ? String(sep.penaltyAmount) : '')} />
      </div>

      <Signatures right="امضای نگرانِ صنف" left="امضای مدیر و مهر مکتب" />
    </section>
  );
};

const TranscriptSheet = ({ settings, student, transcript, blank }) => {
  const p = student?.personalInfo || {};
  const cats = ['religious', 'general', ''];
  const catLabel = { religious: 'مضامین دینی', general: 'مضامین عمومی', '': 'سایر' };
  const rows = blank ? [] : (transcript?.rows || []);
  const att = transcript?.attendance || {};

  return (
    <section className="sp-sheet">
      <Letterhead settings={settings} title="نتیجه امتحانات متعلم — سوانح تعلیمی" />

      <div className="sp-grid">
        <Field label="نام متعلم" value={[p.firstNameDari, p.lastNameDari].filter(Boolean).join(' ')} />
        <Field label="ولد" value={p.fatherName} />
        <Field label="نمبر اساس" value={student?.asasNumber} />
        <Field label="صنف" value={gradeLabel(transcript?.grade)} />
        <Field label="سال تعلیمی" value={transcript?.yearLabel || transcript?.academicYearId?.title} />
        <Field label="مدرسه" value={transcript?.schoolNameSnapshot} />
      </div>

      <table className="sp-table sp-marks">
        <thead>
          <tr>
            <th>مضمون</th><th>سویه</th><th>چهارونیم‌ماهه</th><th>سالانه</th><th>مجموع</th><th>نتیجه</th>
          </tr>
        </thead>
        <tbody>
          {cats.map((cat) => {
            const catRows = rows.filter((r) => (r.category || '') === cat);
            if (!catRows.length) return null;
            return (
              <React.Fragment key={cat || 'other'}>
                <tr className="sp-cat"><td colSpan={6}>{catLabel[cat]}</td></tr>
                {catRows.map((r, i) => (
                  <tr key={`${cat}-${i}`}>
                    <td className="sp-subj">{r.subjectLabel}</td>
                    <td>{dash(r.sawiyaMark)}</td>
                    <td>{dash(r.midYearMark)}</td>
                    <td>{dash(r.finalMark)}</td>
                    <td>{dash(r.annualMark)}</td>
                    <td>{r.subjectPassed == null ? '—' : r.subjectPassed ? 'کامیاب' : 'ناکام'}</td>
                  </tr>
                ))}
              </React.Fragment>
            );
          })}
          {blank && Array.from({ length: 18 }).map((_, i) => (
            <tr key={`b${i}`}><td>&nbsp;</td><td /><td /><td /><td /><td /></tr>
          ))}
        </tbody>
        <tfoot>
          <tr><td>مجموعه</td><td colSpan={3} /><td>{blank ? '' : dash(transcript?.totalObtained)}</td><td /></tr>
          <tr><td>اوسط نمرات</td><td colSpan={3} /><td>{blank ? '' : dash(transcript?.average)}</td><td>{blank ? '' : TIER[transcript?.resultTier]}</td></tr>
          <tr><td>نتیجه</td><td colSpan={5}>{blank ? '' : PROMOTION[transcript?.promotionStatus]}</td></tr>
          <tr>
            <td>درجه (رتبه در صنف)</td>
            <td colSpan={5}>{blank || !transcript?.rank ? '' : `${transcript.rank} از ${transcript.classSize || ''}`}</td>
          </tr>
        </tfoot>
      </table>

      <div className="sp-two">
        <div>
          <h3>حاضری</h3>
          <table className="sp-table">
            <tbody>
              <tr><th>ایام سال تعلیمی</th><td>{blank ? '' : dash(att.schoolDays)}</td><th>حاضر</th><td>{blank ? '' : dash(att.present)}</td></tr>
              <tr><th>غیرحاضر</th><td>{blank ? '' : dash(att.absent)}</td><th>مریض</th><td>{blank ? '' : dash(att.sick)}</td></tr>
              <tr><th>رخصت</th><td>{blank ? '' : dash(att.leave)}</td><th>&nbsp;</th><td /></tr>
            </tbody>
          </table>
        </div>
        <div>
          <h3>توضیحات در مورد امتحانات متعلم</h3>
          <div className="sp-notes">{blank ? '' : (transcript?.examNotes || '')}</div>
        </div>
      </div>

      <Signatures right="امضای نگران" left="امضای معلم و مهر مکتب" />
    </section>
  );
};

const SawanehPrint = () => {
  const { studentId } = useParams();
  const [params] = useSearchParams();
  const { settings } = useSiteSettings();
  const form = params.get('form') || 'full';
  const yearParam = params.get('year') || '';
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

  const transcriptSheets = useMemo(() => {
    if (form === 'card') return [];
    let list = transcripts;
    if (yearParam) {
      list = transcripts.filter((t) => String(t.academicYearId?._id || t.academicYearId) === String(yearParam));
    }
    return list;
  }, [transcripts, form, yearParam]);

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

      {form !== 'card' && transcriptSheets.length === 0 && !blank && (
        <section className="sp-sheet"><p className="sp-muted">برای این شاگرد سوانح تعلیمی ساخته نشده است.</p></section>
      )}

      {form !== 'card' && blank && transcriptSheets.length === 0 && (
        <TranscriptSheet settings={settings} student={student} transcript={null} blank />
      )}

      {transcriptSheets.map((t) => (
        <TranscriptSheet key={t._id} settings={settings} student={student} transcript={t} blank={blank} />
      ))}
    </div>
  );
};

export default SawanehPrint;
