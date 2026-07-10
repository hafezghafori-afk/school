const mongoose = require('mongoose');

const localizedTextSchema = new mongoose.Schema({
  fa: { type: String, default: '' },
  en: { type: String, default: '' },
  ps: { type: String, default: '' }
}, { _id: false });

const localizedListItemSchema = new mongoose.Schema({
  title: { type: localizedTextSchema, default: () => ({}) },
  text: { type: localizedTextSchema, default: () => ({}) },
  value: { type: String, default: '' },
  href: { type: String, default: '' },
  icon: { type: String, default: '' },
  enabled: { type: Boolean, default: true }
}, { _id: false });

const schoolWebsiteProfileSchema = new mongoose.Schema({
  schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'AfghanSchool', required: true, unique: true, index: true },
  slug: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
  siteStatus: { type: String, enum: ['active', 'inactive'], default: 'active', index: true },
  primaryLanguage: { type: String, enum: ['fa', 'en', 'ps'], default: 'fa' },
  enabledLanguages: { type: [String], default: ['fa', 'en', 'ps'] },
  primaryColor: { type: String, default: '#0f766e' },
  schoolLogoUrl: { type: String, default: '' },
  ministryLogoUrl: { type: String, default: '' },
  heroImageUrl: { type: String, default: '' },
  brandName: { type: localizedTextSchema, default: () => ({}) },
  brandSubtitle: { type: localizedTextSchema, default: () => ({}) },
  homeHeroBadge: { type: localizedTextSchema, default: () => ({}) },
  homeHeroTitle: { type: localizedTextSchema, default: () => ({}) },
  homeHeroText: { type: localizedTextSchema, default: () => ({}) },
  aboutTitle: { type: localizedTextSchema, default: () => ({}) },
  aboutBody: { type: localizedTextSchema, default: () => ({}) },
  missionTitle: { type: localizedTextSchema, default: () => ({}) },
  missionBody: { type: localizedTextSchema, default: () => ({}) },
  visionTitle: { type: localizedTextSchema, default: () => ({}) },
  visionBody: { type: localizedTextSchema, default: () => ({}) },
  contactTitle: { type: localizedTextSchema, default: () => ({}) },
  contactText: { type: localizedTextSchema, default: () => ({}) },
  contactPhone: { type: String, default: '' },
  contactEmail: { type: String, default: '' },
  contactAddress: { type: localizedTextSchema, default: () => ({}) },
  socialLinks: { type: [localizedListItemSchema], default: [] },
  features: { type: [localizedListItemSchema], default: [] },
  stats: { type: [localizedListItemSchema], default: [] },
  menuItems: { type: [localizedListItemSchema], default: [] },
  footerLinks: { type: [localizedListItemSchema], default: [] },
  footerNote: { type: localizedTextSchema, default: () => ({}) },
  metadata: { type: mongoose.Schema.Types.Mixed, default: {} }
}, { timestamps: true });

module.exports = mongoose.model('SchoolWebsiteProfile', schoolWebsiteProfileSchema);
