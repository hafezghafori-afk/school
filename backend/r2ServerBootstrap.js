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
require('./server');
