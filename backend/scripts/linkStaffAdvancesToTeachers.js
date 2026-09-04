/**
 * اتصالِ ردیف‌های قدیمیِ «پیشکی و برداشتِ کارمندان» به پروندهٔ رسمیِ کارمند.
 *
 * پس‌زمینه: پیش از «دفترِ کارکنانِ مکتب»، بخشِ مالی گیرندهٔ پیشکی را به‌صورتِ
 * نامِ متنی (staffSnapshot.name) ثبت می‌کرد و staffId خالی می‌ماند. حالا که
 * کارمندان در AfghanTeacher ثبت می‌شوند، این اسکریپت برای هر StaffAdvance با
 * staffId=null تلاش می‌کند دقیقاً یک AfghanTeacher در همان مکتب پیدا کند که
 * نامِ دری یا لاتینش (بدونِ حساسیت به بزرگی/کوچکیِ حروف و فاصله‌های اضافی) با
 * staffSnapshot.name برابر باشد، و در صورتِ تطابقِ یکتا staffId و staffSnapshot
 * را به‌روز می‌کند.
 *
 * پیش‌فرض DRY-RUN است. برای نوشتن: --apply
 *
 *   node backend/scripts/linkStaffAdvancesToTeachers.js                 # گزارش، بدون تغییر
 *   node backend/scripts/linkStaffAdvancesToTeachers.js --apply         # اعمالِ اتصال
 *   node backend/scripts/linkStaffAdvancesToTeachers.js --school=<id>   # فقط یک مکتب
 *   node backend/scripts/linkStaffAdvancesToTeachers.js --uri="..." --dns=8.8.8.8   # اتصال به Atlas
 */
require('dotenv').config();
const dns = require('dns');
const mongoose = require('mongoose');

mongoose.set('autoIndex', false);
mongoose.set('autoCreate', false);

const StaffAdvance = require('../models/StaffAdvance');
const AfghanTeacher = require('../models/AfghanTeacher');

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

const normName = (value) => String(value || '')
  .trim()
  .replace(/\s+/g, ' ')
  .toLowerCase();

const teacherNames = (teacher) => {
  const p = teacher.personalInfo || {};
  return [
    `${p.firstNameDari || ''} ${p.lastNameDari || ''}`,
    `${p.firstName || ''} ${p.lastName || ''}`,
    `${p.firstNamePashto || ''} ${p.lastNamePashto || ''}`
  ].map(normName).filter(Boolean);
};

async function run() {
  const APPLY = hasFlag('apply');
  const schoolFilter = readArg('school');
  const uri = readArg('uri') || process.env.PROD_MONGO_URI || process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/school?replicaSet=rs0';
  const dnsServers = readArg('dns');
  if (dnsServers) {
    dns.setServers(dnsServers.split(',').map((s) => s.trim()).filter(Boolean));
    console.log(`DNS: ${dns.getServers().join(', ')}`);
  }

  await mongoose.connect(uri, { autoIndex: false, autoCreate: false, serverSelectionTimeoutMS: 20000 });
  console.log(`connected: ${uri.replace(/\/\/[^@]*@/, '//***@')}  |  mode: ${APPLY ? 'APPLY' : 'DRY-RUN'}\n`);

  const advanceQuery = { staffId: null };
  if (schoolFilter) advanceQuery.schoolId = schoolFilter;
  const advances = await StaffAdvance.find(advanceQuery).lean();
  console.log(`ردیف‌های بدونِ staffId: ${advances.length}`);

  // Cache teachers per school so we hit the DB once per distinct school.
  const teacherCache = new Map();
  const loadTeachers = async (schoolId) => {
    const key = String(schoolId);
    if (!teacherCache.has(key)) {
      const list = await AfghanTeacher.find({ 'employmentInfo.currentSchool': schoolId })
        .select('personalInfo employmentInfo.employeeId employmentInfo.position')
        .lean();
      teacherCache.set(key, list);
    }
    return teacherCache.get(key);
  };

  const report = { scanned: 0, linked: 0, noName: 0, noMatch: 0, ambiguous: 0, rows: [] };

  for (const advance of advances) {
    report.scanned += 1;
    const wanted = normName(advance.staffSnapshot?.name);
    if (!wanted) {
      report.noName += 1;
      continue;
    }
    const teachers = await loadTeachers(advance.schoolId);
    const matches = teachers.filter((teacher) => teacherNames(teacher).includes(wanted));

    if (matches.length === 0) {
      report.noMatch += 1;
      report.rows.push({ advance: String(advance._id), name: advance.staffSnapshot?.name, result: 'no-match' });
      continue;
    }
    if (matches.length > 1) {
      report.ambiguous += 1;
      report.rows.push({
        advance: String(advance._id),
        name: advance.staffSnapshot?.name,
        result: `ambiguous (${matches.map((m) => String(m._id)).join(', ')})`
      });
      continue;
    }

    const teacher = matches[0];
    const p = teacher.personalInfo || {};
    const canonicalName = `${p.firstNameDari || p.firstName || ''} ${p.lastNameDari || p.lastName || ''}`.trim();
    report.linked += 1;
    report.rows.push({ advance: String(advance._id), name: advance.staffSnapshot?.name, result: `→ ${String(teacher._id)} (${canonicalName})` });

    if (APPLY) {
      await StaffAdvance.updateOne(
        { _id: advance._id },
        {
          $set: {
            staffId: teacher._id,
            'staffSnapshot.name': canonicalName,
            'staffSnapshot.employeeId': String(teacher.employmentInfo?.employeeId || advance.staffSnapshot?.employeeId || ''),
            'staffSnapshot.position': String(teacher.employmentInfo?.position || advance.staffSnapshot?.position || '')
          }
        }
      );
    }
  }

  console.log('\n=== نتیجه ===');
  report.rows.forEach((row) => console.log(`  ${row.advance}  «${row.name}»  ${row.result}`));
  console.log(
    `\nبررسی‌شده: ${report.scanned} | متصل${APPLY ? '' : ' (قابلِ اتصال)'}: ${report.linked} | ` +
    `بدونِ نام: ${report.noName} | بدونِ تطابق: ${report.noMatch} | چندتطابقی: ${report.ambiguous}`
  );
  if (!APPLY && report.linked > 0) {
    console.log('\nبرای اعمال: دوباره با --apply اجرا کنید.');
  }

  await mongoose.disconnect();
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
