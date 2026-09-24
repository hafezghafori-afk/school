import { test, expect } from '@playwright/test';

// The month-close board: one tile per solar month of the financial year. A
// close request shows what blocks it before the month locks; the president
// reopens a month for a few days (out of order only on purpose) and approves
// a close after a reopen with what changed shown. "Today" is 2 Mizan 1405.
test.use({ timezoneId: 'Asia/Kabul' });

const MONTH_NAMES = ['حمل', 'ثور', 'جوزا', 'سرطان', 'اسد', 'سنبله', 'میزان', 'عقرب', 'قوس', 'جدی', 'دلو', 'حوت'];
const MONTH_STARTS = [
  '2026-03-21', '2026-04-21', '2026-05-22', '2026-06-22', '2026-07-23', '2026-08-23',
  '2026-09-23', '2026-10-23', '2026-11-22', '2026-12-22', '2027-01-21', '2027-02-20', '2027-03-21'
];
const TODAY = new Date('2026-09-24T09:00:00+04:30');

const monthKeys = MONTH_NAMES.map((_, index) => `1405-${String(index + 1).padStart(2, '0')}`);
const monthWindow = (monthKey) => {
  const index = Number(monthKey.slice(5)) - 1;
  return {
    startAt: new Date(`${MONTH_STARTS[index]}T00:00:00+04:30`).toISOString(),
    endAt: new Date(new Date(`${MONTH_STARTS[index + 1]}T00:00:00+04:30`).getTime() - 1).toISOString()
  };
};
const monthLabel = (monthKey) => `${MONTH_NAMES[Number(monthKey.slice(5)) - 1]} ۱۴۰۵`;

const baseTotals = {
  ordersIssuedCount: 40,
  ordersIssuedAmount: 40000,
  approvedPaymentAmount: 31000,
  refundAmount: 0,
  approvedExpenseAmount: 9000,
  netCashAmount: 22000,
  standingOutstandingAmount: 12000
};

const closedRecord = (monthKey, extra = {}) => ({
  _id: `mc-${monthKey}`,
  monthKey,
  monthLabel: monthLabel(monthKey),
  calendar: 'shamsi',
  status: 'closed',
  approvalStage: 'completed',
  window: monthWindow(monthKey),
  closeWindow: monthWindow(monthKey),
  snapshot: { totals: baseTotals, readiness: { readyToApprove: true, blockingIssues: [], warningIssues: [] } },
  snapshotVersions: [{ version: 1, reason: 'close', createdAt: '2026-08-25T08:00:00.000Z', createdBy: { name: 'President' }, totals: baseTotals, diff: [] }],
  approvalTrail: [],
  history: [],
  locked: true,
  lockReason: 'closed',
  canApprove: false,
  canReject: false,
  canReopen: false,
  canExtendReopen: false,
  canRefresh: false,
  ...extra
});

// A small in-memory month-close server: enough of the real rules for the UI.
function createMonthCloseServer({ actor = 'finance_manager', closedThrough = 5 } = {}) {
  const state = {
    actor,
    records: new Map(),
    readyForRequest: false,
    approveFails: false,
    calls: { request: [], approve: [], reject: [], reopen: [], readiness: [] }
  };
  for (let month = 1; month <= closedThrough; month += 1) {
    const key = monthKeys[month - 1];
    state.records.set(key, closedRecord(key));
  }
  const decorate = (record) => {
    const president = state.actor === 'general_president';
    const pending = record.status === 'pending_review';
    return {
      ...record,
      canApprove: pending && (president || record.approvalStage !== 'general_president_review'),
      canReject: pending,
      canReopen: record.status === 'closed' && president,
      canExtendReopen: record.status === 'reopened' && president
    };
  };
  const board = () => {
    let earlierClosed = true;
    const months = monthKeys.map((key) => {
      const window = monthWindow(key);
      const record = state.records.get(key) ? decorate(state.records.get(key)) : null;
      const ended = new Date(window.endAt).getTime() < TODAY.getTime();
      const closed = record?.status === 'closed';
      let stateName = 'open';
      if (closed) stateName = 'closed';
      else if (record?.status === 'pending_review') stateName = 'in_review';
      else if (record?.status === 'reopened') stateName = 'reopened';
      else if (!ended) stateName = 'not_ended';
      const canRequest = ended && earlierClosed && !closed && record?.status !== 'pending_review';
      if (!closed) earlierClosed = false;
      return { monthKey: key, label: monthLabel(key), window, ended, covered: closed, state: stateName, canRequest, record };
    });
    return {
      success: true,
      actorLevel: state.actor,
      financialYear: { _id: 'fy-1', title: 'سال مالی ۱۴۰۵', isActive: true, isClosed: false },
      financialYears: [{ _id: 'fy-1', title: 'سال مالی ۱۴۰۵', isActive: true, isClosed: false }],
      months,
      legacy: [],
      nextMonthKey: months.find((month) => month.state !== 'closed')?.monthKey || '',
      reopenDays: { min: 1, max: 7, default: 3 }
    };
  };
  const readiness = (monthKey) => {
    const blockingIssues = state.readyForRequest ? [] : [{
      code: 'missing_monthly_bills',
      label: 'شاگردانی که بل فیس همین ماه برایشان صادر نشده است',
      count: 2,
      amount: 2000,
      samples: ['Student Alpha - Class One', 'Student Beta - Class One']
    }];
    return {
      success: true,
      monthKey,
      monthLabel: monthLabel(monthKey),
      calendar: 'shamsi',
      financialYear: { _id: 'fy-1', title: 'سال مالی ۱۴۰۵' },
      window: monthWindow(monthKey),
      status: state.records.get(monthKey)?.status || '',
      isReclose: state.records.get(monthKey)?.status === 'reopened',
      readiness: { readyToApprove: !blockingIssues.length, blockingIssues, warningIssues: [] },
      totals: baseTotals,
      canRequest: !blockingIssues.length
    };
  };
  const handle = (method, pathname, searchParams, body) => {
    if (pathname === '/api/finance/admin/month-close/board') return board();
    if (pathname === '/api/finance/admin/month-close/readiness') {
      state.calls.readiness.push(searchParams.get('monthKey'));
      return readiness(searchParams.get('monthKey'));
    }
    if (pathname === '/api/finance/admin/month-close' && method === 'POST') {
      state.calls.request.push(body);
      const existing = state.records.get(body.monthKey);
      const isReclose = existing?.status === 'reopened';
      const record = {
        ...(existing || closedRecord(body.monthKey, { snapshotVersions: [] })),
        status: 'pending_review',
        approvalStage: isReclose ? 'general_president_review' : 'finance_manager_review',
        isReclose,
        requestNote: body.note,
        lockReason: 'in_review'
      };
      state.records.set(body.monthKey, record);
      return { success: true, item: decorate(record), message: 'درخواست بستن ماه مالی ثبت شد.' };
    }
    if (pathname === '/api/finance/admin/month-close') {
      return { success: true, items: [...state.records.values()].map(decorate) };
    }
    const action = /^\/api\/finance\/admin\/month-close\/([^/]+)\/(approve|reject|reopen|refresh)$/.exec(pathname);
    if (action && method === 'POST') {
      const [, id, verb] = action;
      const record = [...state.records.values()].find((item) => item._id === id);
      state.calls[verb]?.push({ id, ...body });
      if (verb === 'approve' && state.approveFails) {
        state.approveFails = false;
        return {
          status: 409,
          body: {
            success: false,
            code: 'finance_month_close_figures_changed',
            diff: [{ key: 'ordersIssuedAmount', label: 'مبلغ بل‌های ماه', before: 40500, after: 41000, delta: 500 }],
            message: 'ارقام این ماه پس از ثبت درخواست تغییر کرده است؛ درخواست را رد کنید تا با ارقام تازه دوباره ثبت شود.'
          }
        };
      }
      if (verb === 'approve') {
        Object.assign(record, { status: 'closed', approvalStage: 'completed', isReclose: false, lockReason: 'closed' });
        return { success: true, item: decorate(record), message: `ماه ${record.monthLabel} دوباره بسته شد` };
      }
      if (verb === 'reopen') {
        const deadline = new Date(TODAY.getTime() + Number(body.durationDays || 3) * 86400000).toISOString();
        Object.assign(record, { status: 'reopened', approvalStage: 'completed', reopenDeadline: deadline, lockReason: '' });
        return { success: true, item: decorate(record), message: `ماه ${record.monthLabel} دوباره باز شد` };
      }
    }
    return null;
  };
  return { state, handle };
}

async function openFinance(page, server) {
  await page.clock.setFixedTime(TODAY);
  await page.addInitScript((level) => {
    localStorage.setItem('token', 'mock.header.signature');
    localStorage.setItem('role', 'admin');
    localStorage.setItem('userId', 'admin-1');
    localStorage.setItem('userName', 'Finance Admin');
    localStorage.setItem('adminLevel', level);
    localStorage.setItem('effectivePermissions', JSON.stringify(['manage_finance']));
  }, server.state.actor);

  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    let body = { success: true, items: [] };
    let status = 200;
    const monthClose = url.pathname.startsWith('/api/finance/admin/month-close')
      ? server.handle(request.method(), url.pathname, url.searchParams, request.postDataJSON?.() || {})
      : null;
    if (monthClose?.status) {
      status = monthClose.status;
      body = monthClose.body;
    } else if (monthClose) {
      body = monthClose;
    } else if (url.pathname === '/api/settings/public') {
      body = { success: true, settings: {} };
    } else if (url.pathname === '/api/finance/admin/reference-data') {
      body = { success: true, students: [], classes: [], academicYears: [], currentAcademicYearId: '' };
    } else if (url.pathname === '/api/finance/admin/summary') {
      body = { success: true, summary: {}, topDebtors: [] };
    } else if (url.pathname === '/api/finance/admin/dashboard/overview') {
      body = { success: true, overview: { kpis: {}, distributions: {}, recent: { bills: [], payments: [], expenses: [] }, series: { daily: [] }, byClass: [], topDebtors: [], departedDebtors: [] } };
    }
    await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
  });

  await page.goto('/admin-finance', { waitUntil: 'domcontentloaded' });
  await page.getByTestId('finance-section-reports').click();
  await expect(page.getByTestId('month-close-board')).toBeVisible();
}

test('a close request shows what blocks the month before it locks, then locks it for review', async ({ page }) => {
  test.setTimeout(60_000);
  const server = createMonthCloseServer({ actor: 'finance_manager', closedThrough: 5 });
  await openFinance(page, server);

  const board = page.getByTestId('month-close-board');
  await expect(board.getByTestId('month-close-tile-1405-05')).toHaveAttribute('data-state', 'closed');
  await expect(board.getByTestId('month-close-tile-1405-07')).toHaveAttribute('data-state', 'not_ended');
  await expect(board.getByTestId('month-close-request-1405-07')).toHaveCount(0);

  await board.getByTestId('month-close-request-1405-06').click();
  const dialog = page.getByTestId('month-close-request-dialog');
  await expect(dialog).toContainText('درخواست بستن ماه سنبله ۱۴۰۵');
  await expect(dialog.getByTestId('month-close-preview-blockers')).toContainText('شاگردانی که بل فیس همین ماه برایشان صادر نشده است');
  await expect(dialog.getByTestId('month-close-preview-blockers')).toContainText('Student Alpha - Class One');
  await expect(dialog.getByTestId('month-close-dialog-submit')).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);

  server.state.readyForRequest = true;
  await board.getByTestId('month-close-request-1405-06').click();
  await expect(dialog.getByTestId('month-close-ready')).toBeVisible();
  await expect(dialog.getByTestId('month-close-dialog-totals')).toContainText('۴۰٬۰۰۰');
  await dialog.getByTestId('month-close-dialog-note').fill('Sonbola is complete');
  await dialog.getByTestId('month-close-dialog-submit').click();

  await expect(dialog).toHaveCount(0);
  expect(server.state.calls.request).toEqual([{ monthKey: '1405-06', note: 'Sonbola is complete', financialYearId: 'fy-1' }]);
  await expect(board.getByTestId('month-close-tile-1405-06')).toHaveAttribute('data-state', 'in_review');
  await expect(page.getByTestId('month-close-banner')).toContainText('ماه سنبله ۱۴۰۵ در جریان تایید بستن است');
});

test('the president reopens a month for a few days, confirms reaching past a later month, and approves the close again', async ({ page }) => {
  test.setTimeout(60_000);
  const server = createMonthCloseServer({ actor: 'general_president', closedThrough: 6 });
  await openFinance(page, server);
  const board = page.getByTestId('month-close-board');

  await board.getByTestId('month-close-reopen-1405-05').click();
  const reopen = page.getByTestId('month-close-reopen-dialog');
  await expect(reopen.getByTestId('month-close-reopen-override')).toContainText('سنبله ۱۴۰۵');
  await reopen.getByTestId('month-close-dialog-note').fill('Correct an Asad bill');
  await expect(reopen.getByTestId('month-close-dialog-submit')).toBeDisabled();
  await reopen.getByTestId('month-close-reopen-days').selectOption('5');
  await reopen.getByTestId('month-close-reopen-override-check').check();
  await reopen.getByTestId('month-close-dialog-submit').click();
  await expect(reopen).toHaveCount(0);
  expect(server.state.calls.reopen).toEqual([{ id: 'mc-1405-05', note: 'Correct an Asad bill', durationDays: 5, override: true }]);
  await expect(board.getByTestId('month-close-tile-1405-05')).toHaveAttribute('data-state', 'reopened');
  await expect(page.getByTestId('month-close-banner')).toContainText('ماه اسد ۱۴۰۵ برای اصلاح باز است');

  // The finance manager sent the corrected month back; it waits for the president.
  Object.assign(server.state.records.get('1405-05'), {
    status: 'pending_review',
    approvalStage: 'general_president_review',
    isReclose: true,
    recloseReview: {
      diff: [{ key: 'ordersIssuedAmount', label: 'مبلغ بل‌های ماه', before: 40000, after: 40500, delta: 500 }],
      changes: { total: 1, bills: { count: 1, added: 1, items: [{ number: 'FO-1405-0099', student: 'Student Alpha', amount: 500, added: true }] } }
    }
  });
  server.state.approveFails = true;
  await board.getByRole('button', { name: 'تازه‌سازی' }).click();
  await board.getByTestId('month-close-approve-1405-05').click();
  const approve = page.getByTestId('month-close-approve-dialog');
  await expect(approve.getByTestId('month-close-approve-diff')).toContainText('مبلغ بل‌های ماه');
  await expect(approve.getByTestId('month-close-change-report')).toContainText('FO-1405-0099');

  await approve.getByTestId('month-close-dialog-submit').click();
  await expect(approve.getByTestId('month-close-dialog-error')).toContainText('ارقام این ماه پس از ثبت درخواست تغییر کرده است');
  await expect(approve.getByTestId('month-close-dialog-error-diff')).toContainText('۵۰۰');

  await approve.getByTestId('month-close-dialog-submit').click();
  await expect(approve).toHaveCount(0);
  await expect(board.getByTestId('month-close-notice')).toContainText('دوباره بسته شد');
  await expect(board.getByTestId('month-close-tile-1405-05')).toHaveAttribute('data-state', 'closed');
});
