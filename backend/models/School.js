const mongoose = require('mongoose');
const AfghanSchool = require('./AfghanSchool');

// Compatibility model for legacy schemas that still reference "School".
// Both School and AfghanSchool point to the same afghanschools collection.
module.exports = mongoose.models.School || mongoose.model('School', AfghanSchool.schema, AfghanSchool.collection.name);
