/**
 * ادغامِ حساب‌های تکراریِ استاد/کارمند.
 *
 * مشکل: پیوندِ خودکارِ پرونده به حساب فقط با ایمیل کار می‌کرد. اگر ایمیلِ پروندهٔ
 *   کارمند با ایمیلِ حسابِ خودش یکی نبود (یا پرونده ایمیل نداشت)، سیستم یک حسابِ
 *   دومِ خالی با ایمیلِ ساختگی `teacher.<id>@<school>.local` می‌ساخت و پرونده را به
 *   آن وصل می‌کرد. حسابِ اصلیِ استاد — که تخصیصِ صنف، تقسیم اوقات و گفتگویش روی آن
 *   است — «بدونِ پروندهٔ رسمی» می‌ماند و در کارهای فوریِ داشبورد هشدار می‌داد.
 *
 * چه می‌کند: هر پروندهٔ فعالی که به یک حسابِ ساختگی وصل است را برمی‌دارد، حسابِ
 *   اصلیِ همان شخص را با نام پیدا می‌کند (باید دقیقاً یک حسابِ وصل‌نشده باشد) و:
 *     ۱. پرونده را به حسابِ اصلی وصل می‌کند،
 *     ۲. اگر پرونده ایمیلِ معتبر نداشت، ایمیلِ حسابِ اصلی را روی پرونده می‌نویسد تا
 *        پیوند در آینده پایدار بماند،
 *     ۳. حسابِ ساختگی را «غیرفعال» می‌کند (حذف نمی‌شود، تا ردِ تاریخی نشکند).
 *
 * هرگز حسابی را که داده دارد ادغام نمی‌کند: اگر روی حسابِ ساختگی تخصیصِ استاد،
 *   تقسیم اوقات، مضمون، حاضری، گفتگو، پیام یا اعلان باشد، آن مورد فقط گزارش
 *   می‌شود. موردِ مبهم (دو حساب با یک نام) هم دست نمی‌خورد.
 *
 * پیش‌فرض DRY-RUN است. برای نوشتن: --apply (پیش از نوشتن بکاپ می‌گیرد).
 * فقط با --uri صریح به دیتابیسی غیر از .env وصل می‌شود.
 *
 * اگر نامِ حساب با نامِ پرونده یکی نباشد (مثلاً حسابِ «گیتی» و پروندهٔ «گیتی هستوریا»)
 * اسکریپت حدس نمی‌زند؛ خودتان زوج را با --link مشخص می‌کنید:
 *   --link=<شمارهٔ کارمندی>=<ایمیلِ حسابِ آن شخص>   (قابلِ تکرار)
 *
 *   node backend/scripts/mergeStaffDuplicateAccounts.js
 *   node backend/scripts/mergeStaffDuplicateAccounts.js --apply
 *   node backend/scripts/mergeStaffDuplicateAccounts.js --uri="..." --dns=8.8.8.8
 *   node backend/scripts/mergeStaffDuplicateAccounts.js --link=AF-IGS-KBL-0003=geeti@gmail.com --apply
 */
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const dns = require('dns');
const mongoose = require('mongoose');

mongoose.set('autoIndex', false);
mongoose.set('autoCreate', false);

const User = require('../models/User');
const AfghanTeacher = require('../models/AfghanTeacher');
const {
  TEACHER_USER_REFERENCES,
  isLinkableStaffAccount,
  isSyntheticTeacherEmail,
  normalizeEmail,
  normalizeName,
  pickAccountForTeacherFile,
  teacherFileNameKeys
} = require('../services/staffDirectoryLinkService');

const EMAIL_RX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const argv = process.argv.slice(2);
const readArg = (name, fallback = '') => {
  for (let i = 0; i < argv.length; i += 1) {
    const t = String(argv[i] || '');
    if (t === `--${name}`) return String(argv[i + 1] ?? '').trim();
    if (t.startsWith(`--${name}=`)) return t.slice(name.length + 3).trim();
  }
  return fallback;
};
const hasFlag = (name) => argv.includes(`--${name}`);
const text = (value) => String(value ?? '').trim();

// --link=<employeeId>=<account email> — for people whose account name is not the
// full name on the file («گیتی» vs «گیتی هستوریا»), where guessing would be wrong.
const readPairs = () => {
  const pairs = new Map();
  argv.forEach((raw, index) => {
    const token = String(raw || '');
    const value = token.startsWith('--link=') ? token.slice('--link='.length) : (token === '--link' ? String(argv[index + 1] ?? '') : '');
    if (!value) return;
    const separator = value.lastIndexOf('=');
    const employeeId = text(separator > 0 ? value.slice(0, separator) : '');
    const email = normalizeEmail(separator > 0 ? value.slice(separator + 1) : '');
    if (employeeId && email) pairs.set(employeeId, email);
  });
  return pairs;
};

async function run() {
  const APPLY = hasFlag('apply');
  const explicitPairs = readPairs();
  const uri = readArg('uri') || process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/school_db';
  const dnsServers = readArg('dns');
  if (dnsServers) {
    dns.setServers(dnsServers.split(',').map((s) => s.trim()).filter(Boolean));
    console.log(`DNS: ${dns.getServers().join(', ')}`);
  }

  await mongoose.connect(uri, { autoIndex: false, autoCreate: false, serverSelectionTimeoutMS: 20000 });
  console.log(`connected: ${uri.replace(/\/\/[^@]*@/, '//***@')}  |  mode: ${APPLY ? 'APPLY' : 'DRY-RUN'}\n`);

  const db = mongoose.connection.db;
  const collectionNames = new Set((await db.listCollections().toArray()).map((item) => item.name));
  const referenceUsage = async (userId) => {
    const usage = {};
    for (const [collection, field, label] of TEACHER_USER_REFERENCES) {
      if (!collectionNames.has(collection)) continue;
      // eslint-disable-next-line no-await-in-loop
      const count = await db.collection(collection).countDocuments({ [field]: new mongoose.Types.ObjectId(userId) });
      if (count) usage[label] = count;
    }
    return usage;
  };

  const [files, accounts] = await Promise.all([
    AfghanTeacher.find({ status: 'active', linkedUserId: { $ne: null } })
      // `employmentInfo.position` decides which account a same-name pair belongs to.
      .select('_id personalInfo contactInfo.email employmentInfo.employeeId employmentInfo.position status linkedUserId')
      .lean(),
    // Managerial posts (مدیر مکتب, معاون, سرمعلم, مالی) hold `role: 'admin'`
    // accounts; their files were given synthetic teacher accounts too.
    User.find({ role: { $in: ['instructor', 'admin'] } }).select('_id name email status role orgRole').lean()
  ]);
  const accountById = new Map(accounts.map((account) => [String(account._id), account]));
  const claimedUserIds = new Set(
    (await AfghanTeacher.distinct('linkedUserId', { linkedUserId: { $ne: null } })).map((id) => String(id))
  );

  const report = { mode: APPLY ? 'APPLY' : 'DRY-RUN', filesScanned: files.length, merge: 0, merged: 0, skipped: 0 };
  const rows = [];
  const plans = [];

  for (const file of files) {
    const linkedId = text(file.linkedUserId);
    const linked = accountById.get(linkedId);
    if (!linked || !isSyntheticTeacherEmail(linked.email)) continue;

    const keys = teacherFileNameKeys(file);
    const employeeId = text(file.employmentInfo?.employeeId);
    const freeAccounts = accounts.filter((account) => (
      isLinkableStaffAccount(account)
      && !claimedUserIds.has(String(account._id))
    ));
    const pairedEmail = explicitPairs.get(employeeId) || '';
    // Same rule the app uses when it links a file (email → name → «سمت» when two
    // accounts share the name), so a repair can never disagree with the app.
    const picked = pairedEmail ? null : pickAccountForTeacherFile({ file, accounts: freeAccounts, linkedUserIds: claimedUserIds });
    const candidates = pairedEmail
      ? freeAccounts.filter((account) => normalizeEmail(account.email) === pairedEmail)
      : freeAccounts.filter((account) => String(account._id) === picked.userId);
    const row = {
      file: keys[0] || '—',
      employeeId: employeeId || '—',
      duplicateAccount: `${text(linked.name)} <${text(linked.email)}>`,
      realAccount: candidates.length === 1
        ? `${text(candidates[0].name)} <${text(candidates[0].email)}> [${text(candidates[0].orgRole) || text(candidates[0].role)}]`
        : '—',
      action: pairedEmail ? 'merge (زوجِ دستی)' : `merge (${picked.via})`
    };

    if (candidates.length !== 1) {
      report.skipped += 1;
      // Accounts that share the first word of the name — the likely owner, to be
      // confirmed by a human with --link rather than matched automatically.
      const firstWord = (keys[0] || '').split(' ')[0];
      const hintAccounts = !pairedEmail && firstWord
        ? freeAccounts.filter((account) => normalizeName(account.name).split(' ').includes(firstWord))
        : [];
      const hints = [];
      for (const account of hintAccounts) {
        // The account that carries the person's work is the one her file belongs to.
        // eslint-disable-next-line no-await-in-loop
        const usage = await referenceUsage(String(account._id));
        const usageText = Object.entries(usage).map(([label, count]) => `${label}:${count}`).join('، ') || 'بدونِ داده';
        hints.push(`${text(account.name)} <${text(account.email)}> [${text(account.orgRole) || text(account.role)}] (${usageText})`);
      }
      rows.push({
        ...row,
        action: pairedEmail
          ? 'skip: حسابِ زوجِ دستی پیدا نشد یا آزاد نیست'
          : (picked.via === 'ambiguous_name' ? 'skip: چند حسابِ هم‌نام' : 'skip: حسابِ اصلی پیدا نشد'),
        ...(hints.length ? { hint: `حساب‌های ممکن: ${hints.join(' | ')}` } : {})
      });
      continue;
    }
    // eslint-disable-next-line no-await-in-loop
    const duplicateUsage = await referenceUsage(linkedId);
    if (Object.keys(duplicateUsage).length) {
      report.skipped += 1;
      rows.push({ ...row, action: 'skip: حسابِ تکراری داده دارد', duplicateUsage });
      continue;
    }

    report.merge += 1;
    const real = candidates[0];
    const fileEmail = normalizeEmail(file.contactInfo?.email);
    rows.push({ ...row, backfillFileEmail: EMAIL_RX.test(fileEmail) ? '' : text(real.email) });
    plans.push({ file, duplicate: linked, real, backfillEmail: EMAIL_RX.test(fileEmail) ? '' : text(real.email) });
    claimedUserIds.add(String(real._id));
  }

  if (APPLY && plans.length) {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupDir = path.join(__dirname, '..', 'backups', `${stamp}-pre-staff-account-merge`);
    fs.mkdirSync(backupDir, { recursive: true });
    const [fileDocs, accountDocs] = await Promise.all([
      AfghanTeacher.find({ _id: { $in: plans.map((plan) => plan.file._id) } }).lean(),
      User.find({ _id: { $in: plans.flatMap((plan) => [plan.duplicate._id, plan.real._id]) } }).lean()
    ]);
    fs.writeFileSync(path.join(backupDir, 'afghanteachers.jsonl'), `${fileDocs.map((d) => JSON.stringify(d)).join('\n')}\n`, 'utf8');
    fs.writeFileSync(path.join(backupDir, 'users.jsonl'), `${accountDocs.map((d) => JSON.stringify(d)).join('\n')}\n`, 'utf8');
    console.log(`backup: ${backupDir} (${fileDocs.length} پرونده، ${accountDocs.length} حساب)\n`);

    for (const plan of plans) {
      const update = { linkedUserId: plan.real._id, updatedAt: new Date() };
      if (plan.backfillEmail) update['contactInfo.email'] = plan.backfillEmail;
      // eslint-disable-next-line no-await-in-loop
      await AfghanTeacher.updateOne({ _id: plan.file._id, linkedUserId: plan.duplicate._id }, { $set: update });
      // eslint-disable-next-line no-await-in-loop
      await User.updateOne({ _id: plan.duplicate._id }, { $set: { status: 'inactive' } });
      report.merged += 1;
    }
  }

  rows.forEach((row) => console.log(JSON.stringify(row)));
  if (rows.length) console.log('');
  console.log(JSON.stringify(report, null, 2));
  if (!APPLY && report.merge) console.log('\nبرای اعمالِ تغییرات: --apply');
}

run()
  .catch((error) => {
    console.error(`mergeStaffDuplicateAccounts failed: ${error?.message || error}`);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
