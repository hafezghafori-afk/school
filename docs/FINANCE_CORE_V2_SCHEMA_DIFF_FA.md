# Finance Core V2 Schema Diff

این سند، تفاوت دقیق بین schema فعلی مالی و schema هدف را نشان می‌دهد تا تیم backend و data migration بتوانند بدون ابهام تطبیق را اجرا کنند.

## 1. وضعیت فعلی

هسته فعلی مالی پروژه این مدل‌ها را دارد:

- `FinanceFeePlan`
- `FeeOrder`
- `FeePayment`
- `Discount`
- `FeeExemption`
- `FinanceBill`
- `FinanceReceipt`

## 2. نتیجه کلی diff

نتیجه نهایی این است:

1. `FinanceFeePlan` حفظ می‌شود ولی variant-based می‌شود.
2. `FeeOrder` و `FeePayment` canonical layer نهایی می‌مانند.
3. `Discount` و `FeeExemption` در فاز بعد به `FinanceRelief` ادغام می‌شوند.
4. برای `FeeOrder` یک لایه line item لازم است.
5. `FinanceBill` و `FinanceReceipt` فقط تا پایان cutover نگه داشته می‌شوند.

---

## 3. FinanceFeePlan

### 3.1 قبل

فیلدهای اصلی فعلی:

- `title`
- `academicYearId`
- `term`
- `course`
- `classId`
- `billingFrequency`
- `tuitionFee`
- `admissionFee`
- `examFee`
- `documentFee`
- `transportDefaultFee`
- `otherFee`
- `currency`
- `dueDay`
- `isActive`
- `note`

### 3.2 بعد

فیلدهای جدید هدف:

- `planCode`
- `planType`
- `priority`
- `effectiveFrom`
- `effectiveTo`
- `isDefault`
- `eligibilityRule`

### 3.3 وضعیت اجرا

این بخش همین حالا در کد اجرا شده است.

فایل‌های درگیر:

- `D:\School-Project\backend\models\FinanceFeePlan.js`
- `D:\School-Project\backend\services\financeFeePlanService.js`
- `D:\School-Project\backend\services\feeBillingService.js`
- `D:\School-Project\backend\routes\financeRoutes.js`
- `D:\School-Project\backend\scripts\migrateFinanceFeePlanVariants.js`
- `D:\School-Project\frontend\src\pages\AdminFinance.jsx`

### 3.4 ایندکس هدف

- unique روی `(course, academicYearId, term, billingFrequency, planCode)`
- unique روی `(classId, academicYearId, term, billingFrequency, planCode)`
- sort/index روی `(classId, academicYearId, term, billingFrequency, isActive, isDefault, priority, planType)`

### 3.5 نتیجه functional

حالا یک صنف و یک سال می‌تواند چند پلان هم‌زمان داشته باشد:

- `standard`
- `charity`
- `sibling`
- `scholarship`
- `special`
- `semi_annual`

---

## 4. FeeOrder

### 4.1 قبل

ساختار فعلی:

- یک header برای بدهی
- `adjustments[]`
- `installments[]`
- مبلغ کل در `amountDue`
- نوع محدود در `orderType`

### 4.2 گپ فعلی

مشکل اصلی این است که breakdown فیس‌ها فقط در preview ساخته می‌شود و line item پایدار ندارد.

### 4.3 بعد

دو مسیر ممکن:

1. `FeeOrderLine` به عنوان collection جدید
2. `lines[]` به عنوان subdocument داخل `FeeOrder`

پیشنهاد بهتر برای پروژه:

- ابتدا `lines[]` داخل `FeeOrder`
- اگر گزارش‌گیری خیلی سنگین شد، بعداً به collection مستقل تبدیل شود

### 4.4 فیلدهای خط پیشنهادی

- `feeType`
- `label`
- `grossAmount`
- `discountAmount`
- `netAmount`
- `paidAmount`
- `balanceAmount`
- `sourcePlanId`
- `sourceReliefId`
- `periodKey`
- `status`

### 4.5 توسعه enum

`orderType` فعلی کافی نیست. enum هدف:

- `tuition`
- `admission`
- `transport`
- `exam`
- `document`
- `service`
- `penalty`
- `other`

---

## 5. FeePayment

### 5.1 قبل

ساختار فعلی خوب است و این مزیت‌ها را دارد:

- `allocations[]`
- `allocationMode`
- approval trail
- follow-up
- receipt linkage

### 5.2 بعد

تغییر بزرگ structural در این فاز لازم نیست.

فقط این تکمیل‌ها در roadmap می‌آید:

- افزودن `payerName`
- افزودن `payerPhone`
- افزودن `sponsorId`
- افزودن `settlementChannel`
- افزودن `cashboxId`

### 5.3 نتیجه

`FeePayment` از همین حالا مناسب source of truth نهایی است.

---

## 6. Discount + FeeExemption

### 6.1 قبل

دو مدل جدا:

- `Discount`
- `FeeExemption`

### 6.2 مشکل

قواعد مالی یکپارچه نیستند و این سناریوها پراکنده‌اند:

- تخفیف درصدی
- تخفیف مبلغی
- رایگان
- بورسیه
- خیریه
- معافیت دوره‌ای

### 6.3 بعد

مدل هدف:

- `FinanceRelief`

فیلدهای پیشنهادی:

- `studentMembershipId`
- `reliefType`
- `valueType`
- `value`
- `scope`
- `startDate`
- `endDate`
- `coverageMode`
- `sponsorId`
- `reason`
- `approvedBy`
- `status`

### 6.4 reliefType های پیشنهادی

- `discount`
- `waiver`
- `scholarship_partial`
- `scholarship_full`
- `charity_support`
- `free_student`
- `sibling_discount`
- `special_adjustment`

---

## 7. FundingSource

این مدل در schema فعلی وجود ندارد ولی برای خیریه و اسپانسر خیلی مفید است.

فیلدهای پیشنهادی:

- `name`
- `type`
- `contactName`
- `phone`
- `status`
- `note`

اگر در فاز اول نیاز فوری نبود، می‌تواند postponed بماند و فقط `sponsorName` داخل `FinanceRelief` ذخیره شود.

---

## 8. StudentFinanceSnapshot

این بخش optional است.

هدف:

- سبک‌کردن dashboard
- سبک‌کردن report های summary
- کاهش aggregation سنگین

پیشنهاد:

- در فاز اول ساخته نشود
- فقط اگر performance issue دیده شد اضافه شود

---

## 9. لایه legacy

مدل‌های legacy:

- `FinanceBill`
- `FinanceReceipt`

تصمیم:

1. تا پایان migration نگه داشته شوند.
2. فقط برای sync و backward compatibility استفاده شوند.
3. بعد از تکمیل cutover از write path حذف شوند.

---

## 10. ترتیب migration

### فاز A

- variant-ready کردن `FinanceFeePlan`
- backfill فیلدهای جدید
- update UI و API

وضعیت:

- انجام شد

### فاز B

- افزودن line item به `FeeOrder`
- نگهداری breakdown واقعی هنگام صدور بل
- توسعه report ها بر اساس line item

### فاز C

- ساخت `FinanceRelief`
- migration از `Discount` و `FeeExemption`
- update billing engine برای اعمال relief رسمی

### فاز D

- canonical cutover از `FinanceBill/FinanceReceipt` به `FeeOrder/FeePayment`
- محدود کردن legacy write path

### فاز E

- snapshot/performance tuning
- dashboard مدیریتی نهایی

---

## 11. Definition Of Done

schema diff وقتی done حساب می‌شود که:

1. همه variantهای پلان در UI و API قابل ثبت باشند.
2. هر بل دارای breakdown پایدار باشد.
3. همه تخفیف/معافیت/رایگان/بورسیه در یک موتور واحد ثبت شوند.
4. همه پرداخت‌ها مستقیماً روی canonical layer بنشینند.
5. گزارش درآمد به تفکیک نوع فیس از داده پایدار استخراج شود.
