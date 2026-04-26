import { test, expect } from '@playwright/test';

import { setupAdminWorkspace } from './adminWorkspace.helpers';

test.describe('government finance workflow', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.__openedPrintReports = [];
      window.open = () => ({
        document: {
          open() {},
          write(html) {
            window.__openedPrintReports.push(html);
          },
          close() {}
        },
        focus() {}
      });
    });

    await setupAdminWorkspace(page, {
      permissions: ['manage_finance', 'view_reports']
    });
  });

  test('government finance workflow exports csv, excel, and print output from official archive', async ({ page }) => {
    test.slow();

    let csvCalls = 0;
    let xlsxCalls = 0;
    let printCalls = 0;
    let csvPayload = null;
    let xlsxPayload = null;
    let printPayload = null;

    const financialYears = [
      {
        _id: 'fy-1',
        id: 'fy-1',
        title: 'Financial Year 1405',
        code: 'FY1405',
        academicYearId: 'year-1',
        startDate: '2026-01-01T00:00:00.000Z',
        endDate: '2026-12-31T00:00:00.000Z',
        dailyFeePercent: 2,
        yearlyFeePercent: 10,
        status: 'active',
        isActive: true,
        isClosed: false
      }
    ];
    const expenseCategories = [
      {
        _id: 'cat-admin',
        key: 'admin',
        label: 'Admin',
        colorTone: 'rose',
        isActive: true,
        subCategories: [
          { key: 'stationery', label: 'Stationery', isActive: true }
        ]
      }
    ];
    const expenseItems = [
      {
        _id: 'exp-1',
        category: 'admin',
        subCategory: 'stationery',
        amount: 1200,
        expenseDate: '2026-03-12T00:00:00.000Z',
        status: 'approved',
        approvalStage: 'completed',
        vendorName: 'School Supply House',
        approvalTrail: [{ action: 'approve' }]
      }
    ];

    await page.route('**/api/reports/reference-data', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          catalog: [
            { key: 'finance_overview', title: 'Finance Overview' },
            { key: 'government_finance_quarterly', title: 'Government Finance Quarterly' },
            { key: 'government_finance_annual', title: 'Government Finance Annual' }
          ],
          academicYears: [
            { id: 'year-1', title: '1405', code: '1405', isActive: true }
          ],
          financialYears,
          classes: [
            { id: 'class-1', title: 'Class 10 A', code: '10A' }
          ]
        })
      });
    });

    await page.route('**/api/finance/admin/summary', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          summary: {
            pendingReceipts: 2,
            overdueBills: 1,
            monthCollection: 6400,
            collectionRate: 71,
            receiptWorkflow: {
              financeManager: 1,
              financeLead: 1,
              generalPresident: 0
            }
          }
        })
      });
    });

    await page.route('**/api/finance/admin/reports/aging**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          buckets: {
            current: 2000,
            d1_30: 1000,
            d31_60: 300,
            d61_plus: 120
          }
        })
      });
    });

    await page.route('**/api/finance/admin/reports/cashflow**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          items: [
            { date: '2026-01-15', total: 2000 },
            { date: '2026-02-15', total: 2500 },
            { date: '2026-03-15', total: 1900 }
          ]
        })
      });
    });

    await page.route('**/api/finance/admin/reports/by-class**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          items: [
            { classId: 'class-1', schoolClass: { _id: 'class-1', title: 'Class 10 A' }, due: 8200, remaining: 1700, bills: 6 }
          ]
        })
      });
    });

    await page.route('**/api/finance/admin/reports/discounts', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, items: [] })
      });
    });

    await page.route('**/api/finance/admin/month-close', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          items: [
            { _id: 'close-1', monthKey: '2026-02', closedBy: { name: 'Admin Alpha' } }
          ]
        })
      });
    });

    await page.route('**/api/reports/run', async (route) => {
      const payload = route.request().postDataJSON();
      const reportKey = payload?.reportKey || '';
      if (reportKey === 'government_finance_quarterly') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            report: {
              report: { key: reportKey, title: 'Government Finance Quarterly' },
              summary: {
                totalIncome: 8200,
                totalExpense: 1200,
                balance: 7000
              },
              columns: [
                { key: 'classTitle', label: 'Class' },
                { key: 'totalIncome', label: 'Income' },
                { key: 'totalExpense', label: 'Expense' }
              ],
              rows: [
                { classTitle: 'Class 10 A', totalIncome: 8200, totalExpense: 1200, balance: 7000 }
              ],
              generatedAt: '2026-03-19T08:00:00.000Z'
            }
          })
        });
        return;
      }

      if (reportKey === 'government_finance_annual') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            report: {
              report: { key: reportKey, title: 'Government Finance Annual' },
              summary: {
                totalIncome: 32000,
                totalExpense: 8500,
                netProfit: 23500
              },
              columns: [
                { key: 'quarterLabel', label: 'Quarter' },
                { key: 'totalIncome', label: 'Income' },
                { key: 'totalExpense', label: 'Expense' }
              ],
              rows: [
                { quarterLabel: 'ربع 1', totalIncome: 8000, totalExpense: 2000, balance: 6000 }
              ],
              generatedAt: '2026-03-19T08:00:00.000Z'
            }
          })
        });
        return;
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          report: {
            report: { key: reportKey, title: 'Finance Overview' },
            summary: {
              totalDue: 8200,
              totalPaymentAmount: 6400,
              totalOutstanding: 1800,
              totalOrders: 6,
              totalPayments: 4,
              overdueOrders: 1
            },
            columns: [
              { key: 'orderNumber', label: 'Order' },
              { key: 'classTitle', label: 'Class' },
              { key: 'amountDue', label: 'Due' }
            ],
            rows: [
              { orderNumber: 'FO-1', classTitle: 'Class 10 A', amountDue: 8200 }
            ],
            generatedAt: '2026-03-19T08:00:00.000Z'
          }
        })
      });
    });

    await page.route('**/api/finance/admin/financial-years', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, items: financialYears })
      });
    });

    await page.route('**/api/finance/admin/expense-categories**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, items: expenseCategories })
      });
    });

    await page.route('**/api/finance/admin/expenses/analytics**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          analytics: {
            summary: {
              totalAmount: 1200,
              approvedAmount: 1200,
              pendingAmount: 0,
              queueCount: 0,
              vendorCount: 1,
              categoryCount: 1,
              statusCounts: {
                draft: 0,
                pendingReview: 0,
                approved: 1,
                rejected: 0,
                void: 0
              }
            },
            categories: [
              { key: 'admin', label: 'Admin', amount: 1200, count: 1, colorTone: 'rose', sharePercent: 100 }
            ],
            vendors: [
              { label: 'School Supply House', amount: 1200, count: 1 }
            ],
            monthly: [
              { monthKey: '2026-03', label: '2026-03', amount: 1200, approvedAmount: 1200, pendingAmount: 0, count: 1 }
            ],
            queue: [],
            closeReadiness: {
              financialYearId: 'fy-1',
              financialYearTitle: 'Financial Year 1405',
              isClosed: false,
              canClose: true,
              blockerCount: 0,
              blockers: [],
              counts: {
                draft: 0,
                pendingReview: 0,
                approved: 1,
                rejected: 0,
                void: 0
              }
            },
            registry: expenseCategories
          }
        })
      });
    });

    await page.route('**/api/finance/admin/treasury/analytics**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          analytics: {
            summary: {
              accountCount: 1,
              activeAccountCount: 1,
              cashBalance: 3000,
              bankBalance: 0,
              bookBalance: 3000,
              manualInflow: 500,
              manualOutflow: 0,
              transferCount: 0,
              expenseOutflow: 0,
              unassignedApprovedExpenseCount: 1,
              unassignedApprovedExpenseAmount: 1200,
              reconciledAccountCount: 0,
              unreconciledAccountCount: 1
            },
            accounts: [
              {
                _id: 'treasury-account-1',
                title: 'Main Cashbox',
                code: 'CASH-01',
                accountType: 'cashbox',
                currency: 'AFN',
                openingBalance: 2500,
                accountNoMasked: '***1001',
                isActive: true,
                lastReconciledAt: null,
                metrics: {
                  manualInflow: 500,
                  manualOutflow: 0,
                  transferIn: 0,
                  transferOut: 0,
                  expenseOutflow: 0,
                  transferCount: 0,
                  expenseCount: 0,
                  bookBalance: 3000,
                  lastTransactionAt: '2026-03-05T00:00:00.000Z'
                }
              }
            ],
            recentTransactions: [
              {
                _id: 'treasury-transaction-1',
                transactionType: 'deposit',
                direction: 'in',
                amount: 500,
                transactionDate: '2026-03-05T00:00:00.000Z',
                referenceNo: 'TR-001',
                counterAccount: null,
                account: {
                  _id: 'treasury-account-1',
                  title: 'Main Cashbox',
                  code: 'CASH-01',
                  accountType: 'cashbox',
                  accountNoMasked: '***1001'
                }
              }
            ],
            alerts: [
              {
                key: 'unassigned_expense',
                tone: 'rose',
                label: '1 approved expense(s) missing treasury assignment.'
              }
            ]
          }
        })
      });
    });

    await page.route('**/api/finance/admin/expenses**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          items: expenseItems
        })
      });
    });

    await page.route('**/api/finance/admin/government-snapshots**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          items: [
            {
              _id: 'snap-1',
              reportType: 'annual',
              quarter: null,
              version: 1,
              generatedAt: '2026-03-15T08:00:00.000Z',
              generatedBy: { _id: 'admin-1', name: 'Admin Alpha' },
              title: 'Government Annual Snapshot',
              columns: [
                { key: 'quarterLabel', label: 'Quarter' },
                { key: 'totalIncome', label: 'Income' },
                { key: 'totalExpense', label: 'Expense' }
              ],
              rows: [
                { quarterLabel: 'ربع 1', totalIncome: 12000, totalExpense: 3000 }
              ],
              summary: { netProfit: 9000 }
            }
          ]
        })
      });
    });

    await page.route('**/api/reports/export.csv', async (route) => {
      csvCalls += 1;
      csvPayload = route.request().postDataJSON();
      await route.fulfill({
        status: 200,
        headers: {
          'content-type': 'text/csv; charset=utf-8',
          'content-disposition': 'attachment; filename=\"government_finance.csv\"'
        },
        body: 'Quarter,Income,Expense\nربع 1,12000,3000'
      });
    });

    await page.route('**/api/reports/export.xlsx', async (route) => {
      xlsxCalls += 1;
      xlsxPayload = route.request().postDataJSON();
      await route.fulfill({
        status: 200,
        headers: {
          'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'content-disposition': 'attachment; filename=\"government_finance.xlsx\"'
        },
        body: 'xlsx-binary'
      });
    });

    await page.route('**/api/reports/export.print', async (route) => {
      printCalls += 1;
      printPayload = route.request().postDataJSON();
      await route.fulfill({
        status: 200,
        headers: {
          'content-type': 'text/html; charset=utf-8',
          'content-disposition': 'inline; filename=\"government_finance.html\"'
        },
        body: '<html><body><h1>Government Finance Annual</h1><p>Class 10 A</p></body></html>'
      });
    });

    await page.goto('/admin-government-finance', { waitUntil: 'domcontentloaded' });
    await page.getByRole('tab', { name: 'آرشیف رسمی' }).click();
    await expect.poll(() => new URL(page.url()).searchParams.get('tab') || '').toBe('archive');

    const classFilter = page.locator('.gov-finance-filters select').nth(2);
    await classFilter.selectOption('class-1');
    await expect.poll(() => new URL(page.url()).searchParams.get('classId') || '').toBe('class-1');

    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect.poll(() => new URL(page.url()).searchParams.get('tab') || '').toBe('archive');
    await expect(page.locator('.gov-finance-filters select').nth(2)).toHaveValue('class-1');

    const exportGrid = page.locator('.gov-export-grid');
    await exportGrid.getByRole('button', { name: 'CSV' }).click();
    await exportGrid.getByRole('button', { name: 'اکسل' }).click();
    await exportGrid.getByRole('button', { name: 'نسخه چاپی' }).click();

    await expect.poll(() => csvCalls).toBe(1);
    await expect.poll(() => xlsxCalls).toBe(1);
    await expect.poll(() => printCalls).toBe(1);

    await expect.poll(() => csvPayload?.reportKey || '').toBe('government_finance_annual');
    await expect.poll(() => csvPayload?.filters?.classId || '').toBe('class-1');
    await expect.poll(() => xlsxPayload?.filters?.financialYearId || '').toBe('fy-1');
    await expect.poll(() => printPayload?.filters?.academicYearId || '').toBe('year-1');
    await expect.poll(() => page.evaluate(() => window.__openedPrintReports.length)).toBe(1);
    await expect.poll(() => page.evaluate(() => window.__openedPrintReports[0] || '')).toContain('Government Finance Annual');
  });
});
