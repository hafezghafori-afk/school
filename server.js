const path = require('path');

// Allow running from repository root while preserving backend .env resolution.
process.chdir(path.join(__dirname, 'backend'));

require('./backend/server');
