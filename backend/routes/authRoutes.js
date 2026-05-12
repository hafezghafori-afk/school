const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const User = require('../models/User');
const AuthOtpChallenge = require('../models/AuthOtpChallenge');
const { requireFields } = require('../middleware/validate');
const { ok, fail } = require('../utils/response');
const { resolvePermissions, normalizeAdminLevel } = require('../utils/permissions');
const { getJwtSecret } = require('../utils/env');
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
const DEMO_USERS = {
  admin: { name: 'Demo Admin', email: 'demo.admin@school.local', role: 'admin', orgRole: 'general_president', adminLevel: 'general_president', permissions: ['manage_users', 'manage_enrollments', 'manage_memberships', 'manage_finance', 'manage_content', 'view_reports', 'view_schedule', 'manage_schedule'] },
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
  if (!ADMIN_2FA_ENABLED) return false;
  if (identity.role !== 'admin') return false;
  if (!TWO_FACTOR_LEVEL_FILTER.length) return true;
  const level = normalizeAdminLevel(identity.adminLevel || '');
  return TWO_FACTOR_LEVEL_FILTER.includes(level);
};

const issueAuthPayload = (user) => {
  const identity = serializeUserIdentity(user);
  const token = jwt.sign({ id: user._id.toString(), role: identity.role, orgRole: identity.orgRole, adminLevel: identity.adminLevel, status: identity.status, name: user.name }, JWT_SECRET, { expiresIn: '7d' });
  const adminLevel = identity.role === 'admin' ? normalizeAdminLevel(identity.adminLevel || '') : '';
  const effectivePermissions = resolvePermissions({ role: identity.role, orgRole: identity.orgRole, permissions: user.permissions || [], adminLevel });
  return { userId: user._id, name: user.name, role: identity.role, orgRole: identity.orgRole, status: identity.status, adminLevel, token, avatarUrl: user.avatarUrl || '', lastLoginAt: user.lastLoginAt, effectivePermissions };
};

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
    const created = [];
    for (const profile of Object.values(DEMO_USERS)) {
      await User.findOneAndUpdate({ email: profile.email }, { $set: { ...profile, password: hashedPassword, status: 'active' } }, { upsert: true, new: true, setDefaultsOnInsert: true });
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

router.post('/forgot-password', requireFields(['email']), async (req, res) => {
  try {
    const email = (req.body.email || '').trim().toLowerCase();
    const user = await User.findOne({ email });
    if (!user) return ok(res, {}, 'اگر حساب کاربری با این مشخصات وجود داشته باشد، لینک بازیابی ارسال شد.');
    if (user.role === 'student' || user.role === 'student_applicant') return res.status(403).json({ success: false, message: 'شما شاگرد هستید، لطفا برای بازیابی حساب خود به مدیریت تدریسی تشریف ببرید.' });
    console.log(`[auth][forgot-password] reset link generated for ${user.email}`);
    return ok(res, {}, 'لینک بازیابی حساب به ایمیل شما ارسال شد.');
  } catch (error) { console.error('Forgot Password Error:', error); return fail(res, 'خطای سرور در بازیابی حساب', 500); }
});

module.exports = router;
