const mongoose = require('mongoose');

// مدل برنامه درسی افغانستان
const afghanCurriculumSchema = new mongoose.Schema({
  // اطلاعات اصلی برنامه درسی
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
    trim: true,
    maxlength: 200
  },
  
  // سطح و نوع برنامه درسی
  level: {
    type: String,
    required: true,
    enum: ['primary', 'secondary', 'high', 'all']
  },
  grade: {
    type: String,
    required: true,
    enum: ['grade1', 'grade2', 'grade3', 'grade4', 'grade5', 'grade6', 
            'grade7', 'grade8', 'grade9', 'grade10', 'grade11', 'grade12', 'all']
  },
  
  // اطلاعات وزارت آموزش و پرورش
  ministryInfo: {
    approvedBy: { type: String, required: true, trim: true },
    approvalDate: { type: Date, required: true },
    revisionNumber: { type: String, trim: true },
    lastRevisionDate: { type: Date },
    implementationYear: { type: Number, required: true }
  },
  
  // مواد درسی
  subjects: [{
    subjectCode: { type: String, required: true, unique: true, trim: true },
    subjectName: {
      dari: { type: String, required: true, trim: true },
      pashto: { type: String, trim: true },
      english: { type: String, trim: true }
    },
    subjectType: {
      type: String,
      required: true,
      enum: ['core', 'elective', 'religious', 'practical', 'language']
    },
    isCompulsory: { type: Boolean, default: true },
    credits: { type: Number, default: 1, min: 1 },
    weeklyHours: {
      theory: { type: Number, default: 1, min: 1 },
      practical: { type: Number, default: 0, min: 0 },
      total: { type: Number, default: 1 }
    },
    prerequisites: [{ type: String, trim: true }],
    learningObjectives: [{ type: String, trim: true }],
    assessmentMethods: [{
      type: { type: String, enum: ['exam', 'project', 'presentation', 'practical', 'homework'] },
      weight: { type: Number, min: 0, max: 100 },
      frequency: { type: String, enum: ['weekly', 'monthly', 'quarterly', 'semester', 'yearly'] }
    }],
    textbooks: [{
      title: { type: String, required: true, trim: true },
      author: { type: String, trim: true },
      publisher: { type: String, trim: true },
      year: { type: Number },
      isbn: { type: String, trim: true },
      isOfficial: { type: Boolean, default: true }
    }],
    teachingMaterials: [{
      type: { type: String, enum: ['textbook', 'workbook', 'guide', 'digital', 'equipment'] },
      title: { type: String, required: true, trim: true },
      quantity: { type: Number, default: 1 },
      condition: { type: String, enum: ['new', 'good', 'fair', 'poor'] }
    }]
  }],
  
  // برنامه زمان‌بندی سال تحصیلی
  academicCalendar: {
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    totalWeeks: { type: Number, required: true },
    teachingWeeks: { type: Number, required: true },
    examWeeks: { type: Number, required: true },
    holidayWeeks: { type: Number, required: true },
    terms: [{
      termNumber: { type: Number, required: true, min: 1 },
      startDate: { type: Date, required: true },
      endDate: { type: Date, required: true },
      weeks: { type: Number, required: true },
      examPeriod: {
        startDate: { type: Date, required: true },
        endDate: { type: Date, required: true }
      }
    }],
    holidays: [{
      name: { type: String, required: true, trim: true },
      type: { type: String, enum: ['national', 'religious', 'seasonal', 'school'] },
      startDate: { type: Date, required: true },
      endDate: { type: Date, required: true },
      duration: { type: Number, required: true }
    }]
  },
  
  // استانداردهای ارزیابی
  assessmentStandards: {
    gradingScale: [{
      grade: { type: String, required: true, enum: ['A', 'B', 'C', 'D', 'F'] },
      minScore: { type: Number, required: true, min: 0 },
      maxScore: { type: Number, required: true, max: 100 },
      description: { type: String, trim: true }
    }],
    promotionCriteria: {
      minimumAttendance: { type: Number, default: 75, min: 0, max: 100 },
      minimumGPA: { type: Number, default: 60, min: 0, max: 100 },
      compulsorySubjectsPass: { type: Number, default: 1, min: 1 },
      maximumFailures: { type: Number, default: 2, min: 0 }
    },
    graduationRequirements: {
      totalCredits: { type: Number, required: true },
      compulsoryCredits: { type: Number, required: true },
      electiveCredits: { type: Number, required: true },
      communityService: { type: Boolean, default: false },
      finalExam: { type: Boolean, default: true }
    }
  },
  
  // نیازهای منابع انسانی
  staffingRequirements: {
    minimumTeachers: { type: Number, required: true },
    qualifications: [{
      subject: { type: String, required: true },
      minimumEducation: { type: String, required: true },
      experience: { type: Number, default: 0 },
      specialTraining: [{ type: String, trim: true }]
    }],
    supportStaff: [{
      position: { type: String, required: true },
      required: { type: Boolean, default: false },
      qualifications: { type: String, trim: true }
    }]
  },
  
  // امکانات و زیرساخت‌ها
  facilityRequirements: {
    classrooms: { type: Number, required: true },
    laboratories: [{
      type: { type: String, required: true },
      required: { type: Boolean, default: false },
      equipment: [{ type: String, trim: true }]
    }],
    library: {
      required: { type: Boolean, default: true },
      minimumBooks: { type: Number, default: 0 },
      digitalResources: { type: Boolean, default: false }
    },
    playground: { type: Boolean, default: true },
    computerLab: { type: Boolean, default: false },
    scienceLab: { type: Boolean, default: false }
  },
  
  // وضعیت فعلی
  status: {
    type: String,
    enum: ['draft', 'active', 'deprecated', 'suspended'],
    default: 'draft'
  },
  isNationalStandard: { type: Boolean, default: true },
  
  // اطلاعات سیستم
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  lastUpdatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  
  // اسناد و منابع
  documents: [{
    type: {
      type: String,
      enum: ['curriculum_document', 'textbook_list', 'assessment_guide', 
              'teacher_guide', 'implementation_plan', 'other']
    },
    title: { type: String, required: true, trim: true },
    url: { type: String, required: true },
    uploadDate: { type: Date, default: Date.now },
    version: { type: String, trim: true },
    language: { type: String, enum: ['dari', 'pashto', 'english', 'all'] }
  }],
  
  // یادداشت‌ها
  notes: {
    general: { type: String, default: '' },
    implementation: { type: String, default: '' },
    challenges: { type: String, default: '' },
    recommendations: { type: String, default: '' }
  }
}, { 
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Virtual fields
afghanCurriculumSchema.virtual('totalSubjects').get(function() {
  return this.subjects.length;
});

afghanCurriculumSchema.virtual('compulsorySubjects').get(function() {
  return this.subjects.filter(subject => subject.isCompulsory).length;
});

afghanCurriculumSchema.virtual('electiveSubjects').get(function() {
  return this.subjects.filter(subject => !subject.isCompulsory).length;
});

afghanCurriculumSchema.virtual('totalWeeklyHours').get(function() {
  return this.subjects.reduce((total, subject) => total + subject.weeklyHours.total, 0);
});

// Indexes
afghanCurriculumSchema.index({ level: 1, grade: 1 });
afghanCurriculumSchema.index({ status: 1, isNationalStandard: 1 });
afghanCurriculumSchema.index({ 'ministryInfo.approvalDate': -1 });
afghanCurriculumSchema.index({ createdBy: 1 });

module.exports = mongoose.model('AfghanCurriculum', afghanCurriculumSchema);
