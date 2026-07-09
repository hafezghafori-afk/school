import { API_BASE } from '../config/api';

export const toAssetUrl = (value = '') => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (/^(https?:)?\/\//i.test(raw) || raw.startsWith('data:')) return raw;
  return `${API_BASE}/${raw.replace(/^\/+/, '')}`;
};

export const getPrintLogoUrls = (settings = {}) => ({
  schoolLogoUrl: toAssetUrl(settings?.schoolLogoUrl || settings?.logoUrl || ''),
  ministryLogoUrl: toAssetUrl(settings?.ministryLogoUrl || '')
});
