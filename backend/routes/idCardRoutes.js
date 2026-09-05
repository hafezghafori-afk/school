const express = require('express');
const mongoose = require('mongoose');
const AfghanStudent = require('../models/AfghanStudent');
const AfghanTeacher = require('../models/AfghanTeacher');
const AfghanSchool = require('../models/AfghanSchool');
const IdCard = require('../models/IdCard');
const { nextIdCardSerial } = require('../utils/idCardSerial');
const { ok, fail } = require('../utils/response');
const { logActivity } = require('../utils/activity');
const { attachWriteActivityAudit } = require('../utils/routeWriteAudit');
const { requireAuth, requirePermission } = require('../middleware/auth');
const { requireWritableSchool, writeSchoolContextHeaders } = require('../services/schoolContextService');

const router = express.Router();
attachWriteActivityAudit(router, {
  targetType: 'IdCard',
  actionPrefix: 'id_card',
  audit: (payload) => logActivity(payload)
});

router.use(requireAuth);

const isObjectId = (value) => mongoose.Types.ObjectId.isValid(String(value || ''));
const OWNER_MODELS = { student: AfghanStudent, personnel: AfghanTeacher };

async function loadOwner(ownerType, ownerId) {
  const Model = OWNER_MODELS[ownerType];
  if (!Model || !isObjectId(ownerId)) return null;
  return Model.findById(ownerId);
}

const ownerSchoolId = (ownerType, ownerDoc) => String(
  (ownerType === 'student' ? ownerDoc?.academicInfo?.currentSchool : ownerDoc?.employmentInfo?.currentSchool) || ''
);

const ownerPhotoUrl = (ownerDoc) => (
  (ownerDoc?.documents || []).find((d) => d && d.type === 'photo' && d.url)?.url || ''
);

const GRADE_LABELS_FA = ['اول', 'دوم', 'سوم', 'چهارم', 'پنجم', 'ششم', 'هفتم', 'هشتم', 'نهم', 'دهم', 'یازدهم', 'دوازدهم'];
const gradeLabelFromValue = (value) => {
  const match = String(value || '').match(/\d+/);
  const n = match ? Number(match[0]) : null;
  return n >= 1 && n <= 12 ? `صنف ${GRADE_LABELS_FA[n - 1]}` : '';
};

const POSITION_LABELS_FA = {
  principal: 'مدیر مکتب',
  vice_principal: 'معاون مکتب',
  teacher: 'استاد',
  admin_staff: 'کارمند اداری',
  support_staff: 'کارمند خدماتی'
};

// شکلِ یکسانِ داده برای صفحهٔ چاپ — چه شاگرد چه استاد/کارمند (owner از AfghanStudent
// یا AfghanTeacher می‌آید؛ فیلدهای اختصاصیِ کارت از خودِ رکوردِ IdCard).
function serializeOwnerForCard(ownerType, ownerDoc) {
  const p = ownerDoc.personalInfo || {};
  const contact = ownerDoc.contactInfo || {};
  const name = [p.firstNameDari, p.lastNameDari].filter(Boolean).join(' ')
    || [p.firstName, p.lastName].filter(Boolean).join(' ');

  if (ownerType === 'student') {
    const grade = gradeLabelFromValue(ownerDoc.academicInfo?.currentGrade);
    const section = ownerDoc.academicInfo?.currentSection ? ` — ${ownerDoc.academicInfo.currentSection}` : '';
    return {
      roleKey: 'student',
      roleLabel: 'شاگرد',
      name,
      fatherName: p.fatherName || '',
      idLabel: 'نمبر اساس',
      idValue: ownerDoc.asasNumber || '',
      subLabel: 'صنف',
      subValue: `${grade}${section}`.trim() || '—',
      bloodGroup: ownerDoc.medicalInfo?.bloodGroup || '',
      birthDate: p.birthDate || null,
      province: contact.province || '',
      district: contact.district || '',
      address: contact.address || '',
      emergencyName: contact.emergencyContact?.name || '',
      emergencyPhone: contact.emergencyContact?.phone || '',
      photoUrl: ownerPhotoUrl(ownerDoc)
    };
  }

  const position = ownerDoc.employmentInfo?.position || '';
  const isTeacher = position === 'teacher';
  const subValue = isTeacher
    ? (ownerDoc.employmentInfo?.subjects || []).map((s) => s?.subjectName).filter(Boolean).join('، ') || '—'
    : [ownerDoc.employmentInfo?.jobTitle, ownerDoc.employmentInfo?.department].filter(Boolean).join(' — ') || '—';

  return {
    roleKey: isTeacher ? 'teacher' : 'staff',
    roleLabel: POSITION_LABELS_FA[position] || 'کارمند',
    name,
    fatherName: p.fatherName || '',
    idLabel: 'نمبر کارمند',
    idValue: ownerDoc.employmentInfo?.employeeId || '',
    subLabel: isTeacher ? 'مضمون' : 'سمت',
    subValue,
    bloodGroup: ownerDoc.medicalInfo?.bloodGroup || '',
    birthDate: p.birthDate || null,
    province: contact.province || '',
    district: contact.district || '',
    address: contact.address || '',
    emergencyName: '',
    emergencyPhone: '',
    photoUrl: ownerPhotoUrl(ownerDoc)
  };
}

const serializeCard = (card) => (card && typeof card.toObject === 'function' ? card.toObject() : card);

// رکوردِ IdCard را برمی‌گرداند؛ اگر نبود، با سریالِ تازه می‌سازد (همان الگویِ
// sawanehCardService.ensureCard — idempotent، صداش‌زدن از GET هم بی‌خطر است).
async function ensureCard(ownerType, ownerId, ownerDoc, { actorId } = {}) {
  let card = await IdCard.findOne({ ownerType, ownerId });
  if (card) return card;

  const schoolId = ownerSchoolId(ownerType, ownerDoc);
  if (!schoolId) {
    const error = new Error('id_card_owner_without_school');
    throw error;
  }
  const school = await AfghanSchool.findById(schoolId).select('schoolCode').lean();
  const serial = await nextIdCardSerial({ schoolCode: school?.schoolCode, year: new Date().getFullYear() });

  const issueDate = new Date();
  const expiryDate = new Date(issueDate);
  expiryDate.setFullYear(expiryDate.getFullYear() + 1); // پیش‌فرض: یک سال از تاریخِ صدور؛ در ویرایش قابلِ تغییر است

  try {
    card = await IdCard.create({
      ownerType,
      ownerId,
      schoolId,
      serial,
      issueDate,
      expiryDate,
      createdBy: actorId || null,
      lastUpdatedBy: actorId || null
    });
  } catch (error) {
    // رقابتِ هم‌زمان روی همان نفر (unique ownerType+ownerId) — رکوردِ ساخته‌شده را برگردان
    if (error?.code === 11000) {
      card = await IdCard.findOne({ ownerType, ownerId });
      if (card) return card;
    }
    throw error;
  }
  return card;
}

// GET /api/id-cards?ownerType=student|personnel&ids=id1,id2,...
// نگاشتِ وضعیتِ کارتِ چند نفر با هم — برایِ ستونِ «وضعیتِ کارت» در جدولِ مدیریت
// (جدولِ خودِ افراد از /api/afghan-students یا /api/afghan-teachers خوانده می‌شود).
router.get('/', requirePermission('id_cards.manage'), async (req, res) => {
  try {
    const ownerType = req.query.ownerType;
    if (!OWNER_MODELS[ownerType]) return fail(res, 'نوعِ صاحبِ کارت معتبر نیست.', 400);

    const ids = String(req.query.ids || '').split(',').map((v) => v.trim()).filter(isObjectId);
    if (!ids.length) return ok(res, { data: [] }, 'فهرست خالی است.');

    const cards = await IdCard.find({ ownerType, ownerId: { $in: ids } })
      .select('ownerId serial status issueDate expiryDate reissueCount updatedAt')
      .lean();
    return ok(res, { data: cards }, 'وضعیتِ کارت‌ها دریافت شد.');
  } catch (error) {
    console.error('GET id-cards list error:', error?.message || error);
    return fail(res, 'دریافتِ وضعیتِ کارت‌ها ناموفق بود.', 500);
  }
});

// GET /api/id-cards/:ownerType/:ownerId — گرفتن/ساختِ خودکارِ کارت + دادهٔ آمادهٔ چاپ
router.get('/:ownerType/:ownerId', requirePermission('id_cards.manage'), async (req, res) => {
  try {
    const { ownerType, ownerId } = req.params;
    const ownerDoc = await loadOwner(ownerType, ownerId);
    if (!ownerDoc) return fail(res, 'شاگرد/کارمند پیدا نشد.', 404);

    const card = await ensureCard(ownerType, ownerId, ownerDoc, { actorId: req.user?.id || null });
    return ok(res, {
      data: {
        card: serializeCard(card),
        owner: serializeOwnerForCard(ownerType, ownerDoc)
      }
    }, 'کارتِ هویت دریافت شد.');
  } catch (error) {
    console.error('GET id-card error:', error?.message || error);
    if (error?.message === 'id_card_owner_without_school') {
      return fail(res, 'این شخص به هیچ مکتبی وصل نیست.', 400);
    }
    return fail(res, 'دریافتِ کارتِ هویت ناموفق بود.', 500);
  }
});

// PUT /api/id-cards/:ownerType/:ownerId — ویرایشِ فیلدهایِ اختصاصیِ کارت (اعتبار/وضعیت/یادداشت)
router.put('/:ownerType/:ownerId', requirePermission('id_cards.manage'), async (req, res) => {
  try {
    const { ownerType, ownerId } = req.params;
    const ownerDoc = await loadOwner(ownerType, ownerId);
    if (!ownerDoc) return fail(res, 'شاگرد/کارمند پیدا نشد.', 404);

    const schoolId = ownerSchoolId(ownerType, ownerDoc);
    const schoolContext = await requireWritableSchool(req, { schoolId });
    if (schoolId && String(schoolContext.schoolId) !== schoolId) {
      return fail(res, 'این شخص به مکتبِ فعالِ شما تعلق ندارد.', 403);
    }

    const card = await ensureCard(ownerType, ownerId, ownerDoc, { actorId: req.user?.id || null });

    const body = req.body || {};
    if (body.issueDate) card.issueDate = new Date(body.issueDate);
    if (body.expiryDate) card.expiryDate = new Date(body.expiryDate);
    if (['active', 'lost', 'revoked', 'expired'].includes(body.status)) card.status = body.status;
    if (typeof body.notesForCard === 'string') card.notesForCard = body.notesForCard.trim();
    card.lastUpdatedBy = req.user?.id || card.lastUpdatedBy;
    await card.save();

    writeSchoolContextHeaders(res, schoolContext.schoolId);
    return ok(res, { data: serializeCard(card) }, 'کارتِ هویت به‌روزرسانی شد.');
  } catch (error) {
    console.error('PUT id-card error:', error?.message || error);
    if (error?.message === 'school_context_required') {
      return fail(res, error.messageDari || 'اول یک مکتب فعال انتخاب کنید.', error.statusCode || 400);
    }
    if (error?.name === 'ValidationError') return fail(res, 'اطلاعاتِ کارت معتبر نیست.', 400);
    return fail(res, 'به‌روزرسانیِ کارتِ هویت ناموفق بود.', 500);
  }
});

// POST /api/id-cards/:ownerType/:ownerId/reissue — صدورِ مجدد (گم‌شده/خراب)
router.post('/:ownerType/:ownerId/reissue', requirePermission('id_cards.manage'), async (req, res) => {
  try {
    const { ownerType, ownerId } = req.params;
    const reason = String(req.body?.reason || '').trim();
    if (!reason) return fail(res, 'دلیلِ صدورِ مجدد را وارد کنید.', 400);

    const ownerDoc = await loadOwner(ownerType, ownerId);
    if (!ownerDoc) return fail(res, 'شاگرد/کارمند پیدا نشد.', 404);

    const schoolId = ownerSchoolId(ownerType, ownerDoc);
    const schoolContext = await requireWritableSchool(req, { schoolId });
    if (schoolId && String(schoolContext.schoolId) !== schoolId) {
      return fail(res, 'این شخص به مکتبِ فعالِ شما تعلق ندارد.', 403);
    }

    const card = await ensureCard(ownerType, ownerId, ownerDoc, { actorId: req.user?.id || null });
    const school = await AfghanSchool.findById(schoolId).select('schoolCode').lean();
    const nextSeq = card.reissueCount + 1;
    const baseSerial = await nextIdCardSerial({ schoolCode: school?.schoolCode, year: new Date().getFullYear() });
    card.serial = `${baseSerial}-R${nextSeq}`;
    card.reissueCount = nextSeq;
    card.reissueReason = reason;
    card.status = 'active';
    card.issueDate = new Date();
    card.lastUpdatedBy = req.user?.id || card.lastUpdatedBy;
    await card.save();

    writeSchoolContextHeaders(res, schoolContext.schoolId);
    return ok(res, { data: serializeCard(card) }, 'کارتِ هویت به‌صورتِ مجدد صادر شد.');
  } catch (error) {
    console.error('POST id-card reissue error:', error?.message || error);
    if (error?.message === 'school_context_required') {
      return fail(res, error.messageDari || 'اول یک مکتب فعال انتخاب کنید.', error.statusCode || 400);
    }
    return fail(res, 'صدورِ مجددِ کارت ناموفق بود.', 500);
  }
});

// POST /api/id-cards/:ownerType/:ownerId/print-log — ثبتِ یک رویدادِ چاپ (ردِ چاپ، ضدِ تقلبِ سیستمی)
router.post('/:ownerType/:ownerId/print-log', requirePermission('id_cards.manage'), async (req, res) => {
  try {
    const { ownerType, ownerId } = req.params;
    const ownerDoc = await loadOwner(ownerType, ownerId);
    if (!ownerDoc) return fail(res, 'شاگرد/کارمند پیدا نشد.', 404);

    const card = await ensureCard(ownerType, ownerId, ownerDoc, { actorId: req.user?.id || null });
    const mode = ['single', 'batch'].includes(req.body?.mode) ? req.body.mode : 'single';
    const side = ['front', 'back', 'both'].includes(req.body?.side) ? req.body.side : 'front';
    card.printHistory.push({ printedAt: new Date(), printedBy: req.user?.id || null, mode, side });
    await card.save();

    return ok(res, { data: { printCount: card.printHistory.length } }, 'چاپ ثبت شد.');
  } catch (error) {
    console.error('POST id-card print-log error:', error?.message || error);
    return fail(res, 'ثبتِ چاپ ناموفق بود.', 500);
  }
});

module.exports = router;
