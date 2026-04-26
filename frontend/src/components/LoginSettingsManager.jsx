import React, { useState, useEffect } from 'react';
import { API_BASE } from '../config/api';
import './LoginSettingsManager.css';

const LoginSettingsManager = () => {
  const [settings, setSettings] = useState({
    logo: null,
    logoText: 'سیستم آموزشی',
    title: 'ورود به سیستم آموزشی',
    subtitle: 'به پلتفرم مدیریت آموزشی خوش آمدید',
    footerText: '© 2026 سیستم آموزشی. تمام حقوق محفوظ است.',
    backgroundColor: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    primaryColor: '#667eea',
    showRegistrationLink: true,
    customMessage: ''
  });
  
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [logoPreview, setLogoPreview] = useState(null);
  const [logoFile, setLogoFile] = useState(null);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/api/login-settings`);
      const data = await response.json();
      if (data.success) {
        setSettings(data.settings);
        setLogoPreview(data.settings.logo);
      }
    } catch (error) {
      setMessage('خطا در دریافت تنظیمات');
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (field, value) => {
    setSettings(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleLogoChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setLogoFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setLogoPreview(reader.result);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setMessage('');

    try {
      const formData = new FormData();
      
      // Add logo file if changed
      if (logoFile) {
        formData.append('logo', logoFile);
      }
      
      // Add other settings
      Object.keys(settings).forEach(key => {
        if (key !== 'logo') {
          formData.append(key, settings[key]);
        }
      });

      const response = await fetch(`${API_BASE}/api/login-settings`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: formData
      });

      const data = await response.json();
      
      if (data.success) {
        setMessage('تنظیمات با موفقیت ذخیره شد');
        setLogoFile(null); // Clear file after successful upload
        
        // Update local state with server response
        setSettings(prev => ({
          ...prev,
          ...data.settings
        }));
        
        setLogoPreview(data.settings.logo);
      } else {
        setMessage(data.message || 'خطا در ذخیره تنظیمات');
      }
    } catch (error) {
      console.error('Submit error:', error);
      setMessage('خطا در اتصال به سرور');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteLogo = async () => {
    if (!confirm('آیا از حذف لوگو مطمئن هستید؟')) return;
    
    try {
      const response = await fetch(`${API_BASE}/api/login-settings/logo`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });

      const data = await response.json();
      
      if (data.success) {
        setSettings(prev => ({ ...prev, logo: null }));
        setLogoPreview(null);
        setLogoFile(null);
        setMessage('لوگو با موفقیت حذف شد');
      } else {
        setMessage(data.message || 'خطا در حذف لوگو');
      }
    } catch (error) {
      setMessage('خطا در اتصال به سرور');
    }
  };

  const resetToDefaults = () => {
    if (!confirm('آیا از بازگشت به تنظیمات پیش‌فرض مطمئن هستید؟')) return;
    
    setSettings({
      logo: null,
      logoText: 'سیستم آموزشی',
      title: 'ورود به سیستم آموزشی',
      subtitle: 'به پلتفرم مدیریت آموزشی خوش آمدید',
      footerText: '© 2026 سیستم آموزشی. تمام حقوق محفوظ است.',
      backgroundColor: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      primaryColor: '#667eea',
      showRegistrationLink: true,
      customMessage: ''
    });
    setLogoPreview(null);
    setLogoFile(null);
    setMessage('تنظیمات به حالت پیش‌فرض بازگشت');
  };

  if (loading) {
    return (
      <div className="login-settings-manager">
        <div className="loading-spinner">
          <div className="spinner"></div>
          <p>در حال بارگذاری تنظیمات...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="login-settings-manager">
      <div className="settings-header">
        <h2>🎨 مدیریت تنظیمات صفحه ورود</h2>
        <p>شخصی‌سازی ظاهر و متن‌های صفحه ورود به سیستم</p>
      </div>

      {message && (
        <div className={`message ${message.includes('خطا') ? 'error' : 'success'}`}>
          {message}
        </div>
      )}

      <form onSubmit={handleSubmit} className="settings-form">
        <div className="settings-grid">
          {/* Logo Section */}
          <div className="form-section">
            <h3>🖼️ لوگو</h3>
            <div className="logo-upload">
              <div className="logo-preview">
                {logoPreview ? (
                  <img src={logoPreview} alt="Logo Preview" />
                ) : (
                  <div className="no-logo">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                      <circle cx="8.5" cy="8.5" r="1.5"></circle>
                      <polyline points="21,15 16,10 5,21"></polyline>
                    </svg>
                    <span>لوگو بارگذاری نشده</span>
                  </div>
                )}
              </div>
              <div className="logo-controls">
                <input
                  type="file"
                  id="logo-upload"
                  accept="image/*"
                  onChange={handleLogoChange}
                  className="file-input"
                />
                <label htmlFor="logo-upload" className="upload-btn">
                  انتخاب لوگو
                </label>
                {logoPreview && (
                  <button type="button" onClick={handleDeleteLogo} className="delete-btn">
                    حذف لوگو
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Text Settings */}
          <div className="form-section">
            <h3>📝 تنظیمات متنی</h3>
            <div className="form-group">
              <label>متن جایگزین لوگو</label>
              <input
                type="text"
                value={settings.logoText}
                onChange={(e) => handleInputChange('logoText', e.target.value)}
                placeholder="متن جایگزین لوگو"
              />
            </div>
            <div className="form-group">
              <label>عنوان صفحه</label>
              <input
                type="text"
                value={settings.title}
                onChange={(e) => handleInputChange('title', e.target.value)}
                placeholder="عنوان صفحه ورود"
              />
            </div>
            <div className="form-group">
              <label>زیرنویس</label>
              <textarea
                value={settings.subtitle}
                onChange={(e) => handleInputChange('subtitle', e.target.value)}
                placeholder="زیرنویس صفحه ورود"
                rows={2}
              />
            </div>
            <div className="form-group">
              <label>پیام سفارشی</label>
              <textarea
                value={settings.customMessage}
                onChange={(e) => handleInputChange('customMessage', e.target.value)}
                placeholder="پیام سفارشی برای نمایش در صفحه ورود"
                rows={3}
              />
            </div>
            <div className="form-group">
              <label>متن فوتر</label>
              <input
                type="text"
                value={settings.footerText}
                onChange={(e) => handleInputChange('footerText', e.target.value)}
                placeholder="متن فوتر"
              />
            </div>
          </div>

          {/* Color Settings */}
          <div className="form-section">
            <h3>🎨 تنظیمات رنگی</h3>
            <div className="form-group">
              <label>رنگ اصلی</label>
              <div className="color-input-group">
                <input
                  type="color"
                  value={settings.primaryColor}
                  onChange={(e) => handleInputChange('primaryColor', e.target.value)}
                />
                <input
                  type="text"
                  value={settings.primaryColor}
                  onChange={(e) => handleInputChange('primaryColor', e.target.value)}
                  placeholder="#667eea"
                />
              </div>
            </div>
            <div className="form-group">
              <label>پس‌زمینه (CSS Gradient)</label>
              <textarea
                value={settings.backgroundColor}
                onChange={(e) => handleInputChange('backgroundColor', e.target.value)}
                placeholder="linear-gradient(135deg, #667eea 0%, #764ba2 100%)"
                rows={3}
              />
            </div>
          </div>

          {/* Functional Settings */}
          <div className="form-section">
            <h3>⚙️ تنظیمات عملکردی</h3>
            <div className="form-group">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={settings.showRegistrationLink}
                  onChange={(e) => handleInputChange('showRegistrationLink', e.target.checked)}
                />
                نمایش لینک ثبت‌نام
              </label>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="form-actions">
          <button type="submit" disabled={saving} className="save-btn">
            {saving ? 'در حال ذخیره...' : '💾 ذخیره تنظیمات'}
          </button>
          <button type="button" onClick={resetToDefaults} className="reset-btn">
            🔄 بازگشت به پیش‌فرض
          </button>
          <button 
            type="button" 
            onClick={() => window.open('/login', '_blank')} 
            className="preview-btn"
          >
            👁️ پیش‌نمایش صفحه ورود
          </button>
        </div>
      </form>
    </div>
  );
};

export default LoginSettingsManager;
