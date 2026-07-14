const academyConnection = require('./academyConnection');
const mongoose = require('mongoose');

const academyCounterSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  seq: { type: Number, default: 0 }
});

module.exports = academyConnection.model('AcademyCounter', academyCounterSchema);
