const mongoose = require('mongoose');

// مدل اصلی مکتب افغانستان
const afghanSchoolSchema = new mongoose.Schema({
  // اطلاعات اصلی مکتب
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200
  },
  nameDari: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200
  },
  namePashto: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200
  },
  
  // کدهای شناسایی رسمی
  schoolCode: {
    type: String,
    required: true,
    trim: true
  },
  ministryCode: {
    type: String,
    required: true,
    trim: true
  },
  provinceCode: {
    type: String,
    required: true,
    trim: true
  },
  
  // موقعیت جغرافیایی
  province: {
    type: String,
    required: true,
    enum: [
      'kabul', 'herat', 'kandahar', 'balkh', 'nangarhar', 'badakhshan',
      'takhar', 'samangan', 'kunduz', 'baghlan', 'farah', 'nimroz',
      'helmand', 'ghor', 'daykundi', 'uruzgan', 'zabul', 'paktika',
      'khost', 'paktia', 'logar', 'parwan', 'kapisa', 'panjshir',
      'badghis', 'faryab', 'jowzjan', 'saripul'
    ]
  },
  district: {
    type: String,
    required: true,
    trim: true
  },
  village: {
    type: String,
    default: '',
    trim: true
  },
  coordinates: {
    latitude: { type: Number, min: -90, max: 90 },
    longitude: { type: Number, min: -180, max: 180 },
    accuracy: { type: Number, default: 0 }
  },
  
  // نوع و سطح مکتب
  schoolType: {
    type: String,
    required: true,
    enum: ['primary', 'secondary', 'high', 'mosque', 'madrasa', 'technical', 'private']
  },
  schoolLevel: {
    type: String,
    required: true,
    enum: ['grade1_6', 'grade7_9', 'grade10_12', 'grade1_12', 'grade1_3', 'grade4_6']
  },
  ownership: {
    type: String,
    required: true,
    enum: ['government', 'private', 'ngp', 'mosque', 'community']
  },
  
  // اطلاعات تماس و ارتباطی
  contactInfo: {
    phone: { type: String, default: '' },
    mobile: { type: String, default: '' },
    email: { type: String, default: '' },
    website: { type: String, default: '' },
    address: { type: String, required: true, trim: true }
  },
  
  // مدیریت مکتب
  principal: {
    name: { type: String, required: true, trim: true },
    phone: { type: String, default: '' },
    email: { type: String, default: '' },
    appointmentDate: { type: Date },
    contractExpiry: { type: Date }
  },
  
  // امکانات فیزیکی
  facilities: {
    buildings: [{
      type: { type: String, enum: ['classroom', 'office', 'lab', 'library', 'toilet', 'storage', 'computer_lab', 'workshop'] },
      condition: { type: String, enum: ['excellent', 'good', 'fair', 'poor', 'damaged'] },
      capacity: { type: Number, min: 0 },
      area: { type: Number, min: 0 }
    }],
    hasElectricity: { type: Boolean, default: false },
    hasWater: { type: Boolean, default: false },
    hasInternet: { type: Boolean, default: false },
    hasPlayground: { type: Boolean, default: false },
    hasBoundary: { type: Boolean, default: false },
    totalArea: { type: Number, default: 0 }
  },
  
  // اطلاعات آموزشی
  academicInfo: {
    totalStudents: { type: Number, default: 0 },
    maleStudents: { type: Number, default: 0 },
    femaleStudents: { type: Number, default: 0 },
    totalTeachers: { type: Number, default: 0 },
    maleTeachers: { type: Number, default: 0 },
    femaleTeachers: { type: Number, default: 0 },
    classesCount: { type: Number, default: 0 },
    shiftType: {
      type: String,
      enum: ['morning', 'afternoon', 'evening', 'double'],
      default: 'morning'
    },
    academicYear: { type: String, required: true },
    curriculum: {
      type: String,
      enum: ['national', 'international', 'mixed'],
      default: 'national'
    }
  },
  
  // اطلاعات مالی
  financialInfo: {
    budget: {
      government: { type: Number, default: 0 },
      community: { type: Number, default: 0 },
      ngp: { type: Number, default: 0 },
      other: { type: Number, default: 0 }
    },
    fees: {
      registration: { type: Number, default: 0 },
      monthly: { type: Number, default: 0 },
      exam: { type: Number, default: 0 }
    },
    staffSalaries: { type: Number, default: 0 },
    maintenanceCost: { type: Number, default: 0 }
  },
  
  // وضعیت فعلی
  status: {
    type: String,
    enum: ['active', 'inactive', 'under_construction', 'closed', 'merged'],
    default: 'active'
  },
  verificationStatus: {
    type: String,
    enum: ['pending', 'verified', 'rejected'],
    default: 'pending'
  },
  
  // اطلاعات سیستم
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  lastUpdatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  
  // تاریخ‌های مهم
  establishmentDate: { type: Date, required: true },
  lastInspectionDate: { type: Date },
  nextInspectionDate: { type: Date },
  
  // اسناد و مدارک
  documents: [{
    type: {
      type: String,
      enum: ['license', 'inspection', 'photos', 'reports', 'other']
    },
    title: { type: String, required: true },
    url: { type: String, required: true },
    uploadDate: { type: Date, default: Date.now },
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }
  }],
  
  // یادداشت‌ها و توضیحات
  notes: {
    general: { type: String, default: '' },
    challenges: { type: String, default: '' },
    achievements: { type: String, default: '' }
  }
}, { 
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Virtual fields
afghanSchoolSchema.virtual('studentTeacherRatio').get(function() {
  return this.academicInfo.totalTeachers > 0 ? 
    (this.academicInfo.totalStudents / this.academicInfo.totalTeachers).toFixed(2) : 0;
});

afghanSchoolSchema.virtual('genderBalance').get(function() {
  const total = this.academicInfo.maleStudents + this.academicInfo.femaleStudents;
  return total > 0 ? {
    male: ((this.academicInfo.maleStudents / total) * 100).toFixed(1),
    female: ((this.academicInfo.femaleStudents / total) * 100).toFixed(1)
  } : { male: 0, female: 0 };
});

// Indexes
afghanSchoolSchema.index({ schoolCode: 1 }, { unique: true });
afghanSchoolSchema.index({ province: 1, district: 1 });
afghanSchoolSchema.index({ schoolType: 1, schoolLevel: 1 });
afghanSchoolSchema.index({ status: 1, verificationStatus: 1 });
afghanSchoolSchema.index({ 'academicInfo.totalStudents': -1 });
afghanSchoolSchema.index({ createdBy: 1 });

module.exports = mongoose.model('AfghanSchool', afghanSchoolSchema);
