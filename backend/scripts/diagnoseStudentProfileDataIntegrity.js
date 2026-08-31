/**
 * تشخیصِ فقط‌خواندنیِ سه مشکلِ گزارش‌شده در «مرکز مدیریت شاگردان»:
 *   1) بل‌ها/باقیات — رکوردهای FeeOrder با مبالغِ ذخیره‌شدهٔ ناهمگام یا باقیاتِ منفی/غلط.
 *   2) نام‌های «انگلیسی برویت تذکره» که در واقع فارسی/دری ذخیره شده‌اند.
 *   3) «موبایل پدر» (و دیگر خانه‌های تلفن) که شماره تذکره/اساس یا مقدارِ غیرتلفن دارند،
 *      و پرونده‌هایی که ممکن است به‌خاطرِ اشتراکِ شماره تلفن اشتباهاً ادغام شده باشند.
 *
 * هیچ چیزی نوشته/تغییر داده نمی‌شود. فقط شمارش و چند نمونه.
 *
 * اجرا:
 *   node backend/scripts/diagnoseStudentProfileDataIntegrity.js
 *   node backend/scripts/diagnoseStudentProfileDataIntegrity.js --limit=25 --json
 *   MONGO_URI="mongodb+srv://..." node backend/scripts/diagnoseStudentProfileDataIntegrity.js
 */
require('dotenv').config();
const mongoose = require('mongoose');

mongoose.set('autoIndex', false);
mongoose.set('autoCreate', false);

const AfghanStudent = require('../models/AfghanStudent');
const FeeOrder = require('../models/FeeOrder');
const { normalizeFinanceLineItems, roundMoney } = require('../utils/financeLineItems');

const ARABIC_SCRIPT = /\p{Script=Arabic}/u;
const LATIN = /[A-Za-z]/;

function readArg(name, fallback = '') {
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i += 1) {
    const token = String(argv[i] || '');
    if (token === `--${name}`) return String(argv[i + 1] ?? '').trim();
    if (token.startsWith(`--${name}=`)) return token.slice(name.length + 3).trim();
  }
  return fallback;
}
const hasFlag = (name) => process.argv.slice(2).includes(`--${name}`);

const text = (v) => (typeof v === 'string' ? v.trim() : '');
const digitsOnly = (v) => text(v).replace(/[^0-9]/g, '');
const isPhoneShaped = (v) => {
  const d = digitsOnly(v);
  return d.length >= 7 && d.length <= 15;
};
const asasOf = (s) => text(s.asasNumber) || text(s.registrationId) || String(s._id);

async function run() {
  const LIMIT = Math.max(1, Number(readArg('limit', '15')) || 15);
  const JSON_OUT = hasFlag('json');
  const uri = process.env.MONGO_URI || readArg('uri') || 'mongodb://127.0.0.1:27017/school_db';

  await mongoose.connect(uri, { autoIndex: false, autoCreate: false, serverSelectionTimeoutMS: 15000 });

  const report = {
    mode: 'read-only',
    connectedTo: uri.replace(/\/\/[^@]*@/, '//***@'),
    ranAt: new Date().toISOString(),
    issue1_finance: { scannedOrders: 0, staleStoredAmounts: 0, paidExceedsDue: 0, negativeOrMismatchedOutstanding: 0, samples: [] },
    issue2_latinNames: { scannedStudents: 0, firstNameNotLatin: 0, lastNameNotLatin: 0, fatherNameEnglishNotLatin: 0, samples: [] },
    issue3_phones: {
      fatherPhoneEqualsTazkira: 0,
      fatherPhoneEqualsAsasOrRegId: 0,
      fatherPhoneNotPhoneShaped: 0,
      guardianPhoneNotPhoneShaped: 0,
      contactPhoneNotPhoneShaped: 0,
      samples: []
    },
    issue3b_sharedFatherPhone: { groups: 0, studentsInvolved: 0, samples: [] }
  };

  // ---------- Issue 1: FeeOrder stored amounts ----------
  const orderCursor = FeeOrder.find({ status: { $ne: 'void' } })
    .select('orderNumber student studentId amountOriginal amountDue amountPaid outstandingAmount lineItems adjustments paymentBreakdown orderType status')
    .lean()
    .cursor();

  for await (const order of orderCursor) {
    report.issue1_finance.scannedOrders += 1;
    const storedOriginal = roundMoney(order.amountOriginal);
    const storedDue = roundMoney(order.amountDue);
    const storedPaid = roundMoney(order.amountPaid);
    const storedOutstanding = roundMoney(order.outstandingAmount);

    const lines = normalizeFinanceLineItems({
      lineItems: order.lineItems,
      amountOriginal: order.amountOriginal,
      adjustments: order.adjustments,
      amountPaid: order.amountPaid,
      paymentBreakdown: order.paymentBreakdown,
      defaultType: order.orderType
    });
    const derivedOriginal = roundMoney(lines.reduce((s, e) => s + Number(e?.grossAmount || 0), 0));
    const derivedDue = roundMoney(lines.reduce((s, e) => s + Number(e?.netAmount || 0), 0));
    const expectedOutstanding = Math.max(0, roundMoney(derivedDue - storedPaid));

    const stale = derivedOriginal !== storedOriginal || derivedDue !== storedDue;
    const paidExceedsDue = storedPaid > derivedDue + 0.005;
    const outstandingWrong = Math.abs(storedOutstanding - expectedOutstanding) > 0.005;

    if (stale) report.issue1_finance.staleStoredAmounts += 1;
    if (paidExceedsDue) report.issue1_finance.paidExceedsDue += 1;
    if (outstandingWrong) report.issue1_finance.negativeOrMismatchedOutstanding += 1;

    if ((stale || paidExceedsDue || outstandingWrong) && report.issue1_finance.samples.length < LIMIT) {
      report.issue1_finance.samples.push({
        orderNumber: order.orderNumber,
        stored: { amountOriginal: storedOriginal, amountDue: storedDue, amountPaid: storedPaid, outstandingAmount: storedOutstanding },
        derived: { amountOriginal: derivedOriginal, amountDue: derivedDue, expectedOutstanding },
        flags: { stale, paidExceedsDue, outstandingWrong }
      });
    }
  }

  // ---------- Issue 2 & 3: AfghanStudent ----------
  const studentCursor = AfghanStudent.find({ status: { $ne: 'deleted' } })
    .select('asasNumber registrationId personalInfo.firstName personalInfo.lastName personalInfo.firstNameDari personalInfo.lastNameDari personalInfo.fatherNameEnglish identification.tazkiraNumber familyInfo.fatherPhone familyInfo.guardianPhone contactInfo.phone contactInfo.mobile')
    .lean()
    .cursor();

  const fatherPhoneGroups = new Map();

  for await (const s of studentCursor) {
    report.issue2_latinNames.scannedStudents += 1;
    const pi = s.personalInfo || {};
    const idf = s.identification || {};
    const fam = s.familyInfo || {};
    const con = s.contactInfo || {};

    // Issue 2 — latin name fields holding Arabic-script text
    const firstBad = text(pi.firstName) && ARABIC_SCRIPT.test(pi.firstName) && !LATIN.test(pi.firstName);
    const lastBad = text(pi.lastName) && ARABIC_SCRIPT.test(pi.lastName) && !LATIN.test(pi.lastName);
    const fatherEnBad = text(pi.fatherNameEnglish) && ARABIC_SCRIPT.test(pi.fatherNameEnglish) && !LATIN.test(pi.fatherNameEnglish);
    if (firstBad) report.issue2_latinNames.firstNameNotLatin += 1;
    if (lastBad) report.issue2_latinNames.lastNameNotLatin += 1;
    if (fatherEnBad) report.issue2_latinNames.fatherNameEnglishNotLatin += 1;
    if ((firstBad || lastBad || fatherEnBad) && report.issue2_latinNames.samples.length < LIMIT) {
      report.issue2_latinNames.samples.push({
        asas: asasOf(s),
        firstName: text(pi.firstName),
        lastName: text(pi.lastName),
        fatherNameEnglish: text(pi.fatherNameEnglish),
        dari: `${text(pi.firstNameDari)} ${text(pi.lastNameDari)}`.trim()
      });
    }

    // Issue 3 — phone fields
    const tazkiraDigits = digitsOnly(idf.tazkiraNumber);
    const asasRegDigits = new Set([digitsOnly(s.asasNumber), digitsOnly(s.registrationId)].filter(Boolean));
    const fatherPhone = text(fam.fatherPhone);
    const fatherPhoneDigits = digitsOnly(fatherPhone);
    const flags = {};
    if (fatherPhone && fatherPhoneDigits && fatherPhoneDigits === tazkiraDigits) { report.issue3_phones.fatherPhoneEqualsTazkira += 1; flags.equalsTazkira = true; }
    if (fatherPhone && fatherPhoneDigits && asasRegDigits.has(fatherPhoneDigits)) { report.issue3_phones.fatherPhoneEqualsAsasOrRegId += 1; flags.equalsAsasOrRegId = true; }
    if (fatherPhone && !isPhoneShaped(fatherPhone)) { report.issue3_phones.fatherPhoneNotPhoneShaped += 1; flags.fatherNotPhoneShaped = true; }
    if (text(fam.guardianPhone) && !isPhoneShaped(fam.guardianPhone)) { report.issue3_phones.guardianPhoneNotPhoneShaped += 1; flags.guardianNotPhoneShaped = true; }
    if ((text(con.phone) && !isPhoneShaped(con.phone)) || (text(con.mobile) && !isPhoneShaped(con.mobile))) { report.issue3_phones.contactPhoneNotPhoneShaped += 1; flags.contactNotPhoneShaped = true; }
    if (Object.keys(flags).length && report.issue3_phones.samples.length < LIMIT) {
      report.issue3_phones.samples.push({
        asas: asasOf(s),
        tazkiraNumber: text(idf.tazkiraNumber),
        fatherPhone,
        guardianPhone: text(fam.guardianPhone),
        contactPhone: text(con.phone) || text(con.mobile),
        flags
      });
    }

    // Issue 3b — students sharing a father phone (possible wrong merge OR just siblings)
    if (fatherPhone && fatherPhoneDigits && fatherPhoneDigits !== '0000000000' && isPhoneShaped(fatherPhone)) {
      const key = fatherPhoneDigits;
      if (!fatherPhoneGroups.has(key)) fatherPhoneGroups.set(key, []);
      fatherPhoneGroups.get(key).push(asasOf(s));
    }
  }

  for (const [phone, list] of fatherPhoneGroups.entries()) {
    if (list.length > 1) {
      report.issue3b_sharedFatherPhone.groups += 1;
      report.issue3b_sharedFatherPhone.studentsInvolved += list.length;
      if (report.issue3b_sharedFatherPhone.samples.length < LIMIT) {
        report.issue3b_sharedFatherPhone.samples.push({ fatherPhone: phone, students: list });
      }
    }
  }

  await mongoose.disconnect();

  if (JSON_OUT) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return;
  }

  const L = (k, v) => console.log(`  ${k.padEnd(42)} ${v}`);
  console.log('\n=== تشخیصِ یکپارچگیِ دادهٔ پروندهٔ شاگرد (فقط‌خواندنی) ===');
  console.log(`دیتابیس: ${report.connectedTo}`);
  console.log(`زمان: ${report.ranAt}\n`);

  console.log('— مشکل ۱: مبالغِ ذخیره‌شدهٔ بل‌ها —');
  L('تعداد بل‌های بررسی‌شده', report.issue1_finance.scannedOrders);
  L('بل با مبلغِ ذخیره‌شدهٔ ناهمگام با خطوط', report.issue1_finance.staleStoredAmounts);
  L('بل با پرداختِ بیش از مبلغِ قابل پرداخت', report.issue1_finance.paidExceedsDue);
  L('بل با outstandingAmountِ غلط', report.issue1_finance.negativeOrMismatchedOutstanding);

  console.log('\n— مشکل ۲: نامِ انگلیسی که فارسی ذخیره شده —');
  L('تعداد شاگردانِ بررسی‌شده', report.issue2_latinNames.scannedStudents);
  L('personalInfo.firstName غیرلاتین', report.issue2_latinNames.firstNameNotLatin);
  L('personalInfo.lastName غیرلاتین', report.issue2_latinNames.lastNameNotLatin);
  L('personalInfo.fatherNameEnglish غیرلاتین', report.issue2_latinNames.fatherNameEnglishNotLatin);

  console.log('\n— مشکل ۳: خانه‌های تلفن —');
  L('«موبایل پدر» = شماره تذکره', report.issue3_phones.fatherPhoneEqualsTazkira);
  L('«موبایل پدر» = نمبر اساس/ثبت', report.issue3_phones.fatherPhoneEqualsAsasOrRegId);
  L('«موبایل پدر» غیرِ شکلِ تلفن', report.issue3_phones.fatherPhoneNotPhoneShaped);
  L('«تلفن سرپرست» غیرِ شکلِ تلفن', report.issue3_phones.guardianPhoneNotPhoneShaped);
  L('«تماس متعلم» غیرِ شکلِ تلفن', report.issue3_phones.contactPhoneNotPhoneShaped);

  console.log('\n— مشکل ۳ب: شاگردانِ هم‌شمارهٔ پدر (احتمالِ ادغامِ اشتباه یا صرفاً خواهر/برادر) —');
  L('تعداد گروه‌های هم‌شماره', report.issue3b_sharedFatherPhone.groups);
  L('مجموع شاگردانِ درگیر', report.issue3b_sharedFatherPhone.studentsInvolved);

  const dump = (title, arr) => {
    if (!arr.length) return;
    console.log(`\n  نمونه‌های «${title}»:`);
    arr.forEach((row) => console.log(`   ${JSON.stringify(row)}`));
  };
  dump('مشکل ۱', report.issue1_finance.samples);
  dump('مشکل ۲', report.issue2_latinNames.samples);
  dump('مشکل ۳', report.issue3_phones.samples);
  dump('مشکل ۳ب', report.issue3b_sharedFatherPhone.samples);
  console.log('\nهیچ تغییری در دیتابیس داده نشد.\n');
}

run().catch((error) => {
  console.error('diagnose failed:', error?.message || error);
  process.exitCode = 1;
  return mongoose.disconnect().catch(() => {});
});
