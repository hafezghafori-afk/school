import { useEffect, useState } from 'react';
import { API_BASE } from '../config/api';

export default function useSiteSettings() {
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(false);

  const fetchSettings = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/settings/public`);
      const data = await res.json();
      setSettings(data?.settings || null);
    } catch (error) {
      setSettings(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  return { settings, loading, refresh: fetchSettings };
}
