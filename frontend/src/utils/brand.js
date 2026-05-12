export const BRAND_NAME = 'سیما';
export const BRAND_SUBTITLE = 'سیستم مدیریت هوشمند مکاتیب افغانستان';

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
