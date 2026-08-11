const shortTermConnection = require('./shortTermConnection');
const mongoose = require('mongoose');

const shortTermCounterSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  seq: { type: Number, default: 0 }
});

module.exports = shortTermConnection.model('ShortTermCounter', shortTermCounterSchema);
