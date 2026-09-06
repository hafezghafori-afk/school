/**
 * پاک‌سازیِ ثبت‌نام‌های تکراریِ آموزشگاه و شاگردان موقت.
 *
 * «تکراری» = بیش از یک ثبت‌نامِ status='active' برای همان (studentId, classId).
 *
 * برای هر خوشه یک ثبت‌نام «نگه‌داشته» و بقیه «ابطال» می‌شوند:
 *   قانونِ انتخابِ نگه‌داشته (به‌ترتیب اولویت):
 *     ۱) بیشترین تعدادِ قلمِ ماهانهٔ زنده (تاریخچهٔ ماه‌ها) — فقط آموزشگاه
 *     ۲) بیشترین مجموعِ پرداختِ زنده
 *     ۳) قدیمی‌ترین createdAt
 *     ۴) کوچک‌ترین _id
 *
 * اعمال (--apply):
 *   آموزشگاه:
 *     - پرداخت‌های زندهٔ ثبت‌نام‌های ابطالی → registrationId/studentId = نگه‌داشته،
 *       بلِ مربوط هم re-point می‌شود.
 *     - همهٔ قلم‌های غیرِ ابطالیِ ثبت‌نام‌های ابطالی → status='void'.
 *     - allocations همهٔ پرداخت‌های (نگه‌داشته + منتقل‌شده) پاک، سپس به‌ترتیبِ paidAt
 *       با FIFO روی قلم‌های زندهٔ نگه‌داشته از نو تخصیص می‌یابد.
 *     - recomputeRegistration(نگه‌داشته).
 *   موقت:
 *     - پرداخت‌های زندهٔ ابطالی‌ها → نگه‌داشته، بل re-point.
 *     - paidAmount نگه‌داشته = مجموعِ پرداخت‌های زنده‌اش؛ balance بازمحاسبه.
 *   هر دو:
 *     - ثبت‌نام‌های ابطالی: status='cancelled'، note ادغام، قلم‌هایشان void.
 *     - مازادِ پرداخت (paid > payable) فقط گزارش می‌شود؛ خودکار چیزی ساخته نمی‌شود.
 *
 *   node backend/scripts/cleanupDuplicateRegistrations.js --uri="..." --dns=8.8.8.8            # DRY-RUN
 *   node backend/scripts/cleanupDuplicateRegistrations.js --uri="..." --dns=8.8.8.8 --apply
 *   ... --only=academy        # فقط آموزشگاه
 *   ... --only=shortterm      # فقط موقت
 */
require('dotenv').config();
const dns = require('dns');
const mongoose = require('mongoose');

mongoose.set('autoIndex', false);
mongoose.set('autoCreate', false);

const argv = process.argv.slice(2);
const readArg = (n, fb = '') => {
  for (let i = 0; i < argv.length; i += 1) {
    const t = String(argv[i] || '');
    if (t === `--${n}`) return String(argv[i + 1] ?? '').trim();
    if (t.startsWith(`--${n}=`)) return t.slice(n.length + 3).trim();
  }
  return fb;
};
const hasFlag = (n) => argv.includes(`--${n}`);
const num = (v) => Math.max(0, Number(v || 0));
const round = (v) => Math.round(num(v) * 100) / 100;
const todayKey = () => new Date().toISOString().slice(0, 10);
const idStr = (v) => String(v);

function fifoAllocate(amount, openCharges) {
  let left = round(amount);
  const allocations = [];
  for (const c of openCharges) {
    if (left <= 0) break;
    const net = round(num(c.amount) - num(c.discountAmount));
    const open = round(net - num(c._paid || 0));
    if (open <= 0) continue;
    const take = round(Math.min(open, left));
    allocations.push({ chargeId: c._id, amount: take });
    c._paid = round(num(c._paid || 0) + take);
    left = round(left - take);
  }
  return { allocations, unallocated: round(left) };
}

/** انتخابِ نگه‌داشته از میانِ کاندیداهای یک خوشه. */
function pickKeeper(cands) {
  return [...cands].sort((a, b) => (
    b.liveMonthly - a.liveMonthly
    || b.sumPaid - a.sumPaid
    || new Date(a.createdAt || 0) - new Date(b.createdAt || 0)
    || idStr(a._id).localeCompare(idStr(b._id))
  ))[0];
}

async function run() {
  const APPLY = hasFlag('apply');
  const ONLY = readArg('only', '');
  const uri = readArg('uri') || process.env.PROD_MONGO_URI || process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/school';
  const d = readArg('dns');
  if (d) { dns.setServers(d.split(',').map((s) => s.trim()).filter(Boolean)); console.log(`DNS: ${dns.getServers().join(', ')}`); }

  await mongoose.connect(uri, { autoIndex: false, autoCreate: false, serverSelectionTimeoutMS: 20000 });
  console.log(`connected: ${uri.replace(/\/\/[^@]*@/, '//***@')}  |  mode: ${APPLY ? 'APPLY' : 'DRY-RUN'}\n`);
  const today = todayKey();

  const academyDb = mongoose.connection.useDb(String(process.env.ACADEMY_DB_NAME || 'academy_db'));
  const shortDb = mongoose.connection.useDb(String(process.env.SHORT_TERM_DB_NAME || 'short_term_center_db'));

  const grand = { voidRegs: 0, movedPayments: 0, voidedCharges: 0, debtRemoved: 0, surplusFlags: [] };

  // ============ آموزشگاه ============
  if (ONLY !== 'shortterm') {
    const R = academyDb.collection('academyregistrations');
    const C = academyDb.collection('academycharges');
    const P = academyDb.collection('academypayments');
    const I = academyDb.collection('academyinvoices');
    const St = academyDb.collection('academystudents');
    const Cl = academyDb.collection('academyclasses');

    const clusters = await R.aggregate([
      { $match: { status: 'active' } },
      { $group: { _id: { s: '$studentId', c: '$classId' }, ids: { $push: '$_id' }, n: { $sum: 1 } } },
      { $match: { n: { $gt: 1 } } },
      { $sort: { n: -1 } }
    ]).toArray();

    console.log(`================ آموزشگاه — ${clusters.length} خوشهٔ تکراری ================`);
    for (const cl of clusters) {
      const st = await St.findOne({ _id: cl._id.s }, { projection: { fullName: 1, studentCode: 1 } });
      const kls = await Cl.findOne({ _id: cl._id.c }, { projection: { name: 1 } });
      const regs = await R.find({ _id: { $in: cl.ids } }).toArray();

      const cands = [];
      for (const rg of regs) {
        const charges = await C.find({ registrationId: rg._id }).toArray();
        const pays = await P.find({ registrationId: rg._id, status: { $ne: 'void' } }).toArray();
        const liveCharges = charges.filter((x) => x.status !== 'void');
        cands.push({
          _id: rg._id, createdAt: rg.createdAt, doc: rg,
          liveCharges, allCharges: charges, pays,
          liveMonthly: liveCharges.filter((x) => x.kind === 'monthly').length,
          sumPaid: round(pays.reduce((s, p) => s + num(p.amount), 0)),
          balance: num(rg.balance)
        });
      }
      const keeper = pickKeeper(cands);
      const losers = cands.filter((c) => idStr(c._id) !== idStr(keeper._id));
      const debtRemoved = round(losers.reduce((s, l) => s + l.balance, 0));
      const movePays = losers.flatMap((l) => l.pays);

      console.log(`\n• ${st?.fullName || cl._id.s} (${st?.studentCode || ''}) / صنف ${kls?.name || cl._id.c}  — ${cands.length} ثبت‌نام`);
      console.log(`   نگه‌داشته: ${keeper._id}  (ماه‌ها=${keeper.liveMonthly}، پرداخت=${keeper.sumPaid}، مانده=${keeper.balance}، ساخت=${keeper.createdAt?.toISOString?.().slice(0, 10)})`);
      for (const l of losers) {
        console.log(`   ابطال:    ${l._id}  (ماه‌ها=${l.liveMonthly}، پرداخت=${l.sumPaid}، مانده=${l.balance}، ساخت=${l.createdAt?.toISOString?.().slice(0, 10)})  → قلم‌های زنده ${l.liveCharges.length} void؛ پرداخت‌ها (${l.pays.length}) منتقل`);
      }
      // projected keeper reconcile
      const keeperLive = keeper.liveCharges.map((c) => ({ ...c, _paid: 0 }));
      const keeperNet = round(keeperLive.reduce((s, c) => s + round(num(c.amount) - num(c.discountAmount)), 0));
      const allPay = [...keeper.pays, ...movePays].sort((a, b) => new Date(a.paidAt || a.createdAt || 0) - new Date(b.paidAt || b.createdAt || 0));
      const sumAllPay = round(allPay.reduce((s, p) => s + num(p.amount), 0));
      const projBal = round(Math.max(0, keeperNet - sumAllPay));
      const projSurplus = round(Math.max(0, sumAllPay - keeperNet));
      console.log(`   → پس از ادغام: قابل‌پرداختِ نگه‌داشته=${keeperNet}، پرداختِ کل=${sumAllPay}، مانده=${projBal}${projSurplus > 0 ? `، ⚠️ مازاد=${projSurplus}` : ''}`);
      console.log(`   → بدهیِ ساختگیِ حذف‌شده از این خوشه: ${debtRemoved}`);
      if (projSurplus > 0) grand.surplusFlags.push({ mod: 'academy', who: st?.fullName, keeper: idStr(keeper._id), surplus: projSurplus });

      grand.voidRegs += losers.length;
      grand.movedPayments += movePays.length;
      grand.voidedCharges += losers.reduce((s, l) => s + l.liveCharges.length, 0);
      grand.debtRemoved += debtRemoved;

      if (APPLY) {
        // 1) void loser charges
        for (const l of losers) {
          if (l.liveCharges.length) {
            await C.updateMany(
              { _id: { $in: l.liveCharges.map((c) => c._id) } },
              { $set: { status: 'void', voidedAt: new Date(), voidReason: `تکراری — ادغام در ${keeper._id} (${today})` } }
            );
          }
        }
        // 2) move loser payments + invoices to keeper
        for (const p of movePays) {
          await P.updateOne({ _id: p._id }, { $set: { registrationId: keeper._id, studentId: cl._id.s, allocations: [] } });
          if (p.invoiceId) await I.updateOne({ _id: p.invoiceId }, { $set: { registrationId: keeper._id } });
        }
        // 3) re-FIFO all keeper payments over keeper live charges
        const freshCharges = (await C.find({ registrationId: keeper._id, status: { $ne: 'void' } }).sort({ dueDate: 1, createdAt: 1 }).toArray())
          .map((c) => ({ ...c, _paid: 0 }));
        const freshPays = await P.find({ registrationId: keeper._id, status: { $ne: 'void' } }).sort({ paidAt: 1, createdAt: 1 }).toArray();
        for (const p of freshPays) {
          const { allocations } = fifoAllocate(num(p.amount), freshCharges);
          await P.updateOne({ _id: p._id }, { $set: { allocations } });
        }
        // 4) recompute keeper charge paid/balance + rollup
        let totalNet = 0;
        let totalPaid = 0;
        for (const c of freshCharges) {
          const net = round(num(c.amount) - num(c.discountAmount));
          const paid = round(Math.min(net, num(c._paid)));
          const bal = round(net - paid);
          const status = bal <= 0 && net > 0 ? 'paid' : paid > 0 ? 'partial' : 'pending';
          await C.updateOne({ _id: c._id }, { $set: { paidAmount: paid, balance: bal, status } });
          totalNet += net;
          totalPaid += paid;
        }
        await R.updateOne({ _id: keeper._id }, { $set: {
          ledgerManaged: true, totalPayable: round(totalNet), paidAmount: round(totalPaid),
          balance: round(Math.max(0, totalNet - totalPaid)),
          paymentStatus: (totalNet - totalPaid) <= 0 && totalNet > 0 ? 'paid' : totalPaid > 0 ? 'partial' : 'unpaid'
        } });
        // 5) cancel losers
        for (const l of losers) {
          await R.updateOne({ _id: l._id }, { $set: {
            status: 'cancelled', balance: 0, paidAmount: 0, paymentStatus: 'unpaid',
            note: `${String(l.doc.note || '').trim()} | تکراری — ادغام در ${keeper._id} (${today})`.trim()
          } });
        }
      }
    }
  }

  // ============ شاگردان موقت ============
  if (ONLY !== 'academy') {
    const R = shortDb.collection('shorttermregistrations');
    const P = shortDb.collection('shorttermpayments');
    const I = shortDb.collection('shortterminvoices');
    const C = shortDb.collection('shorttermcharges'); // ممکن است وجود نداشته باشد
    const St = shortDb.collection('shorttermstudents');
    const Cl = shortDb.collection('shorttermclasses');

    const clusters = await R.aggregate([
      { $match: { status: 'active' } },
      { $group: { _id: { s: '$studentId', c: '$classId' }, ids: { $push: '$_id' }, n: { $sum: 1 } } },
      { $match: { n: { $gt: 1 } } },
      { $sort: { n: -1 } }
    ]).toArray();

    console.log(`\n\n================ شاگردان موقت — ${clusters.length} خوشهٔ تکراری ================`);
    for (const cl of clusters) {
      const st = await St.findOne({ _id: cl._id.s }, { projection: { fullName: 1, studentCode: 1 } });
      const kls = await Cl.findOne({ _id: cl._id.c }, { projection: { name: 1 } });
      const regs = await R.find({ _id: { $in: cl.ids } }).toArray();

      const cands = [];
      for (const rg of regs) {
        const pays = await P.find({ registrationId: rg._id, status: { $ne: 'void' } }).toArray();
        cands.push({
          _id: rg._id, createdAt: rg.createdAt, doc: rg, pays, liveMonthly: 0,
          sumPaid: round(pays.reduce((s, p) => s + num(p.amount), 0)),
          balance: num(rg.balance), payable: num(rg.totalPayable)
        });
      }
      const keeper = pickKeeper(cands);
      const losers = cands.filter((c) => idStr(c._id) !== idStr(keeper._id));
      const debtRemoved = round(losers.reduce((s, l) => s + l.balance, 0));
      const movePays = losers.flatMap((l) => l.pays);
      const sumAllPay = round([...keeper.pays, ...movePays].reduce((s, p) => s + num(p.amount), 0));
      const projBal = round(Math.max(0, keeper.payable - sumAllPay));
      const projSurplus = round(Math.max(0, sumAllPay - keeper.payable));

      console.log(`\n• ${st?.fullName || cl._id.s} (${st?.studentCode || ''}) / صنف ${kls?.name || cl._id.c}  — ${cands.length} ثبت‌نام`);
      console.log(`   نگه‌داشته: ${keeper._id}  (پرداخت=${keeper.sumPaid}، قابل‌پرداخت=${keeper.payable}، مانده=${keeper.balance}، ساخت=${keeper.createdAt?.toISOString?.().slice(0, 10)})`);
      for (const l of losers) {
        console.log(`   ابطال:    ${l._id}  (پرداخت=${l.sumPaid}، مانده=${l.balance}، ساخت=${l.createdAt?.toISOString?.().slice(0, 10)})  → پرداخت‌ها (${l.pays.length}) منتقل`);
      }
      console.log(`   → پس از ادغام: پرداختِ کل=${sumAllPay}، مانده=${projBal}${projSurplus > 0 ? `، ⚠️ مازاد=${projSurplus}` : ''}`);
      console.log(`   → بدهیِ ساختگیِ حذف‌شده از این خوشه: ${debtRemoved}`);
      if (projSurplus > 0) grand.surplusFlags.push({ mod: 'shortterm', who: st?.fullName, keeper: idStr(keeper._id), surplus: projSurplus });

      grand.voidRegs += losers.length;
      grand.movedPayments += movePays.length;
      grand.debtRemoved += debtRemoved;

      if (APPLY) {
        for (const p of movePays) {
          await P.updateOne({ _id: p._id }, { $set: { registrationId: keeper._id, studentId: cl._id.s } });
          if (p.invoiceId) await I.updateOne({ _id: p.invoiceId }, { $set: { registrationId: keeper._id } });
        }
        try {
          for (const l of losers) {
            await C.updateMany({ registrationId: l._id, status: { $ne: 'void' } },
              { $set: { status: 'void', voidedAt: new Date(), voidReason: `تکراری — ادغام در ${keeper._id} (${today})` } });
          }
        } catch { /* بدون کالکشنِ charge */ }
        const freshPaid = round((await P.find({ registrationId: keeper._id, status: { $ne: 'void' } }).toArray())
          .reduce((s, p) => s + num(p.amount), 0));
        const kBal = round(Math.max(0, keeper.payable - freshPaid));
        await R.updateOne({ _id: keeper._id }, { $set: {
          paidAmount: freshPaid, balance: kBal,
          paymentStatus: kBal <= 0 && keeper.payable > 0 ? 'paid' : freshPaid > 0 ? 'partial' : 'unpaid'
        } });
        for (const l of losers) {
          await R.updateOne({ _id: l._id }, { $set: {
            status: 'cancelled', balance: 0, paidAmount: 0, paymentStatus: 'unpaid',
            note: `${String(l.doc.note || '').trim()} | تکراری — ادغام در ${keeper._id} (${today})`.trim()
          } });
        }
      }
    }
  }

  console.log('\n\n==================== جمع‌بندی ====================');
  console.log(JSON.stringify({
    ...grand,
    debtRemoved: round(grand.debtRemoved)
  }, null, 2));
  if (!APPLY) console.log('\nحالتِ DRY-RUN بود. برای اعمال:  --apply');
  if (grand.surplusFlags.length) console.log(`\n⚠️ ${grand.surplusFlags.length} موردِ مازادِ پرداخت — پس از اعمال، دستی به اعتبار/بازپرداخت تبدیل شود.`);

  await mongoose.disconnect();
  process.exit(0);
}

run().catch((e) => { console.error(e); process.exit(1); });
