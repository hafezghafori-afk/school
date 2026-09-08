/* eslint-disable no-console */
/**
 * مهاجرت به مدلِ «بلِ صریح» برای مرکزِ موقت.
 *
 *  - بل‌های خودکارِ ماه‌های *بعد از ماهِ جاری* که پرداخت نخورده‌اند → void
 *    (این‌ها با اقدامِ کاربر صادر نشده بودند، فقط تولیدِ خودکارِ «تا حوت» بودند).
 *  - بل‌های ماهِ جاری و پیش از آن → نگه داشته می‌شوند به‌عنوانِ «بلِ صادرشده»
 *    (issuedAt = createdAt، issuedBy = null).
 *  - رول‌آپِ هر ثبت‌نام از نو.
 *
 *  node backend/scripts/migrateShortTermToExplicitBills.js            # DRY-RUN
 *  node backend/scripts/migrateShortTermToExplicitBills.js --apply
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const mongoose = require('mongoose');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/school_db';
const APPLY = process.argv.includes('--apply');

const L = require('../services/shortTermLedger');
const ShortTermCharge = require('../models/ShortTermCharge');
const ShortTermRegistration = require('../models/ShortTermRegistration');
require('../models/ShortTermStudent');
require('../models/ShortTermClass');

(async () => {
  await mongoose.connect(MONGO_URI);
  console.log(`connected: ${MONGO_URI.replace(/\/\/[^@]*@/, '//***@')}  |  mode: ${APPLY ? 'APPLY' : 'DRY-RUN'}`);

  const cur = L.currentShamsiMonthKey();
  const curOrd = L.monthOrdinal(cur);
  console.log(`ماهِ جاری: ${cur} (${L.shamsiMonthLabel(cur)})\n`);

  const all = await ShortTermCharge.find({ status: { $ne: 'void' } }).lean();
  const futureUnpaid = all.filter((c) => L.monthOrdinal(c.periodKey) > curOrd && L.num(c.paidAmount) <= 0);
  const keep = all.filter((c) => !(L.monthOrdinal(c.periodKey) > curOrd && L.num(c.paidAmount) <= 0));

  const byMonth = {};
  for (const c of all) {
    const k = c.periodKey;
    byMonth[k] = byMonth[k] || { total: 0, keep: 0, voidFuture: 0 };
    byMonth[k].total += 1;
    if (L.monthOrdinal(k) > curOrd && L.num(c.paidAmount) <= 0) byMonth[k].voidFuture += 1;
    else byMonth[k].keep += 1;
  }
  console.log('بل‌ها به تفکیکِ ماه (total / نگه‌داشته / void):');
  for (const k of Object.keys(byMonth).sort((a, b) => L.monthOrdinal(a) - L.monthOrdinal(b))) {
    const m = byMonth[k];
    console.log(`  ${k} ${L.shamsiMonthLabel(k).padEnd(14)}  ${String(m.total).padStart(3)} / ${String(m.keep).padStart(3)} / ${String(m.voidFuture).padStart(3)}`);
  }
  console.log(`\nجمع: ${all.length} بلِ فعال → ${keep.length} نگه‌داشته، ${futureUnpaid.length} ماهِ آیندهٔ پرداخت‌نشده → void`);

  if (!APPLY) { console.log('\nDRY-RUN. برای اعمال: --apply'); await mongoose.disconnect(); process.exit(0); }

  const ids = futureUnpaid.map((c) => c._id);
  const del = await ShortTermCharge.updateMany(
    { _id: { $in: ids } },
    { $set: { status: 'void', voidedAt: new Date(), voidReason: 'مهاجرت به مدلِ بلِ صریح — تولیدِ خودکارِ «تا حوت» حذف شد' } }
  );
  console.log(`\n[1] ${del.modifiedCount} بلِ ماهِ آینده void شد`);

  const stamp = await ShortTermCharge.updateMany(
    { status: { $ne: 'void' }, $or: [{ issuedAt: { $exists: false } }, { issuedAt: null }] },
    [{ $set: { issuedAt: '$createdAt' } }]
  );
  console.log(`[2] issuedAt روی ${stamp.modifiedCount} بلِ باقی‌مانده تنظیم شد`);

  let n = 0;
  for (const reg of await ShortTermRegistration.find({ status: { $in: ['active', 'completed'] } })) {
    await L.recomputeRegistration(reg._id);
    n += 1;
  }
  console.log(`[3] ${n} ثبت‌نام از نو رول‌آپ شد`);

  const left = await ShortTermCharge.countDocuments({ status: { $ne: 'void' } });
  console.log(`\nAFTER: ${left} بلِ فعال`);
  await mongoose.disconnect();
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
