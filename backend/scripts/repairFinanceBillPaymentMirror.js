// Manual/on-demand runner for the same repair that now also runs
// automatically on every server boot (see server.js) - useful for checking
// or forcing a repair without waiting for/triggering a deploy.
//
// Defaults to a dry run that only prints what it would change. Pass --apply
// to actually write the fixes.
require('dotenv').config();
const mongoose = require('mongoose');

require('../models/User');
require('../models/StudentCore');
require('../models/SchoolClass');
require('../models/AcademicYear');
require('../models/Course');
const { repairFinanceBillPaymentMirrors } = require('../utils/studentFinanceSync');

const APPLY = process.argv.includes('--apply');

async function main() {
  await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 8000 });

  console.log(`==== ${APPLY ? 'اجرای واقعی' : 'اجرای آزمایشی (dry run)'} ترمیم همگام‌سازی FinanceBill/FeeOrder ====`);
  const { checked, changed, fixes } = await repairFinanceBillPaymentMirrors({ dryRun: !APPLY });
  console.log(`تعداد بل‌های دارای FinanceBill منبع: ${checked}`);
  console.log('');

  fixes.forEach((fix) => {
    console.log(
      `${APPLY ? 'ترمیم شد' : 'نیاز به ترمیم دارد'}: بل ${fix.orderNumber} (شاگرد: ${fix.student?.name || fix.student || '---'}) `
      + `— مبلغ پرداختی FinanceBill از ${fix.from} به ${fix.to} افغانی اصلاح ${APPLY ? 'شد' : 'می‌شود'}.`
    );
  });

  console.log('');
  if (!changed) {
    console.log('هیچ ناهمخوانی پیدا نشد؛ همه FinanceBill ها با FeeOrder کانونیک خود همسان هستند.');
  } else if (!APPLY) {
    console.log(`${changed} مورد ناهمخوانی پیدا شد. برای اعمال واقعی، دوباره با پرچم --apply اجرا کنید:`);
    console.log('  node scripts/repairFinanceBillPaymentMirror.js --apply');
  } else {
    console.log(`${changed} مورد با موفقیت ترمیم شد.`);
  }

  await mongoose.connection.close();
}

main().catch((err) => {
  console.error('خطا در اجرای ترمیم:', err);
  process.exit(1);
});
