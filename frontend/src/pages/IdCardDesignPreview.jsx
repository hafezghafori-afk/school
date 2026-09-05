import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import useSiteSettings from '../hooks/useSiteSettings';
import { normalizeBrandName } from '../utils/brand';
import { getPrintLogoUrls } from '../utils/printLogos';
import { CardBack, CardFront, TiltStage } from './IdCardPrint';
import './IdCardPrint.css';

// ابزارِ داخلیِ طراحی — بدونِ نیاز به لاگین یا دیتابیس، همان کامپوننت‌هایِ واقعیِ
// IdCardPrint.jsx را با دادهٔ نمونه نشان می‌دهد تا طرح/رنگ/چیدمان زودتر و زنده
// بررسی شود. صفحهٔ واقعیِ چاپ (با دادهٔ واقعی) در «/id-cards/print» است.

const ROLES = ['student', 'teacher', 'staff'];
const ROLE_TAB_LABELS = { student: 'شاگرد', teacher: 'استاد', staff: 'کارمند' };

const SAMPLE = {
  student: {
    owner: {
      roleKey: 'student', roleLabel: 'شاگرد', name: 'سارا احمدی', fatherName: 'محمد اسحاق',
      idLabel: 'نمبر اساس', idValue: '۱۴۰۲۳۳۱۲', subLabel: 'صنف', subValue: 'ششم — الف',
      bloodGroup: 'O+', birthDate: '2013-06-04', province: 'nangarhar', district: 'کابل-خوشحال خان مینه',
      address: 'کابل-خوشحال خان مینه', emergencyName: 'سید طاووس',
      emergencyPhone: '0772198220', photoUrl: ''
    },
    card: { serial: 'AF-IMN-2026-0001', issueDate: '2026-01-01', expiryDate: '2027-01-01', status: 'active' }
  },
  teacher: {
    owner: {
      roleKey: 'teacher', roleLabel: 'استاد', name: 'استاد فریده حسینی', fatherName: 'غلام حیدر',
      idLabel: 'نمبر کارمند', idValue: 'T-۰۲۱۸', subLabel: 'مضمون', subValue: 'ریاضی، هندسه',
      bloodGroup: 'A+', birthDate: '1989-07-24', province: 'kabul', district: 'ناحیهٔ ۳',
      address: 'سرکِ عمومی، مقابلِ لیسهٔ نسوان', emergencyName: 'غلام حیدر',
      emergencyPhone: '۰۷۹۹۴۴۵۵۶۶', photoUrl: ''
    },
    card: { serial: 'AF-IMN-2026-0002', issueDate: '2026-01-01', expiryDate: '2027-01-01', status: 'active' }
  },
  staff: {
    owner: {
      roleKey: 'staff', roleLabel: 'کارمند اداری', name: 'محمد یما رحیمی', fatherName: 'عبدالقیوم',
      idLabel: 'نمبر کارمند', idValue: 'S-۰۰۴۵', subLabel: 'سمت', subValue: 'محاسب مکتب',
      bloodGroup: 'B+', birthDate: '1991-10-12', province: 'kabul', district: 'ناحیهٔ ۱۰',
      address: 'کوچهٔ دوم، مقابلِ بانک', emergencyName: 'عبدالقیوم',
      emergencyPhone: '۰۷۷۸۸۹۹۰۰۱', photoUrl: ''
    },
    card: { serial: 'AF-IMN-2026-0003', issueDate: '2026-01-01', expiryDate: '2027-01-01', status: 'active' }
  }
};

const IdCardDesignPreview = () => {
  const { settings } = useSiteSettings();
  const schoolName = normalizeBrandName(settings?.brandName) || 'اناثیهٔ ایمان';
  const { schoolLogoUrl } = getPrintLogoUrls(settings || {});

  const [activeRole, setActiveRole] = useState('student');
  const [side, setSide] = useState('front');
  const [sheet, setSheet] = useState(false);

  useEffect(() => {
    document.body.classList.add('has-idc-print');
    return () => document.body.classList.remove('has-idc-print');
  }, []);

  const person = SAMPLE[activeRole];
  const cardEl = side === 'front'
    ? <CardFront person={person} schoolName={schoolName} logoUrl={schoolLogoUrl} />
    : <CardBack person={person} schoolName={schoolName} logoUrl={schoolLogoUrl} />;

  return createPortal(
    <div className="idc-print" dir="rtl">
      <div className="idc-toolbar no-print">
        <div className="idc-tabs">
          {ROLES.map((r) => (
            <button key={r} type="button" className={r === activeRole ? 'idc-tab idc-tab-active' : 'idc-tab'} onClick={() => setActiveRole(r)}>
              {ROLE_TAB_LABELS[r]}
            </button>
          ))}
        </div>
        <div className="idc-toolbar-actions">
          <button type="button" className="idc-side-btn" onClick={() => setSide((s) => (s === 'front' ? 'back' : 'front'))}>
            {side === 'front' ? 'نمایشِ پشتِ کارت' : 'نمایشِ رویِ کارت'}
          </button>
          <label className="idc-sheet-toggle">
            <input type="checkbox" checked={sheet} onChange={(e) => setSheet(e.target.checked)} />
            چیدمانِ ورقِ چاپ (۱۰ کارت)
          </label>
          <button type="button" onClick={() => window.print()}>چاپ</button>
        </div>
      </div>

      {!sheet && (
        <div className="idc-stage no-print-margin">
          <TiltStage interactive>{cardEl}</TiltStage>
        </div>
      )}

      {sheet && (
        <section className="idc-sheet">
          {Array.from({ length: 10 }).map((_, i) => (
            <div className="idc-sheet-cell" key={i}>{cardEl}</div>
          ))}
        </section>
      )}
    </div>,
    document.body
  );
};

export default IdCardDesignPreview;
