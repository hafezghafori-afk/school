# نقشه نهایی وضعیت داشبوردها

تاریخ: 2026-03-26

## جمع‌بندی

در این برش، نقشه داشبوردهای پروژه از حالت برنامه‌ریزی به حالت اجرای واقعی رسید. داشبوردهای اصلی اکنون روی لایه‌های canonical موجود سوار هستند و برای نقش‌های اصلی محصول صفحه و backend summary دارند.

هسته‌های مرجع:

- `StudentMembership`
- `FeeOrder`
- `FeePayment`
- `Attendance`
- `Grade`
- `ExamSession`
- `ExamResult`

## وضعیت فعلی هر داشبورد

### 1. داشبورد مالی

وضعیت: `تکمیل‌شده`

فایل‌های اصلی:

- `frontend/src/pages/AdminFinance.jsx`
- `frontend/src/pages/AdminFinance.css`

پوشش فعلی:

- KPIهای مالی
- جریان ثبت پرداخت
- بل‌ها و تعهدات
- تخفیف و معافیت
- گزارش‌ها
- نمودارهای summary
- جستجو و فیلتر
- رسید چاپی
- گزارش صندوق روزانه

### 2. داشبورد مالی دولت و مکتب

وضعیت: `تکمیل‌شده`

فایل‌های اصلی:

- `frontend/src/pages/AdminGovernmentFinance.jsx`
- `frontend/src/pages/GovernmentFinanceWorkspace.css`

پوشش فعلی:

- نمای کلی
- مدیریت سال مالی
- عملیات مصارف
- گزارش ربعوار
- گزارش سالانه
- آرشیف رسمی
- export
- snapshot

### 3. داشبورد شاگرد

وضعیت: `تکمیل‌شده`

فایل‌های اصلی:

- `frontend/src/pages/StudentDashboard.jsx`
- `frontend/src/pages/Dashboard.jsx`
- `frontend/src/pages/Dashboard.css`

پوشش فعلی:

- KPIهای حضور، نمره، مالی و تکالیف
- فعالیت‌ها و هشدارها
- quick actions
- summaryهای مالی و آموزشی

### 4. داشبورد استاد

وضعیت: `تکمیل‌شده`

فایل‌های اصلی:

- `frontend/src/pages/InstructorDashboard.jsx`
- `frontend/src/pages/Dashboard.css`

پوشش فعلی:

- KPIهای آموزشی
- summary صنف‌ها و شاگردان
- برنامه امروز
- tasks و alerts
- مسیرهای سریع به attendance, grades, homework, exams

### 5. داشبورد ریاست عمومی

وضعیت: `تکمیل‌شده`

فایل‌های اصلی:

- `frontend/src/pages/AdminPanel.jsx`
- `frontend/src/pages/AdminPanel.css`

پوشش فعلی:

- summary اجرایی
- هشدارها و کارهای معطل
- quick actions مدیریتی
- وضعیت سرور
- top command bar
- داشبورد دسترسی سریع

### 6. داشبورد امتحانات

وضعیت: `تکمیل‌شده`

فایل‌های اصلی:

- `frontend/src/pages/AdminExamsDashboard.jsx`

backend summary:

- `backend/services/dashboardService.js`
- `backend/routes/dashboardRoutes.js`

پوشش فعلی:

- KPIهای امتحانات
- trend وضعیت جلسات
- recent sessions
- هشدارها و taskها

### 7. داشبورد والد/سرپرست

وضعیت: `تکمیل‌شده برای flow عملیاتی`

فایل‌های اصلی:

- `frontend/src/pages/ParentDashboard.jsx`
- `frontend/src/pages/StudentReport.jsx`
- `frontend/src/pages/StudentReport.css`

backend linkage:

- `backend/services/parentDashboardService.js`
- `backend/services/studentProfileService.js`
- `backend/routes/studentProfileRoutes.js`
- `backend/utils/userRole.js`
- `backend/utils/permissions.js`

پوشش فعلی:

- نقش رسمی `parent`
- لینک‌کردن والد/سرپرست به متعلم
- جستجوی guardian user
- unlink guardian
- dashboard والد با child switch
- preview مدیریتی/شاگردی

## لایه aggregation

وضعیت: `تکمیل‌شده`

فایل‌های اصلی:

- `backend/services/dashboardService.js`
- `backend/services/parentDashboardService.js`
- `backend/routes/dashboardRoutes.js`
- `backend/scripts/checkDashboardRoutes.js`

endpointهای فعال:

- `/api/dashboard/teacher`
- `/api/dashboard/admin`
- `/api/dashboard/exams`
- `/api/dashboard/parent`

## Shared Dashboard Framework

وضعیت: `تکمیل‌شده`

فایل‌های اصلی:

- `frontend/src/components/dashboard/DashboardShell.jsx`
- `frontend/src/components/dashboard/KpiRingCard.jsx`
- `frontend/src/components/dashboard/QuickActionRail.jsx`
- `frontend/src/components/dashboard/TaskAlertPanel.jsx`
- `frontend/src/components/dashboard/TrendBars.jsx`
- `frontend/src/components/dashboard/dashboard.css`

## اعتبارسنجی انجام‌شده

backend:

- `npm run check:syntax`
- `node ./scripts/checkDashboardRoutes.js`
- `npm run test:smoke`

frontend:

- `npm run build`
- `npm run test:e2e:parent`
- `npm run test:e2e:exams-dashboard`
- `npm run test:e2e:admin`
- `npm run test:e2e:attendance`
- `npm run test:e2e:schedule`

## کمبودهای باقی‌مانده

این موارد blocking نیستند و بیشتر polish یا فاز بعدی‌اند:

1. realtime با socket برای refresh زنده KPIها
2. شخصی‌سازی widgetها برای هر نقش
3. drill-down عمیق‌تر از بعضی KPIها به جزئیات تحلیلی
4. تست مرورگری گسترده‌تر برای سناریوهای parent linkage در چند child واقعی
5. پاک‌سازی تدریجی چند helper قدیمی و بعضی متن‌های قدیمی در فایل‌های legacy

## نتیجه نهایی

از نظر محصولی، داشبوردهای اصلی پروژه اکنون برای این scope تکمیل شده‌اند:

- مالی
- مالی دولت
- شاگرد
- استاد
- مدیریت
- امتحانات
- والد/سرپرست

آنچه باقی مانده، بازطراحی یا کمبود معماری نیست؛ فقط لایه‌های تکمیلی و polish است.
