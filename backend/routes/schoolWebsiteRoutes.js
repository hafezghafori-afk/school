const express = require('express');
const mongoose = require('mongoose');

const School = require('../models/School');
const SchoolWebsiteProfile = require('../models/SchoolWebsiteProfile');
const ContactMessage = require('../models/ContactMessage');
const { requireAuth, requireRole, requirePermission } = require('../middleware/auth');
const { getSchoolWebsiteLocale } = require('../config/schoolWebsiteLocales');

const router = express.Router();

const SUPPORTED_LANGUAGES = ['fa', 'en', 'ps'];
const TRANSLATABLE_TEXT_FIELDS = [
  'brandName', 'brandSubtitle', 'homeHeroBadge', 'homeHeroTitle', 'homeHeroText',
  'aboutTitle', 'aboutBody', 'missionTitle', 'missionBody', 'visionTitle', 'visionBody',
  'contactTitle', 'contactText', 'contactAddress', 'footerNote'
];
const TRANSLATABLE_LIST_FIELDS = ['features', 'stats', 'menuItems', 'footerLinks', 'socialLinks'];

const TRANSLATION_MEMORY = {
  en: {
    'خانه': 'Home',
    'امکانات': 'Facilities',
    'درباره مکتب': 'About school',
    'تماس': 'Contact',
    'تماس با مکتب': 'Contact school',
    'ورود به سیستم': 'Login',
    'وب‌سایت رسمی مکتب': 'Official school website',
    'ماموریت': 'Mission',
    'چشم‌انداز': 'Vision',
    'شاگردان': 'Students',
    'استادان': 'Teachers',
    'صنف‌ها': 'Classes',
    'مدیریت آموزشی': 'Academic management',
    'امور مالی': 'Finance',
    'ارتباط با خانواده': 'Family communication',
    'برای معلومات بیشتر، پیشنهاد یا پیام رسمی با اداره مکتب تماس بگیرید.': 'For more information, suggestions, or official messages, contact the school office.'
  },
  ps: {
    'خانه': 'کور',
    'امکانات': 'امکانات',
    'درباره مکتب': 'د ښوونځي په اړه',
    'تماس': 'اړیکه',
    'تماس با مکتب': 'له ښوونځي سره اړیکه',
    'ورود به سیستم': 'سیستم ته ننوتل',
    'وب‌سایت رسمی مکتب': 'د ښوونځي رسمي وېب‌پاڼه',
    'ماموریت': 'ماموریت',
    'چشم‌انداز': 'لیدلوری',
    'شاگردان': 'زده کوونکي',
    'استادان': 'ښوونکي',
    'صنف‌ها': 'صنفونه',
    'مدیریت آموزشی': 'تعلیمي مدیریت',
    'امور مالی': 'مالي چارې',
    'ارتباط با خانواده': 'له کورنۍ سره اړیکه',
    'برای معلومات بیشتر، پیشنهاد یا پیام رسمی با اداره مکتب تماس بگیرید.': 'د نورو معلوماتو، وړاندیزونو یا رسمي پیغامونو لپاره د ښوونځي له ادارې سره اړیکه ونیسئ.'
  },
  fa: {}
};

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

const EMPTY_SLUG_VALUES = new Set([
  'ندارد',
  'نداشته',
  'نامشخص',
  'بدون',
  'none',
  'no',
  'n-a',
  'na',
  'n/a',
  'null',
  'undefined',
  '-'
]);

const normalizeSlugSource = (value = '') => String(value || '')
  .trim()
  .toLowerCase()
  .replace(/\s+/g, ' ');

const isEmptySlugSource = (value = '') => {
  const text = normalizeSlugSource(value);
  if (!text) return true;
  return EMPTY_SLUG_VALUES.has(text) || EMPTY_SLUG_VALUES.has(slugify(text));
};

const pickSlugSource = (school = {}) => [
  school.schoolCode,
  school.nameDari,
  school.name,
  school.namePashto,
  school.contactInfo?.website,
  school._id
].find((value) => !isEmptySlugSource(value));

const buildSchoolSlug = (school = {}) => slugify(pickSlugSource(school) || school._id || '');

const makeUniqueSlug = async (baseSlug, currentProfileId = null) => {
  const fallbackSlug = slugify(baseSlug);
  let slug = fallbackSlug;
  let suffix = 1;
  const filterFor = (candidate) => ({
    slug: candidate,
    ...(currentProfileId ? { _id: { $ne: currentProfileId } } : {})
  });

  while (await SchoolWebsiteProfile.exists(filterFor(slug))) {
    suffix += 1;
    slug = `${fallbackSlug}-${suffix}`;
  }
  return slug;
};

const pickText = (value = {}, lang = 'fa', fallback = '') => {
  if (typeof value === 'string') return value;
  return String(value?.[lang] || value?.fa || value?.en || value?.ps || fallback || '').trim();
};

const translateText = (text = '', targetLanguage = 'en') => {
  const source = String(text || '').trim();
  if (!source) return '';
  const memory = TRANSLATION_MEMORY[targetLanguage] || {};
  if (memory[source]) return memory[source];
  let translated = source;
  Object.entries(memory)
    .sort((a, b) => b[0].length - a[0].length)
    .forEach(([from, to]) => {
      translated = translated.split(from).join(to);
    });
  return translated;
};

const translateLocalizedText = (value = {}, sourceLanguage = 'fa', targetLanguages = ['en', 'ps'], overwrite = false) => {
  const next = {
    fa: String(value?.fa || ''),
    en: String(value?.en || ''),
    ps: String(value?.ps || '')
  };
  const sourceText = next[sourceLanguage] || pickText(next, sourceLanguage);
  targetLanguages.forEach((language) => {
    if (!SUPPORTED_LANGUAGES.includes(language) || language === sourceLanguage) return;
    if (!overwrite && String(next[language] || '').trim()) return;
    next[language] = translateText(sourceText, language);
  });
  return next;
};

const translateProfileContent = (profile, sourceLanguage = 'fa', targetLanguages = ['en', 'ps'], overwrite = false) => {
  TRANSLATABLE_TEXT_FIELDS.forEach((field) => {
    profile[field] = translateLocalizedText(profile[field] || {}, sourceLanguage, targetLanguages, overwrite);
  });

  TRANSLATABLE_LIST_FIELDS.forEach((field) => {
    profile[field] = (Array.isArray(profile[field]) ? profile[field] : []).map((item) => ({
      ...item,
      title: translateLocalizedText(item?.title || {}, sourceLanguage, targetLanguages, overwrite),
      text: translateLocalizedText(item?.text || {}, sourceLanguage, targetLanguages, overwrite)
    }));
  });
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
    slug: buildSchoolSlug(school),
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
  if (profile) {
    if (isEmptySlugSource(profile.slug)) {
      profile.slug = await makeUniqueSlug(buildSchoolSlug(school), profile._id);
      await profile.save();
    }
    return profile;
  }

  const fallback = buildFallbackProfile(school);
  const slug = await makeUniqueSlug(fallback.slug);
  profile = await SchoolWebsiteProfile.create({ ...fallback, slug });
  return profile;
};

const repairProfileSlugIfNeeded = async (profile) => {
  if (!profile || !isEmptySlugSource(profile.slug)) return profile;
  const school = profile.schoolId ? await School.findById(profile.schoolId) : null;
  if (!school) return profile;
  profile.slug = await makeUniqueSlug(buildSchoolSlug(school), profile._id);
  await profile.save();
  return profile;
};

const resolveProfile = async (slug = '') => {
  const cleanSlug = slugify(slug);
  if (slug) {
    const direct = await SchoolWebsiteProfile.findOne({ slug: cleanSlug, siteStatus: 'active' });
    if (direct) return repairProfileSlugIfNeeded(direct);
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
  if (existing) return repairProfileSlugIfNeeded(existing);
  const school = await School.findOne().sort({ createdAt: -1 });
  return school ? ensureProfileForSchool(school) : null;
};

const pickSchoolName = (school, language = 'fa') => {
  if (!school) return '';
  if (language === 'ps') return school.namePashto || school.nameDari || school.name || '';
  if (language === 'en') return school.name || school.nameDari || school.namePashto || '';
  return school.nameDari || school.name || school.namePashto || '';
};

const serializeProfile = (profile, lang = 'fa', school = null) => {
  if (!profile) return null;
  const language = normalizeLanguage(lang || profile.primaryLanguage);
  const locale = getSchoolWebsiteLocale(language);
  const basePath = `/schools/${profile.slug}`;
  const withLanguage = (href) => (language === 'fa' ? href : `${href}${href.includes('?') ? '&' : '?'}lang=${language}`);
  const officialSchoolName = pickSchoolName(school, language);
  const officialContact = school?.contactInfo || {};
  const contactAddress = officialContact.address || pickText(profile.contactAddress, language);
  const contactPhone = officialContact.phone || officialContact.mobile || profile.contactPhone || '';
  const contactEmail = officialContact.email || profile.contactEmail || '';
  const schoolLogoUrl = profile.schoolLogoUrl || school?.logoUrl || school?.schoolLogoUrl || school?.logo || '';
  return {
    id: String(profile._id),
    schoolId: String(profile.schoolId || ''),
    slug: profile.slug,
    language,
    enabledLanguages: profile.enabledLanguages || SUPPORTED_LANGUAGES,
    publicBasePath: basePath,
    primaryColor: profile.primaryColor || '#0f766e',
    logoUrl: schoolLogoUrl,
    schoolLogoUrl,
    ministryLogoUrl: profile.ministryLogoUrl || '',
    heroImageUrl: profile.heroImageUrl || '',
    brandName: officialSchoolName || pickText(profile.brandName, language, 'مکتب'),
    brandSubtitle: pickText(profile.brandSubtitle, language, ''),
    homeHeroBadge: pickText(profile.homeHeroBadge, language),
    homeHeroTitle: pickText(profile.homeHeroTitle, language),
    homeHeroText: pickText(profile.homeHeroText, language),
    homeHeroPrimaryLabel: locale.contactUs,
    homeHeroPrimaryHref: withLanguage(`${basePath}/contact`),
    homeHeroSecondaryLabel: locale.login,
    homeHeroSecondaryHref: '/login',
    homeCtaTitle: locale.contactOffice,
    homeCtaText: pickText(profile.contactText, language),
    homeCtaLabel: locale.sendMessage,
    homeCtaHref: withLanguage(`${basePath}/contact`),
    aboutTitle: pickText(profile.aboutTitle, language),
    aboutBody: pickText(profile.aboutBody, language),
    missionTitle: pickText(profile.missionTitle, language),
    missionBody: pickText(profile.missionBody, language),
    visionTitle: pickText(profile.visionTitle, language),
    visionBody: pickText(profile.visionBody, language),
    contactTitle: pickText(profile.contactTitle, language),
    contactText: pickText(profile.contactText, language),
    contactPhone,
    contactEmail,
    contactAddress,
    salesQuickCards: localizeItems(profile.features, language),
    salesModules: localizeItems(profile.features, language),
    homeStats: localizeItems(profile.stats, language),
    footerLinks: localizeItems(profile.footerLinks, language).length
      ? localizeItems(profile.footerLinks, language)
      : [
          { title: locale.home, href: withLanguage(basePath) },
          { title: locale.facilities, href: withLanguage(`${basePath}/features`) },
          { title: locale.about, href: withLanguage(`${basePath}/about`) },
          { title: locale.contact, href: withLanguage(`${basePath}/contact`) },
          { title: locale.login, href: '/login' }
        ],
    mainMenu: localizeItems(profile.menuItems, language).length
      ? localizeItems(profile.menuItems, language).map((item) => ({
          ...item,
          href: item.href?.startsWith('/schools/') ? withLanguage(item.href.split('?')[0]) : item.href,
          enabled: true
        }))
      : [
          { title: locale.home, href: withLanguage(basePath), icon: 'fa-house', enabled: true },
          { title: locale.facilities, href: withLanguage(`${basePath}/features`), icon: 'fa-layer-group', enabled: true },
          { title: locale.aboutSchool, href: withLanguage(`${basePath}/about`), icon: 'fa-circle-info', enabled: true },
          { title: locale.contact, href: withLanguage(`${basePath}/contact`), icon: 'fa-phone', enabled: true }
        ],
    footerContactTitle: locale.schoolContact,
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
    const school = profile.schoolId ? await School.findById(profile.schoolId).lean() : null;
    return res.json({ success: true, profile: serializeProfile(profile, req.query.lang, school) });
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

router.get('/admin/primary', requireAuth, requireRole(['admin']), requirePermission('manage_content'), async (req, res) => {
  try {
    if (req.user?.schoolId) {
      const school = await School.findById(req.user.schoolId);
      if (school) {
        const profile = await ensureProfileForSchool(school);
        return res.json({ success: true, profile });
      }
    }

    const existing = await SchoolWebsiteProfile.findOne({ siteStatus: 'active' }).sort({ updatedAt: -1 });
    if (existing) return res.json({ success: true, profile: existing });

    const school = await School.findOne().sort({ createdAt: -1 });
    const profile = school ? await ensureProfileForSchool(school) : null;
    return res.json({ success: true, profile });
  } catch {
    return res.status(500).json({ success: false, message: 'Failed to load school website profile.' });
  }
});

router.post('/admin/:schoolId/translate', requireAuth, requireRole(['admin']), requirePermission('manage_content'), async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.schoolId)) {
      return res.status(400).json({ success: false, message: 'Invalid school id.' });
    }
    if (req.user?.isDemo === true && String(req.user.schoolId || '') !== String(req.params.schoolId || '')) {
      return res.status(403).json({ success: false, message: 'Demo account cannot edit another school website.' });
    }

    const profile = await SchoolWebsiteProfile.findOne({ schoolId: req.params.schoolId });
    if (!profile) return res.status(404).json({ success: false, message: 'School website profile was not found.' });

    const sourceLanguage = normalizeLanguage(req.body?.sourceLanguage || 'fa');
    const targetLanguages = (Array.isArray(req.body?.targetLanguages) ? req.body.targetLanguages : SUPPORTED_LANGUAGES)
      .map(normalizeLanguage)
      .filter((language, index, list) => SUPPORTED_LANGUAGES.includes(language) && language !== sourceLanguage && list.indexOf(language) === index);
    const overwrite = req.body?.overwrite === true;

    translateProfileContent(profile, sourceLanguage, targetLanguages, overwrite);
    await profile.save();
    return res.json({ success: true, profile, message: 'School website content translated.' });
  } catch {
    return res.status(500).json({ success: false, message: 'Failed to translate school website content.' });
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
      'features', 'stats', 'menuItems', 'footerLinks', 'socialLinks', 'footerNote', 'metadata'
    ];
    allowed.forEach((key) => {
      if (req.body && Object.prototype.hasOwnProperty.call(req.body, key)) profile[key] = req.body[key];
    });
    if (req.body?.slug && !isEmptySlugSource(req.body.slug)) profile.slug = slugify(req.body.slug);
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
