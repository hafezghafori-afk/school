const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const User = require('../models/User');
const AfghanSchool = require('../models/AfghanSchool');
const AuthOtpChallenge = require('../models/AuthOtpChallenge');
const PasswordResetToken = require('../models/PasswordResetToken');
const { requireFields } = require('../middleware/validate');
const { ok, fail } = require('../utils/response');
const { resolvePermissions, normalizeAdminLevel } = require('../utils/permissions');
const { getJwtSecret, getPublicAppUrl } = require('../utils/env');
const { sendMail } = require('../utils/mailer');
const { serializeUserIdentity } = require('../utils/userRole');
const { logActivity } = require('../utils/activity');
const { attachWriteActivityAudit } = require('../utils/routeWriteAudit');

const router = express.Router();
const auditWrite = (payload) => logActivity(payload);
attachWriteActivityAudit(router, { targetType: 'AuthFlow', actionPrefix: 'auth', audit: auditWrite });
const JWT_SECRET = getJwtSecret();

const ADMIN_2FA_ENABLED = String(process.env.ADMIN_2FA_ENABLED || 'true').toLowerCase() !== 'false';
const TWO_FACTOR_CODE_TTL_SEC = Math.max(60, Number(process.env.ADMIN_2FA_CODE_TTL_SEC || 300));
const TWO_FACTOR_CHALLENGE_TTL_SEC = Math.max(TWO_FACTOR_CODE_TTL_SEC + 60, Number(process.env.ADMIN_2FA_CHALLENGE_TTL_SEC || 900));
const TWO_FACTOR_RESEND_COOLDOWN_SEC = Math.max(15, Number(process.env.ADMIN_2FA_RESEND_COOLDOWN_SEC || 45));
const TWO_FACTOR_MAX_ATTEMPTS = Math.max(3, Number(process.env.ADMIN_2FA_MAX_ATTEMPTS || 5));
const TWO_FACTOR_LEVEL_FILTER = String(process.env.ADMIN_2FA_LEVELS || 'finance_manager,finance_lead,general_president')
  .split(',')
  .map((item) => normalizeAdminLevel(item, 'finance_manager'))
  .filter(Boolean);

const isDemoEnabled = () => String(process.env.DEMO_ENABLED || '').toLowerCase() === 'true';
const DEMO_PASSWORD = 'Demo@12345';
const DEMO_SCHOOL_CODE = 'DEMO-SCHOOL';
const DEMO_USERS = {
  admin: { name: 'Demo Admin', email: 'demo.admin@school.local', role: 'admin', orgRole: 'general_president', adminLevel: 'general_president', permissions: ['manage_users', 'manage_enrollments', 'manage_memberships', 'students.transfers.manage', 'students.lifecycle.manage', 'students.lifecycle.approve', 'education.promotions.manage', 'manage_finance', 'finance.lifecycle_effects.manage', 'manage_content', 'view_reports', 'view_schedule', 'manage_schedule'] },
  finance: { name: 'Demo Finance', email: 'demo.finance@school.local', role: 'admin', orgRole: 'finance_manager', adminLevel: 'finance_manager', permissions: ['manage_finance', 'view_reports'] },
  instructor: { name: 'Demo Teacher', email: 'demo.teacher@school.local', role: 'instructor', orgRole: 'teacher', adminLevel: '', permissions: ['view_schedule'] },
  student: { name: 'Demo Student', email: 'demo.student@school.local', role: 'student', orgRole: 'student', adminLevel: '', permissions: [] }
};

const hashValue = (value = '') => crypto.createHash('sha256').update(String(value)).digest('hex');
const generateCode = () => String(crypto.randomInt(100000, 1000000));
const generateChallengeToken = () => crypto.randomBytes(32).toString('hex');
const isProduction = () => String(process.env.NODE_ENV || '').toLowerCase() === 'production';

const maskEmail = (email = '') => {
  const value = String(email || '').trim();
  const at = value.indexOf('@');
  if (at <= 0) return '***';
  const local = value.slice(0, at);
  const domain = value.slice(at + 1);
  const maskedLocal = local.length <= 2 ? `${local.slice(0, 1)}***` : `${local.slice(0, 2)}***`;
  return `${maskedLocal}@${domain}`;
};

const shouldRequireTwoFactor = (user) => {
  const identity = serializeUserIdentity(user);
  if (user?.isDemo === true) return false;
  if (!ADMIN_2FA_ENABLED) return false;
  if (identity.role !== 'admin') return false;
  if (!TWO_FACTOR_LEVEL_FILTER.length) return true;
  const level = normalizeAdminLevel(identity.adminLevel || '');
  return TWO_FACTOR_LEVEL_FILTER.includes(level);
};

const issueAuthPayload = (user) => {
  const identity = serializeUserIdentity(user);
  const schoolId = user.schoolId ? String(user.schoolId) : '';
  const isDemo = user.isDemo === true;
  const token = jwt.sign({ id: user._id.toString(), role: identity.role, orgRole: identity.orgRole, adminLevel: identity.adminLevel, status: identity.status, name: user.name, schoolId, isDemo }, JWT_SECRET, { expiresIn: '7d' });
  const adminLevel = identity.role === 'admin' ? normalizeAdminLevel(identity.adminLevel || '') : '';
  const effectivePermissions = resolvePermissions({ role: identity.role, orgRole: identity.orgRole, permissions: user.permissions || [], adminLevel });
  return { userId: user._id, name: user.name, role: identity.role, orgRole: identity.orgRole, status: identity.status, adminLevel, token, schoolId, isDemo, avatarUrl: user.avatarUrl || '', lastLoginAt: user.lastLoginAt, effectivePermissions };
};

async function ensureDemoSchool() {
  return AfghanSchool.findOneAndUpdate(
    { schoolCode: DEMO_SCHOOL_CODE },
    {
      $set: {
        name: 'Demo School',
        nameDari: 'مکتب آزمایشی دیمو',
        namePashto: 'د ازموینې ښوونځی',
        ministryCode: DEMO_SCHOOL_CODE,
        provinceCode: 'KBL',
        province: 'kabul',
        district: 'demo',
        schoolType: 'private',
        schoolLevel: 'grade1_12',
        ownership: 'private',
        contactInfo: { address: 'محیط آزمایشی سیستم' },
        principal: { name: 'Demo Manager' },
        academicInfo: { academicYear: '1405' },
        establishmentDate: new Date('2025-03-21T00:00:00.000Z'),
        status: 'active',
        verificationStatus: 'verified'
      }
    },
    { upsert: true, new: true, setDefaultsOnInsert: true, runValidators: true }
  );
}

function isDemoUser(user = null) {
  const email = String(user?.email || '').trim().toLowerCase();
  return Object.values(DEMO_USERS).some((profile) => profile.email === email);
}

async function ensureDemoIdentity(user = null) {
  if (!user || !isDemoUser(user)) return user;
  const demoSchool = await ensureDemoSchool();
  user.schoolId = demoSchool._id;
  user.isDemo = true;
  await user.save();
  return user;
}

const cleanupChallenges = async () => {
  const now = new Date();
  await AuthOtpChallenge.deleteMany({ $or: [{ consumedAt: { $ne: null }, updatedAt: { $lt: new Date(now.getTime() - (24 * 60 * 60 * 1000)) } }, { challengeExpiresAt: { $lt: now } }] });
};

const createOrRefreshLoginChallenge = async (req, user, challenge = null) => {
  const now = Date.now();
  const code = generateCode();
  const codeHash = await bcrypt.hash(code, 10);
  const codeExpiresAt = new Date(now + (TWO_FACTOR_CODE_TTL_SEC * 1000));
  const challengeExpiresAt = new Date(now + (TWO_FACTOR_CHALLENGE_TTL_SEC * 1000));
  let challengeToken = '';
  let record = challenge;
  if (record) {
    record.codeHash = codeHash; record.codeExpiresAt = codeExpiresAt; record.challengeExpiresAt = challengeExpiresAt; record.lastSentAt = new Date(now); record.attempts = 0; await record.save(); challengeToken = record._plainToken || '';
  } else {
    challengeToken = generateChallengeToken();
    record = await AuthOtpChallenge.create({ user: user._id, purpose: 'login_2fa', tokenHash: hashValue(challengeToken), codeHash, attempts: 0, maxAttempts: TWO_FACTOR_MAX_ATTEMPTS, codeExpiresAt, challengeExpiresAt, lastSentAt: new Date(now) });
  }
  const mailResult = await sendMail({ to: user.email, subject: 'کد ورود دو مرحله‌ای', text: `کد ورود شما: ${code}`, html: `<p>کد ورود شما: <strong>${code}</strong></p>` });
  if (!mailResult?.ok && isProduction()) { await AuthOtpChallenge.deleteOne({ _id: record._id }); return { ok: false, message: 'ارسال کد دو مرحله‌ای ناموفق بود. تنظیم SMTP را بررسی کنید.' }; }
  if (!challengeToken) { challengeToken = generateChallengeToken(); record.tokenHash = hashValue(challengeToken); await record.save(); }
  return { ok: true, challengeToken, codeExpiresAt, challengeExpiresAt, emailMasked: maskEmail(user.email) };
};

router.post('/demo-seed', async (req, res) => {
  try {
    if (!isDemoEnabled()) return fail(res, 'نسخه دیمو فعال نیست', 403);
    const secret = String(req.headers['x-demo-seed-secret'] || req.body?.secret || '').trim();
    if (!process.env.DEMO_SEED_SECRET || secret !== process.env.DEMO_SEED_SECRET) return fail(res, 'اجازه ساخت دیمو ندارید', 403);
    const hashedPassword = await bcrypt.hash(DEMO_PASSWORD, 10);
    const demoSchool = await ensureDemoSchool();
    const created = [];
    for (const profile of Object.values(DEMO_USERS)) {
      await User.findOneAndUpdate({ email: profile.email }, { $set: { ...profile, password: hashedPassword, status: 'active', schoolId: demoSchool._id, isDemo: true } }, { upsert: true, new: true, setDefaultsOnInsert: true });
      created.push({ email: profile.email, role: profile.role, orgRole: profile.orgRole, adminLevel: profile.adminLevel });
    }
    return ok(res, { users: created, password: DEMO_PASSWORD }, 'کاربران دیمو ساخته یا به‌روزرسانی شدند');
  } catch (error) {
    console.error('Demo Seed Error:', error);
    return fail(res, 'خطای ساخت کاربران دیمو', 500);
  }
});

router.post('/demo-login', async (req, res) => {
  try {
    if (!isDemoEnabled()) return fail(res, 'نسخه دیمو فعال نیست', 403);
    const roleKey = String(req.body?.role || 'admin').trim().toLowerCase();
    const profile = DEMO_USERS[roleKey];
    if (!profile) return fail(res, 'نقش دیمو معتبر نیست');
    const user = await User.findOne({ email: profile.email });
    if (!user) return fail(res, 'کاربر دیمو ساخته نشده است. اول demo-seed را اجرا کنید.', 404);
    await ensureDemoIdentity(user);
    user.lastLoginAt = new Date();
    await user.save();
    return ok(res, issueAuthPayload(user), 'ورود دیمو موفق');
  } catch (error) {
    console.error('Demo Login Error:', error);
    return fail(res, 'خطای ورود دیمو', 500);
  }
});

router.post('/register', requireFields(['name', 'email', 'password']), async (req, res) => {
  try {
    const name = (req.body.name || '').trim();
    const email = (req.body.email || '').trim().toLowerCase();
    const password = req.body.password || '';
    if (name.length < 2 || name.length > 60) return fail(res, 'نام باید بین 2 تا 60 کاراکتر باشد');
    if (!email.includes('@')) return fail(res, 'ایمیل معتبر نیست');
    if (password.length < 6) return fail(res, 'رمز عبور حداقل باید 6 کاراکتر باشد');
    const existingUser = await User.findOne({ email });
    if (existingUser) return fail(res, 'این ایمیل قبلا ثبت شده است');
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = new User({ name, email, password: hashedPassword });
    await user.save();
    return ok(res, {}, 'ثبت نام با موفقیت انجام شد');
  } catch (error) { console.error('Register Error:', error); return fail(res, 'خطای سرور', 500); }
});

router.post('/login', requireFields(['email', 'password']), async (req, res) => {
  try {
    const email = (req.body.email || '').trim().toLowerCase();
    const password = req.body.password || '';
    const user = await User.findOne({ email });
    if (!user) return fail(res, 'ایمیل یا رمز عبور اشتباه است');
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return fail(res, 'ایمیل یا رمز عبور اشتباه است');
    await ensureDemoIdentity(user);
    if (shouldRequireTwoFactor(user)) {
      await cleanupChallenges();
      await AuthOtpChallenge.deleteMany({ user: user._id, purpose: 'login_2fa', consumedAt: null });
      const challenge = await createOrRefreshLoginChallenge(req, user);
      if (!challenge.ok) return fail(res, challenge.message || 'ارسال کد دو مرحله‌ای ناموفق بود', 500);
      return ok(res, { requiresTwoFactor: true, challengeToken: challenge.challengeToken, challengeExpiresAt: challenge.challengeExpiresAt, codeExpiresAt: challenge.codeExpiresAt, emailMasked: challenge.emailMasked }, 'کد تایید دو مرحله‌ای ارسال شد');
    }
    user.lastLoginAt = new Date();
    await user.save();
    return ok(res, issueAuthPayload(user), 'ورود موفق');
  } catch (error) { console.error('Login Error:', error); return fail(res, 'خطای سرور', 500); }
});

router.post('/login/2fa/verify', requireFields(['challengeToken', 'code']), async (req, res) => fail(res, 'تایید دو مرحله‌ای در این نسخه غیرفعال نشده است؛ از مسیر login اصلی استفاده کنید', 400));
router.post('/login/2fa/resend', requireFields(['challengeToken']), async (req, res) => fail(res, 'ارسال مجدد کد در این نسخه غیرفعال نشده است؛ از مسیر login اصلی استفاده کنید', 400));

const PASSWORD_RESET_TTL_MIN = Math.max(10, Number(process.env.PASSWORD_RESET_TTL_MIN || 60));
const PASSWORD_RESET_COOLDOWN_SEC = Math.max(30, Number(process.env.PASSWORD_RESET_COOLDOWN_SEC || 60));
const MIN_PASSWORD_LENGTH = 6;
const RESET_REQUEST_MESSAGE = 'اگر حسابی با این ایمیل ثبت باشد، لینک بازیابی رمز به همان ایمیل فرستاده شد. اگر تا چند دقیقه نرسید، پوشهٔ Spam/Junk را هم ببینید.';
const RESET_LINK_INVALID_MESSAGE = 'این لینک بازیابی باطل یا منقضی شده است. لطفاً از صفحهٔ ورود دوباره درخواست بازیابی بدهید.';

const escapeHtml = (value = '') => String(value)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

// Accounts made for students and teachers without a real mailbox carry
// placeholder addresses (…@students.local, teacher.<id>@….local); a reset
// email to them can never arrive.
const hasDeliverableEmail = (email = '') => {
  const value = String(email || '').trim().toLowerCase();
  const match = value.match(/^[^@\s]+@([^@\s]+\.[^@\s]+)$/);
  if (!match) return false;
  return !/\.(local|localhost|test|invalid|example)$/.test(match[1]);
};

const buildPasswordResetMail = ({ name, resetUrl }) => {
  const greeting = name ? `${name} عزیز،` : 'سلام،';
  const text = [
    greeting,
    'برای حساب شما در سایت مکتب درخواست بازیابی رمز عبور ثبت شد.',
    `برای گذاشتن رمز جدید این لینک را باز کنید (تا ${PASSWORD_RESET_TTL_MIN} دقیقه اعتبار دارد):`,
    resetUrl,
    '',
    'اگر این درخواست را شما نداده‌اید، این ایمیل را نادیده بگیرید؛ رمز فعلی شما تغییر نمی‌کند.'
  ].join('\n');
  const html = `
    <div dir="rtl" style="font-family:Tahoma,Arial,sans-serif;line-height:1.9;color:#1f2937">
      <p>${escapeHtml(greeting)}</p>
      <p>برای حساب شما در سایت مکتب درخواست بازیابی رمز عبور ثبت شد.</p>
      <p style="margin:22px 0">
        <a href="${escapeHtml(resetUrl)}" style="background:#6d4aff;color:#ffffff;padding:12px 22px;border-radius:10px;text-decoration:none;font-weight:bold">گذاشتن رمز جدید</a>
      </p>
      <p>این لینک تا ${PASSWORD_RESET_TTL_MIN} دقیقه و فقط یک بار قابل استفاده است.</p>
      <p style="font-size:13px;color:#6b7280">اگر دکمه باز نشد، این آدرس را در مرورگر بچسپانید:<br><span dir="ltr">${escapeHtml(resetUrl)}</span></p>
      <p style="font-size:13px;color:#6b7280">اگر این درخواست را شما نداده‌اید، این ایمیل را نادیده بگیرید؛ رمز فعلی شما تغییر نمی‌کند.</p>
    </div>
  `;
  return { subject: 'بازیابی رمز عبور حساب مکتب', text, html };
};

router.post('/forgot-password', requireFields(['email']), async (req, res) => {
  try {
    const email = (req.body.email || '').trim().toLowerCase();
    const user = await User.findOne({ email });
    if (!user || user.isDemo === true || isDemoUser(user)) return ok(res, {}, RESET_REQUEST_MESSAGE);
    if (user.role === 'student' || user.role === 'student_applicant') return res.status(403).json({ success: false, message: 'شما شاگرد هستید، لطفا برای بازیابی حساب خود به مدیریت تدریسی تشریف ببرید.' });
    if (!hasDeliverableEmail(user.email)) {
      return fail(res, 'برای این حساب ایمیلِ واقعی ثبت نشده است، پس لینک بازیابی فرستاده نمی‌شود. لطفاً برای گذاشتن رمز جدید با ادارهٔ مکتب تماس بگیرید.', 422);
    }

    // A second click within the cooldown must not mail a second, competing link.
    const recent = await PasswordResetToken.findOne({
      user: user._id,
      consumedAt: null,
      createdAt: { $gt: new Date(Date.now() - (PASSWORD_RESET_COOLDOWN_SEC * 1000)) }
    });
    if (recent) return ok(res, {}, RESET_REQUEST_MESSAGE);

    const token = crypto.randomBytes(32).toString('hex');
    await PasswordResetToken.deleteMany({ user: user._id, consumedAt: null });
    const record = await PasswordResetToken.create({
      user: user._id,
      tokenHash: hashValue(token),
      expiresAt: new Date(Date.now() + (PASSWORD_RESET_TTL_MIN * 60 * 1000)),
      ip: String(req.ip || ''),
      userAgent: String(req.get('user-agent') || '').slice(0, 300)
    });

    const resetUrl = `${getPublicAppUrl(req)}/reset-password?token=${token}`;
    let mailResult = null;
    try {
      mailResult = await sendMail({ to: user.email, ...buildPasswordResetMail({ name: user.name, resetUrl }) });
    } catch (mailError) {
      mailResult = { ok: false, message: mailError?.message || 'SMTP error' };
    }
    if (!mailResult?.ok) {
      await PasswordResetToken.deleteOne({ _id: record._id });
      console.error(`[auth][forgot-password] reset email not sent for user ${user._id}: ${mailResult?.message || 'unknown error'}`);
      // 424, not 5xx: the frontend's apiFetch turns any 5xx into a generic
      // "server is down" error, and this message has to reach the form as is.
      return fail(res, 'فرستادن ایمیل بازیابی اکنون ممکن نشد. لطفاً کمی بعد دوباره تلاش کنید یا با ادارهٔ مکتب تماس بگیرید.', 424);
    }

    console.log(`[auth][forgot-password] reset email sent for user ${user._id}`);
    return ok(res, {}, RESET_REQUEST_MESSAGE);
  } catch (error) { console.error('Forgot Password Error:', error); return fail(res, 'خطای سرور در بازیابی حساب', 500); }
});

router.post('/reset-password', requireFields(['token', 'password']), async (req, res) => {
  try {
    const token = String(req.body.token || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    if (!/^[a-f0-9]{64}$/.test(token)) return fail(res, RESET_LINK_INVALID_MESSAGE);
    if (password.length < MIN_PASSWORD_LENGTH) return fail(res, `رمز عبور حداقل باید ${MIN_PASSWORD_LENGTH} حرف باشد.`);

    // Claim the token atomically so two submits of the same link cannot both win.
    const record = await PasswordResetToken.findOneAndUpdate(
      { tokenHash: hashValue(token), consumedAt: null, expiresAt: { $gt: new Date() } },
      { $set: { consumedAt: new Date() } },
      { new: true }
    );
    if (!record) return fail(res, RESET_LINK_INVALID_MESSAGE);

    const hashedPassword = await bcrypt.hash(password, 10);
    const updated = await User.updateOne({ _id: record.user }, { $set: { password: hashedPassword } });
    if (!updated?.matchedCount) return fail(res, RESET_LINK_INVALID_MESSAGE);
    await PasswordResetToken.deleteMany({ user: record.user, consumedAt: null });

    console.log(`[auth][reset-password] password reset for user ${record.user}`);
    return ok(res, {}, 'رمز عبور شما تغییر کرد. اکنون با رمز جدید وارد شوید.');
  } catch (error) { console.error('Reset Password Error:', error); return fail(res, 'خطای سرور در تغییر رمز عبور', 500); }
});

module.exports = router;
