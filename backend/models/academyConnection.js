const mongoose = require('mongoose');

const academyDbName = String(process.env.ACADEMY_DB_NAME || 'academy_db').trim() || 'academy_db';

module.exports = mongoose.connection.useDb(academyDbName, { useCache: true });
