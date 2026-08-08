// Must run before any local require below - this file (the actual `npm
// start` entry point) requires route files directly, and those routes
// require middleware/auth.js, which reads process.env.JWT_SECRET at
// module-load time. server.js normally calls dotenv.config() first, but
// server.js itself isn't required until the bottom of this file, so
// middleware/auth.js was capturing JWT_SECRET before .env had been read -
// silently falling back to the weak 'dev_secret' default and rejecting
// every real token in local development. Render itself is unaffected
// (its env vars are injected into process.env before Node starts, not via
// a .env file), so this only ever broke `npm start` locally.
require('dotenv').config();

const express = require('express');

// Keep all existing settings endpoints unchanged, but handle logo and official
// asset uploads with Cloudflare R2 before the legacy disk-backed handlers.
const settingsRoutesPath = require.resolve('./routes/settingsRoutes');
const legacySettingsRoutes = require(settingsRoutesPath);
const r2SettingsAssetRoutes = require('./routes/r2SettingsAssetRoutes');

const combinedSettingsRoutes = express.Router();
combinedSettingsRoutes.use(r2SettingsAssetRoutes);
combinedSettingsRoutes.use(legacySettingsRoutes);
require.cache[settingsRoutesPath].exports = combinedSettingsRoutes;

// Show the student's complete open account across current and historical
// memberships before falling back to the existing finance routes.
const studentFinanceRoutesPath = require.resolve('./routes/studentFinanceRoutes');
const legacyStudentFinanceRoutes = require(studentFinanceRoutesPath);
const studentAccountByStudentRoutes = require('./routes/studentAccountByStudentRoutes');

const combinedStudentFinanceRoutes = express.Router();
combinedStudentFinanceRoutes.use(studentAccountByStudentRoutes);
combinedStudentFinanceRoutes.use(legacyStudentFinanceRoutes);
require.cache[studentFinanceRoutesPath].exports = combinedStudentFinanceRoutes;

require('./server');
