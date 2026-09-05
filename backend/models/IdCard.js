const mongoose = require('mongoose');

// کارتِ هویتِ چاپی — یک رکورد به‌ازای هر شاگرد/استاد/کارمند، جدا از پروفایلِ خودشان
// (AfghanStudent برای ownerType='student'، AfghanTeacher برای ownerType='personnel' —
// همان مدلی که هم استاد و هم کارمندِ اداری/خدماتی را با employmentInfo.position پوشش می‌دهد).
// همان الگویِ StudentSawanehCard: فیلدهایی که به خودِ پروفایل تعلق ندارند (سریال،
// اعتبار، وضعیتِ کارت، تاریخچهٔ چاپ) این‌جا نگه‌داری می‌شوند؛ عکس/نام/تذکره از خودِ
// پروفایل خوانده می‌شود و این‌جا تکرار نمی‌شود.

const printEntrySchema = new mongoose.Schema({
  printedAt: { type: Date, default: Date.now },
  printedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  mode: { type: String, enum: ['single', 'batch'], default: 'single' },
  side: { type: String, enum: ['front', 'back', 'both'], default: 'front' }
}, { _id: false });

const idCardSchema = new mongoose.Schema({
  ownerType: { type: String, enum: ['student', 'personnel'], required: true },
  ownerId: { type: mongoose.Schema.Types.ObjectId, required: true },
  schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'AfghanSchool', required: true, index: true },

  serial: { type: String, required: true, unique: true, trim: true },
  status: {
    type: String,
    enum: ['active', 'lost', 'revoked', 'expired', 'reissued'],
    default: 'active',
    index: true
  },
  issueDate: { type: Date, default: Date.now },
  expiryDate: { type: Date, default: null }, // «اعتبار» روی خودِ کارت

  reissueCount: { type: Number, default: 0, min: 0 },
  reissueReason: { type: String, default: '', trim: true }, // الزامی در سطحِ route هنگامِ صدورِ مجدد

  notesForCard: { type: String, default: '', trim: true }, // یادداشتِ داخلیِ مخصوصِ کارت، نه پروفایل

  printHistory: { type: [printEntrySchema], default: [] },

  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  lastUpdatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
}, { timestamps: true });

// یک کارت به‌ازای هر نفر
idCardSchema.index({ ownerType: 1, ownerId: 1 }, { unique: true });
idCardSchema.index({ schoolId: 1, status: 1 });

module.exports = mongoose.model('IdCard', idCardSchema);
