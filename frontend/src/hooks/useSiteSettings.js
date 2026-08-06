import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { API_BASE } from '../config/api';
import { getPublicWebsiteLocale } from '../i18n/publicWebsite';

export const PUBLIC_WEBSITE_LANGUAGE_KEY = 'publicWebsiteLanguage';

const normalizeLanguage = (value = '') => {
  const text = String(value || '').trim().toLowerCase();
  if (['en', 'english'].includes(text)) return 'en';
  if (['ps', 'pa', 'pashto'].includes(text)) return 'ps';
  return 'fa';
};

const getStoredLanguage = () => {
  if (typeof window === 'undefined') return 'fa';
  return normalizeLanguage(window.localStorage.getItem(PUBLIC_WEBSITE_LANGUAGE_KEY) || 'fa');
};

const getUrlLanguage = (search = '') => {
  try {
    return normalizeLanguage(new URLSearchParams(search || '').get('lang') || '');
  } catch {
    return '';
  }
};

const extractSchoolSlug = (pathname = '') => {
  const match = String(pathname || '').match(/^\/schools\/([^/]+)/);
  return match ? decodeURIComponent(match[1]) : '';
};

const getAuthHeaders = () => {
  try {
    const token = window.localStorage.getItem('token');
    return token ? { Authorization: `Bearer ${token}` } : {};
  } catch {
    return {};
  }
};

const isPublicWebsitePath = (pathname = '') => {
  const path = String(pathname || '/');
  return path === '/'
    || path === '/login'
    || path === '/about'
    || path === '/contact'
    || path === '/news'
    || path.startsWith('/news/')
    || path === '/gallery'
    || path.startsWith('/schools/');
};

const pickSchoolName = (school, language = 'fa') => {
  if (!school) return '';
  if (language === 'ps') return school.namePashto || school.nameDari || school.name || '';
  if (language === 'en') return school.name || school.nameDari || school.namePashto || '';
  return school.nameDari || school.name || school.namePashto || '';
};

const mergeSchoolWebsiteSettings = (settings, profile, activeSchool, language = 'fa') => {
  const schoolName = pickSchoolName(activeSchool, language);
  const schoolContact = activeSchool?.contactInfo || {};
  const officialLogo = settings?.schoolLogoUrl || settings?.logoUrl || profile?.schoolLogoUrl || profile?.logoUrl || '';
  if (!profile) {
    return {
      ...(settings || {}),
      brandName: schoolName || settings?.brandName,
      schoolLogoUrl: officialLogo || settings?.schoolLogoUrl || settings?.logoUrl || '',
      logoUrl: officialLogo || settings?.logoUrl || settings?.schoolLogoUrl || '',
      contactPhone: schoolContact.phone || schoolContact.mobile || settings?.contactPhone || '',
      contactEmail: schoolContact.email || settings?.contactEmail || '',
      contactAddress: schoolContact.address || settings?.contactAddress || ''
    };
  }
  return {
    ...(settings || {}),
    ...profile,
    isSchoolWebsite: true,
    languages: ['فارسی', 'English', 'پشتو'],
    brandName: schoolName || profile.brandName || settings?.brandName,
    schoolLogoUrl: officialLogo || '',
    logoUrl: officialLogo || '',
    contactPhone: schoolContact.phone || schoolContact.mobile || profile.contactPhone || settings?.contactPhone || '',
    contactEmail: schoolContact.email || profile.contactEmail || settings?.contactEmail || '',
    contactAddress: schoolContact.address || profile.contactAddress || settings?.contactAddress || '',
    mainMenu: profile.mainMenu || settings?.mainMenu || [],
    footerLinks: profile.footerLinks || settings?.footerLinks || [],
    socialLinks: profile.socialLinks || settings?.socialLinks || []
  };
};

export default function useSiteSettings() {
  const location = useLocation();
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(false);
  const [language, setLanguage] = useState(() => (
    (typeof window !== 'undefined' ? getUrlLanguage(window.location?.search || '') : '') || getStoredLanguage()
  ));
  const schoolSlug = useMemo(() => extractSchoolSlug(location.pathname), [location.pathname]);
  const shouldLoadSchoolProfile = useMemo(() => isPublicWebsitePath(location.pathname), [location.pathname]);

  const fetchSettings = async () => {
    setLoading(true);
    try {
      // The active-school lookup used to run AFTER the other two requests
      // resolved instead of alongside them, so the page title/logo showed
      // the generic app name for as long as both round trips took, back to
      // back, instead of just the slower of the two. Every page load hits
      // this, not just the public site.
      const [settingsResponse, profileResponse, activeSchoolResponse] = await Promise.all([
        fetch(`${API_BASE}/api/settings/public`),
        shouldLoadSchoolProfile
          ? fetch(`${API_BASE}/api/school-websites/public?slug=${encodeURIComponent(schoolSlug)}&lang=${encodeURIComponent(language)}`)
          : Promise.resolve(null),
        fetch(`${API_BASE}/api/afghan-schools/active`, {
          headers: { ...getAuthHeaders() }
        }).catch(() => null)
      ]);
      const data = await settingsResponse.json();
      const profileData = profileResponse ? await profileResponse.json().catch(() => ({})) : {};
      const activeSchoolData = activeSchoolResponse ? await activeSchoolResponse.json().catch(() => ({})) : {};
      setSettings(mergeSchoolWebsiteSettings(
        data?.settings || null,
        profileData?.profile || null,
        activeSchoolData?.data?.school || null,
        language
      ));
    } catch (error) {
      setSettings(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, [schoolSlug, language, shouldLoadSchoolProfile]);

  useEffect(() => {
    const urlLanguage = getUrlLanguage(location.search);
    if (urlLanguage && urlLanguage !== language) {
      setLanguage(urlLanguage);
      try {
        window.localStorage.setItem(PUBLIC_WEBSITE_LANGUAGE_KEY, urlLanguage);
      } catch {
        // ignore storage issues
      }
    }
  }, [location.search, language]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const handleLanguageChange = (event) => {
      setLanguage(normalizeLanguage(event?.detail?.language || getStoredLanguage()));
    };
    window.addEventListener('publicWebsiteLanguageChange', handleLanguageChange);
    return () => window.removeEventListener('publicWebsiteLanguageChange', handleLanguageChange);
  }, []);

  return { settings, loading, language, locale: getPublicWebsiteLocale(language), refresh: fetchSettings };
}
