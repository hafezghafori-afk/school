const mongoose = require('mongoose');

// مدل معلم افغانستانی
const afghanTeacherSchema = new mongoose.Schema({
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
    hasTeacherLicense: { type: Boolean, default: false },
    teacherLicenseNumber: { type: String, trim: true },
    teacherLicenseExpiry: { type: Date }
  },
  
  // اطلاعات تماس و آدرس
  contactInfo: {
    phone: { type: String, trim: true },
    mobile: { type: String, required: true, trim: true },
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
    address: { type: String, required: true, trim: true }
  },
  
  // اطلاعات آموزشی و تخصصی
  educationInfo: {
    highestEducation: {
      type: String,
      required: true,
      enum: ['high_school', 'bachelor', 'master', 'phd', 'other']
    },
    fieldOfStudy: { type: String, required: true, trim: true },
    university: { type: String, required: true, trim: true },
    graduationYear: { type: Number, required: true },
    gpa: { type: Number, min: 0, max: 4 },
    hasTeachingCertificate: { type: Boolean, default: false },
    teachingCertificateType: { type: String, trim: true },
    teachingCertificateYear: { type: Number }
  },
  
  // اطلاعات شغلی
  employmentInfo: {
    currentSchool: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AfghanSchool',
      required: true
    },
    employeeId: { type: String, required: true, trim: true },
    position: {
      type: String,
      required: true,
      enum: ['principal', 'vice_principal', 'teacher', 'admin_staff', 'support_staff']
    },
    employmentType: {
      type: String,
      required: true,
      enum: ['permanent', 'contract', 'temporary', 'volunteer']
    },
    hireDate: { type: Date, required: true },
    contractExpiry: { type: Date },
    workSchedule: {
      type: String,
      enum: ['full_time', 'part_time', 'flexible'],
      default: 'full_time'
    },
    subjects: [{
      subjectName: { type: String, required: true },
      subjectCode: { type: String, trim: true },
      gradeLevels: [{
        type: String,
        enum: ['grade1', 'grade2', 'grade3', 'grade4', 'grade5', 'grade6', 
                'grade7', 'grade8', 'grade9', 'grade10', 'grade11', 'grade12']
      }]
    }],
    classes: [{
      grade: { type: String, required: true },
      section: { type: String, trim: true },
      subject: { type: String, required: true },
      shift: { type: String, enum: ['morning', 'afternoon', 'evening'] }
    }],
    workload: {
      teachingHours: { type: Number, default: 0 },
      adminHours: { type: Number, default: 0 },
      totalHours: { type: Number, default: 0 }
    }
  },
  
  // اطلاعات مالی
  financialInfo: {
    salary: {
      base: { type: Number, required: true },
      housing: { type: Number, default: 0 },
      transport: { type: Number, default: 0 },
      other: { type: Number, default: 0 },
      total: { type: Number }
    },
    bankAccount: {
      bankName: { type: String, trim: true },
      accountNumber: { type: String, trim: true },
      accountHolder: { type: String, trim: true }
    },
    receivesBonus: { type: Boolean, default: false },
    bonusCriteria: { type: String, trim: true }
  },
  
  // اطلاعات ارزیابی عملکرد
  performanceInfo: {
    lastEvaluationDate: { type: Date },
    nextEvaluationDate: { type: Date },
    evaluations: [{
      date: { type: Date, required: true },
      evaluator: { type: String, required: true },
      criteria: {
        teaching_quality: { type: Number, min: 1, max: 5 },
        classroom_management: { type: Number, min: 1, max: 5 },
        student_engagement: { type: Number, min: 1, max: 5 },
        professional_development: { type: Number, min: 1, max: 5 },
        collaboration: { type: Number, min: 1, max: 5 }
      },
      overall_score: { type: Number, min: 1, max: 5 },
      comments: { type: String, trim: true },
      recommendations: { type: String, trim: true }
    }],
    achievements: [{
      title: { type: String, required: true },
      description: { type: String, trim: true },
      date: { type: Date, required: true },
      recognized_by: { type: String, trim: true }
    }],
    disciplinary_actions: [{
      type: { type: String, enum: ['warning', 'suspension', 'termination'] },
      reason: { type: String, required: true },
      date: { type: Date, required: true },
      action_by: { type: String, required: true }
    }]
  },
  
  // اطلاعات توسعه حرفه‌ای
  professionalDevelopment: {
    trainings: [{
      title: { type: String, required: true },
      provider: { type: String, trim: true },
      startDate: { type: Date, required: true },
      endDate: { type: Date, required: true },
      certificate: { type: Boolean, default: false },
      hours: { type: Number, default: 0 }
    }],
    workshops: [{
      title: { type: String, required: true },
      date: { type: Date, required: true },
      duration: { type: Number, default: 0 },
      organizer: { type: String, trim: true }
    }],
    conferences: [{
      title: { type: String, required: true },
      date: { type: Date, required: true },
      location: { type: String, trim: true },
      role: { type: String, trim: true }
    }]
  },
  
  // وضعیت فعلی
  status: {
    type: String,
    enum: ['active', 'inactive', 'on_leave', 'suspended', 'terminated', 'retired'],
    default: 'active'
  },
  verificationStatus: {
    type: String,
    enum: ['pending', 'verified', 'rejected'],
    default: 'pending'
  },
  
  // اسناد و مدارک
  documents: [{
    type: {
      type: String,
      enum: ['tazkira', 'teacher_license', 'degree_certificate', 'transcript', 
              'teaching_certificate', 'cv', 'contract', 'performance_review', 'other']
    },
    title: { type: String, required: true },
    url: { type: String, required: true },
    uploadDate: { type: Date, default: Date.now },
    verified: { type: Boolean, default: false },
    expiryDate: { type: Date },
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
    performance: { type: String, default: '' },
    disciplinary: { type: String, default: '' },
    medical: { type: String, default: '' }
  }
}, { 
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Virtual fields
afghanTeacherSchema.virtual('fullName').get(function() {
  return `${this.personalInfo.firstName} ${this.personalInfo.lastName}`;
});

afghanTeacherSchema.virtual('fullNameDari').get(function() {
  return `${this.personalInfo.firstNameDari} ${this.personalInfo.lastNameDari}`;
});

afghanTeacherSchema.virtual('age').get(function() {
  const today = new Date();
  const birthDate = new Date(this.personalInfo.birthDate);
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  return age;
});

afghanTeacherSchema.virtual('yearsOfExperience').get(function() {
  const today = new Date();
  const hireDate = new Date(this.employmentInfo.hireDate);
  return today.getFullYear() - hireDate.getFullYear();
});

afghanTeacherSchema.virtual('totalSalary').get(function() {
  const salary = this.financialInfo.salary;
  return salary.base + salary.housing + salary.transport + salary.other;
});

// Indexes
afghanTeacherSchema.index({ 'identification.tazkiraNumber': 1 }, { unique: true });
afghanTeacherSchema.index({ 'employmentInfo.currentSchool': 1, status: 1 });
afghanTeacherSchema.index({ 'employmentInfo.position': 1, 'personalInfo.gender': 1 });
afghanTeacherSchema.index({ 'contactInfo.province': 1, 'contactInfo.district': 1 });
afghanTeacherSchema.index({ createdBy: 1 });
afghanTeacherSchema.index({ status: 1, verificationStatus: 1 });
afghanTeacherSchema.index({ 'employmentInfo.employeeId': 1 }, { unique: true });

module.exports = mongoose.model('AfghanTeacher', afghanTeacherSchema);
