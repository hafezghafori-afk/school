import { test, expect } from '@playwright/test';

import { setupAdminWorkspace } from './adminWorkspace.helpers';

const json = (body, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(body) });

const years = [
  { id: 'year-1', title: '1406', code: '1406', sequence: 1, startDate: '2027-03-21T00:00:00.000Z', endDate: '2028-03-19T00:00:00.000Z' },
  { id: 'year-2', title: '1407', code: '1407', sequence: 2, startDate: '2028-03-20T00:00:00.000Z', endDate: '2029-03-20T00:00:00.000Z' }
];
const class10a = { id: 'class-10a', title: 'Class 10 A', code: '10A' };
const class11a = { id: 'class-11a', title: 'Class 11 A', code: '11A' };
const class11b = { id: 'class-11b', title: 'Class 11 B', code: '11B' };
const class10aNext = { id: 'class-10a-next', title: 'Class 10 A', code: '10A-1407' };

const student = (fullName, asasNumber) => ({ fullName, asasNumber, admissionNo: '' });
const finance = (overrides = {}) => ({ outstanding: 0, outstandingCount: 0, postEndUnpaid: [], postEndPaid: [], reliefs: [], ...overrides });

function buildPreview() {
  return {
    success: true,
    session: null,
    rule: { id: 'rule-1', name: 'Default Promotion Rule', evaluationMode: 'official_general_result' },
    targetAcademicYear: years[1],
    plan: {
      sourceAcademicYear: years[0],
      sourceClass: class10a,
      targetAcademicYear: years[1],
      isTerminal: false,
      promotedClass: class11a,
      repeatClass: class10aNext,
      promotedCandidates: [class11a, class11b],
      repeatCandidates: [class10aNext],
      sourceEndAt: '2028-03-19T00:00:00.000Z',
      targetStartAt: '2028-03-20T00:00:00.000Z',
      blockers: [],
      warnings: [{ code: 'source_year_debt', field: 'finance', message: 'مالی: 1 شاگرد از سال مبدا 500 افغانی باقی دارند.' }],
      capacity: [],
      finance: { studentsWithDebt: 1, debtAmount: 500, studentsWithPostEndDocuments: 0, targetClassesWithoutFeePlan: [] },
      canApply: true
    },
    summary: { total: 3, promoted: 2, repeated: 0, conditional: 1, graduated: 0, blocked: 0, skipped: 0, alreadyProcessed: 0, canApply: 3 },
    items: [
      {
        studentMembershipId: 'm-alpha',
        sourceResultStatus: 'passed',
        computedOutcome: 'promoted',
        averageScore: 81,
        canApply: true,
        issueCode: '',
        policyEvaluation: { failedSubjects: [] },
        sourceMembership: { id: 'm-alpha', student: student('Alpha Student', 'A-1') },
        targetClass: class11a,
        finance: finance({
          outstanding: 500,
          outstandingCount: 1,
          reliefs: [{ id: 'disc-1', sourceModel: 'discount', label: 'تخفیف', coverageMode: 'percent', amount: 0, percentage: 10, reason: 'sibling' }]
        })
      },
      {
        studentMembershipId: 'm-beta',
        sourceResultStatus: 'passed',
        computedOutcome: 'promoted',
        averageScore: 74,
        canApply: true,
        issueCode: '',
        policyEvaluation: { failedSubjects: [] },
        sourceMembership: { id: 'm-beta', student: student('Beta Student', 'A-2') },
        targetClass: class11a,
        finance: finance()
      },
      {
        studentMembershipId: 'm-gamma',
        sourceResultStatus: 'conditional',
        computedOutcome: 'conditional',
        averageScore: 58,
        canApply: true,
        issueCode: '',
        policyEvaluation: { failedSubjects: [{ subjectTitle: 'Physics', percentage: 41 }] },
        sourceMembership: { id: 'm-gamma', student: student('Gamma Student', 'A-3') },
        targetClass: null,
        finance: finance()
      }
    ]
  };
}

const transaction = (id, name, asas, overrides = {}) => ({
  id,
  batchId: 'batch-1',
  promotionOutcome: 'promoted',
  transactionStatus: 'applied',
  targetClass: class11a,
  sourceMembership: { student: student(name, asas) },
  financeEffects: { outstandingAtPromotion: 0, voidedBills: 0, voidedOrders: 0, refundCases: 0, reviewRequired: [], plannedReliefs: [], carriedReliefs: [] },
  ...overrides
});

test.describe('promotion workflow', () => {
  test.beforeEach(async ({ page }) => {
    await setupAdminWorkspace(page, {
      permissions: ['view_reports', 'manage_users']
    });
  });

  test('promotes a class step by step, then rolls a student back and resolves a held one', async ({ page }) => {
    const previewBodies = [];
    let applyBody = null;
    let rollbackBody = null;
    let resolveBody = null;
    let batches = [];

    const batch = {
      id: 'batch-1',
      status: 'applied',
      isTerminal: false,
      appliedAt: '2028-03-10T08:00:00.000Z',
      sourceEndAt: '2028-03-19T00:00:00.000Z',
      targetStartAt: '2028-03-20T00:00:00.000Z',
      summary: { total: 3, promoted: 2, repeated: 0, conditional: 1, graduated: 0, notApplied: 0 },
      financeSummary: { studentsWithDebt: 1, debtAmount: 500, voidedDocuments: 0, refundCases: 0, reviewRequired: 0, carriedReliefs: 1, failedReliefs: 0 },
      sourceAcademicYear: years[0],
      sourceClass: class10a,
      targetAcademicYear: years[1],
      promotedClass: class11a,
      repeatClass: class10aNext,
      notApplied: []
    };
    const batchDetail = () => ({
      ...batch,
      transactions: [
        transaction('tx-alpha', 'Alpha Student', 'A-1'),
        transaction('tx-beta', 'Beta Student', 'A-2', { targetClass: class11b }),
        transaction('tx-gamma', 'Gamma Student', 'A-3', { promotionOutcome: 'conditional', transactionStatus: 'held', targetClass: null })
      ]
    });

    await page.route('**/api/promotions/reference-data', (route) => route.fulfill(json({
      success: true,
      academicYears: years,
      classes: [class10a, class11a, class11b, class10aNext],
      sessions: [],
      rules: [{ id: 'rule-1', name: 'Default Promotion Rule', code: 'DEFAULT-PROMOTION' }],
      activeYear: years[0]
    })));
    await page.route('**/api/promotions/year-board?**', (route) => route.fulfill(json({
      success: true,
      academicYear: years[0],
      classes: [{ schoolClass: class10a, currentStudents: 3, heldCount: 0, isTerminal: false, batchCount: batches.length, latestBatch: batches[0] || null }]
    })));
    await page.route('**/api/result-tables/readiness?**', (route) => route.fulfill(json({ success: true, ready: true, issues: [] })));
    await page.route('**/api/promotions/preview', (route) => {
      previewBodies.push(route.request().postDataJSON());
      return route.fulfill(json(buildPreview()));
    });
    await page.route('**/api/promotions/apply', (route) => {
      applyBody = route.request().postDataJSON();
      batches = [batch];
      return route.fulfill(json({ success: true, batch, items: [] }));
    });
    await page.route((url) => url.pathname === '/api/promotions/batches', (route) => route.fulfill(json({ success: true, items: batches })));
    await page.route((url) => url.pathname === '/api/promotions/batches/batch-1', (route) => route.fulfill(json({ success: true, item: batchDetail() })));
    await page.route('**/api/promotions/rollback/*', (route) => {
      rollbackBody = route.request().postDataJSON();
      return route.fulfill(json({ success: true, item: transaction('tx-alpha', 'Alpha Student', 'A-1', { transactionStatus: 'rolled_back' }) }));
    });
    await page.route('**/api/promotions/transactions/*/resolve', (route) => {
      resolveBody = route.request().postDataJSON();
      return route.fulfill(json({ success: true, item: transaction('tx-gamma', 'Gamma Student', 'A-3'), warnings: [] }));
    });
    page.on('dialog', (dialog) => (dialog.type() === 'prompt' ? dialog.accept('operator review') : dialog.accept()));

    await page.goto('/admin-promotions', { waitUntil: 'domcontentloaded' });
    // The page is a lazy chunk; a cold dev server can take a while to compile it.
    await expect(page.getByRole('heading', { name: 'مرکز ارتقا صنف' })).toBeVisible({ timeout: 30_000 });

    // 1. Source: the active year is preselected; choose the class on the board.
    await expect(page.locator('#promotion-source-year')).toHaveValue('year-1');
    await page.getByTestId('promotion-board-class-class-10a').click();
    await expect.poll(() => previewBodies.at(-1)?.classId).toBe('class-10a');

    // 2. Target: the system's suggestion is shown, only later years are offered.
    await page.getByTestId('promotion-step-2').click();
    await expect(page.locator('#promotion-promoted-class option').first()).toContainText('Class 11 A');
    await expect(page.locator('#promotion-target-year option')).toHaveCount(2);

    // 4. Students: move Beta to 11 B and carry Alpha's discount into the new year.
    await page.getByTestId('promotion-step-4').click();
    await expect(page.getByTestId('promotion-student-m-alpha')).toContainText('A-1');
    await page.getByTestId('promotion-student-m-beta').locator('select').selectOption('class-11b');
    await page.getByTestId('promotion-student-m-alpha').locator('.promotion-reliefs input').check();
    await expect.poll(() => previewBodies.at(-1)?.studentOverrides?.[0]?.targetClassId).toBe('class-11b');

    // 5. Check and apply.
    await page.getByTestId('promotion-step-5').click();
    await expect(page.locator('.promotion-checklist.is-warning')).toContainText('500');
    await page.getByTestId('promotion-apply').click();
    await expect.poll(() => applyBody?.classId).toBe('class-10a');
    expect(applyBody.studentOverrides).toEqual([{ membershipId: 'm-beta', targetClassId: 'class-11b' }]);
    expect(applyBody.reliefCarryOver).toEqual([{ membershipId: 'm-alpha', reliefs: [{ sourceModel: 'discount', id: 'disc-1' }] }]);
    await expect(page.getByTestId('promotion-result')).toBeVisible();

    // Batches: roll one student back, record the held student's second chance.
    const batchRow = page.getByTestId('promotion-batch-batch-1');
    await expect(batchRow).toContainText('Class 10 A');
    await batchRow.getByRole('button', { name: 'جزئیات' }).click();
    await page.getByTestId('promotion-transaction-tx-alpha').getByRole('button', { name: 'بازگردانی' }).click();
    await expect.poll(() => rollbackBody?.reason).toBe('operator review');
    await page.getByTestId('promotion-transaction-tx-gamma').getByRole('button', { name: 'کامیاب شد' }).click();
    await expect.poll(() => resolveBody?.decision).toBe('promoted');
  });
});
