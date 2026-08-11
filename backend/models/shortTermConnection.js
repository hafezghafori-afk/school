const mongoose = require('mongoose');

// Fully independent database for the "short-term / temporary students" center.
// Same server + same login as the rest of the platform, but the data itself
// never touches the main school database or the academy database (see
// academyConnection.js for the sibling module this pattern was copied from).
const shortTermDbName = String(process.env.SHORT_TERM_DB_NAME || 'short_term_center_db').trim() || 'short_term_center_db';

module.exports = mongoose.connection.useDb(shortTermDbName, { useCache: true });
