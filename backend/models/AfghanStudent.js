const mongoose = require('mongoose');

// مدل دانش‌آموز افغانستانی
const afghanStudentSchema = new mongoose.Schema({
  // اطلاعات شخصی
  personalInfo: {
    firstName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100
    },
    lastName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100
    },
    firstNameDari: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100
    },
    lastNameDari: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100
    },
    firstNamePashto: {
      type: String,
      trim: true,
      maxlength: 100
    },
    lastNamePashto: {
      type: String,
      trim: true,
      maxlength: 100
    },
    fatherName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100
    },
    grandfatherName: {
      type: String,
      trim: true,
      maxlength: 100
    },
    gender: {
      type: String,
      required: true,
      enum: ['male', 'female']
    },
    birthDate: {
      type: Date,
      required: true
    },
    birthPlace: {
      type: String,
      required: true,
      trim: true
    },
    nationality: {
      type: String,
      default: 'Afghan',
      trim: true
    }
  },
  
  // اطلاعات شناسایی
  identification: {
    tazkiraNumber: {
      type: String,
      required: true,
      trim: true
    },
    tazkiraVolume: { type: String, trim: true },
    tazkiraPage: { type: String, trim: true },
    tazkiraRegistrationDate: { type: Date },
    hasBirthCertificate: { type: Boolean, default: false },
    birthCertificateNumber: { type: String, trim: true }
  },
  
  // اطلاعات خانواده
  familyInfo: {
    fatherOccupation: {
      type: String,
      trim: true,
      maxlength: 100
    },
    fatherEducation: {
      type: String,
      enum: ['illiterate', 'primary', 'secondary', 'high', 'university', 'other']
    },
    fatherPhone: { type: String, trim: true },
    motherName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100
    },
    motherOccupation: {
      type: String,
      trim: true,
      maxlength: 100
    },
    motherEducation: {
      type: String,
      enum: ['illiterate', 'primary', 'secondary', 'high', 'university', 'other']
    },
    motherPhone: { type: String, trim: true },
    guardianName: { type: String, trim: true },
    guardianRelation: {
      type: String,
      enum: ['father', 'mother', 'uncle', 'brother', 'sister', 'grandparent', 'other']
    },
    guardianPhone: { type: String, trim: true },
    familyIncome: {
      type: String,
      enum: ['very_low', 'low', 'medium', 'high', 'very_high']
    },
    familySize: { type: Number, min: 1, max: 50 }
  },
  
  // اطلاعات تماس و آدرس
  contactInfo: {
    phone: { type: String, trim: true },
    mobile: { type: String, trim: true },
    email: { type: String, trim: true },
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
    district: { type: String, required: true, trim: true },
    village: { type: String, trim: true },
    address: { type: String, required: true, trim: true },
    emergencyContact: {
      name: { type: String, required: true, trim: true },
      relation: { type: String, required: true, trim: true },
      phone: { type: String, required: true, trim: true }
    }
  },
  
  // اطلاعات آموزشی
  academicInfo: {
    currentSchool: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AfghanSchool',
      required: true
    },
    currentGrade: {
      type: String,
      required: true,
      enum: ['grade1', 'grade2', 'grade3', 'grade4', 'grade5', 'grade6', 
              'grade7', 'grade8', 'grade9', 'grade10', 'grade11', 'grade12']
    },
    currentSection: { type: String, trim: true },
    currentShift: {
      type: String,
      enum: ['morning', 'afternoon', 'evening'],
      default: 'morning'
    },
    enrollmentDate: { type: Date, required: true },
    enrollmentType: {
      type: String,
      enum: ['new', 'transfer', 're_admission'],
      default: 'new'
    },
    previousSchool: {
      name: { type: String, trim: true },
      type: { type: String, enum: ['government', 'private', 'mosque', 'madrasa'] },
      lastGrade: { type: String, trim: true },
      transferReason: { type: String, trim: true }
    },
    attendanceRecord: {
      totalDays: { type: Number, default: 0 },
      presentDays: { type: Number, default: 0 },
      absentDays: { type: Number, default: 0 },
      lateDays: { type: Number, default: 0 }
    },
    academicPerformance: {
      lastYearGPA: { type: Number, min: 0, max: 100 },
      lastYearRank: { type: Number, min: 1 },
      subjects: [{
        name: { type: String, required: true },
        score: { type: Number, min: 0, max: 100 },
        grade: { type: String, enum: ['A', 'B', 'C', 'D', 'F'] }
      }]
    }
  },
  
  // اطلاعات پزشکی و بهداشتی
  medicalInfo: {
    bloodGroup: {
      type: String,
      enum: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']
    },
    hasMedicalConditions: { type: Boolean, default: false },
    medicalConditions: [{
      condition: { type: String, required: true },
      severity: { type: String, enum: ['mild', 'moderate', 'severe'] },
      medication: { type: String },
      doctorNotes: { type: String }
    }],
    allergies: [{
      allergen: { type: String, required: true },
      reaction: { type: String, required: true },
      severity: { type: String, enum: ['mild', 'moderate', 'severe'] }
    }],
    vaccinations: [{
      vaccine: { type: String, required: true },
      date: { type: Date, required: true },
      nextDue: { type: Date }
    }],
    physicalDisabilities: {
      hasDisability: { type: Boolean, default: false },
      type: { type: String, enum: ['visual', 'hearing', 'physical', 'mental', 'other'] },
      severity: { type: String, enum: ['mild', 'moderate', 'severe'] },
      needsSpecialSupport: { type: Boolean, default: false }
    }
  },
  
  // اطلاعات مالی و کمک‌هزینه
  financialInfo: {
    tuitionFee: {
      amount: { type: Number, default: 0 },
      paymentMethod: {
        type: String,
        enum: ['cash', 'bank', 'mobile', 'sponsor']
      },
      sponsorInfo: {
        name: { type: String, trim: true },
        organization: { type: String, trim: true },
        phone: { type: String, trim: true },
        amount: { type: Number }
      }
    },
    receivesScholarship: { type: Boolean, default: false },
    scholarshipInfo: {
      provider: { type: String, trim: true },
      amount: { type: Number },
      duration: { type: String }
    },
    receivesAid: { type: Boolean, default: false },
    aidType: {
      type: String,
      enum: ['uniform', 'books', 'transportation', 'food', 'other']
    }
  },
  
  // وضعیت فعلی
  status: {
    type: String,
    enum: ['active', 'inactive', 'suspended', 'graduated', 'transferred', 'dropped'],
    default: 'active'
  },
  verificationStatus: {
    type: String,
    enum: ['pending', 'verified', 'rejected'],
    default: 'pending'
  },
  registrationId: {
    type: String,
    trim: true
  },
  asasNumber: {
    type: String,
    trim: true
  },
  linkedUserId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  
  // اسناد و مدارک
  documents: [{
    type: {
      type: String,
      enum: ['tazkira', 'birth_certificate', 'medical_report', 'previous_transcript', 
              'transfer_certificate', 'photo', 'other']
    },
    title: { type: String, required: true },
    url: { type: String, required: true },
    uploadDate: { type: Date, default: Date.now },
    verified: { type: Boolean, default: false },
    notes: { type: String, trim: true }
  }],
  
  // اطلاعات سیستم
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  lastUpdatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  
  // یادداشت‌ها
  notes: {
    general: { type: String, default: '' },
    behavioral: { type: String, default: '' },
    academic: { type: String, default: '' },
    disciplinary: { type: String, default: '' }
  }
}, { 
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Virtual fields
afghanStudentSchema.virtual('fullName').get(function() {
  return `${this.personalInfo.firstName} ${this.personalInfo.lastName}`;
});

afghanStudentSchema.virtual('fullNameDari').get(function() {
  return `${this.personalInfo.firstNameDari} ${this.personalInfo.lastNameDari}`;
});

afghanStudentSchema.virtual('age').get(function() {
  const today = new Date();
  const birthDate = new Date(this.personalInfo.birthDate);
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  return age;
});

afghanStudentSchema.virtual('attendancePercentage').get(function() {
  const total = this.academicInfo.attendanceRecord.totalDays;
  return total > 0 ? ((this.academicInfo.attendanceRecord.presentDays / total) * 100).toFixed(1) : 0;
});

// Indexes
afghanStudentSchema.index({ 'identification.tazkiraNumber': 1 }, { unique: true });
afghanStudentSchema.index({ 'registrationId': 1 }, { unique: true, sparse: true });
afghanStudentSchema.index({ 'asasNumber': 1 }, { unique: true, sparse: true });
afghanStudentSchema.index({ 'academicInfo.currentSchool': 1, 'academicInfo.currentGrade': 1 });
afghanStudentSchema.index({ 'personalInfo.gender': 1, status: 1 });
afghanStudentSchema.index({ 'contactInfo.province': 1, 'contactInfo.district': 1 });
afghanStudentSchema.index({ createdBy: 1 });
afghanStudentSchema.index({ status: 1, verificationStatus: 1 });

module.exports = mongoose.model('AfghanStudent', afghanStudentSchema);
