# Finance Core V2 Execution Backlog

این backlog برای اجرای مرحله‌ای Finance Core V2 نوشته شده تا تیم بتواند بدون rewrite و با کمترین ریسک، ماژول مالی را به نسخه نهایی برساند.

## 1. اصل اجرایی

قانون اصلی این backlog:

- اول canonical layer را قوی می‌کنیم
- بعد legacy layer را محدود می‌کنیم
- بعد گزارش و dashboard را روی داده canonical می‌نشانیم

---

## 2. فاز 1: Fee Plan Variants

### هدف

فعال‌کردن چند پلان مالی برای یک صنف و سال تعلیمی.

### وضعیت

این فاز اجرا شده است.

### فایل‌های تغییرکرده

- `D:\School-Project\backend\models\FinanceFeePlan.js`
- `D:\School-Project\backend\services\financeFeePlanService.js`
- `D:\School-Project\backend\services\feeBillingService.js`
- `D:\School-Project\backend\routes\financeRoutes.js`
- `D:\School-Project\backend\scripts\migrateFinanceFeePlanVariants.js`
- `D:\School-Project\frontend\src\pages\AdminFinance.jsx`

### کارهای done

- افزودن `planCode`
- افزودن `planType`
- افزودن `priority`
- افزودن `effectiveFrom`
- افزودن `effectiveTo`
- افزودن `isDefault`
- افزودن `eligibilityRule`
- تغییر unique indexها
- بهبود sort و selection پلان
- افزودن dry-run/apply script برای migration
- افزودن UI برای ثبت و مشاهده variantها

### فرمان‌های اجرایی

```powershell
cd D:\School-Project\backend
cmd /c npm run finance:fee-plan-variants:dry
cmd /c npm run finance:fee-plan-variants
```

### معیار پذیرش

- یک صنف بتواند هم‌زمان `standard` و `sibling` و `charity` داشته باشد
- فقط یک پلان پیش‌فرض در هر scope فعال بماند
- billing engine پلان درست را با sort جدید پیدا کند

---

## 3. فاز 2: Fee Order Line Items

### هدف

تبدیل بدهی از یک مبلغ کل به breakdown پایدار.

### backend tasks

- افزودن `lines[]` داخل `FeeOrder`
- توسعه enum `orderType`
- ذخیره `feeBreakdown` واقعی هنگام صدور بل
- update serializer ها
- update گزارش‌ها بر اساس line item

### فایل‌های درگیر

- `D:\School-Project\backend\models\FeeOrder.js`
- `D:\School-Project\backend\services\feeBillingService.js`
- `D:\School-Project\backend\services\studentFinanceService.js`
- `D:\School-Project\backend\routes\financeRoutes.js`

### frontend tasks

- نمایش breakdown هر بل
- نمایش breakdown در گزارش هر متعلم
- نمایش type totals در dashboard

### فایل‌های درگیر

- `D:\School-Project\frontend\src\pages\AdminFinance.jsx`

### معیار پذیرش

- هر بل حداقل یک line داشته باشد
- مجموع `lines.netAmount` با `amountDue` برابر باشد
- report درآمد بر اساس line item قابل تولید باشد

---

## 4. فاز 3: Relief Engine

### هدف

ادغام تخفیف، معافیت، رایگان، بورسیه و خیریه در یک موتور واحد.

### backend tasks

- ساخت مدل `FinanceRelief`
- ساخت migration از `Discount` و `FeeExemption`
- update billing engine برای اعمال reliefها قبل از صدور بل
- اضافه‌کردن approval metadata

### فایل‌های درگیر

- `D:\School-Project\backend\models\Discount.js`
- `D:\School-Project\backend\models\FeeExemption.js`
- `D:\School-Project\backend\models\FinanceRelief.js`
- `D:\School-Project\backend\services\feeBillingService.js`
- `D:\School-Project\backend\services\studentFinanceService.js`
- `D:\School-Project\backend\routes\financeRoutes.js`

### frontend tasks

- تبدیل صفحه تخفیف و معافیت به registry واحد
- فیلتر بر اساس relief type
- نمایش sponsor/approval/status

### معیار پذیرش

- relief فعال روی billing اثر مستقیم بگذارد
- relief در reportها جدا دیده شود
- صفحه "متعلمین رایگان" فقط filter/view باشد

---

## 5. فاز 4: Search + Profile + Dashboard

### هدف

تبدیل مالی از صفحه‌محور به سیستم عملیات روزانه.

### backend tasks

- search مالی بر اساس نام پدر، guardian و phone
- بهبود student finance profile
- ساخت endpointهای summary جدید

### frontend tasks

- کارت مالی متعلم
- search سراسری مالی
- alertهای هوشمند
- dashboard تحلیلی بهتر

### فایل‌های درگیر

- `D:\School-Project\backend\models\StudentProfile.js`
- `D:\School-Project\backend\services\studentFinanceService.js`
- `D:\School-Project\backend\routes\financeRoutes.js`
- `D:\School-Project\frontend\src\pages\AdminFinance.jsx`

### معیار پذیرش

- با یک جستجو، وضعیت مالی متعلم فوری دیده شود
- بدهی، پرداخت، relief و پلان در یک کارت واحد دیده شود

---

## 6. فاز 5: Canonical Cutover

### هدف

خارج‌کردن `FinanceBill` و `FinanceReceipt` از write path اصلی.

### tasks

- ثبت مستقیم روی `FeeOrder` و `FeePayment`
- محدودکردن sync به migration/backward compatibility
- log و monitoring روی دو لایه
- خاموش‌کردن writeهای legacy بعد از signoff

### فایل‌های درگیر

- `D:\School-Project\backend\models\FinanceBill.js`
- `D:\School-Project\backend\models\FinanceReceipt.js`
- `D:\School-Project\backend\utils\studentFinanceSync.js`
- `D:\School-Project\backend\routes\financeRoutes.js`

### معیار پذیرش

- همه create/updateهای جدید روی canonical models ثبت شوند
- sync فقط برای سازگاری باقی بماند

---

## 7. QA Gate

قبل از هر cutover این موارد باید انجام شود:

1. syntax check
2. route check
3. dry-run migration
4. backup plan
5. sample data verification

### فرمان‌های پیشنهادی

```powershell
cd D:\School-Project\backend
cmd /c npm run check:syntax
cmd /c npm run check:finance-routes
cmd /c npm run finance:fee-plan-variants:dry
```

```powershell
cd D:\School-Project\frontend
cmd /c npm run build
```

---

## 8. اولویت اجرای واقعی

اگر بخواهیم با بهترین نسبت ارزش به ریسک حرکت کنیم، ترتیب پیشنهادی من این است:

1. `FeePlan Variants`
2. `FeeOrder Line Items`
3. `Relief Engine`
4. `Student Finance Profile + Search`
5. `Canonical Cutover`

---

## 9. پیشنهاد نهایی من

اگر فقط یک مسیر عالی و مدرن را انتخاب کنیم، پیشنهاد من این است:

1. variant-based plan را مبنا بگیریم
2. line-item billing را سریع اجرا کنیم
3. relief engine را به‌جای ادامه‌دادن مدل‌های جدا پیاده کنیم
4. بعد از آن dashboard و search را روی داده canonical بازطراحی کنیم

این مسیر هم modern است، هم audit-friendly، هم برای تیم فعلی قابل تطبیق است.
