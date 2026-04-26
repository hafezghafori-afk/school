import React, { useEffect, useState } from 'react';

import { API_BASE } from '../config/api';
import LoginModernBase from './LoginModernBase';

const DEFAULT_LOGIN_SETTINGS = {
  logo: null,
  logoText: 'سیستم آموزشی',
  title: 'ورود به سیستم آموزشی',
  subtitle: 'از یک درگاه عمومی وارد شوید و به داشبورد متناسب با نقش خود بروید.',
  footerText: '© 2026 سیستم آموزشی. تمام حقوق محفوظ است.',
  backgroundColor: 'linear-gradient(135deg, #083344 0%, #0f766e 30%, #1d4ed8 68%, #f59e0b 100%)',
  primaryColor: '#0f766e',
  showRegistrationLink: true,
  customMessage: ''
};

export default function LoginPageEnhanced() {
  const [loginSettings, setLoginSettings] = useState(DEFAULT_LOGIN_SETTINGS);
  const [loadingSettings, setLoadingSettings] = useState(true);

  useEffect(() => {
    let mounted = true;

    const fetchLoginSettings = async () => {
      try {
        const response = await fetch(`${API_BASE}/api/settings/login-page`);
        if (!response.ok) return;

        const data = await response.json();
        if (!mounted || !data?.success) return;

        setLoginSettings((current) => ({
          ...current,
          ...data.settings
        }));
      } catch (error) {
        console.log('Failed to load login settings, using defaults', error);
      } finally {
        if (mounted) {
          setLoadingSettings(false);
        }
      }
    };

    fetchLoginSettings();

    return () => {
      mounted = false;
    };
  }, []);

  return (
    <LoginModernBase
      title={loginSettings.title}
      subtitle={loginSettings.subtitle}
      gradientOverride={loginSettings.primaryColor}
      backgroundStyle={loginSettings.backgroundColor ? { background: loginSettings.backgroundColor } : undefined}
      customMessage={loginSettings.customMessage}
      footerText={loginSettings.footerText}
      showRegistrationLink={loginSettings.showRegistrationLink}
      logoSrc={loginSettings.logo || ''}
      logoAlt={loginSettings.logoText || 'لوگوی صفحه ورود'}
      settingsLoading={loadingSettings}
    />
  );
}
