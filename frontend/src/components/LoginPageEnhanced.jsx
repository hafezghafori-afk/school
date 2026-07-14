import React, { useEffect, useState } from 'react';

import { API_BASE } from '../config/api';
import LoginModernBase from './LoginModernBase';

const DEFAULT_LOGIN_SETTINGS = {
  logo: null,
  logoText: 'Iman Girls School',
  title: 'ورود به سیستم',
  subtitle: 'با حساب مکتب دخترانه ایمان وارد داشبورد مربوط به نقش خود شوید.',
  footerText: '© 2026 Iman Girls School. تمام حقوق محفوظ است.',
  backgroundColor: 'linear-gradient(135deg, rgba(109, 74, 255, 0.95), rgba(243, 166, 200, 0.92))',
  primaryColor: '#6d4aff',
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
