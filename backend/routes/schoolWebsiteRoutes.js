const express = require('express');
const mongoose = require('mongoose');

const School = require('../models/School');
const SchoolWebsiteProfile = require('../models/SchoolWebsiteProfile');
const ContactMessage = require('../models/ContactMessage');
const { requireAuth, requireRole, requirePermission } = require('../middleware/auth');

const router = express.Router();

const SUPPORTED_LANGUAGES = ['fa', 'en', 'ps'];

const normalizeLanguage = (value = '') => {
  const text = String(value || '').trim().toLowerCase();
  if (['dr', 'dari', 'fa-af', 'prs'].includes(text)) return 'fa';
  if (['pashto', 'pa'].includes(text)) return 'ps';
  return SUPPORTED_LANGUAGES.includes(text) ? text : 'fa';
};

const slugify = (value = '') => {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '');
  return normalized || `school-${Date.now()}`;
};

const pickText = (value = {}, lang = 'fa', fallback = '') => {
  if (typeof value === 'string') return value;
  return String(value?.[lang] || value?.fa || value?.en || value?.ps || fallback || '').trim();
};

const localizeItems = (items = [], lang = 'fa') => (
  (Array.isArray(items) ? items : [])
    .filter((item) => item && item.enabled !== false)
    .map((item) => ({
      title: pickText(item.title, lang),
      text: pickText(item.text, lang),
      value: item.value || '',
      href: item.href || '',
      icon: item.icon || ''
    }))
    .filter((item) => item.title || item.text || item.value)
);

const schoolName = (school = {}) => school.nameDari || school.name || school.namePashto || 'مکتب';

const buildFallbackProfile = (school) => {
  const nameFa = school.nameDari || school.name || 'مکتب';
  const nameEn = school.name || school.nameDari || 'School';
  const namePs = school.namePashto || school.nameDari || 'ښوونځی';
  const address = school.contactInfo?.address || [school.district, school.province].filter(Boolean).join('، ');
  return {
    schoolId: school._id,
    slug: slugify(school.contactInfo?.website || school.schoolCode || school.name || school.nameDari),
    siteStatus: 'active',
    brandName: { fa: nameFa, en: nameEn, ps: namePs },
    brandSubtitle: {
      fa: 'وب‌سایت رسمی مکتب',
      en: 'Official school website',
      ps: 'د ښوونځي رسمي وېب‌پاڼه'
    },
    homeHeroBadge: {
      fa: 'آموزش منظم، ارتباط روشن',
      en: 'Organized learning, clear communication',
      ps: 'منظم زده کړه، روښانه اړیکه'
    },
    homeHeroTitle: {
      fa: nameFa,
      en: nameEn,
      ps: namePs
    },
    homeHeroText: {
      fa: 'معلومات مکتب، امکانات، اخبار و راه‌های ارتباطی در یک صفحه منظم برای شاگردان، والدین و همکاران.',
      en: 'School information, facilities, news, and contact details in one clear public website.',
      ps: 'د ښوونځي معلومات، امکانات، خبرونه او اړیکې په یوه منظم عامه وېب‌پاڼه کې.'
    },
    aboutTitle: { fa: `درباره ${nameFa}`, en: `About ${nameEn}`, ps: `د ${namePs} په اړه` },
    aboutBody: {
      fa: 'این صفحه برای معرفی رسمی مکتب، هدف آموزشی، امکانات و مسیر ارتباطی آن تنظیم شده است.',
      en: 'This page introduces the school, its educational goals, facilities, and contact channels.',
      ps: 'دا پاڼه د ښوونځي، د زده کړې موخو، امکاناتو او اړیکو د معرفي لپاره ده.'
    },
    missionTitle: { fa: 'ماموریت', en: 'Mission', ps: 'ماموریت' },
    missionBody: {
      fa: 'ایجاد محیط آموزشی منظم، شفاف و قابل پیگیری برای شاگردان و خانواده‌ها.',
      en: 'To provide an organized, transparent, and trackable learning environment.',
      ps: 'د زده کوونکو او کورنیو لپاره منظم او روڼ تعلیمي چاپېریال برابرول.'
    },
    visionTitle: { fa: 'چشم‌انداز', en: 'Vision', ps: 'لیدلوری' },
    visionBody: {
      fa: 'رشد کیفیت آموزش و ارتباط بهتر میان مکتب، شاگرد و خانواده.',
      en: 'Improving education quality and school-family communication.',
      ps: 'د زده کړې کیفیت او د ښوونځي، زده کوونکي او کورنۍ اړیکې ښه کول.'
    },
    contactTitle: { fa: 'تماس با مکتب', en: 'Contact the school', ps: 'له ښوونځي سره اړیکه' },
    contactText: {
      fa: 'برای معلومات بیشتر، پیشنهاد یا پیام رسمی با اداره مکتب تماس بگیرید.',
      en: 'For information, suggestions, or official messages, contact the school office.',
      ps: 'د نورو معلوماتو، وړاندیزونو یا رسمي پیغامونو لپاره له ادارې سره اړیکه ونیسئ.'
    },
    contactPhone: school.contactInfo?.phone || school.contactInfo?.mobile || '',
    contactEmail: school.contactInfo?.email || '',
    contactAddress: { fa: address, en: address, ps: address },
    features: [
      { title: { fa: 'مدیریت آموزشی', en: 'Academic management', ps: 'تعلیمي مدیریت' }, text: { fa: 'صنف‌ها، مضامین، نمرات و گزارش‌های آموزشی.', en: 'Classes, subjects, grades, and academic reports.', ps: 'صنفونه، مضمونونه، نمرې او تعلیمي راپورونه.' }, icon: 'fa-graduation-cap' },
      { title: { fa: 'امور مالی', en: 'Finance', ps: 'مالي چارې' }, text: { fa: 'فیس، رسیدها، تخفیف‌ها و گزارش مالی.', en: 'Fees, receipts, discounts, and finance reports.', ps: 'فیس، رسیدونه، تخفیفونه او مالي راپورونه.' }, icon: 'fa-wallet' },
      { title: { fa: 'ارتباط با خانواده', en: 'Family communication', ps: 'له کورنۍ سره اړیکه' }, text: { fa: 'اطلاع‌رسانی و دسترسی روشن برای والدین.', en: 'Clear updates and access for parents.', ps: 'د والدینو لپاره روښانه خبرتیاوې او لاسرسی.' }, icon: 'fa-people-roof' }
    ],
    stats: [
      { title: { fa: 'شاگردان', en: 'Students', ps: 'زده کوونکي' }, value: String(school.academicInfo?.totalStudents || 0) },
      { title: { fa: 'استادان', en: 'Teachers', ps: 'ښوونکي' }, value: String(school.academicInfo?.totalTeachers || 0) },
      { title: { fa: 'صنف‌ها', en: 'Classes', ps: 'صنفونه' }, value: String(school.academicInfo?.classesCount || 0) }
    ]
  };
};

const ensureProfileForSchool = async (school) => {
  if (!school?._id) return null;
  let profile = await SchoolWebsiteProfile.findOne({ schoolId: school._id });
  if (profile) return profile;

  const fallback = buildFallbackProfile(school);
  let slug = fallback.slug;
  let suffix = 1;
  while (await SchoolWebsiteProfile.exists({ slug })) {
    suffix += 1;
    slug = `${fallback.slug}-${suffix}`;
  }
  profile = await SchoolWebsiteProfile.create({ ...fallback, slug });
  return profile;
};

const resolveProfile = async (slug = '') => {
  const cleanSlug = slugify(slug);
  if (slug) {
    const direct = await SchoolWebsiteProfile.findOne({ slug: cleanSlug, siteStatus: 'active' });
    if (direct) return direct;
    const school = await School.findOne({
      $or: [
        { schoolCode: slug },
        { name: slug },
        { nameDari: slug },
        { namePashto: slug }
      ]
    });
    if (school) return ensureProfileForSchool(school);
  }

  const existing = await SchoolWebsiteProfile.findOne({ siteStatus: 'active' }).sort({ updatedAt: -1 });
  if (existing) return existing;
  const school = await School.findOne().sort({ createdAt: -1 });
  return school ? ensureProfileForSchool(school) : null;
};

const serializeProfile = (profile, lang = 'fa') => {
  if (!profile) return null;
  const language = normalizeLanguage(lang || profile.primaryLanguage);
  const basePath = `/schools/${profile.slug}`;
  const contactAddress = pickText(profile.contactAddress, language);
  return {
    id: String(profile._id),
    schoolId: String(profile.schoolId || ''),
    slug: profile.slug,
    language,
    enabledLanguages: profile.enabledLanguages || SUPPORTED_LANGUAGES,
    publicBasePath: basePath,
    primaryColor: profile.primaryColor || '#0f766e',
    logoUrl: profile.schoolLogoUrl || '',
    schoolLogoUrl: profile.schoolLogoUrl || '',
    ministryLogoUrl: profile.ministryLogoUrl || '',
    heroImageUrl: profile.heroImageUrl || '',
    brandName: pickText(profile.brandName, language, 'مکتب'),
    brandSubtitle: pickText(profile.brandSubtitle, language, ''),
    homeHeroBadge: pickText(profile.homeHeroBadge, language),
    homeHeroTitle: pickText(profile.homeHeroTitle, language),
    homeHeroText: pickText(profile.homeHeroText, language),
    homeHeroPrimaryLabel: language === 'en' ? 'Contact us' : language === 'ps' ? 'اړیکه ونیسئ' : 'تماس با مکتب',
    homeHeroPrimaryHref: `${basePath}/contact`,
    homeHeroSecondaryLabel: language === 'en' ? 'Login' : language === 'ps' ? 'سیستم ته ننوتل' : 'ورود به سیستم',
    homeHeroSecondaryHref: '/login',
    homeCtaTitle: language === 'en' ? 'Contact the school office' : language === 'ps' ? 'له ادارې سره اړیکه' : 'با اداره مکتب تماس بگیرید',
    homeCtaText: pickText(profile.contactText, language),
    homeCtaLabel: language === 'en' ? 'Send message' : language === 'ps' ? 'پیغام ولېږئ' : 'ارسال پیام',
    homeCtaHref: `${basePath}/contact`,
    aboutTitle: pickText(profile.aboutTitle, language),
    aboutBody: pickText(profile.aboutBody, language),
    missionTitle: pickText(profile.missionTitle, language),
    missionBody: pickText(profile.missionBody, language),
    visionTitle: pickText(profile.visionTitle, language),
    visionBody: pickText(profile.visionBody, language),
    contactTitle: pickText(profile.contactTitle, language),
    contactText: pickText(profile.contactText, language),
    contactPhone: profile.contactPhone || '',
    contactEmail: profile.contactEmail || '',
    contactAddress,
    salesQuickCards: localizeItems(profile.features, language),
    salesModules: localizeItems(profile.features, language),
    homeStats: localizeItems(profile.stats, language),
    footerLinks: localizeItems(profile.footerLinks, language).length
      ? localizeItems(profile.footerLinks, language)
      : [
          { title: language === 'en' ? 'Home' : language === 'ps' ? 'کور' : 'خانه', href: basePath },
          { title: language === 'en' ? 'Facilities' : language === 'ps' ? 'امکانات' : 'امکانات', href: `${basePath}/features` },
          { title: language === 'en' ? 'About' : language === 'ps' ? 'په اړه' : 'درباره مکتب', href: `${basePath}/about` },
          { title: language === 'en' ? 'Contact' : language === 'ps' ? 'اړیکه' : 'تماس', href: `${basePath}/contact` },
          { title: language === 'en' ? 'Login' : language === 'ps' ? 'ننوتل' : 'ورود به سیستم', href: '/login' }
        ],
    mainMenu: [
      { title: language === 'en' ? 'Home' : language === 'ps' ? 'کور' : 'خانه', href: basePath, icon: 'fa-house', enabled: true },
      { title: language === 'en' ? 'Facilities' : language === 'ps' ? 'امکانات' : 'امکانات', href: `${basePath}/features`, icon: 'fa-layer-group', enabled: true },
      { title: language === 'en' ? 'About school' : language === 'ps' ? 'د ښوونځي په اړه' : 'درباره مکتب', href: `${basePath}/about`, icon: 'fa-circle-info', enabled: true },
      { title: language === 'en' ? 'Contact' : language === 'ps' ? 'اړیکه' : 'تماس', href: `${basePath}/contact`, icon: 'fa-phone', enabled: true }
    ],
    footerContactTitle: language === 'en' ? 'School contact' : language === 'ps' ? 'د ښوونځي اړیکه' : 'تماس مکتب',
    footerContactText: pickText(profile.footerNote, language) || pickText(profile.aboutBody, language),
    footerNote: pickText(profile.footerNote, language),
    footerCopyright: ''
  };
};

router.get('/public', async (req, res) => {
  try {
    const profile = await resolveProfile(req.query.slug || '');
    if (!profile) {
      return res.json({ success: true, profile: null });
    }
    return res.json({ success: true, profile: serializeProfile(profile, req.query.lang) });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Failed to load school website profile.' });
  }
});

router.get('/admin', requireAuth, requireRole(['admin']), requirePermission('manage_content'), async (req, res) => {
  try {
    const filter = req.user?.isDemo === true && req.user?.schoolId ? { schoolId: req.user.schoolId } : {};
    const items = await SchoolWebsiteProfile.find(filter).sort({ updatedAt: -1 });
    return res.json({ success: true, items });
  } catch {
    return res.status(500).json({ success: false, message: 'Failed to load school website profiles.' });
  }
});

router.put('/admin/:schoolId', requireAuth, requireRole(['admin']), requirePermission('manage_content'), async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.schoolId)) {
      return res.status(400).json({ success: false, message: 'Invalid school id.' });
    }
    if (req.user?.isDemo === true && String(req.user.schoolId || '') !== String(req.params.schoolId || '')) {
      return res.status(403).json({ success: false, message: 'Demo account cannot edit another school website.' });
    }
    const school = await School.findById(req.params.schoolId);
    if (!school) return res.status(404).json({ success: false, message: 'School not found.' });
    const profile = await ensureProfileForSchool(school);
    const allowed = [
      'siteStatus', 'primaryLanguage', 'enabledLanguages', 'primaryColor', 'schoolLogoUrl', 'ministryLogoUrl',
      'heroImageUrl', 'brandName', 'brandSubtitle', 'homeHeroBadge', 'homeHeroTitle', 'homeHeroText',
      'aboutTitle', 'aboutBody', 'missionTitle', 'missionBody', 'visionTitle', 'visionBody',
      'contactTitle', 'contactText', 'contactPhone', 'contactEmail', 'contactAddress',
      'features', 'stats', 'menuItems', 'footerLinks', 'footerNote', 'metadata'
    ];
    allowed.forEach((key) => {
      if (req.body && Object.prototype.hasOwnProperty.call(req.body, key)) profile[key] = req.body[key];
    });
    if (req.body?.slug) profile.slug = slugify(req.body.slug);
    await profile.save();
    return res.json({ success: true, profile, message: 'School website profile saved.' });
  } catch (error) {
    const status = error?.code === 11000 ? 409 : 500;
    return res.status(status).json({ success: false, message: 'Failed to save school website profile.' });
  }
});

router.post('/contact', async (req, res) => {
  try {
    const profile = await resolveProfile(req.body?.slug || req.query?.slug || '');
    if (!profile) return res.status(404).json({ success: false, message: 'School website was not found.' });
    const message = String(req.body?.message || '').trim();
    if (!message) return res.status(400).json({ success: false, message: 'Message is required.' });
    const item = await ContactMessage.create({
      schoolId: profile.schoolId,
      name: String(req.body?.name || '').trim(),
      phone: String(req.body?.phone || '').trim(),
      email: String(req.body?.email || '').trim(),
      message,
      type: ['suggestion', 'complaint'].includes(String(req.body?.type || '').trim()) ? req.body.type : 'contact'
    });
    return res.json({ success: true, item, message: 'Message saved.' });
  } catch {
    return res.status(500).json({ success: false, message: 'Failed to save message.' });
  }
});

module.exports = router;
