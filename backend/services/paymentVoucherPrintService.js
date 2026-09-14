// سندِ چاپیِ HTML برای «رسیدِ پرداخت» — مصرفِ معاش یا پیشکی/برداشتِ یک کارمند که
// از قبل در سیستم تایید شده. خروجی در یک پنجرهٔ جدید باز می‌شود یا با Playwright
// (بنگرید sheetTemplatePdfService.buildHtmlPdfBuffer) به PDF تبدیل می‌شود.
//
// این سند جایگزینِ «دفترِ پرداختِ معاش» یا «پیشکی و برداشتِ کارمندان» نیست — همان
// رکوردهای رسمی و زنجیرهٔ تاییدِ دیجیتالی (مدیرِ مالی → آمریتِ مالی → ریاستِ عمومی)
// سرِ جایشان می‌مانند. این فقط یک برگهٔ کاغذیِ اضافه برای سه امضای فیزیکی است:
// گیرندهٔ پول، مدیرِ مالی، مدیرِ مکتب. امضای مدیرِ مکتب یک کنترلِ کاغذیِ مستقل است،
// نه یک مرحلهٔ تازه در گردشِ کارِ دیجیتالی.

const fs = require('fs');
const path = require('path');
const { KIND_LABELS, advanceCapFor } = require('./staffAdvanceService');

// Vazirmatn به‌صورتِ data-URI جاسازی می‌شود، نه فقط با نام در font-family
// ارجاع داده می‌شود: Playwright این HTML را با page.setContent() (بدونِ
// baseURL) می‌رندر می‌کند، پس نه لینکِ نسبی به فایل روی دیسک کار می‌کند نه
// اتصال به اینترنت برای فونتِ گوگل — و امیدوار بودن به اینکه Vazirmatn روی
// سیستم‌عاملِ سرور نصب باشد شکننده است. دو وزنِ لازم (معمولی/ضخیم) یک‌بار در
// زمانِ بارگذاریِ ماژول خوانده و کش می‌شوند؛ اگر فایل نبود، سند بدونِ جاسازی و
// فقط با نامِ فونت (رفتارِ قبلی) رندر می‌شود.
function loadFontFaceCss() {
  try {
    const dir = path.join(__dirname, '..', 'assets', 'fonts');
    const regular = fs.readFileSync(path.join(dir, 'Vazirmatn-Regular.woff2')).toString('base64');
    const bold = fs.readFileSync(path.join(dir, 'Vazirmatn-Bold.woff2')).toString('base64');
    return `
    @font-face { font-family: 'Vazirmatn'; font-weight: 400; font-style: normal; src: url(data:font/woff2;base64,${regular}) format('woff2'); }
    @font-face { font-family: 'Vazirmatn'; font-weight: 700; font-style: normal; src: url(data:font/woff2;base64,${bold}) format('woff2'); }
    `;
  } catch {
    return '';
  }
}
const FONT_FACE_CSS = loadFontFaceCss();

function esc(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function fa(value) {
  return Number(value || 0).toLocaleString('fa-AF-u-ca-persian');
}

const METHOD_LABELS = {
  cash: 'نقدی',
  bank_transfer: 'انتقالِ بانکی',
  hawala: 'حواله',
  manual: 'دستی'
};

// ---- Gregorian -> Jalali (Shamsi) — همان الگوریتمِ استانداردِ jalaali ----
const G_DAYS = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
function gregorianToJalali(gy, gm, gd) {
  let jy = gy <= 1600 ? 0 : 979;
  gy -= gy <= 1600 ? 621 : 1600;
  const gy2 = gm > 2 ? gy + 1 : gy;
  let days = 365 * gy + Math.floor((gy2 + 3) / 4) - Math.floor((gy2 + 99) / 100) + Math.floor((gy2 + 399) / 400) - 80 + gd + G_DAYS[gm - 1];
  jy += 33 * Math.floor(days / 12053);
  days %= 12053;
  jy += 4 * Math.floor(days / 1461);
  days %= 1461;
  if (days > 365) { jy += Math.floor((days - 1) / 365); days = (days - 1) % 365; }
  const jm = days < 186 ? 1 + Math.floor(days / 31) : 7 + Math.floor((days - 186) / 30);
  const jd = 1 + (days < 186 ? days % 31 : (days - 186) % 30);
  return [jy, jm, jd];
}
const SOLAR_MONTHS = ['حمل', 'ثور', 'جوزا', 'سرطان', 'اسد', 'سنبله', 'میزان', 'عقرب', 'قوس', 'جدی', 'دلو', 'حوت'];

function formatGregorian(value) {
  const d = value ? new Date(value) : null;
  if (!d || Number.isNaN(d.getTime())) return '—';
  return `${d.getUTCFullYear()}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${String(d.getUTCDate()).padStart(2, '0')}`;
}
function formatShamsi(value) {
  const d = value ? new Date(value) : null;
  if (!d || Number.isNaN(d.getTime())) return '';
  const [jy, jm, jd] = gregorianToJalali(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
  return `${fa(jd)} ${SOLAR_MONTHS[jm - 1]} ${fa(jy)}`;
}

// ---- عدد → حروفِ دری ----
const ONES = ['', 'یک', 'دو', 'سه', 'چهار', 'پنج', 'شش', 'هفت', 'هشت', 'نه'];
const TEENS = ['ده', 'یازده', 'دوازده', 'سیزده', 'چهارده', 'پانزده', 'شانزده', 'هفده', 'هجده', 'نوزده'];
const TENS = ['', '', 'بیست', 'سی', 'چهل', 'پنجاه', 'شصت', 'هفتاد', 'هشتاد', 'نود'];
const HUNDREDS = ['', 'یکصد', 'دوصد', 'سیصد', 'چهارصد', 'پانصد', 'ششصد', 'هفتصد', 'هشتصد', 'نهصد'];
const SCALES = ['', 'هزار', 'میلیون', 'میلیارد'];
function threeDigitsToWords(n) {
  const parts = [];
  const h = Math.floor(n / 100);
  const rem = n % 100;
  if (h) parts.push(HUNDREDS[h]);
  if (rem >= 10 && rem < 20) parts.push(TEENS[rem - 10]);
  else {
    const t = Math.floor(rem / 10);
    const o = rem % 10;
    if (t) parts.push(TENS[t]);
    if (o) parts.push(ONES[o]);
  }
  return parts.join(' و ');
}
function toDariWords(num) {
  num = Math.floor(Math.abs(Number(num) || 0));
  if (num === 0) return 'صفر';
  const groups = [];
  let n = num;
  while (n > 0) { groups.push(n % 1000); n = Math.floor(n / 1000); }
  const words = [];
  for (let i = groups.length - 1; i >= 0; i -= 1) {
    if (!groups[i]) continue;
    const g = threeDigitsToWords(groups[i]);
    words.push(SCALES[i] ? `${g} ${SCALES[i]}` : g);
  }
  return words.join(' و ');
}

function docShell({ title, badgeLabel, docCode, dateValue, brandName, brandSubtitle, detailTitle, detailFields, recipient, methodLabel, total, capNote, filenameBase }) {
  const printedAt = formatGregorian(new Date());
  const recipientFields = [
    ['نام و تخلص', recipient.name || '—'],
    ['سمت / وظیفه', recipient.position || '—'],
    ['شمارهٔ کارمند', recipient.employeeId || '—'],
    ['روشِ پرداخت', methodLabel]
  ];
  const fieldRow = ([label, value]) => `<div class="field"><span class="l">${esc(label)}</span><span class="v">${esc(value)}</span></div>`;

  const html = `<!doctype html>
<html lang="fa" dir="rtl">
<head>
<meta charset="utf-8" />
<title>${esc(title)}</title>
<style>
  ${FONT_FACE_CSS}
  @page { size: A4; margin: 14mm 12mm; }
  * { box-sizing: border-box; }
  html, body { background: #ffffff; }
  body { font-family: 'Vazirmatn', 'B Nazanin', Tahoma, Arial, sans-serif; color: #16221f; font-size: 12px; direction: rtl; text-align: right; margin: 0; }
  .toolbar { margin: 10px 12px; }
  .toolbar button { font: inherit; padding: 8px 16px; border: 1px solid #7a2a20; background: #7a2a20; color: #fff; border-radius: 6px; cursor: pointer; }
  .wrap { padding: 4px 6px 24px; }
  .head { display: flex; align-items: flex-start; justify-content: space-between; gap: 14px; border-bottom: 2px solid #4c6459; padding-bottom: 12px; margin-bottom: 16px; }
  .head .t1 { font-size: 14px; font-weight: 800; }
  .head .t2 { font-size: 10.5px; color: #5a6b64; margin-top: 3px; }
  .head .doc-title { font-size: 19px; font-weight: 800; margin-top: 10px; }
  .head .badge { display: inline-block; font-size: 11px; font-weight: 700; border: 1.2px solid #7a2a20; color: #7a2a20; border-radius: 20px; padding: 3px 14px; margin-top: 8px; }
  .head .meta { text-align: left; font-size: 10.5px; color: #444; line-height: 1.9; white-space: nowrap; }
  h2.sec { font-size: 11.5px; color: #3b544f; border-bottom: 1px solid #a9bcae; padding-bottom: 4px; margin: 18px 0 8px; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 3px 26px; }
  .field { border-bottom: 1px solid #dbe3de; padding: 5px 2px 6px; display: flex; justify-content: space-between; gap: 10px; }
  .field .l { color: #5a6b64; }
  .field .v { font-weight: 700; font-variant-numeric: tabular-nums; }
  .amount { border: 1.4px solid #4c6459; border-radius: 6px; padding: 12px 16px; margin: 18px 0; display: flex; flex-direction: column; gap: 5px; }
  .amount .n { font-size: 13px; color: #5a6b64; }
  .amount .n b { font-size: 24px; color: #7a2a20; font-weight: 800; font-variant-numeric: tabular-nums; }
  .amount .w { font-size: 12px; color: #374b45; }
  .amount .c { font-size: 10.5px; color: #5a6b64; margin-top: 2px; }
  .sign { margin-top: 22px; display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; }
  .sign .box { border: 1px solid #a9bcae; border-radius: 6px; padding: 12px; }
  .sign .box h3 { margin: 0 0 4px; font-size: 12px; }
  .sign .box p { margin: 0 0 10px; font-size: 9.5px; color: #5a6b64; line-height: 1.5; }
  .sign .name { font-size: 11px; margin-bottom: 18px; }
  .sign .line { border-top: 1px dashed #6e8a7d; padding-top: 4px; font-size: 9px; color: #8a9a94; margin-bottom: 8px; }
  .sign .date { font-size: 10.5px; color: #5a6b64; }
  .foot { margin-top: 20px; font-size: 9.5px; color: #5a6b64; text-align: center; }
  @media print { .toolbar { display: none; } }
</style>
</head>
<body dir="rtl">
  <div class="toolbar"><button type="button" onclick="window.print()">چاپ / ذخیرهٔ PDF</button></div>
  <div class="wrap">
    <div class="head">
      <div class="brand">
        <div class="t1">${esc(brandName || 'مکتب')}</div>
        ${brandSubtitle ? `<div class="t2">${esc(brandSubtitle)}</div>` : ''}
        <div class="doc-title">${esc(title)}</div>
        <span class="badge">${esc(badgeLabel)}</span>
      </div>
      <div class="meta">
        <div>کدِ سند: ${esc(docCode)}</div>
        <div>تاریخ: ${esc(formatGregorian(dateValue))} (${esc(formatShamsi(dateValue))})</div>
        <div>تاریخِ چاپ: ${esc(printedAt)}</div>
      </div>
    </div>

    <h2 class="sec">مشخصاتِ گیرنده</h2>
    <div class="grid">${recipientFields.map(fieldRow).join('')}</div>

    <h2 class="sec">${esc(detailTitle)}</h2>
    <div class="grid">${detailFields.map(fieldRow).join('')}</div>

    <div class="amount">
      <div class="n">مبلغِ قابلِ پرداخت: <b>${fa(total)}</b> افغانی</div>
      <div class="w">به حروف: ${esc(toDariWords(total))} افغانی</div>
      ${capNote ? `<div class="c">${esc(capNote)}</div>` : ''}
    </div>

    <div class="sign">
      <div class="box">
        <h3>گیرندهٔ پول</h3>
        <p>با امضای زیر، دریافتِ مبلغِ فوق را تأیید می‌کنم.</p>
        <div class="name">نام: ${esc(recipient.name || '')}</div>
        <div class="line">امضا</div>
        <div class="date">تاریخ: ..........................</div>
      </div>
      <div class="box">
        <h3>مدیرِ مالی</h3>
        <p>محاسبه و صحتِ مبلغ تأیید می‌شود.</p>
        <div class="name">نام: ..........................</div>
        <div class="line">امضا</div>
        <div class="date">تاریخ: ..........................</div>
      </div>
      <div class="box">
        <h3>مدیرِ مکتب</h3>
        <p>تأییدِ نهایی و صدورِ اجازهٔ پرداخت.</p>
        <div class="name">نام: ..........................</div>
        <div class="line">امضا</div>
        <div class="date">تاریخ: ..........................</div>
      </div>
    </div>

    <div class="foot">این سند بخشِ رسمیِ دفترِ مالیِ مکتب است؛ پس از تکمیلِ هر سه امضا در دوسیهٔ مصارف بایگانی شود.</div>
  </div>
</body>
</html>`;

  return { html, filename: `${filenameBase}.html` };
}

/**
 * رسیدِ پرداختِ معاش — از یک StaffSalaryPayment سریالایزشده (serializeStaffSalaryPayment).
 */
function buildSalaryVoucherHtml({ payment, treasuryAccountLabel = '', branding = null } = {}) {
  const monthLabel = formatShamsi(payment.paymentDate).split(' ').slice(1).join(' ');
  const docCode = `S-${String(payment._id || '').slice(-6).toUpperCase()}`;
  return docShell({
    title: 'رسیدِ پرداختِ معاش',
    badgeLabel: monthLabel || 'دورهٔ معاش',
    docCode,
    dateValue: payment.paymentDate,
    brandName: branding?.brandName,
    brandSubtitle: branding?.brandSubtitle,
    detailTitle: 'جزئیاتِ معاش',
    detailFields: [
      ['دورهٔ معاش', monthLabel || payment.period || '—'],
      ['معاشِ اساسی (؋)', fa(payment.grossSalary)],
      ['کسرِ اقساطِ پیشکی (؋)', fa(payment.deductionTotal)],
      ['حسابِ خزانه', treasuryAccountLabel || '—']
    ],
    recipient: payment.staff || {},
    methodLabel: METHOD_LABELS[payment.paymentMethod] || 'دستی',
    total: payment.netAmount,
    capNote: '',
    filenameBase: `receipt-salary-${docCode}`
  });
}

/**
 * رسیدِ پیشکی/برداشت — از یک StaffAdvance سریالایزشده (serializeStaffAdvance).
 */
function buildAdvanceVoucherHtml({ advance, treasuryAccountLabel = '', branding = null } = {}) {
  const docCode = `A-${String(advance._id || '').slice(-6).toUpperCase()}`;
  const repaymentLabel = advance.repaymentPlan?.mode === 'installments'
    ? `اقساطِ ماهانه (${fa(advance.repaymentPlan.months)} ماه)`
    : 'یکجا از معاشِ بعدی';
  return docShell({
    title: 'رسیدِ پیشکی و برداشت',
    badgeLabel: advance.kindLabel || KIND_LABELS[advance.kind] || 'پیشکی',
    docCode,
    dateValue: advance.issueDate,
    brandName: branding?.brandName,
    brandSubtitle: branding?.brandSubtitle,
    detailTitle: 'جزئیاتِ پیشکی و برداشت',
    detailFields: [
      ['نوعِ برداشت', advance.kindLabel || KIND_LABELS[advance.kind] || '—'],
      ['معاشِ ماهانهٔ مبنا (؋)', fa(advance.monthlySalaryBasis)],
      ['سقفِ مجاز (؋)', fa(advance.cap ?? advanceCapFor(advance.kind, advance.monthlySalaryBasis))],
      ['پلانِ بازپرداخت', repaymentLabel],
      ['دلیل / شرح', advance.reason || '—'],
      ['حسابِ خزانه', treasuryAccountLabel || '—']
    ],
    recipient: advance.staff || {},
    methodLabel: METHOD_LABELS[advance.paymentMethod] || 'دستی',
    total: advance.amount,
    capNote: '',
    filenameBase: `receipt-advance-${docCode}`
  });
}

module.exports = {
  buildSalaryVoucherHtml,
  buildAdvanceVoucherHtml,
  toDariWords
};
