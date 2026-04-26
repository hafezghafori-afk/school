const mongoose = require('mongoose');

const loginSettingsSchema = new mongoose.Schema({
  // Visual Settings
  logo: {
    type: String, // URL to logo image
    default: null
  },
  logoText: {
    type: String,
    default: 'سیستم آموزشی'
  },
  title: {
    type: String,
    default: 'ورود به سیستم آموزشی'
  },
  subtitle: {
    type: String,
    default: 'به پلتفرم مدیریت آموزشی خوش آمدید'
  },
  footerText: {
    type: String,
    default: '© 2026 سیستم آموزشی. تمام حقوق محفوظ است.'
  },
  
  // Color Settings
  backgroundColor: {
    type: String,
    default: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
  },
  primaryColor: {
    type: String,
    default: '#667eea'
  },
  
  // Functional Settings
  showRegistrationLink: {
    type: Boolean,
    default: true
  },
  customMessage: {
    type: String,
    default: ''
  },
  
  // Metadata
  isActive: {
    type: Boolean,
    default: true
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Ensure only one active settings document exists
// Note: This middleware is temporarily disabled for testing
// loginSettingsSchema.pre('save', function(next) {
//   if (this.isActive && this.isNew) {
//     const self = this;
//     this.constructor.updateMany(
//       { _id: { $ne: this._id } },
//       { isActive: false }
//     ).then(() => next()).catch(next);
//   } else {
//     next();
//   }
// });

module.exports = mongoose.model('LoginSettings', loginSettingsSchema);
