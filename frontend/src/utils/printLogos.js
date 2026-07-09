import { API_BASE } from '../config/api';

const PRINT_LOGOS_STORAGE_KEY = 'officialPrintLogos';

export const toAssetUrl = (value = '') => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (/^(https?:)?\/\//i.test(raw) || raw.startsWith('data:')) return raw;
  const assetPath = `/${raw.replace(/^\/+/, '')}`;
  const base = String(API_BASE || '').replace(/\/+$/, '').replace(/\/api$/i, '');
  return `${base}${assetPath}`;
};

export const readStoredPrintLogos = () => {
  if (typeof window === 'undefined') return {};
  try {
    const parsed = JSON.parse(window.localStorage.getItem(PRINT_LOGOS_STORAGE_KEY) || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
};

export const storePrintLogos = (settings = {}) => {
  if (typeof window === 'undefined') return;
  const stored = readStoredPrintLogos();
  const payload = {
    schoolLogoUrl: settings?.schoolLogoUrl || settings?.logoUrl || stored.schoolLogoUrl || '',
    ministryLogoUrl: settings?.ministryLogoUrl || stored.ministryLogoUrl || ''
  };
  try {
    window.localStorage.setItem(PRINT_LOGOS_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Ignore storage failures; database settings remain the source of truth.
  }
};

export const getPrintLogoUrls = (settings = {}) => {
  const stored = readStoredPrintLogos();
  return {
    schoolLogoUrl: toAssetUrl(settings?.schoolLogoUrl || settings?.logoUrl || stored.schoolLogoUrl || ''),
    ministryLogoUrl: toAssetUrl(settings?.ministryLogoUrl || stored.ministryLogoUrl || '')
  };
};
