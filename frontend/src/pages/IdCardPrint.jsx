import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams } from 'react-router-dom';
import useSiteSettings from '../hooks/useSiteSettings';
import { normalizeBrandName } from '../utils/brand';
import { getPrintLogoUrls, toAssetUrl } from '../utils/printLogos';
import { provinceLabel } from '../config/afghanStudentFields';
import { formatAfghanStoredDateLabel } from '../utils/afghanDate';
import { fetchJson, postJson } from './adminWorkspaceUtils';
import './IdCardPrint.css';

// چاپِ کارتِ هویت — شیشه‌ای/سه‌بعدی با واترمارکِ ضدِ تقلب، رویِ دادهٔ واقعیِ
// شاگرد/استاد/کارمند. این صفحه از فهرستِ «کارت‌های هویت» باز می‌شود:
//   /id-cards/print?type=student|personnel&ids=id1,id2,...&mode=single|batch

const ROLE_ACCENTS = {
  student: { accent: '#0d9488', accentDark: '#0f3d3a' },
  teacher: { accent: '#d97706', accentDark: '#5a2e08' },
  staff: { accent: '#1d4ed8', accentDark: '#0b1f4d' }
};

const STATUS_LABELS_FA = {
  active: 'فعال', lost: 'گم‌شده', revoked: 'باطل', expired: 'منقضی', reissued: 'صادرشدهٔ مجدد'
};

const QrPlaceholder = ({ size = 46 }) => (
  <svg viewBox="0 0 100 100" width={size} height={size} className="idc-qr" aria-hidden="true">
    <rect width="100" height="100" fill="#fff" />
    {[
      [0, 0], [10, 0], [20, 0], [0, 10], [20, 10], [0, 20], [10, 20], [20, 20],
      [40, 0], [60, 0], [80, 0], [40, 10], [80, 10], [40, 20], [50, 20], [70, 20], [80, 20],
      [0, 40], [0, 50], [0, 60], [10, 50], [20, 40], [20, 60],
      [40, 40], [50, 50], [60, 40], [70, 50], [80, 40], [40, 60], [60, 70], [80, 80],
      [80, 60], [90, 40], [90, 80], [50, 80], [30, 80], [30, 90], [60, 90], [10, 80], [10, 90]
    ].map(([x, y]) => (
      <rect key={`${x}-${y}`} x={x} y={y} width="10" height="10" fill="#111" />
    ))}
  </svg>
);

// لایهٔ ضدِ تقلب: بافتِ ریزِ خط‌چین (گیوشه) + کاشی‌کاریِ کم‌نورِ لوگو + واترمارکِ بزرگِ نامِ مکتب.
const SecurityLayers = ({ logoUrl, schoolName }) => (
  <>
    <div className="idc-guilloche" aria-hidden="true" />
    {logoUrl && <div className="idc-wm-tile" style={{ backgroundImage: `url(${logoUrl})` }} aria-hidden="true" />}
    <div className="idc-wm-ghost" aria-hidden="true">{schoolName}</div>
  </>
);

const validityLabel = (card) => {
  const from = card?.issueDate ? formatAfghanStoredDateLabel(card.issueDate) : '';
  const to = card?.expiryDate ? formatAfghanStoredDateLabel(card.expiryDate) : '';
  if (from && to) return `${from} — ${to}`;
  return to || from || '—';
};

export const CardFront = ({ person, schoolName, logoUrl }) => {
  const { owner, card } = person;
  const { accent, accentDark } = ROLE_ACCENTS[owner.roleKey] || ROLE_ACCENTS.staff;
  const photoUrl = owner.photoUrl ? toAssetUrl(owner.photoUrl) : '';
  return (
    <div className="idc-card" style={{ '--idc-accent': accent, '--idc-accent-dark': accentDark }}>
      <SecurityLayers logoUrl={logoUrl} schoolName={schoolName} />
      <div className="idc-glare" aria-hidden="true" />
      <div className="idc-holo" aria-hidden="true" />

      <div className="idc-content">
        <div className="idc-band">
          <div className="idc-logo">{logoUrl ? <img src={logoUrl} alt="" /> : <span>لوگو</span>}</div>
          <div className="idc-band-text">
            <strong>{schoolName}</strong>
            <span>کارت هویت</span>
          </div>
          <span className="idc-role-badge">{owner.roleLabel}</span>
        </div>

        <div className="idc-body">
          <div className="idc-photo">
            {photoUrl ? <img src={photoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 6 }} /> : <span>عکس</span>}
          </div>
          <div className="idc-fields">
            <div className="idc-name">{owner.name || '—'}</div>
            <div className="idc-row"><span className="idc-k">ولد</span><span className="idc-v">{owner.fatherName || '—'}</span></div>
            <div className="idc-row"><span className="idc-k">{owner.subLabel}</span><span className="idc-v">{owner.subValue}</span></div>
            <div className="idc-row"><span className="idc-k">{owner.idLabel}</span><span className="idc-v idc-mono">{owner.idValue || '—'}</span></div>
            <div className="idc-row"><span className="idc-k">گروپ خونی</span><span className="idc-v">{owner.bloodGroup || '—'}</span></div>
          </div>
        </div>

        <div className="idc-foot">
          <QrPlaceholder size={34} />
          <div className="idc-foot-text">
            <span>اعتبار: {validityLabel(card)}</span>
            <span className="idc-sign">مهر و امضای مدیر مکتب</span>
          </div>
        </div>
      </div>
      <div className="idc-microtext">{Array(4).fill(`SEC · ${card.serial}`).join('   ·   ')}</div>
    </div>
  );
};

export const CardBack = ({ person, schoolName, logoUrl }) => {
  const { owner, card } = person;
  const { accent, accentDark } = ROLE_ACCENTS[owner.roleKey] || ROLE_ACCENTS.staff;
  // ولایت/ولسوالی/آدرس گاهی در دادهٔ ثبت‌شده هم‌پوشانی دارند (مثلاً «آدرس» عیناً
  // همان متنِ «ولسوالی» تکرار شده) — قبل از نمایش، مقادیرِ تکراری یا زیرمجموعه‌ی
  // یک مقدارِ دیگر حذف می‌شوند تا آدرس دوبار چاپ نشود.
  const addressParts = [provinceLabel(owner.province), owner.district, owner.address]
    .map((v) => String(v || '').trim())
    .filter(Boolean);
  const uniqueParts = [...new Set(addressParts)]
    .filter((part, i, arr) => !arr.some((other, j) => j !== i && other.length > part.length && other.includes(part)));
  const addressLine = uniqueParts.join('، ');
  const emergency = [owner.emergencyName, owner.emergencyPhone].filter(Boolean).join(' — ');
  return (
    <div className="idc-card idc-card-back" style={{ '--idc-accent': accent, '--idc-accent-dark': accentDark }}>
      <SecurityLayers logoUrl={logoUrl} schoolName={schoolName} />
      <div className="idc-glare" aria-hidden="true" />

      <div className="idc-content">
        <div className="idc-back-head">{schoolName} — پشتِ کارت</div>
        <ul className="idc-rules">
          <li>این کارت متعلق به مکتب بوده و در صورت گم‌شدن باید فوراً اطلاع داده شود.</li>
          <li>استفادهٔ این کارت توسط شخص دیگر مجاز نیست.</li>
          <li>در صورت ختم دورهٔ تحصیلی/وظیفوی، کارت باید به ادارهٔ مکتب تسلیم شود.</li>
        </ul>
        <div className="idc-back-grid">
          <div><span className="idc-k">تاریخ تولد</span><span className="idc-v">{owner.birthDate ? formatAfghanStoredDateLabel(owner.birthDate) : '—'}</span></div>
          <div><span className="idc-k">آدرس</span><span className="idc-v">{addressLine || '—'}</span></div>
          <div><span className="idc-k">تماس اضطراری</span><span className="idc-v">{emergency || '—'}</span></div>
        </div>
        <div className="idc-back-foot">
          <QrPlaceholder size={54} />
          <div className="idc-stamp">جای مهر</div>
        </div>
      </div>
    </div>
  );
};

export const TiltStage = ({ interactive, children }) => {
  const ref = useRef(null);
  const [vars, setVars] = useState({ rx: 8, ry: -12, mx: 72, my: 18 });

  const handleMove = (e) => {
    if (!interactive || !ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width;
    const py = (e.clientY - rect.top) / rect.height;
    setVars({ rx: -(py - 0.5) * 22, ry: (px - 0.5) * 28, mx: px * 100, my: py * 100 });
  };
  const handleLeave = () => {
    if (!interactive) return;
    setVars({ rx: 8, ry: -12, mx: 72, my: 18 });
  };

  return (
    <div
      ref={ref}
      className="idc-tilt-stage"
      onMouseMove={handleMove}
      onMouseLeave={handleLeave}
      style={{ '--rx': `${vars.rx}deg`, '--ry': `${vars.ry}deg`, '--mx': `${vars.mx}%`, '--my': `${vars.my}%` }}
    >
      {children}
    </div>
  );
};

const IdCardPrint = () => {
  const { settings } = useSiteSettings();
  const schoolName = normalizeBrandName(settings?.brandName) || 'اناثیهٔ ایمان';
  const { schoolLogoUrl } = getPrintLogoUrls(settings || {});
  const [params] = useSearchParams();

  const ownerType = params.get('type') === 'personnel' ? 'personnel' : 'student';
  const ids = useMemo(
    () => String(params.get('ids') || '').split(',').map((v) => v.trim()).filter(Boolean),
    [params]
  );
  const explicitBatch = params.get('mode') === 'batch';

  const [people, setPeople] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [side, setSide] = useState('front');

  useEffect(() => {
    document.body.classList.add('has-idc-print');
    return () => document.body.classList.remove('has-idc-print');
  }, []);

  useEffect(() => {
    let alive = true;
    if (!ids.length) {
      setLoading(false);
      setError('هیچ فردی برای چاپ انتخاب نشده است. این صفحه باید از فهرستِ «کارت‌های هویت» باز شود.');
      return undefined;
    }
    (async () => {
      setLoading(true);
      setError('');
      try {
        const results = await Promise.all(
          ids.map((id) => fetchJson(`/api/id-cards/${ownerType}/${id}`).then((res) => res?.data))
        );
        if (!alive) return;
        setPeople(results.filter(Boolean));
      } catch (err) {
        if (alive) setError(err?.message || 'دریافتِ اطلاعاتِ کارت ناموفق بود.');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [ownerType, ids]);

  const isBatch = explicitBatch || people.length > 1;
  const nonActive = people.filter((p) => p.card?.status && p.card.status !== 'active');

  // ثبتِ رویدادِ چاپ برایِ هرکس (سریِ جداگانه چون idِ هر شخص لازم است، نه role)
  const logPrints = async () => {
    try {
      await Promise.all(ids.map((id, i) => postJson(`/api/id-cards/${ownerType}/${id}/print-log`, {
        mode: isBatch ? 'batch' : 'single',
        side
      })));
    } catch {
      // بی‌خطر — فقط برایِ ردِ چاپ
    }
  };

  const onPrintClick = () => {
    window.print();
    logPrints();
  };

  if (loading) {
    return createPortal(<div className="idc-print" dir="rtl"><p className="no-print" style={{ color: '#fff', padding: 24 }}>در حال بارگذاری…</p></div>, document.body);
  }

  return createPortal(
    <div className="idc-print" dir="rtl">
      <div className="idc-toolbar no-print">
        <div className="idc-tabs">
          <span style={{ color: '#e2e8f0', fontWeight: 700, fontSize: 13 }}>
            {error ? 'خطا' : `${people.length.toLocaleString('fa-AF')} کارت آمادهٔ چاپ`}
          </span>
        </div>
        <div className="idc-toolbar-actions">
          <button type="button" className="idc-side-btn" onClick={() => setSide((s) => (s === 'front' ? 'back' : 'front'))}>
            {side === 'front' ? 'نمایشِ پشتِ کارت' : 'نمایشِ رویِ کارت'}
          </button>
          <button type="button" onClick={onPrintClick} disabled={!!error || !people.length}>چاپ</button>
          <button type="button" onClick={() => window.close()}>بستن</button>
        </div>
      </div>

      {error && <p className="no-print" style={{ color: '#fecaca', textAlign: 'center', maxWidth: 480, margin: '0 auto' }}>{error}</p>}

      {!error && !!nonActive.length && (
        <p className="no-print" style={{ color: '#fde68a', textAlign: 'center', maxWidth: 480, margin: '0 auto 10px', fontSize: 13 }}>
          توجه: {nonActive.length.toLocaleString('fa-AF')} نفر از این‌ها وضعیتِ کارتشان «{STATUS_LABELS_FA[nonActive[0].card.status] || nonActive[0].card.status}» است — پیش از چاپ بررسی کنید.
        </p>
      )}

      {!error && !isBatch && people[0] && (
        <div className="idc-stage no-print-margin">
          <TiltStage interactive>
            {side === 'front'
              ? <CardFront person={people[0]} schoolName={schoolName} logoUrl={schoolLogoUrl} />
              : <CardBack person={people[0]} schoolName={schoolName} logoUrl={schoolLogoUrl} />}
          </TiltStage>
        </div>
      )}

      {!error && isBatch && (
        <section className="idc-sheet">
          {people.map((person) => (
            <div className="idc-sheet-cell" key={`${person.owner.idValue}-${person.card._id || person.card.serial}`}>
              {side === 'front'
                ? <CardFront person={person} schoolName={schoolName} logoUrl={schoolLogoUrl} />
                : <CardBack person={person} schoolName={schoolName} logoUrl={schoolLogoUrl} />}
            </div>
          ))}
        </section>
      )}
    </div>,
    document.body
  );
};

export default IdCardPrint;
