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

const isPublicWebsitePath = (pathname = '') => {
  const path = String(pathname || '/');
  return path === '/'
    || path === '/about'
    || path === '/contact'
    || path.startsWith('/schools/');
};

const mergeSchoolWebsiteSettings = (settings, profile) => {
  if (!profile) return settings;
  return {
    ...(settings || {}),
    ...profile,
    isSchoolWebsite: true,
    languages: ['فارسی', 'English', 'پشتو'],
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
      const [settingsResponse, profileResponse] = await Promise.all([
        fetch(`${API_BASE}/api/settings/public`),
        shouldLoadSchoolProfile
          ? fetch(`${API_BASE}/api/school-websites/public?slug=${encodeURIComponent(schoolSlug)}&lang=${encodeURIComponent(language)}`)
          : Promise.resolve(null)
      ]);
      const data = await settingsResponse.json();
      const profileData = profileResponse ? await profileResponse.json().catch(() => ({})) : {};
      setSettings(mergeSchoolWebsiteSettings(data?.settings || null, profileData?.profile || null));
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
