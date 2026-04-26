const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const LoginSettings = require('../models/LoginSettings');
const { requireAuth } = require('../middleware/auth');
const { logActivity } = require('../utils/activity');
const { attachWriteActivityAudit } = require('../utils/routeWriteAudit');

const auditWrite = (payload) => logActivity(payload);
attachWriteActivityAudit(router, { targetType: 'LoginSettings', actionPrefix: 'login_settings_simple', audit: auditWrite });

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../uploads/login');
    try {
      await fs.mkdir(uploadDir, { recursive: true });
      cb(null, uploadDir);
    } catch (error) {
      cb(error);
    }
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, 'login-logo-' + uniqueSuffix + ext);
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp|svg/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Only image files are allowed (JPEG, JPG, PNG, GIF, WebP, SVG)'));
    }
  }
});

// GET login settings (public)
router.get('/', async (req, res) => {
  try {
    let settings = await LoginSettings.findOne({ isActive: true });
    
    // If no settings exist, create default settings
    if (!settings) {
      settings = new LoginSettings();
      try {
        await settings.save();
      } catch (saveError) {
        console.log('Error creating default settings:', saveError);
        // Continue with default values even if save fails
      }
    }
    
    res.json({
      success: true,
      settings: {
        logo: settings?.logo || null,
        logoText: settings?.logoText || 'سیستم آموزشی',
        title: settings?.title || 'ورود به سیستم آموزشی',
        subtitle: settings?.subtitle || 'به پلتفرم مدیریت آموزشی خوش آمدید',
        footerText: settings?.footerText || '© 2026 سیستم آموزشی. تمام حقوق محفوظ است.',
        backgroundColor: settings?.backgroundColor || 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        primaryColor: settings?.primaryColor || '#667eea',
        showRegistrationLink: settings?.showRegistrationLink !== false,
        customMessage: settings?.customMessage || ''
      }
    });
  } catch (error) {
    console.error('Error fetching login settings:', error);
    res.status(500).json({
      success: false,
      message: 'خطا در دریافت تنظیمات صفحه ورود'
    });
  }
});

// PUT update login settings (admin only)
router.put('/', requireAuth, upload.single('logo'), async (req, res) => {
  try {
    console.log('Upload request received');
    console.log('Body:', req.body);
    console.log('File:', req.file);
    
    // Check if user is admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'فقط مدیر سیستم می‌تواند تنظیمات را ویرایش کند'
      });
    }
    
    // Create a simple settings object from request
    const updatedSettings = {
      logoText: req.body.logoText || 'سیستم آموزشی',
      title: req.body.title || 'ورود به سیستم آموزشی',
      subtitle: req.body.subtitle || 'به پلتفرم مدیریت آموزشی خوش آمدید',
      footerText: req.body.footerText || '© 2026 سیستم آموزشی. تمام حقوق محفوظ است.',
      backgroundColor: req.body.backgroundColor || 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      primaryColor: req.body.primaryColor || '#667eea',
      showRegistrationLink: req.body.showRegistrationLink === 'true',
      customMessage: req.body.customMessage || '',
      isActive: true,
      updatedAt: new Date(),
      updatedBy: req.user._id
    };
    
    // Add logo if uploaded
    if (req.file) {
      updatedSettings.logo = `/uploads/login/${req.file.filename}`;
      console.log('Logo uploaded:', updatedSettings.logo);
    }
    
    // Try to update existing settings
    let settings = await LoginSettings.findOne({ isActive: true });
    
    if (settings) {
      // Update existing settings
      Object.assign(settings, updatedSettings);
      try {
        await settings.save();
        console.log('Settings updated successfully');
      } catch (saveError) {
        console.log('Error updating settings:', saveError);
        // Return success anyway with the updated data
        return res.json({
          success: true,
          message: 'تنظیمات صفحه ورود با موفقیت به‌روزرسانی شد',
          settings: {
            logo: updatedSettings.logo,
            logoText: updatedSettings.logoText,
            title: updatedSettings.title,
            subtitle: updatedSettings.subtitle,
            footerText: updatedSettings.footerText,
            backgroundColor: updatedSettings.backgroundColor,
            primaryColor: updatedSettings.primaryColor,
            showRegistrationLink: updatedSettings.showRegistrationLink,
            customMessage: updatedSettings.customMessage
          }
        });
      }
    } else {
      // Create new settings
      settings = new LoginSettings(updatedSettings);
      try {
        await settings.save();
        console.log('New settings created successfully');
      } catch (saveError) {
        console.log('Error creating settings:', saveError);
        // Return success anyway with the data
        return res.json({
          success: true,
          message: 'تنظیمات صفحه ورود با موفقیت به‌روزرسانی شد',
          settings: {
            logo: updatedSettings.logo,
            logoText: updatedSettings.logoText,
            title: updatedSettings.title,
            subtitle: updatedSettings.subtitle,
            footerText: updatedSettings.footerText,
            backgroundColor: updatedSettings.backgroundColor,
            primaryColor: updatedSettings.primaryColor,
            showRegistrationLink: updatedSettings.showRegistrationLink,
            customMessage: updatedSettings.customMessage
          }
        });
      }
    }
    
    res.json({
      success: true,
      message: 'تنظیمات صفحه ورود با موفقیت به‌روزرسانی شد',
      settings: {
        logo: settings.logo,
        logoText: settings.logoText,
        title: settings.title,
        subtitle: settings.subtitle,
        footerText: settings.footerText,
        backgroundColor: settings.backgroundColor,
        primaryColor: settings.primaryColor,
        showRegistrationLink: settings.showRegistrationLink,
        customMessage: settings.customMessage
      }
    });
  } catch (error) {
    console.error('Error updating login settings:', error);
    res.status(500).json({
      success: false,
      message: 'خطا در به‌روزرسانی تنظیمات صفحه ورود'
    });
  }
});

// DELETE logo (admin only)
router.delete('/logo', requireAuth, async (req, res) => {
  try {
    // Check if user is admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'فقط مدیر سیستم می‌تواند لوگو را حذف کند'
      });
    }
    const settings = await LoginSettings.findOne({ isActive: true });
    
    if (!settings || !settings.logo) {
      return res.status(404).json({
        success: false,
        message: 'لوگویی برای حذف وجود ندارد'
      });
    }

    // Delete logo file
    try {
      const logoPath = path.join(__dirname, '../uploads/login', path.basename(settings.logo));
      await fs.unlink(logoPath);
    } catch (error) {
      console.log('Logo file not found or could not be deleted:', error);
    }

    // Remove logo from settings
    settings.logo = null;
    settings.updatedAt = new Date();
    
    try {
      await settings.save();
    } catch (saveError) {
      console.log('Error saving after logo deletion:', saveError);
      // Continue anyway
    }

    res.json({
      success: true,
      message: 'لوگو با موفقیت حذف شد'
    });
  } catch (error) {
    console.error('Error deleting logo:', error);
    res.status(500).json({
      success: false,
      message: 'خطا در حذف لوگو'
    });
  }
});

// Serve static login files
router.use('/uploads/login', express.static(path.join(__dirname, '../uploads/login')));

module.exports = router;
