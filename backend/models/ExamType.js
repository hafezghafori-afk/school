const mongoose = require('mongoose');

const examTypeSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  code: { type: String, default: '', trim: true },
  category: {
    type: String,
    enum: ['standard', 'conditional', 'temporary', 'distinction', 'placement', 'excused'],
    default: 'standard',
    index: true
  },
  evaluationMode: {
    type: String,
    enum: ['score', 'status_only'],
    default: 'score'
  },
  defaultTotalMark: { type: Number, default: 100, min: 1 },
  defaultPassMark: { type: Number, default: 50, min: 0 },
  defaultConditionalMark: { type: Number, default: 40, min: 0 },
  isRankingEnabled: { type: Boolean, default: true },
  isActive: { type: Boolean, default: true, index: true },
  note: { type: String, default: '' }
}, { timestamps: true });

examTypeSchema.pre('validate', function syncExamTypeState() {
  if (typeof this.title === 'string') this.title = this.title.trim();
  if (typeof this.code === 'string') this.code = this.code.trim().toUpperCase();
  if (typeof this.note === 'string') this.note = this.note.trim();

  if (!this.title && this.code) {
    this.title = this.code;
  }

  if (this.evaluationMode === 'status_only') {
    this.isRankingEnabled = false;
  }

  if (this.defaultConditionalMark > this.defaultPassMark) {
    this.defaultConditionalMark = this.defaultPassMark;
  }
});

examTypeSchema.index({ title: 1 }, { unique: true });
examTypeSchema.index({ code: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model('ExamType', examTypeSchema);
