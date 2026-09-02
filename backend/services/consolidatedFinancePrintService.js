// سندِ چاپیِ HTML برای گزارشِ مالیِ یکپارچه — «همه بخش‌ها» یا یک بخشِ مشخص.
// خروجی در یک پنجرهٔ جدید باز می‌شود و کاربر با Ctrl+P آن را PDF می‌کند.
const { buildConsolidatedFinanceReport, DOMAIN_KEYS } = require('./consolidatedFinanceReportService');
const { AFGHAN_SOLAR_MONTHS } = require('../utils/afghanDate');

let SiteSettings = null;
try {
  SiteSettings = require('../models/SiteSettings');
} catch {
  SiteSettings = null;
}

const METHOD_LABELS = {
  cash: 'نقدی',
  card: 'کارت',
  bank_transfer: 'انتقال بانکی',
  hawala: 'حواله',
  manual: 'ثبت دستی',
  gateway: 'درگاه پرداخت',
  other: 'سایر'
};

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

function monthKeyLabel(key) {
  const [jy, jm] = String(key || '').split('-').map(Number);
  if (!jy || !jm) return String(key || '');
  return `${AFGHAN_SOLAR_MONTHS[jm - 1] || jm} ${jy}`;
}

function kpiStrip(items) {
  const cells = items
    .filter(Boolean)
    .map((item) => `<div class="kpi"><div class="l">${esc(item.label)}</div><div class="v">${fa(item.value)}${item.suffix ? esc(item.suffix) : ''}</div></div>`)
    .join('');
  return `<div class="kpis">${cells}</div>`;
}

function monthlyTable(monthly) {
  const rows = (Array.isArray(monthly) ? monthly : []).map((row) => `
    <tr>
      <td>${esc(monthKeyLabel(row.month))}</td>
      <td class="num">${fa(row.income)}</td>
      <td class="num">${fa(row.expense)}</td>
      <td class="num">${fa(row.net)}</td>
    </tr>`).join('');
  const sum = (Array.isArray(monthly) ? monthly : []).reduce((acc, row) => ({
    income: acc.income + Number(row.income || 0),
    expense: acc.expense + Number(row.expense || 0),
    net: acc.net + Number(row.net || 0)
  }), { income: 0, expense: 0, net: 0 });
  return `<table>
    <thead><tr><th>ماه</th><th class="num">درآمد</th><th class="num">مصرف</th><th class="num">خالص</th></tr></thead>
    <tbody>${rows}
      <tr class="total"><td>جمع</td><td class="num">${fa(sum.income)}</td><td class="num">${fa(sum.expense)}</td><td class="num">${fa(sum.net)}</td></tr>
    </tbody>
  </table>`;
}

function breakdownTable(title, items, key, labelFn) {
  const list = Array.isArray(items) ? items : [];
  if (!list.length) return `<div><h3>${esc(title)}</h3><p class="muted">موردی ثبت نشده.</p></div>`;
  const rows = list.map((item) => `<tr><td>${esc(labelFn ? labelFn(item[key]) : item[key])}</td><td class="num">${fa(item.total)}</td></tr>`).join('');
  return `<div><h3>${esc(title)}</h3><table><thead><tr><th>${esc(key === 'method' ? 'روش' : 'دسته')}</th><th class="num">مبلغ</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

function debtorTable(debtors) {
  const list = Array.isArray(debtors) ? debtors : [];
  if (!list.length) return '<p class="muted">بدهکاری باز ثبت نشده است.</p>';
  const rows = list.map((row, index) => `
    <tr>
      <td class="num">${fa(index + 1)}</td>
      <td>${esc(row.studentName)}</td>
      <td>${esc(row.asasNumber || row.studentCode || '—')}</td>
      <td>${esc(row.groupName || '—')}</td>
      <td>${esc(row.monthLabel || monthKeyLabel(row.monthKey) || '—')}</td>
      <td class="num">${fa(row.balance)}</td>
    </tr>`).join('');
  const total = list.reduce((sum, row) => sum + Number(row.balance || 0), 0);
  return `<table>
    <thead><tr><th class="num">شماره</th><th>شاگرد</th><th>شماره اساس</th><th>صنف / کورس</th><th>ماه</th><th class="num">باقیات</th></tr></thead>
    <tbody>${rows}
      <tr class="total"><td colspan="5">جمع باقیات</td><td class="num">${fa(total)}</td></tr>
    </tbody>
  </table>`;
}

function domainSection(domain, { pageBreak }) {
  const totals = domain.totals || {};
  return `<section class="sec${pageBreak ? ' brk' : ''}">
    <h2>${esc(domain.label)}</h2>
    ${kpiStrip([
      { label: 'درآمد بازه', value: totals.income },
      { label: 'مصرف بازه', value: totals.expense },
      { label: 'خالص', value: totals.net },
      { label: 'باقیات باز', value: totals.outstanding },
      { label: 'نرخ وصول', value: Math.round(Number(totals.collectionRate) || 0), suffix: '٪' },
      { label: 'شاگردان فعال', value: totals.activeStudents }
    ])}
    ${Number(totals.pendingExpense) > 0 ? `<p class="muted">مصرف بازه شاملِ ${fa(totals.pendingExpense)} افغانی مصرفِ در انتظار تأیید است.</p>` : ''}
    <h3>جدول ماهانه</h3>
    ${monthlyTable(domain.monthly)}
    <div class="cols">
      ${breakdownTable('درآمد بر اساس روش پرداخت', domain.byPaymentMethod, 'method', (value) => METHOD_LABELS[value] || value || 'سایر')}
      ${breakdownTable(`مصرف بر اساس دسته${Number(totals.expenseCount) ? ` — ${fa(totals.expenseCount)} فقره` : ''}`, domain.byExpenseCategory, 'category', null)}
    </div>
    <h3>بدهکاران (${fa(domain.debtorCount)} نفر)</h3>
    ${debtorTable(domain.debtors)}
  </section>`;
}

/**
 * @param {{ section?: string, year?, months?, from?, to?, origin?: string,
 *   branding?: { name?: string, subtitle?: string, principalName?: string } }} opts
 * @returns {Promise<{ html: string, filename: string }>}
 */
async function buildConsolidatedFinancePrintHtml({ section = 'all', year, months, from, to, origin = '', branding = null } = {}) {
  const report = await buildConsolidatedFinanceReport({ year, months, from, to });

  let settings = null;
  if (SiteSettings) {
    try { settings = await SiteSettings.findOne().lean(); } catch { settings = null; }
  }
  // نامِ مکتب از «مکتبِ فعال» (branding) می‌آید؛ اگر نبود، از تنظیماتِ برند.
  const brandName = String(branding?.name || settings?.brandName || 'مکتب').trim();
  const brandSubtitle = String(branding?.subtitle || settings?.brandSubtitle || '').trim();
  const principalName = String(branding?.principalName || '').trim();
  let logo = String(settings?.logoUrl || '').trim();
  if (logo && logo.startsWith('/') && origin) logo = `${origin}${logo}`;

  const wantAll = section === 'all' || !DOMAIN_KEYS.includes(section);
  const domains = wantAll
    ? DOMAIN_KEYS.map((key) => report.domains[key]).filter(Boolean)
    : [report.domains[section]].filter(Boolean);
  const sectionLabel = wantAll ? 'همه بخش‌ها' : (report.domains[section]?.label || section);
  const periodLabel = `${monthKeyLabel(report.period.from)} تا ${monthKeyLabel(report.period.to)}`;
  const printedAt = new Date().toLocaleString('fa-AF-u-ca-persian');

  const combined = report.combined || {};
  const combinedBlock = wantAll ? `<section class="sec">
    <h2>مجموع هر سه بخش</h2>
    ${kpiStrip([
      { label: 'کل درآمد', value: combined.income },
      { label: 'کل مصرف', value: combined.expense },
      { label: 'خالص', value: combined.net },
      { label: 'کل باقیات باز', value: combined.outstanding },
      { label: 'شاگردان فعال', value: combined.activeStudents }
    ])}
    ${Number(combined.pendingExpense) > 0 ? `<p class="muted">کل مصرف شاملِ ${fa(combined.pendingExpense)} افغانی مصرفِ در انتظار تأیید است.</p>` : ''}
    <h3>روند خالص ماهانهٔ ترکیبی</h3>
    ${monthlyTable((report.monthlyTrend || []).map((row) => ({
      month: row.month,
      income: row.combined?.income,
      expense: row.combined?.expense,
      net: row.combined?.net
    })))}
  </section>` : '';

  const hasCombined = Boolean(combinedBlock);
  const sectionsHtml = combinedBlock + domains
    .map((domain, index) => domainSection(domain, { pageBreak: hasCombined || index > 0 }))
    .join('');

  const html = `<!doctype html>
<html lang="fa" dir="rtl">
<head>
<meta charset="utf-8" />
<title>گزارش مالی یکپارچه — ${esc(sectionLabel)}</title>
<style>
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; }
  html, body { background: #ffffff; direction: rtl; }
  body { font-family: 'Vazirmatn', 'B Nazanin', Tahoma, Arial, sans-serif; color: #111; font-size: 11px; direction: rtl; text-align: right; margin: 0; }
  .toolbar { margin: 10px 12px; }
  .toolbar button { font: inherit; padding: 8px 16px; border: 1px solid #0f766e; background: #0f766e; color: #fff; border-radius: 8px; cursor: pointer; }
  .wrap { padding: 4px 4px 30px; }
  .doc-head { display: flex; flex-direction: row; align-items: center; gap: 14px; border-bottom: 2px solid #0f766e; padding-bottom: 10px; margin-bottom: 14px; }
  .doc-head img { height: 54px; width: auto; }
  .doc-head .brand { flex: 1; }
  .doc-head .t1 { font-size: 17px; font-weight: 800; }
  .doc-head .t2 { font-size: 11px; color: #555; margin-top: 3px; }
  .doc-head .meta { text-align: left; font-size: 10px; color: #444; line-height: 1.8; white-space: nowrap; }
  h2 { font-size: 15px; margin: 0 0 10px; color: #0f403b; border-right: 4px solid #0f766e; padding-right: 8px; text-align: right; }
  h3 { font-size: 12px; margin: 14px 0 6px; color: #444; text-align: right; }
  .sec { margin-bottom: 16px; }
  .sec.brk { page-break-before: always; }
  .kpis { display: grid; grid-template-columns: repeat(6, 1fr); gap: 6px; direction: rtl; }
  .kpi { border: 1px solid #dcdcdc; border-radius: 6px; padding: 6px 8px; text-align: right; }
  .kpi .l { font-size: 9px; color: #666; }
  .kpi .v { font-size: 13px; font-weight: 700; font-variant-numeric: tabular-nums; }
  table { width: 100%; border-collapse: collapse; font-size: 10px; margin-top: 4px; direction: rtl; }
  thead { display: table-header-group; }
  th, td { border: 1px solid #d8d8d8; padding: 4px 6px; text-align: right; }
  th { background: #eef3f2; }
  td.num, th.num { font-variant-numeric: tabular-nums; }
  tr.total td { font-weight: 700; background: #f6f6f6; }
  .cols { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; direction: rtl; }
  .muted { color: #888; font-size: 10px; }
  .sign { margin-top: 30px; display: flex; justify-content: space-around; direction: rtl; }
  .sign div { text-align: center; font-size: 10px; color: #333; }
  .sign .line { margin: 34px auto 0; border-top: 1px solid #999; width: 160px; }
  @media print { .toolbar { display: none; } .wrap { padding: 0; } }
</style>
</head>
<body dir="rtl">
  <div class="toolbar"><button type="button" onclick="window.print()">چاپ / ذخیرهٔ PDF</button></div>
  <div class="wrap">
    <div class="doc-head">
      ${logo ? `<img src="${esc(logo)}" alt="" onerror="this.style.display='none'" />` : ''}
      <div class="brand">
        <div class="t1">${esc(brandName)}</div>
        ${brandSubtitle ? `<div class="t2">${esc(brandSubtitle)}</div>` : ''}
        <div class="t2">گزارش مالی یکپارچه — ${esc(sectionLabel)}</div>
      </div>
      <div class="meta">
        <div>بازه: ${esc(periodLabel)}</div>
        <div>مبنا: نقدی · واحد: افغانی</div>
        <div>تاریخ چاپ: ${esc(printedAt)}</div>
      </div>
    </div>
    ${sectionsHtml}
    <div class="sign">
      <div>مدیر مکتب${principalName ? `<div class="t2">${esc(principalName)}</div>` : ''}<div class="line"></div></div>
      <div>مدیر مالی<div class="line"></div></div>
    </div>
  </div>
</body>
</html>`;

  const safeSection = wantAll ? 'all' : section;
  return { html, filename: `consolidated-finance-${safeSection}.html` };
}

module.exports = { buildConsolidatedFinancePrintHtml };
