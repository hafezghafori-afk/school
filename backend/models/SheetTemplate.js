const mongoose = require('mongoose');

const marginSchema = new mongoose.Schema({
  top: { type: Number, default: 24, min: 0 },
  right: { type: Number, default: 24, min: 0 },
  bottom: { type: Number, default: 24, min: 0 },
  left: { type: Number, default: 24, min: 0 }
}, { _id: false });

const columnSchema = new mongoose.Schema({
  key: { type: String, required: true, trim: true },
  label: { type: String, default: '', trim: true },
  width: { type: Number, default: 16, min: 4, max: 80 },
  visible: { type: Boolean, default: true },
  order: { type: Number, default: 0, min: 0 }
}, { _id: false });

const scopeSchema = new mongoose.Schema({
  academicYearId: { type: mongoose.Schema.Types.ObjectId, ref: 'AcademicYear', default: null, index: true },
  gradeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Grade', default: null },
  sectionId: { type: mongoose.Schema.Types.ObjectId, ref: 'SchoolClass', default: null },
  classId: { type: mongoose.Schema.Types.ObjectId, ref: 'SchoolClass', default: null, index: true }
}, { _id: false });

const layoutSchema = new mongoose.Schema({
  fontFamily: { type: String, default: 'B Zar', trim: true },
  fontSize: { type: Number, default: 12, min: 8, max: 32 },
  orientation: { type: String, enum: ['portrait', 'landscape'], default: 'landscape' },
  showHeader: { type: Boolean, default: true },
  showFooter: { type: Boolean, default: true },
  showLogo: { type: Boolean, default: true },
  headerText: { type: String, default: '', trim: true },
  footerText: { type: String, default: '', trim: true },
  margins: { type: marginSchema, default: () => ({}) }
}, { _id: false });

const filtersSchema = new mongoose.Schema({
  termId: { type: mongoose.Schema.Types.ObjectId, ref: 'AcademicTerm', default: null },
  examId: { type: mongoose.Schema.Types.ObjectId, ref: 'ExamSession', default: null },
  month: { type: String, default: '', trim: true },
  dateFrom: { type: String, default: '', trim: true },
  dateTo: { type: String, default: '', trim: true }
}, { _id: false });

const optionsSchema = new mongoose.Schema({
  showTotal: { type: Boolean, default: true },
  showAverage: { type: Boolean, default: false },
  showNotes: { type: Boolean, default: true },
  showStudentCode: { type: Boolean, default: false }
}, { _id: false });

const ownershipSchema = new mongoose.Schema({
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
  isDefault: { type: Boolean, default: false },
  isPublic: { type: Boolean, default: false }
}, { _id: false });

const SHEET_TYPES = ['attendance', 'attendance_summary', 'subjects', 'exam', 'finance'];

const sheetTemplateSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  code: { type: String, default: undefined, trim: true },
  type: { type: String, enum: SHEET_TYPES, required: true, index: true },
  version: { type: Number, default: 1, min: 1 },
  scope: { type: scopeSchema, default: () => ({}) },
  layout: { type: layoutSchema, default: () => ({}) },
  columns: { type: [columnSchema], default: [] },
  filters: { type: filtersSchema, default: () => ({}) },
  options: { type: optionsSchema, default: () => ({}) },
  ownership: { type: ownershipSchema, default: () => ({}) },
  isActive: { type: Boolean, default: true, index: true },
  note: { type: String, default: '', trim: true }
}, { timestamps: true });

sheetTemplateSchema.pre('validate', function syncSheetTemplateState() {
  if (typeof this.title === 'string') this.title = this.title.trim();
  if (typeof this.code === 'string') {
    this.code = this.code.trim().toUpperCase();
    if (!this.code) this.code = undefined;
  }
  if (typeof this.note === 'string') this.note = this.note.trim();
  if (!this.title && this.code) this.title = this.code;

  if (!Array.isArray(this.columns)) {
    this.columns = [];
  }
  this.columns = this.columns
    .map((column, index) => ({
      key: String(column?.key || '').trim(),
      label: String(column?.label || '').trim(),
      width: Number(column?.width || 16),
      visible: column?.visible !== false,
      order: Number(column?.order ?? index)
    }))
    .filter((column) => column.key)
    .sort((left, right) => left.order - right.order);
});

sheetTemplateSchema.index({ code: 1 }, { unique: true, sparse: true });
sheetTemplateSchema.index({ type: 1, isActive: 1, createdAt: -1 });

module.exports = mongoose.model('SheetTemplate', sheetTemplateSchema);
