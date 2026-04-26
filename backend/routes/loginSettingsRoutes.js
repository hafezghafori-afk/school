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
attachWriteActivityAudit(router, { targetType: 'LoginSettings', actionPrefix: 'login_settings', audit: auditWrite });

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
      await settings.save();
    }
    
    res.json({
      success: true,
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
    console.error('Error fetching login settings:', error);
    res.status(500).json({
      success: false,
      message: 'خطا در دریافت تنظیمات صفحه ورود'
    });
  }
});

// PUT update login settings (admin only) - TEMPORARILY DISABLED AUTH FOR TESTING
router.put('/', upload.single('logo'), async (req, res) => {
  try {
    console.log('Upload request received:', req.body);
    console.log('File info:', req.file);

    const {
      logoText,
      title,
      subtitle,
      footerText,
      backgroundColor,
      primaryColor,
      showRegistrationLink,
      customMessage
    } = req.body;

    // Find existing settings or create new one
    let settings = await LoginSettings.findOne({ isActive: true });
    console.log('Found settings:', settings);
    
    if (!settings) {
      console.log('Creating new settings...');
      settings = new LoginSettings();
      console.log('New settings created:', settings);
    }

    // Update logo if uploaded
    if (req.file) {
      // Delete old logo if exists
      if (settings && settings.logo) {
        try {
          const oldLogoPath = path.join(__dirname, '../uploads/login', path.basename(settings.logo));
          await fs.unlink(oldLogoPath);
        } catch (error) {
          console.log('Old logo file not found or could not be deleted:', error);
        }
      }
      
      // Set new logo path
      settings.logo = `/uploads/login/${req.file.filename}`;
    }

    // Update other settings
    if (logoText !== undefined) settings.logoText = logoText;
    if (title !== undefined) settings.title = title;
    if (subtitle !== undefined) settings.subtitle = subtitle;
    if (footerText !== undefined) settings.footerText = footerText;
    if (backgroundColor !== undefined) settings.backgroundColor = backgroundColor;
    if (primaryColor !== undefined) settings.primaryColor = primaryColor;
    if (showRegistrationLink !== undefined) settings.showRegistrationLink = showRegistrationLink === 'true';
    if (customMessage !== undefined) settings.customMessage = customMessage;

    // TEMPORARY: Skip user tracking for testing
    // settings.updatedBy = req.user._id;
    settings.updatedAt = new Date();
    settings.isActive = true;

    console.log('About to save settings:', settings);
    await settings.save();
    console.log('Settings saved successfully');

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
    settings.updatedBy = req.user._id;
    settings.updatedAt = new Date();
    
    await settings.save();

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
