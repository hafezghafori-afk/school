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
