# راهنمای پاک‌سازی کنترل‌شده دفتر مالی

آخرین بازبینی: ۲۲ جولای ۲۰۲۶

این عملیات فقط زمانی انجام شود که مرکز مالی، منطق بل، پرداخت، تخفیف/معافیت، حساب باز شاگرد و گزارش‌ها آزمایش و تأیید شده باشند. اجرای Apply تمام بل‌ها، تعهدهای فیس، رسیدها و پرداخت‌های مربوط به محدوده هدف را پاک می‌کند؛ بنابراین اجرای آن روی دیتابیس اصلی بدون تأیید کتبی مدیریت و نسخه پشتیبان ممنوع است.

## چه چیز پاک یا تغییر می‌شود؟

- `FinanceBill`، `FeeOrder`، `FinanceReceipt` و `FeePayment` مربوط به مکتب هدف پاک می‌شوند.
- گردش‌های صندوق مرتبط با پرداخت به حالت `void` می‌روند تا سابقه حسابرسی باقی بماند.
- آرشیف‌ها و کمپاین‌های وابسته باطل/متوقف می‌شوند.
- تخفیف یا معافیت دستی مدیر حذف نمی‌شود؛ لغو و از سند پاک‌شده جدا می‌شود.
- پلان مالی، شاگرد، عضویت، صنف، سال تعلیمی و ثبت‌نام اصلی حفظ می‌شوند.
- `Order` قدیمی ثبت‌نام حفظ می‌شود؛ چون ممکن است سابقه تأیید عضویت را داشته باشد.

## موانع اجباری

Reset در این حالت‌ها متوقف می‌شود:

- ختم ماه `pending_review`، `closed` یا `reopened` باشد؛
- ختم ماه سابقه تأیید یا تاریخچه داشته باشد؛
- سال مالی بسته باشد؛
- گزارش رسمی دولت، آرشیف رسمی یا سند تحویل‌شده وجود داشته باشد؛
- سند بدون `schoolId` به‌گونه مطمئن به مکتب هدف نسبت داده نشود؛
- سند به بیش از یک مکتب رابطه متضاد داشته باشد.

این موارد باید از مسیر رسمی خود حل شوند؛ با ویرایش مستقیم دیتابیس دور زده نشوند.

## مرحله ۱: آمادگی مرکز مالی

پیش از Dry-run این موارد کنترل شود:

1. برای هر صنف فقط پلان فعال درست با فیس ماهانه، داخله یک‌باره، تاریخ مؤثر و سال تعلیمی درست وجود داشته باشد.
2. مشاهده پروفایل یا کارت شاگرد هیچ بل خودکار نسازد.
3. بل‌های سررسیده از قدیمی‌ترین تاریخ در صندوق دیده شوند.
4. تاریخچه شاگرد بل، پرداخت، رسید، تخفیف، معافیت و نوع تعهد (`tuition` یا `admission`) را جدا نشان دهد.
5. پرداخت فقط به بل رسمی باز و در همان مکتب تخصیص یابد.
6. داخله هرگز از فیس ماهانه کم نشود و تخفیف فیس به داخله سرایت نکند.
7. تست‌های زیر موفق باشند:

```powershell
cd D:\School-Project\backend
npm run check:finance-routes
npm run check:student-finance-routes
npm run check:canonical-payment-allocation
npm run check:student-open-account
npm run check:finance-integrity-guards
npm run check:finance-ledger-reset
npm run check:database-restore
```

## مرحله ۲: Dry-run

برای یک مکتب:

```powershell
npm run finance:ledger-reset:dry -- --school-id=OBJECT_ID_MAKTAB
```

برای همه مکاتب فقط جهت بررسی:

```powershell
npm run finance:ledger-reset:dry -- --all-schools
```

Dry-run هیچ داده‌ای را تغییر نمی‌دهد. خروجی زیر را نگهدارید:

- نام دقیق دیتابیس؛
- `database.fingerprint`؛
- `planDigest`؛
- تعداد و مجموع بل، تعهد، رسید، پرداخت و گردش صندوق؛
- فهرست blockers و هشدارهای اسناد مبهم.

پس از Dry-run، اگر داده مالی تغییر کند Digest نیز تغییر می‌کند و Apply رد خواهد شد.

## مرحله ۳: Apply کنترل‌شده

شرایط قبل از اجرا:

- مدیر اجرایی باید کاربر فعال با نقش `finance_lead` یا `general_president` باشد.
- مسیر Backup باید مطلق، تازه، پایدار و بیرون از مخزن پروژه باشد.
- نام دیتابیس آزمایشی Restore باید تازه و با `finance_reset_restore_test_` شروع شود.
- از زمان Dry-run تا Apply بل یا پرداخت جدید ثبت نشود.

نمونه برای یک مکتب:

```powershell
npm run finance:ledger-reset:apply -- `
  --school-id=OBJECT_ID_MAKTAB `
  --actor-id=OBJECT_ID_MODIR_MALI `
  --expected-database=NAME_DATABASE `
  --expected-database-fingerprint=FINGERPRINT_FROM_DRY_RUN `
  --expected-plan-digest=PLAN_DIGEST_FROM_DRY_RUN `
  --backup-dir=C:\durable-backups\pre-finance-reset-20260722 `
  --restore-test-database=finance_reset_restore_test_20260722 `
  --confirm=DELETE_ALL_FINANCE_BILLS_AND_PAYMENTS `
  --reason="شروع دفتر مالی پاک پس از تأیید رسمی مدیریت"
```

برای همه مکاتب، علاوه بر پارامترهای بالا باید این دو گزینه جایگزین `--school-id` شوند:

```powershell
--all-schools `
--confirm-all-schools=DELETE_FINANCE_LEDGER_FOR_ALL_SCHOOLS
```

هنگام Apply سیستم:

1. قفل نگهداری سراسری مالی را فعال می‌کند؛
2. پس از مکث کوتاه، Digest را دوباره بررسی می‌کند؛
3. از تمام collectionهای خام MongoDB و Uploads نسخه v2 می‌سازد؛
4. checksum، تعداد اسناد و فهرست فایل‌ها را بررسی می‌کند؛
5. نسخه پشتیبان را در دیتابیس آزمایشی خالی Restore و دوباره بررسی می‌کند؛
6. Reset را داخل MongoDB Transaction اجرا می‌کند؛
7. نتیجه را بعد از Commit بررسی می‌کند؛
8. فایل‌های رسید حذف‌شده را در Backup قرنطینه می‌کند؛
9. فقط پس از موفقیت Verification قفل را آزاد می‌کند.

اگر Commit انجام شود اما Verification شکست بخورد، قفل عمداً فعال می‌ماند. در آن حالت سرویس مالی را باز نکنید و ابتدا نتیجه و Backup بررسی شود.

### بررسی و آزادسازی امن قفل باقی‌مانده

فرمان وضعیت فقط خواندنی است:

```powershell
npm run finance:maintenance-status
```

این فرمان نام و Fingerprint دیتابیس، `resetId`، مرحله قفل، وجود Audit، نتیجه Verification و `planDigest` فعلی را نشان می‌دهد. اگر `verificationClean` برابر `false` باشد، قفل نباید آزاد شود؛ از بازیابی Stage در بخش بعد استفاده کنید.

آزادسازی فقط وقتی ممکن است که قفل در مرحله `post_commit_review_required` باشد، Audit همان Reset وجود داشته باشد، چهار مجموعه اصلی و گردش posted صفر باشند، و Digest بین دو بررسی تغییر نکرده باشد:

```powershell
npm run finance:maintenance-unlock -- `
  --actor-id=OBJECT_ID_MODIR_MALI `
  --expected-database=NAME_DATABASE `
  --expected-database-fingerprint=FINGERPRINT_FROM_STATUS `
  --expected-reset-id=RESET_ID_FROM_STATUS `
  --expected-plan-digest=PLAN_DIGEST_FROM_STATUS `
  --review-note="نتیجه Reset، حساب شاگردان و Backup به‌صورت دستی بررسی شد" `
  --confirm=RELEASE_FINANCE_LOCK_AFTER_MANUAL_VERIFICATION
```

این فرمان گزینه Force برای نادیده‌گرفتن باقیات یا Verification ندارد. فقط مدیر فعال `finance_lead` یا `general_president` می‌تواند آن را اجرا کند و آزادسازی در Activity Log ثبت می‌شود.

## مرحله ۴: بازیابی امن در صورت نیاز

بازیابی مستقیم روی دیتابیس زنده انجام نمی‌شود. نخست Backup را بدون اتصال بررسی کنید:

```powershell
npm run backup:restore -- `
  --in=C:\durable-backups\pre-finance-reset-20260722 `
  --dry-run
```

سپس آن را در دیتابیس و پوشه Uploads تازه Stage کنید:

```powershell
npm run backup:restore -- `
  --in=C:\durable-backups\pre-finance-reset-20260722 `
  --target-database=restore_stage_pre_finance_reset_20260722 `
  --uploads-out=C:\durable-restores\pre-finance-reset-uploads-20260722 `
  --expected-manifest-sha256=SHA256_FROM_RESTORE_DRY_RUN `
  --confirm=RESTORE_VERIFIED_BACKUP_TO_NEW_TARGET `
  --force
```

این فرمان دیتابیس و Uploads اصلی را تغییر نمی‌دهد. نسخه Stage باید در یک نمونه جداگانه برنامه آزمایش شود؛ سپس با توقف کامل ترافیک نوشتن و پلان عملیاتی Hosting به آن Cutover شود.

## مرحله ۵: شروع دفتر تازه

بعد از Reset هنوز هیچ بل سررسیده وجود ندارد. ترتیب درست شروع دوباره:

1. پلان‌های مالی و عضویت‌ها دوباره بررسی شوند.
2. پیش‌نمایش صدور گروهی به تفکیک صنف اجرا شود.
3. بل رسمی فیس ماهانه و داخله یک‌باره فقط از پلان فعال صادر شود.
4. صندوق، پروفایل و گزارش‌ها با یک صنف آزمایشی بررسی شوند.
5. یک پرداخت کوچک آزمایشی ثبت و تأیید شود؛ تخصیص، رسید، صندوق و باقیات با هم تطبیق داده شوند.
6. پس از تأیید مدیر مالی، صدور و پرداخت عمومی آغاز شود.

هیچ Reset روی وب‌سایت اصلی صرفاً بر اساس درخواست شفاهی اجرا نشود؛ School ID، نام دیتابیس، Fingerprint، Digest، مدیر اجراکننده و مسیر Backup باید ثبت و تأیید شوند.
