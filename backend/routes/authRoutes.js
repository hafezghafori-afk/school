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
const TWO_FACTOR_CHALLENGE_TTL_SEC = Math.max(
  TWO_FACTOR_CODE_TTL_SEC + 60,
  Number(process.env.ADMIN_2FA_CHALLENGE_TTL_SEC || 900)
);
const TWO_FACTOR_RESEND_COOLDOWN_SEC = Math.max(15, Number(process.env.ADMIN_2FA_RESEND_COOLDOWN_SEC || 45));
const TWO_FACTOR_MAX_ATTEMPTS = Math.max(3, Number(process.env.ADMIN_2FA_MAX_ATTEMPTS || 5));
const TWO_FACTOR_LEVEL_FILTER = String(process.env.ADMIN_2FA_LEVELS || 'finance_manager,finance_lead,general_president')
  .split(',')
  .map((item) => normalizeAdminLevel(item, 'finance_manager'))
  .filter(Boolean);

const hashValue = (value = '') => crypto.createHash('sha256').update(String(value)).digest('hex');
const generateCode = () => String(crypto.randomInt(100000, 1000000));
const generateChallengeToken = () => crypto.randomBytes(32).toString('hex');
const isProduction = () => String(process.env.NODE_ENV || '').toLowerCase() === 'production';

const getClientIp = (req) => {
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',').map((item) => item.trim()).filter(Boolean);
  return forwarded[0] || req.ip || req.connection?.remoteAddress || '';
};

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
  const token = jwt.sign(
    {
      id: user._id.toString(),
      role: identity.role,
      orgRole: identity.orgRole,
      adminLevel: identity.adminLevel,
      status: identity.status,
      name: user.name
    },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
  const adminLevel = identity.role === 'admin' ? normalizeAdminLevel(identity.adminLevel || '') : '';
  const effectivePermissions = resolvePermissions({
    role: identity.role,
    orgRole: identity.orgRole,
    permissions: user.permissions || [],
    adminLevel
  });

  return {
    userId: user._id,
    name: user.name,
    role: identity.role,
    orgRole: identity.orgRole,
    status: identity.status,
    adminLevel,
    token,
    avatarUrl: user.avatarUrl || '',
    lastLoginAt: user.lastLoginAt,
    effectivePermissions
  };
};

const cleanupChallenges = async () => {
  const now = new Date();
  await AuthOtpChallenge.deleteMany({
    $or: [
      { consumedAt: { $ne: null }, updatedAt: { $lt: new Date(now.getTime() - (24 * 60 * 60 * 1000)) } },
      { challengeExpiresAt: { $lt: now } }
    ]
  });
};

const createOrRefreshLoginChallenge = async (req, user, challenge = null) => {
  const now = Date.now();
  const code = generateCode();
  const codeHash = await bcrypt.hash(code, 10);
  const codeExpiresAt = new Date(now + (TWO_FACTOR_CODE_TTL_SEC * 1000));
  const challengeExpiresAt = new Date(now + (TWO_FACTOR_CHALLENGE_TTL_SEC * 1000));
  const clientIp = getClientIp(req);
  const userAgent = String(req.headers['user-agent'] || '').slice(0, 300);

  let challengeToken = '';
  let record = challenge;

  if (record) {
    record.codeHash = codeHash;
    record.codeExpiresAt = codeExpiresAt;
    record.challengeExpiresAt = challengeExpiresAt;
    record.lastSentAt = new Date(now);
    record.attempts = 0;
    record.ip = clientIp;
    record.userAgent = userAgent;
    await record.save();
    challengeToken = record._plainToken || '';
  } else {
    challengeToken = generateChallengeToken();
    record = await AuthOtpChallenge.create({
      user: user._id,
      purpose: 'login_2fa',
      tokenHash: hashValue(challengeToken),
      codeHash,
      attempts: 0,
      maxAttempts: TWO_FACTOR_MAX_ATTEMPTS,
      codeExpiresAt,
      challengeExpiresAt,
      lastSentAt: new Date(now),
      ip: clientIp,
      userAgent
    });
  }

  const mailResult = await sendMail({
    to: user.email,
    subject: 'کد ورود دو مرحله‌ای',
    text: `کد ورود شما: ${code}\nاین کد تا ${Math.floor(TWO_FACTOR_CODE_TTL_SEC / 60)} دقیقه معتبر است.`,
    html: `<p>کد ورود شما: <strong>${code}</strong></p><p>این کد تا ${Math.floor(TWO_FACTOR_CODE_TTL_SEC / 60)} دقیقه معتبر است.</p>`
  });

  if (!mailResult?.ok) {
    const msg = mailResult?.message || 'smtp_not_configured';
    console.warn(`[auth][2fa] failed sending code to ${user.email}: ${msg}`);
    if (isProduction()) {
      await AuthOtpChallenge.deleteOne({ _id: record._id });
      return { ok: false, message: 'ارسال کد دو مرحله‌ای ناموفق بود. تنظیم SMTP را بررسی کنید.' };
    }
    console.log(`[auth][2fa][dev] login code for ${user.email}: ${code}`);
  }

  if (!challengeToken) {
    challengeToken = generateChallengeToken();
    record.tokenHash = hashValue(challengeToken);
    await record.save();
  }

  return {
    ok: true,
    challengeToken,
    codeExpiresAt,
    challengeExpiresAt,
    emailMasked: maskEmail(user.email)
  };
};

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
  } catch (error) {
    console.error('Register Error:', error);
    return fail(res, 'خطای سرور', 500);
  }
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
      await AuthOtpChallenge.deleteMany({
        user: user._id,
        purpose: 'login_2fa',
        consumedAt: null
      });

      const challenge = await createOrRefreshLoginChallenge(req, user);
      if (!challenge.ok) {
        return fail(res, challenge.message || 'ارسال کد دو مرحله‌ای ناموفق بود', 500);
      }

      return ok(res, {
        requiresTwoFactor: true,
        challengeToken: challenge.challengeToken,
        challengeExpiresAt: challenge.challengeExpiresAt,
        codeExpiresAt: challenge.codeExpiresAt,
        emailMasked: challenge.emailMasked
      }, 'کد تایید دو مرحله‌ای ارسال شد');
    }

    user.lastLoginAt = new Date();
    await user.save();
    return ok(res, issueAuthPayload(user), 'ورود موفق');
  } catch (error) {
    console.error('Login Error:', error);
    return fail(res, 'خطای سرور', 500);
  }
});

router.post('/login/2fa/verify', requireFields(['challengeToken', 'code']), async (req, res) => {
  try {
    const challengeToken = String(req.body.challengeToken || '').trim();
    const code = String(req.body.code || '').trim();
    if (!challengeToken || !code) {
      return fail(res, 'اطلاعات تایید ناقص است');
    }
    if (!/^\d{6}$/.test(code)) {
      return fail(res, 'کد تایید باید 6 رقمی باشد');
    }

    await cleanupChallenges();
    const now = new Date();
    const challenge = await AuthOtpChallenge.findOne({
      purpose: 'login_2fa',
      tokenHash: hashValue(challengeToken),
      consumedAt: null,
      challengeExpiresAt: { $gt: now }
    });
    if (!challenge) {
      return fail(res, 'درخواست تایید منقضی شده یا نامعتبر است');
    }
    if (challenge.codeExpiresAt.getTime() < now.getTime()) {
      challenge.consumedAt = now;
      await challenge.save();
      return fail(res, 'کد تایید منقضی شده است');
    }
    if (Number(challenge.attempts || 0) >= Number(challenge.maxAttempts || TWO_FACTOR_MAX_ATTEMPTS)) {
      challenge.consumedAt = now;
      await challenge.save();
      return fail(res, 'تعداد تلاش بیش از حد مجاز است');
    }

    const isCodeValid = await bcrypt.compare(code, challenge.codeHash);
    if (!isCodeValid) {
      challenge.attempts = Number(challenge.attempts || 0) + 1;
      if (challenge.attempts >= Number(challenge.maxAttempts || TWO_FACTOR_MAX_ATTEMPTS)) {
        challenge.consumedAt = now;
      }
      await challenge.save();
      return fail(res, 'کد تایید اشتباه است');
    }

    const user = await User.findById(challenge.user);
    if (!user) {
      challenge.consumedAt = now;
      await challenge.save();
      return fail(res, 'کاربر یافت نشد', 404);
    }
    if (!shouldRequireTwoFactor(user)) {
      challenge.consumedAt = now;
      await challenge.save();
      return fail(res, 'این حساب نیاز به تایید دو مرحله‌ای ندارد');
    }

    challenge.consumedAt = now;
    await challenge.save();

    user.lastLoginAt = now;
    await user.save();
    return ok(res, issueAuthPayload(user), 'ورود موفق');
  } catch (error) {
    console.error('2FA Verify Error:', error);
    return fail(res, 'خطای سرور', 500);
  }
});

router.post('/login/2fa/resend', requireFields(['challengeToken']), async (req, res) => {
  try {
    const challengeToken = String(req.body.challengeToken || '').trim();
    if (!challengeToken) return fail(res, 'شناسه تایید نامعتبر است');

    await cleanupChallenges();
    const now = new Date();
    const challenge = await AuthOtpChallenge.findOne({
      purpose: 'login_2fa',
      tokenHash: hashValue(challengeToken),
      consumedAt: null,
      challengeExpiresAt: { $gt: now }
    });
    if (!challenge) {
      return fail(res, 'درخواست تایید منقضی شده یا نامعتبر است');
    }

    const lastSentAt = challenge.lastSentAt ? challenge.lastSentAt.getTime() : 0;
    const waitMs = (lastSentAt + (TWO_FACTOR_RESEND_COOLDOWN_SEC * 1000)) - now.getTime();
    if (waitMs > 0) {
      const waitSec = Math.ceil(waitMs / 1000);
      return res.status(429).json({
        success: false,
        message: `ارسال مجدد کد فعلا ممکن نیست. ${waitSec} ثانیه دیگر تلاش کنید.`,
        waitSec
      });
    }

    const user = await User.findById(challenge.user);
    if (!user) {
      challenge.consumedAt = now;
      await challenge.save();
      return fail(res, 'کاربر یافت نشد', 404);
    }
    if (!shouldRequireTwoFactor(user)) {
      challenge.consumedAt = now;
      await challenge.save();
      return fail(res, 'این حساب نیاز به تایید دو مرحله‌ای ندارد');
    }

    const refreshed = await createOrRefreshLoginChallenge(req, user, challenge);
    if (!refreshed.ok) {
      return fail(res, refreshed.message || 'ارسال کد دو مرحله‌ای ناموفق بود', 500);
    }

    return ok(res, {
      challengeToken,
      challengeExpiresAt: refreshed.challengeExpiresAt,
      codeExpiresAt: refreshed.codeExpiresAt,
      emailMasked: refreshed.emailMasked
    }, 'کد جدید ارسال شد');
  } catch (error) {
    console.error('2FA Resend Error:', error);
    return fail(res, 'خطای سرور', 500);
  }
});

router.post('/forgot-password', requireFields(['email']), async (req, res) => {
  try {
    const email = (req.body.email || '').trim().toLowerCase();
    
    const user = await User.findOne({ email });
    if (!user) {
      return ok(res, {}, 'اگر حساب کاربری با این مشخصات وجود داشته باشد، لینک بازیابی ارسال شد.');
    }

    if (user.role === 'student' || user.role === 'student_applicant') {
      return res.status(403).json({
        success: false,
        message: 'شما شاگرد هستید، لطفا برای بازیابی حساب خود به مدیریت تدریسی تشریف ببرید.'
      });
    }

    // Since this is just a procedural mock according to user instructions, we just pretend to send an email.
    // In a real system we'd generate a token and send it.
    console.log(`[auth][forgot-password] reset link generated for ${user.email}`);

    return ok(res, {}, 'لینک بازیابی حساب به ایمیل شما ارسال شد.');
  } catch (error) {
    console.error('Forgot Password Error:', error);
    return fail(res, 'خطای سرور در بازیابی حساب', 500);
  }
});

module.exports = router;
