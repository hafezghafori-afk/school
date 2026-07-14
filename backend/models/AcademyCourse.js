const mongoose = require('mongoose');
const academyConnection = require('./academyConnection');

const academyCourseSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, index: true },
  level: { type: String, default: '', trim: true },
  duration: { type: String, default: '', trim: true },
  defaultFee: { type: Number, default: 0, min: 0 },
  description: { type: String, default: '', trim: true },
  status: { type: String, enum: ['active', 'inactive', 'archived'], default: 'active', index: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
}, { timestamps: true });

academyCourseSchema.pre('validate', function normalizeAcademyCourse() {
  this.name = String(this.name || '').trim();
  this.level = String(this.level || '').trim();
  this.duration = String(this.duration || '').trim();
  this.description = String(this.description || '').trim();
  this.defaultFee = Math.max(0, Number(this.defaultFee || 0));
});

module.exports = academyConnection.model('AcademyCourse', academyCourseSchema);
