const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const { formatFinanceCode } = require('./latinFinanceCode');

const FONT_PATH = path.join(__dirname, '..', '..', 'Fonts', 'B Nazanin_p30download.com.ttf');
// This font can be enabled again once we validate a PDFKit-safe Persian font.
const HAS_FINANCE_FONT = String(process.env.FINANCE_PDF_FONT_ENABLED || 'false').toLowerCase() === 'true'
  && fs.existsSync(FONT_PATH);

const faNumber = new Intl.NumberFormat('fa-AF-u-ca-persian');
const faDateTime = new Intl.DateTimeFormat('fa-AF-u-ca-persian', {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit'
});

function formatNumber(value) {
  return faNumber.format(Number(value || 0));
}

function formatMoney(value, currency = 'AFN') {
  return `${formatNumber(value)} ${currency || 'AFN'}`;
}

function formatDateTime(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  try {
    return faDateTime.format(date);
  } catch {
    return date.toISOString();
  }
}

function sanitizeLine(value = '') {
  return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
}

function withPdfDocument(meta = {}, build = () => {}) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margin: 42,
      info: {
        Title: meta.title || 'Finance PDF',
        Subject: meta.subject || 'Finance export',
        Author: 'School Project',
        Creator: 'School Project Finance Core',
        Keywords: 'finance, statement, month-close, pdf'
      }
    });

    if (HAS_FINANCE_FONT) {
      doc.registerFont('finance-base', FONT_PATH);
      doc.font('finance-base');
    }

    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    build(doc);
    doc.end();
  });
}

function setBodyFont(doc, size = 11) {
  if (HAS_FINANCE_FONT) {
    doc.font('finance-base');
  } else {
    doc.font('Helvetica');
  }
  doc.fontSize(size);
}

function ensureSpace(doc, minHeight = 80) {
  if (doc.y + minHeight <= doc.page.height - doc.page.margins.bottom) return;
  doc.addPage();
  setBodyFont(doc, 11);
}

function drawHeader(doc, { title = '', subtitle = '', documentNo = '', statusLabel = '' } = {}) {
  const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const top = doc.y;

  doc.save();
  doc.roundedRect(doc.page.margins.left, top, pageWidth, 74, 12).fill('#0f172a');
  doc.restore();

  doc.fillColor('#ffffff');
  setBodyFont(doc, 18);
  doc.text(sanitizeLine(title), doc.page.margins.left + 14, top + 12, {
    width: pageWidth - 28,
    align: 'right'
  });
  setBodyFont(doc, 10);
  doc.text(sanitizeLine(subtitle), doc.page.margins.left + 14, top + 38, {
    width: pageWidth - 28,
    align: 'right'
  });
  doc.text(`Doc No: ${sanitizeLine(documentNo || '-')}`, doc.page.margins.left + 14, top + 54, {
    width: (pageWidth / 2) - 14,
    align: 'left'
  });
  doc.text(`Status: ${sanitizeLine(statusLabel || '-')}`, doc.page.margins.left + (pageWidth / 2), top + 54, {
    width: (pageWidth / 2) - 14,
    align: 'right'
  });
  doc.fillColor('#0f172a');
  doc.y = top + 90;
}

function drawMetaLines(doc, lines = []) {
  setBodyFont(doc, 10);
  lines.filter(Boolean).forEach((line) => {
    ensureSpace(doc, 18);
    doc.fillColor('#334155').text(sanitizeLine(line), {
      align: 'right'
    });
  });
  doc.moveDown(0.4);
}

function drawSectionTitle(doc, title = '') {
  ensureSpace(doc, 28);
  doc.moveDown(0.4);
  doc.fillColor('#0f172a');
  setBodyFont(doc, 13);
  doc.text(sanitizeLine(title), { align: 'right', underline: true });
  doc.moveDown(0.3);
  setBodyFont(doc, 11);
}

function drawVerificationBlock(doc, {
  generatedByName = '',
  verificationCode = '',
  verificationUrl = '',
  verificationQrBuffer = null
} = {}) {
  const hasVerificationCode = Boolean(sanitizeLine(verificationCode));
  const hasVerificationUrl = Boolean(sanitizeLine(verificationUrl));
  const hasGeneratedBy = Boolean(sanitizeLine(generatedByName));
  const hasQr = Buffer.isBuffer(verificationQrBuffer) && verificationQrBuffer.length > 0;

  if (!hasVerificationCode && !hasVerificationUrl && !hasGeneratedBy && !hasQr) {
    return;
  }

  ensureSpace(doc, hasQr ? 120 : 74);
  const x = doc.page.margins.left;
  const y = doc.y;
  const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const boxHeight = hasQr ? 100 : 64;

  doc.save();
  doc.roundedRect(x, y, width, boxHeight, 12).fill('#eff6ff');
  doc.restore();

  doc.fillColor('#0f172a');
  setBodyFont(doc, 12);
  doc.text('Verification', x + 14, y + 10, {
    width: width - 28,
    align: 'right'
  });

  const contentWidth = hasQr ? width - 118 : width - 28;
  const contentX = x + 14;
  let textY = y + 30;
  setBodyFont(doc, 9.5);
  if (hasGeneratedBy) {
    doc.text(`Generated By: ${sanitizeLine(generatedByName)}`, contentX, textY, {
      width: contentWidth,
      align: 'right'
    });
    textY += 16;
  }
  if (hasVerificationCode) {
    doc.text(`Verification Code: ${sanitizeLine(verificationCode)}`, contentX, textY, {
      width: contentWidth,
      align: 'right'
    });
    textY += 16;
  }
  if (hasVerificationUrl) {
    doc.text(`Verify URL: ${sanitizeLine(verificationUrl)}`, contentX, textY, {
      width: contentWidth,
      align: 'right'
    });
  }

  if (hasQr) {
    try {
      doc.image(verificationQrBuffer, x + width - 90, y + 16, {
        fit: [68, 68],
        align: 'center',
        valign: 'center'
      });
    } catch {
      // Ignore QR rendering failures so document generation remains resilient.
    }
  }

  doc.y = y + boxHeight + 10;
}

function drawKeyValueList(doc, rows = []) {
  rows.filter((row) => row && row.label).forEach((row) => {
    ensureSpace(doc, 18);
    doc.fillColor('#0f172a').text(`${sanitizeLine(row.label)}: ${sanitizeLine(row.value)}`, {
      align: 'right'
    });
  });
  doc.moveDown(0.3);
}

function drawItemList(doc, items = [], emptyText = 'No items registered.') {
  const safeItems = Array.isArray(items) ? items.filter(Boolean) : [];
  if (!safeItems.length) {
    setBodyFont(doc, 10);
    doc.fillColor('#64748b').text(sanitizeLine(emptyText), { align: 'right' });
    doc.moveDown(0.3);
    return;
  }

  safeItems.forEach((item) => {
    ensureSpace(doc, 28);
    setBodyFont(doc, 10.5);
    doc.fillColor('#0f172a').text(`- ${sanitizeLine(item.title || item.label || item.name || '-')}`, {
      align: 'right'
    });
    if (item.meta) {
      setBodyFont(doc, 9.5);
      doc.fillColor('#475569').text(sanitizeLine(item.meta), { align: 'right', indent: 12 });
    }
  });
  doc.moveDown(0.3);
}

function buildStatementDocumentNo(prefix = 'SFP', id = '') {
  const base = sanitizeLine(id).replace(/[^a-zA-Z0-9_-]+/g, '').slice(-8) || 'DOC';
  const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  return `${prefix}-${base}-${datePart}`;
}

function buildMonthCloseDocumentNo(monthKey = '', id = '') {
  const normalizedMonth = sanitizeLine(monthKey).replace(/[^0-9-]+/g, '') || 'month';
  const tail = sanitizeLine(id).replace(/[^a-zA-Z0-9_-]+/g, '').slice(-6) || 'PACK';
  return `MC-${normalizedMonth}-${tail.toUpperCase()}`;
}

function buildGovernmentSnapshotDocumentNo(snapshot = {}) {
  const reportType = sanitizeLine(snapshot?.reportType || 'report').replace(/[^a-zA-Z0-9_-]+/g, '').slice(0, 3).toUpperCase() || 'GOV';
  const version = String(Number(snapshot?.version || 1) || 1);
  const tail = sanitizeLine(snapshot?._id || snapshot?.id || 'PACK').replace(/[^a-zA-Z0-9_-]+/g, '').slice(-6) || 'PACK';
  return `GF-${reportType}-${version}-${tail.toUpperCase()}`;
}

async function buildStatementPackPdfBuffer({
  title = 'Finance Statement Pack',
  subtitle = 'Official finance statement export',
  subjectName = 'Student',
  classTitle = '-',
  academicYearTitle = '-',
  membershipId = '-',
  generatedAt = null,
  currency = 'AFN',
  totals = {},
  pack = null,
  latestApprovedPayment = null,
  latestPendingPayment = null,
  orders = [],
  payments = [],
  reliefs = [],
  documentNo = '',
  generatedByName = '',
  verificationCode = '',
  verificationUrl = '',
  verificationQrBuffer = null
} = {}) {
  return withPdfDocument({ title, subject: subtitle }, (doc) => {
    drawHeader(doc, {
      title,
      subtitle,
      documentNo: documentNo || buildStatementDocumentNo('SFP', membershipId),
      statusLabel: totals.totalOutstanding > 0 ? 'Open balance' : 'Settled'
    });

    drawMetaLines(doc, [
      `Subject: ${subjectName}`,
      `Class: ${classTitle}`,
      `Academic Year: ${academicYearTitle}`,
      `Membership ID: ${membershipId}`,
      `Generated At: ${formatDateTime(generatedAt)}`
    ]);

    drawVerificationBlock(doc, {
      generatedByName,
      verificationCode,
      verificationUrl,
      verificationQrBuffer
    });

    drawSectionTitle(doc, 'Summary');
    drawKeyValueList(doc, [
      { label: 'Total Orders', value: formatNumber(totals.totalOrders || 0) },
      { label: 'Total Payments', value: formatNumber(totals.totalPayments || 0) },
      { label: 'Total Due', value: formatMoney(totals.totalDue || 0, currency) },
      { label: 'Total Paid', value: formatMoney(totals.totalPaid || 0, currency) },
      { label: 'Outstanding', value: formatMoney(totals.totalOutstanding || 0, currency) },
      { label: 'Active Reliefs', value: formatNumber(totals.totalReliefs || 0) },
      { label: 'Fixed Relief Amount', value: formatMoney(totals.totalFixedReliefAmount || 0, currency) }
    ]);

    drawSectionTitle(doc, 'Action & Signals');
    drawKeyValueList(doc, [
      { label: 'Recommended Action', value: sanitizeLine(pack?.recommendedAction || 'No special action') },
      { label: 'Signals', value: formatNumber(pack?.summary?.total || 0) },
      { label: 'Critical Signals', value: formatNumber(pack?.summary?.critical || 0) }
    ]);
    drawItemList(
      doc,
      (Array.isArray(pack?.signals) ? pack.signals : []).slice(0, 8).map((item) => ({
        title: item?.title || item?.anomalyType || 'Finance signal',
        meta: [
          item?.amountLabel || '',
          item?.description || '',
          formatDateTime(item?.dueDate || item?.endDate || item?.at)
        ].filter(Boolean).join(' | ')
      })),
      'هیچ سیگنال مالی فعالی ثبت نشده است.'
    );

    drawSectionTitle(doc, 'Latest Activity');
    drawKeyValueList(doc, [
      {
        label: 'Latest Approved Payment',
        value: latestApprovedPayment
          ? `${formatMoney(latestApprovedPayment.amount || 0, currency)} | ${formatDateTime(latestApprovedPayment.paidAt)}`
          : 'Not recorded'
      },
      {
        label: 'Latest Pending Payment',
        value: latestPendingPayment
          ? `${formatMoney(latestPendingPayment.amount || 0, currency)} | ${sanitizeLine(latestPendingPayment.approvalStage || 'pending')}`
          : 'Not recorded'
      }
    ]);

    drawSectionTitle(doc, 'Open Orders');
    drawItemList(
      doc,
      orders.slice(0, 10).map((item) => ({
        title: item?.title || formatFinanceCode(item?.orderNumber, '') || 'Order',
        meta: [
          item?.orderType || '',
          item?.status || '',
          `Due ${formatDateTime(item?.dueDate)}`,
          `Outstanding ${formatMoney(item?.outstandingAmount || 0, item?.currency || currency)}`
        ].filter(Boolean).join(' | ')
      })),
      'هیچ دستور مالی ثبت نشده است.'
    );

    drawSectionTitle(doc, 'Payments');
    drawItemList(
      doc,
      payments.slice(0, 10).map((item) => ({
        title: formatFinanceCode(item?.paymentNumber, 'Payment'),
        meta: [
          item?.paymentMethod || '',
          item?.status || '',
          item?.approvalStage || '',
          formatMoney(item?.amount || 0, item?.currency || currency),
          formatDateTime(item?.paidAt)
        ].filter(Boolean).join(' | ')
      })),
      'هیچ پرداختی ثبت نشده است.'
    );

    drawSectionTitle(doc, 'Reliefs');
    drawItemList(
      doc,
      reliefs.slice(0, 10).map((item) => ({
        title: item?.reliefType || 'Relief',
        meta: [
          item?.coverageMode || '',
          item?.coverageMode === 'percent'
            ? `${formatNumber(item?.percentage || 0)}%`
            : item?.coverageMode === 'full'
              ? '100%'
              : formatMoney(item?.amount || 0, currency),
          item?.sponsorName || '',
          `Ends ${formatDateTime(item?.endDate)}`
        ].filter(Boolean).join(' | ')
      })),
      'No active relief registered.'
    );
  });
}

async function buildMonthClosePdfBuffer(item = {}, options = {}) {
  const snapshot = item?.snapshot || {};
  const totals = snapshot?.totals || {};
  const readiness = snapshot?.readiness || {};
  const anomalies = snapshot?.anomalies || {};
  const cashflow = snapshot?.cashflow || {};
  const classes = Array.isArray(snapshot?.classes) ? snapshot.classes : [];
  const approvalTrail = Array.isArray(item?.approvalTrail) ? item.approvalTrail : [];
  const history = Array.isArray(item?.history) ? item.history : [];
  const documentNo = options?.documentNo || buildMonthCloseDocumentNo(item?.monthKey, item?._id || item?.id);

  return withPdfDocument({
    title: `Finance Month Close ${sanitizeLine(item?.monthKey || '')}`,
    subject: 'Official management month-close package'
  }, (doc) => {
    drawHeader(doc, {
      title: `Finance Month Close / ${sanitizeLine(item?.monthKey || 'Month')}`,
      subtitle: 'Management snapshot, approvals, anomalies, and cashflow',
      documentNo,
      statusLabel: sanitizeLine(item?.status || 'draft')
    });

    drawMetaLines(doc, [
      `Approval Stage: ${sanitizeLine(item?.approvalStage || 'draft')}`,
      `Requested At: ${formatDateTime(item?.requestedAt)}`,
      `Approved At: ${formatDateTime(item?.approvedAt)}`,
      `Closed At: ${formatDateTime(item?.closedAt)}`,
      `Window: ${formatDateTime(snapshot?.window?.startAt)} -> ${formatDateTime(snapshot?.window?.endAt)}`
    ]);

    drawVerificationBlock(doc, {
      generatedByName: options?.generatedByName,
      verificationCode: options?.verificationCode,
      verificationUrl: options?.verificationUrl,
      verificationQrBuffer: options?.verificationQrBuffer
    });

    drawSectionTitle(doc, 'Snapshot Totals');
    drawKeyValueList(doc, [
      { label: 'Orders Issued Count', value: formatNumber(totals.ordersIssuedCount || 0) },
      { label: 'Orders Issued Amount', value: formatMoney(totals.ordersIssuedAmount || 0) },
      { label: 'Approved Payment Count', value: formatNumber(totals.approvedPaymentCount || 0) },
      { label: 'Approved Payment Amount', value: formatMoney(totals.approvedPaymentAmount || 0) },
      { label: 'Pending Payment Count', value: formatNumber(totals.pendingPaymentCount || 0) },
      { label: 'Pending Payment Amount', value: formatMoney(totals.pendingPaymentAmount || 0) },
      { label: 'Approved Expense Count', value: formatNumber(totals.approvedExpenseCount || 0) },
      { label: 'Approved Expense Amount', value: formatMoney(totals.approvedExpenseAmount || 0) },
      { label: 'Pending Expense Count', value: formatNumber(totals.pendingExpenseCount || 0) },
      { label: 'Net Cash', value: formatMoney(totals.netCashAmount || 0) },
      { label: 'Treasury Net', value: formatMoney(totals.treasuryNetAmount || 0) },
      { label: 'Standing Outstanding', value: formatMoney(totals.standingOutstandingAmount || 0) },
      { label: 'Overdue Orders', value: formatNumber(totals.overdueOrders || 0) },
      { label: 'Active Memberships', value: formatNumber(totals.activeMemberships || 0) },
      { label: 'Active Reliefs', value: formatNumber(totals.activeReliefs || 0) }
    ]);

    drawSectionTitle(doc, 'Readiness');
    drawKeyValueList(doc, [
      { label: 'Ready To Approve', value: readiness?.readyToApprove === false ? 'No' : 'Yes' },
      { label: 'Blocking Issues', value: formatNumber((readiness?.blockingIssues || []).length) },
      { label: 'Warning Issues', value: formatNumber((readiness?.warningIssues || []).length) }
    ]);
    drawItemList(
      doc,
      (readiness?.blockingIssues || []).map((item) => ({
        title: item?.label || item?.code || 'Blocking issue',
        meta: [
          item?.count != null ? `count=${formatNumber(item.count)}` : '',
          item?.amount != null ? `amount=${formatMoney(item.amount || 0)}` : ''
        ].filter(Boolean).join(' | ')
      })),
      'هیچ مورد مسدودکننده‌ای ثبت نشده است.'
    );
    drawItemList(
      doc,
      (readiness?.warningIssues || []).map((item) => ({
        title: item?.label || item?.code || 'Warning issue',
        meta: [
          item?.count != null ? `count=${formatNumber(item.count)}` : '',
          item?.amount != null ? `amount=${formatMoney(item.amount || 0)}` : ''
        ].filter(Boolean).join(' | ')
      })),
      'هیچ هشدار ثبت نشده است.'
    );

    drawSectionTitle(doc, 'Cashflow');
    drawKeyValueList(doc, [
      { label: 'Approved Total', value: formatMoney(cashflow.approvedTotal || 0) },
      { label: 'Approved Count', value: formatNumber(cashflow.approvedCount || 0) },
      { label: 'Pending Total', value: formatMoney(cashflow.pendingTotal || 0) },
      { label: 'Pending Count', value: formatNumber(cashflow.pendingCount || 0) },
      { label: 'Approved Expenses', value: formatMoney(cashflow.approvedExpenseTotal || 0) },
      { label: 'Net Cash', value: formatMoney(cashflow.netCashAmount || 0) },
      { label: 'Treasury Inflow', value: formatMoney(cashflow.treasuryInflowAmount || 0) },
      { label: 'Treasury Outflow', value: formatMoney(cashflow.treasuryOutflowAmount || 0) }
    ]);
    drawItemList(
      doc,
      (cashflow.items || []).slice(0, 15).map((entry) => ({
        title: formatDateTime(entry?.date || entry?.day || entry?.paidAt),
        meta: [
          `approved=${formatMoney(entry?.approvedAmount || entry?.amount || 0)}`,
          entry?.approvedCount != null ? `count=${formatNumber(entry.approvedCount)}` : ''
        ].filter(Boolean).join(' | ')
      })),
      'برای این ماه هیچ ردیف جریان نقدی ثبت نشده است.'
    );

    drawSectionTitle(doc, 'Anomalies');
    drawKeyValueList(doc, [
      { label: 'Total Signals', value: formatNumber(anomalies?.summary?.total || 0) },
      { label: 'Critical', value: formatNumber(anomalies?.summary?.critical || 0) },
      { label: 'Action Required', value: formatNumber(anomalies?.summary?.actionRequired || 0) }
    ]);
    drawItemList(
      doc,
      (anomalies?.items || []).slice(0, 12).map((entry) => ({
        title: entry?.title || entry?.anomalyType || 'Finance anomaly',
        meta: [
          entry?.severity || '',
          entry?.amountLabel || '',
          entry?.description || ''
        ].filter(Boolean).join(' | ')
      })),
      'هیچ مورد ناهنجاری ثبت نشده است.'
    );

    drawSectionTitle(doc, 'Class Snapshot');
    drawItemList(
      doc,
      classes.slice(0, 12).map((row) => ({
        title: row?.title || row?.classTitle || 'Class',
        meta: [
          `due=${formatMoney(row?.totalDue || 0)}`,
          `paid=${formatMoney(row?.totalPaid || 0)}`,
          `outstanding=${formatMoney(row?.totalOutstanding || 0)}`,
          row?.activeReliefs != null ? `reliefs=${formatNumber(row.activeReliefs)}` : ''
        ].filter(Boolean).join(' | ')
      })),
      'هیچ ردیف نسخه صنفی ثبت نشده است.'
    );

    drawSectionTitle(doc, 'Approval Trail');
    drawItemList(
      doc,
      approvalTrail.map((entry) => ({
        title: `${sanitizeLine(entry?.level || 'review')} / ${sanitizeLine(entry?.action || '-')}`,
        meta: [
          entry?.by?.name || '',
          formatDateTime(entry?.at),
          entry?.note || entry?.reason || ''
        ].filter(Boolean).join(' | ')
      })),
      'هیچ ردپای تایید ثبت نشده است.'
    );

    drawSectionTitle(doc, 'History');
    drawItemList(
      doc,
      history.map((entry) => ({
        title: sanitizeLine(entry?.action || 'history'),
        meta: [
          entry?.by?.name || '',
          formatDateTime(entry?.at),
          entry?.note || ''
        ].filter(Boolean).join(' | ')
      })),
      'هیچ تاریخچه گردش کار ثبت نشده است.'
    );
  });
}

const GOVERNMENT_REPORT_TYPE_LABELS = {
  quarterly: 'ربع‌وار',
  annual: 'سالانه',
  government_finance_quarterly: 'گزارش مالی ربع‌وار',
  government_finance_annual: 'گزارش مالی سالانه',
  snapshot: 'نسخه رسمی'
};

const BUDGET_APPROVAL_STAGE_LABELS = {
  draft: 'پیش‌نویس بودجه',
  finance_manager_review: 'بررسی مدیر مالی',
  finance_lead_review: 'بررسی آمریت مالی',
  general_president_review: 'بررسی ریاست عمومی',
  approved: 'بودجه تایید شد',
  rejected: 'بودجه رد شد'
};

const APPROVAL_ACTION_LABELS = {
  saved: 'ذخیره شد',
  revision_started: 'بازنگری شروع شد',
  review_requested: 'برای بررسی ارسال شد',
  approved: 'تایید شد',
  rejected: 'رد شد',
  submitted: 'ارسال شد'
};

const PROCUREMENT_STATUS_LABELS = {
  draft: 'پیش‌نویس',
  pending_review: 'در انتظار بررسی',
  approved: 'تایید شده',
  rejected: 'رد شده',
  cancelled: 'لغو شده'
};

function pickDariLabel(labels = {}, value = '', fallback = '') {
  const normalized = String(value || '').trim();
  return labels[normalized] || normalized || fallback;
}

async function buildGovernmentFinanceSnapshotPdfBuffer(snapshot = {}, options = {}) {
  const pack = snapshot?.pack || {};
  const expenseAnalytics = pack?.expenseAnalytics || {};
  const treasuryAnalytics = pack?.treasuryAnalytics || {};
  const budgetVsActual = pack?.budgetVsActual || {};
  const procurementAnalytics = pack?.procurementAnalytics || {};
  const budgetApproval = pack?.budgetApproval || {};
  const documentNo = options?.documentNo || buildGovernmentSnapshotDocumentNo(snapshot);
  const reportSummaryValue = snapshot?.summary?.balance ?? snapshot?.summary?.netProfit ?? 0;
  const rows = Array.isArray(snapshot?.rows) ? snapshot.rows : [];
  const reportTypeLabel = pickDariLabel(GOVERNMENT_REPORT_TYPE_LABELS, snapshot?.reportType || 'snapshot', 'نسخه رسمی');

  return withPdfDocument({
    title: `گزارش مالی دولت ${sanitizeLine(reportTypeLabel)}`,
    subject: 'بسته رسمی گزارش مالی دولت'
  }, (doc) => {
    drawHeader(doc, {
      title: `گزارش مالی دولت / ${sanitizeLine(snapshot?.title || reportTypeLabel || 'نسخه رسمی')}`,
      subtitle: 'بسته رسمی با معلومات خزانه، بودجه، مصرفات و تعهدات خریداری',
      documentNo,
      statusLabel: snapshot?.isOfficial === false ? 'پیش‌نویس' : 'رسمی'
    });

    drawMetaLines(doc, [
      `سال مالی: ${sanitizeLine(snapshot?.financialYear?.title || snapshot?.financialYearId || '-')}`,
      `سال تعلیمی: ${sanitizeLine(snapshot?.academicYear?.title || snapshot?.academicYearId || '-')}`,
      `صنف: ${sanitizeLine(snapshot?.schoolClass?.title || 'همه صنف‌ها')}`,
      `نوع گزارش: ${sanitizeLine(reportTypeLabel || '-')}`,
      `ربع: ${sanitizeLine(snapshot?.quarter || '-')}`,
      `نسخه: ${sanitizeLine(snapshot?.version || '1')}`,
      `تاریخ تولید: ${formatDateTime(snapshot?.generatedAt)}`,
      `تولیدکننده: ${sanitizeLine(snapshot?.generatedBy?.name || options?.generatedByName || '-')}`
    ]);

    drawVerificationBlock(doc, {
      generatedByName: snapshot?.generatedBy?.name || options?.generatedByName || '',
      verificationCode: options?.verificationCode,
      verificationUrl: options?.verificationUrl,
      verificationQrBuffer: options?.verificationQrBuffer
    });

    drawSectionTitle(doc, 'خلاصه نسخه رسمی');
    drawKeyValueList(doc, [
      { label: 'کلید گزارش', value: sanitizeLine(pickDariLabel(GOVERNMENT_REPORT_TYPE_LABELS, snapshot?.reportKey || '', snapshot?.reportKey || '-')) },
      { label: 'تعداد ردیف‌ها', value: formatNumber(rows.length) },
      { label: 'تعداد ستون‌ها', value: formatNumber((snapshot?.columns || []).length) },
      { label: 'خالص / مانده', value: formatMoney(reportSummaryValue || 0) }
    ]);

    drawSectionTitle(doc, 'کنترل و نظارت مصرفات');
    drawKeyValueList(doc, [
      { label: 'تعداد ردیف‌های مصرف', value: formatNumber(expenseAnalytics?.summary?.totalCount || 0) },
      { label: 'مبلغ تاییدشده', value: formatMoney(expenseAnalytics?.summary?.approvedAmount || 0) },
      { label: 'مبلغ در انتظار بررسی', value: formatMoney(expenseAnalytics?.summary?.pendingAmount || 0) },
      { label: 'فروشندگان', value: formatNumber(expenseAnalytics?.summary?.vendorCount || 0) }
    ]);

    drawSectionTitle(doc, 'خزانه');
    drawKeyValueList(doc, [
      { label: 'مانده دفتری', value: formatMoney(treasuryAnalytics?.summary?.bookBalance || 0) },
      { label: 'مانده نقدی', value: formatMoney(treasuryAnalytics?.summary?.cashBalance || 0) },
      { label: 'مانده بانکی', value: formatMoney(treasuryAnalytics?.summary?.bankBalance || 0) },
      { label: 'مصرف تاییدشده بدون حساب خزانه', value: formatMoney(treasuryAnalytics?.summary?.unassignedApprovedExpenseAmount || 0) }
    ]);
    drawItemList(
      doc,
      (treasuryAnalytics?.alerts || []).map((item) => ({
        title: item?.label || item?.key || 'هشدار خزانه',
        meta: item?.detail || ''
      })),
      'هیچ هشداری برای خزانه ثبت نشده است.'
    );

    drawSectionTitle(doc, 'بودجه در برابر عملکرد واقعی');
    drawKeyValueList(doc, [
      { label: 'هدف درآمد', value: formatMoney(budgetVsActual?.summary?.annualIncomeTarget || 0) },
      { label: 'درآمد واقعی', value: formatMoney(budgetVsActual?.summary?.actualIncome || 0) },
      { label: 'بودجه مصرفات', value: formatMoney(budgetVsActual?.summary?.annualExpenseBudget || 0) },
      { label: 'مصرف واقعی', value: formatMoney(budgetVsActual?.summary?.actualExpense || 0) },
      { label: 'هدف ذخیره خزانه', value: formatMoney(budgetVsActual?.summary?.treasuryReserveTarget || 0) },
      { label: 'مانده ذخیره خزانه', value: formatMoney(budgetVsActual?.summary?.treasuryReserveBalance || 0) }
    ]);
    drawItemList(
      doc,
      (budgetVsActual?.alerts || []).map((item) => ({
        title: item?.title || item?.key || 'هشدار بودجه',
        meta: item?.detail || ''
      })),
      'هیچ هشداری برای بودجه ثبت نشده است.'
    );

    drawSectionTitle(doc, 'تایید بودجه');
    drawKeyValueList(doc, [
      { label: 'مرحله', value: sanitizeLine(pickDariLabel(BUDGET_APPROVAL_STAGE_LABELS, budgetApproval?.stage || 'draft', 'پیش‌نویس بودجه')) },
      { label: 'تاریخ ارسال', value: formatDateTime(budgetApproval?.submittedAt) },
      { label: 'تاریخ تایید', value: formatDateTime(budgetApproval?.approvedAt) },
      { label: 'تاریخ رد', value: formatDateTime(budgetApproval?.rejectedAt) }
    ]);
    drawItemList(
      doc,
      (budgetApproval?.trail || []).slice(0, 8).map((entry) => ({
        title: `${sanitizeLine(pickDariLabel(BUDGET_APPROVAL_STAGE_LABELS, entry?.level || '', 'بررسی'))} / ${sanitizeLine(pickDariLabel(APPROVAL_ACTION_LABELS, entry?.action || '', '-'))}`,
        meta: [
          sanitizeLine(entry?.by?.name || ''),
          formatDateTime(entry?.at),
          sanitizeLine(entry?.note || entry?.reason || '')
        ].filter(Boolean).join(' | ')
      })),
      'هیچ ردپای تایید بودجه ثبت نشده است.'
    );

    drawSectionTitle(doc, 'خریداری و تعهدات فروشندگان');
    drawKeyValueList(doc, [
      { label: 'تعداد تعهدات', value: formatNumber(procurementAnalytics?.summary?.totalCount || 0) },
      { label: 'مجموع تعهدشده', value: formatMoney(procurementAnalytics?.summary?.totalCommittedAmount || 0) },
      { label: 'پوشش‌شده با مصرف تاییدشده', value: formatMoney(procurementAnalytics?.summary?.totalApprovedExpenseAmount || 0) },
      { label: 'باقی‌مانده تعهد', value: formatMoney(procurementAnalytics?.summary?.totalOutstandingAmount || 0) },
      { label: 'مبلغ تصفیه‌شده', value: formatMoney(procurementAnalytics?.summary?.totalSettledAmount || 0) },
      { label: 'آماده پرداخت', value: formatMoney(procurementAnalytics?.summary?.totalPayableReadyAmount || 0) }
    ]);
    drawItemList(
      doc,
      (procurementAnalytics?.items || []).slice(0, 10).map((item) => ({
        title: item?.title || item?.vendorName || 'تعهد',
        meta: [
          sanitizeLine(item?.vendorName || ''),
          sanitizeLine(pickDariLabel(PROCUREMENT_STATUS_LABELS, item?.status || '', '')),
          `تعهد=${formatMoney(item?.committedAmount || 0)}`,
          `باقی‌مانده=${formatMoney(item?.outstandingAmount || 0)}`
        ].filter(Boolean).join(' | ')
      })),
      'هیچ تعهد خریداری ثبت نشده است.'
    );

    drawSectionTitle(doc, 'ردیف‌های نسخه رسمی');
    drawItemList(
      doc,
      rows.slice(0, 12).map((row, index) => ({
        title: `${sanitizeLine(row?.classTitle || row?.quarterLabel || `ردیف ${index + 1}`)}`,
        meta: Object.entries(row || {})
          .slice(0, 4)
          .map(([key, value]) => `${sanitizeLine(key)}=${sanitizeLine(value)}`)
          .join(' | ')
      })),
      'پیش‌نمایش ردیفی در دسترس نیست.'
    );
  });
}

module.exports = {
  buildGovernmentFinanceSnapshotPdfBuffer,
  buildGovernmentSnapshotDocumentNo,
  buildStatementPackPdfBuffer,
  buildMonthClosePdfBuffer,
  buildStatementDocumentNo,
  buildMonthCloseDocumentNo
};
