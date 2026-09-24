// What the page title, headers and printed cards show while the site settings
// haven't loaded, or when they fail to. This is the school's own name: the
// platform's product name used to be here and leaked into search results.
export const BRAND_NAME = 'مدرسه اناثیه ایمان';
export const BRAND_SUBTITLE = '';

const legacyBrandNames = new Set([
  'مدرسه ایمان',
  'سیستم مدیریت هوشمند مکتب'
]);

const legacyBrandSubtitles = new Set([
  'Academy Pro',
  'نرم‌افزار مدیریت مکاتب افغانستان'
]);

export const normalizeBrandName = (value) => {
  const text = String(value || '').trim();
  return text && !legacyBrandNames.has(text) ? text : BRAND_NAME;
};

export const normalizeBrandSubtitle = (value) => {
  const text = String(value || '').trim();
  return text && !legacyBrandSubtitles.has(text) ? text : BRAND_SUBTITLE;
};
