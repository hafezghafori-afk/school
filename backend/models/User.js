const mongoose = require('mongoose');
const {
  ORG_ROLES,
  USER_STATUSES,
  buildUserRoleState,
  deriveOrgRole,
  normalizeUserStatus
} = require('../utils/userRole');

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  email: {
    type: String,
    required: true,
    unique: true
  },
  password: {
    type: String,
    required: true
  },
  role: {
    type: String,
    default: 'student'
  },
  orgRole: {
    type: String,
    enum: ORG_ROLES,
    default() {
      return deriveOrgRole(this || {}, 'student');
    }
  },
  status: {
    type: String,
    enum: USER_STATUSES,
    default: 'active'
  },
  adminLevel: {
    type: String,
    enum: ['finance_manager', 'finance_lead', 'school_manager', 'academic_manager', 'head_teacher', 'general_president', ''],
    default: ''
  },
  avatarUrl: { type: String, default: '' },
  lastLoginAt: { type: Date, default: null },
  grade: { type: String, default: '' },
  subject: { type: String, default: '' },
  bio: { type: String, default: '' },
  permissions: [{ type: String }]
}, { timestamps: true });

const splitDisplayName = (value = '') => {
  const parts = String(value || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return { firstName: '', lastName: '' };
  if (parts.length === 1) return { firstName: parts[0], lastName: '' };
  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(' ')
  };
};

userSchema.set('toJSON', { virtuals: true });
userSchema.set('toObject', { virtuals: true });

userSchema.virtual('firstName').get(function getFirstName() {
  return splitDisplayName(this.name).firstName;
});

userSchema.virtual('lastName').get(function getLastName() {
  return splitDisplayName(this.name).lastName;
});

userSchema.pre('validate', function syncUserRoleState() {
  const state = buildUserRoleState(this);
  this.role = state.role;
  this.orgRole = state.orgRole;
  this.adminLevel = state.adminLevel;
  this.status = normalizeUserStatus(this.status || '', 'active');
});

userSchema.index({ orgRole: 1, status: 1, createdAt: -1 });

module.exports = mongoose.model('User', userSchema);

