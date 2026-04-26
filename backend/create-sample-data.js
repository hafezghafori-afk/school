const mongoose = require('mongoose');
const AfghanSchool = require('./models/AfghanSchool');
const AfghanStudent = require('./models/AfghanStudent');
const AfghanTeacher = require('./models/AfghanTeacher');
require('dotenv').config();

// Sample data for Afghan schools
const sampleSchools = [
  {
    name: 'Habibia High School',
    nameDari: 'لیسه حبیبیه',
    namePashto: 'حبیبیه لیسه',
    schoolCode: 'KBL-001',
    ministryCode: 'MOE-2023-001',
    provinceCode: 'KBL-001',
    province: 'kabul',
    district: 'Kabul',
    village: 'Karte 4',
    coordinates: { latitude: 34.5167, longitude: 69.1833, accuracy: 10 },
    schoolType: 'high',
    schoolLevel: 'grade10_12',
    ownership: 'government',
    contactInfo: {
      phone: '+93-20-2201234',
      mobile: '+93-78-1234567',
      email: 'habibia@edu.gov.af',
      address: 'Karte 4, Kabul, Afghanistan'
    },
    principal: {
      name: 'Mohammad Karimi',
      phone: '+93-78-1234567',
      appointmentDate: new Date('2020-03-15'),
      contractExpiry: new Date('2025-03-15')
    },
    facilities: {
      buildings: [
        { type: 'classroom', condition: 'good', capacity: 40, area: 50 },
        { type: 'library', condition: 'fair', capacity: 30, area: 80 },
        { type: 'office', condition: 'good', capacity: 10, area: 25 }
      ],
      hasElectricity: true,
      hasWater: true,
      hasInternet: false,
      hasPlayground: true,
      hasBoundary: true,
      totalArea: 5000
    },
    academicInfo: {
      totalStudents: 850,
      maleStudents: 450,
      femaleStudents: 400,
      totalTeachers: 35,
      maleTeachers: 20,
      femaleTeachers: 15,
      classesCount: 18,
      shiftType: 'double',
      academicYear: '2023-2024',
      curriculum: 'national'
    },
    financialInfo: {
      budget: {
        government: 500000,
        community: 50000,
        ngp: 0,
        other: 0
      },
      fees: {
        registration: 0,
        monthly: 0,
        exam: 50
      },
      staffSalaries: 350000,
      maintenanceCost: 50000
    },
    status: 'active',
    verificationStatus: 'verified',
    establishmentDate: new Date('1950-09-01'),
    lastInspectionDate: new Date('2023-06-15'),
    nextInspectionDate: new Date('2024-06-15'),
    notes: {
      general: 'One of the oldest and most prestigious schools in Kabul',
      challenges: 'Need renovation of science laboratories',
      achievements: 'Consistently high academic performance'
    }
  },
  {
    name: 'Aisha-i-Durani School',
    nameDari: 'مکتب عایشه درانی',
    namePashto: 'عایشه درانی مکتب',
    schoolCode: 'KBL-002',
    ministryCode: 'MOE-2023-002',
    provinceCode: 'KBL-002',
    province: 'kabul',
    district: 'Kabul',
    village: 'Wazir Akbar Khan',
    coordinates: { latitude: 34.5333, longitude: 69.1667, accuracy: 10 },
    schoolType: 'primary',
    schoolLevel: 'grade1_6',
    ownership: 'private',
    contactInfo: {
      phone: '+93-20-2205678',
      mobile: '+93-79-8765432',
      email: 'info@aisha.edu.af',
      address: 'Wazir Akbar Khan, Kabul, Afghanistan'
    },
    principal: {
      name: 'Fatema Mohammadi',
      phone: '+93-79-8765432',
      appointmentDate: new Date('2019-08-01'),
      contractExpiry: new Date('2024-08-01')
    },
    facilities: {
      buildings: [
        { type: 'classroom', condition: 'excellent', capacity: 30, area: 40 },
        { type: 'library', condition: 'good', capacity: 20, area: 60 },
        { type: 'computer_lab', condition: 'good', capacity: 25, area: 45 }
      ],
      hasElectricity: true,
      hasWater: true,
      hasInternet: true,
      hasPlayground: true,
      hasBoundary: true,
      totalArea: 3000
    },
    academicInfo: {
      totalStudents: 320,
      maleStudents: 165,
      femaleStudents: 155,
      totalTeachers: 18,
      maleTeachers: 8,
      femaleTeachers: 10,
      classesCount: 12,
      shiftType: 'morning',
      academicYear: '2023-2024',
      curriculum: 'national'
    },
    financialInfo: {
      budget: {
        government: 0,
        community: 0,
        ngp: 100000,
        other: 200000
      },
      fees: {
        registration: 5000,
        monthly: 1500,
        exam: 200
      },
      staffSalaries: 180000,
      maintenanceCost: 30000
    },
    status: 'active',
    verificationStatus: 'verified',
    establishmentDate: new Date('2005-04-20'),
    lastInspectionDate: new Date('2023-09-10'),
    nextInspectionDate: new Date('2024-09-10'),
    notes: {
      general: 'Modern private school with focus on technology and languages',
      challenges: 'Limited space for expansion',
      achievements: '100% graduation rate for past 3 years'
    }
  },
  {
    name: 'Herat Technical School',
    nameDari: 'مکتب فنی هرات',
    namePashto: 'هرات فنی مکتب',
    schoolCode: 'HRAT-001',
    ministryCode: 'MOE-2023-003',
    provinceCode: 'HRAT-001',
    province: 'herat',
    district: 'Herat',
    village: 'Center',
    coordinates: { latitude: 34.3508, longitude: 62.2043, accuracy: 10 },
    schoolType: 'technical',
    schoolLevel: 'grade10_12',
    ownership: 'government',
    contactInfo: {
      phone: '+93-40-3201234',
      mobile: '+93-79-2345678',
      email: 'herat.technical@edu.gov.af',
      address: 'Center, Herat, Afghanistan'
    },
    principal: {
      name: 'Ahmad Rahimi',
      phone: '+93-79-2345678',
      appointmentDate: new Date('2018-02-01'),
      contractExpiry: new Date('2025-02-01')
    },
    facilities: {
      buildings: [
        { type: 'classroom', condition: 'good', capacity: 35, area: 45 },
        { type: 'lab', condition: 'excellent', capacity: 20, area: 70 },
        { type: 'workshop', condition: 'good', capacity: 25, area: 100 }
      ],
      hasElectricity: true,
      hasWater: true,
      hasInternet: true,
      hasPlayground: false,
      hasBoundary: true,
      totalArea: 8000
    },
    academicInfo: {
      totalStudents: 280,
      maleStudents: 220,
      femaleStudents: 60,
      totalTeachers: 22,
      maleTeachers: 18,
      femaleTeachers: 4,
      classesCount: 8,
      shiftType: 'morning',
      academicYear: '2023-2024',
      curriculum: 'national'
    },
    financialInfo: {
      budget: {
        government: 400000,
        community: 30000,
        ngp: 70000,
        other: 0
      },
      fees: {
        registration: 0,
        monthly: 0,
        exam: 30
      },
      staffSalaries: 280000,
      maintenanceCost: 80000
    },
    status: 'active',
    verificationStatus: 'verified',
    establishmentDate: new Date('1968-11-15'),
    lastInspectionDate: new Date('2023-07-20'),
    nextInspectionDate: new Date('2024-07-20'),
    notes: {
      general: 'Leading technical school in western Afghanistan',
      challenges: 'Need updated equipment for workshops',
      achievements: 'High employment rate for graduates'
    }
  },
  {
    name: 'Nangarhar Girls School',
    nameDari: 'مکتب دخترانه ننگرهار',
    namePashto: 'ننگرهار د ښځو مکتب',
    schoolCode: 'NGH-001',
    ministryCode: 'MOE-2023-004',
    provinceCode: 'NGH-001',
    province: 'nangarhar',
    district: 'Jalalabad',
    village: 'City Center',
    coordinates: { latitude: 34.4333, longitude: 70.4667, accuracy: 10 },
    schoolType: 'secondary',
    schoolLevel: 'grade7_9',
    ownership: 'government',
    contactInfo: {
      phone: '+93-60-2201234',
      mobile: '+93-78-3456789',
      email: 'nangarhar.girls@edu.gov.af',
      address: 'City Center, Jalalabad, Afghanistan'
    },
    principal: {
      name: 'Roya Ahmadzai',
      phone: '+93-78-3456789',
      appointmentDate: new Date('2021-01-15'),
      contractExpiry: new Date('2026-01-15')
    },
    facilities: {
      buildings: [
        { type: 'classroom', condition: 'fair', capacity: 35, area: 45 },
        { type: 'library', condition: 'fair', capacity: 25, area: 65 },
        { type: 'toilet', condition: 'poor', capacity: 50, area: 30 }
      ],
      hasElectricity: false,
      hasWater: true,
      hasInternet: false,
      hasPlayground: true,
      hasBoundary: true,
      totalArea: 4000
    },
    academicInfo: {
      totalStudents: 450,
      maleStudents: 0,
      femaleStudents: 450,
      totalTeachers: 25,
      maleTeachers: 3,
      femaleTeachers: 22,
      classesCount: 15,
      shiftType: 'double',
      academicYear: '2023-2024',
      curriculum: 'national'
    },
    financialInfo: {
      budget: {
        government: 350000,
        community: 25000,
        ngp: 50000,
        other: 0
      },
      fees: {
        registration: 0,
        monthly: 0,
        exam: 20
      },
      staffSalaries: 250000,
      maintenanceCost: 40000
    },
    status: 'active',
    verificationStatus: 'verified',
    establishmentDate: new Date('1975-03-10'),
    lastInspectionDate: new Date('2023-08-05'),
    nextInspectionDate: new Date('2024-08-05'),
    notes: {
      general: 'Dedicated girls school promoting female education',
      challenges: 'Lack of electricity and internet facilities',
      achievements: 'Increased female enrollment by 30% in last 2 years'
    }
  },
  {
    name: 'Balkh Islamic School',
    nameDari: 'مکتب اسلامی بلخ',
    namePashto: 'بلخ اسلامی مکتب',
    schoolCode: 'BLK-001',
    ministryCode: 'MOE-2023-005',
    provinceCode: 'BLK-001',
    province: 'balkh',
    district: 'Mazar-i-Sharif',
    village: 'Old City',
    coordinates: { latitude: 36.7464, longitude: 66.8965, accuracy: 10 },
    schoolType: 'madrasa',
    schoolLevel: 'grade1_12',
    ownership: 'mosque',
    contactInfo: {
      phone: '+93-60-5201234',
      mobile: '+93-79-4567890',
      email: 'balkh.islamic@mosque.af',
      address: 'Old City, Mazar-i-Sharif, Afghanistan'
    },
    principal: {
      name: 'Mullah Mohammad Omar',
      phone: '+93-79-4567890',
      appointmentDate: new Date('2015-09-01'),
      contractExpiry: new Date('2025-09-01')
    },
    facilities: {
      buildings: [
        { type: 'classroom', condition: 'fair', capacity: 40, area: 50 },
        { type: 'library', condition: 'good', capacity: 30, area: 70 },
        { type: 'toilet', condition: 'fair', capacity: 60, area: 40 }
      ],
      hasElectricity: true,
      hasWater: true,
      hasInternet: false,
      hasPlayground: false,
      hasBoundary: true,
      totalArea: 3500
    },
    academicInfo: {
      totalStudents: 380,
      maleStudents: 280,
      femaleStudents: 100,
      totalTeachers: 20,
      maleTeachers: 18,
      femaleTeachers: 2,
      classesCount: 12,
      shiftType: 'morning',
      academicYear: '2023-2024',
      curriculum: 'national'
    },
    financialInfo: {
      budget: {
        government: 0,
        community: 80000,
        ngp: 20000,
        other: 50000
      },
      fees: {
        registration: 1000,
        monthly: 500,
        exam: 25
      },
      staffSalaries: 180000,
      maintenanceCost: 25000
    },
    status: 'active',
    verificationStatus: 'verified',
    establishmentDate: new Date('1990-05-20'),
    lastInspectionDate: new Date('2023-10-15'),
    nextInspectionDate: new Date('2024-10-15'),
    notes: {
      general: 'Traditional Islamic education combined with modern curriculum',
      challenges: 'Balancing religious and secular education',
      achievements: 'Strong community support and funding'
    }
  }
];

// Sample students data
const generateSampleStudents = async (schools) => {
  const firstNames = ['Ahmad', 'Mohammad', 'Ali', 'Omar', 'Hassan', 'Fatima', 'Aisha', 'Khadija', 'Zahra', 'Maryam'];
  const lastNames = ['Karimi', 'Mohammadi', 'Ahmadi', 'Rahimi', 'Hussaini', 'Ali', 'Omar', 'Hassan', 'Fatemi', 'Amini'];
  const firstNamesDari = ['احمد', 'محمد', 'علی', 'عمر', 'حسن', 'فاطمه', 'عایشه', 'خدیجه', 'زهرا', 'مریم'];
  const lastNamesDari = ['کریمی', 'محمدی', 'احمدی', 'رحیمی', 'حسینی', 'علی', 'عمر', 'حسن', 'فاطمی', 'امینی'];
  
  const students = [];
  
  for (const school of schools) {
    const studentCount = Math.floor(Math.random() * 50) + 20; // 20-70 students per school
    
    for (let i = 0; i < studentCount; i++) {
      const firstNameIndex = Math.floor(Math.random() * firstNames.length);
      const lastNameIndex = Math.floor(Math.random() * lastNames.length);
      const gender = Math.random() > 0.5 ? 'male' : 'female';
      
      const birthYear = 2005 + Math.floor(Math.random() * 12); // Students aged 6-18
      const birthDate = new Date(birthYear, Math.floor(Math.random() * 12), Math.floor(Math.random() * 28) + 1);
      
      const student = {
        personalInfo: {
          firstName: firstNames[firstNameIndex],
          lastName: lastNames[lastNameIndex],
          firstNameDari: firstNamesDari[firstNameIndex],
          lastNameDari: lastNamesDari[lastNameIndex],
          fatherName: lastNames[Math.floor(Math.random() * lastNames.length)],
          gender,
          birthDate,
          birthPlace: school.district,
          nationality: 'Afghan'
        },
        identification: {
          tazkiraNumber: `AF-${school.province.toUpperCase()}-${Math.floor(Math.random() * 1000000)}`,
          tazkiraVolume: Math.floor(Math.random() * 100) + 1,
          tazkiraPage: Math.floor(Math.random() * 500) + 1,
          tazkiraRegistrationDate: new Date(birthYear + 16, 0, 1)
        },
        familyInfo: {
          fatherOccupation: ['Farmer', 'Teacher', 'Shopkeeper', 'Driver', 'Government Employee'][Math.floor(Math.random() * 5)],
          fatherEducation: ['illiterate', 'primary', 'secondary', 'high'][Math.floor(Math.random() * 4)],
          fatherPhone: `+93-7${Math.floor(Math.random() * 9)}-${Math.floor(Math.random() * 10000000).toString().padStart(7, '0')}`,
          motherName: ['Khadija', 'Fatima', 'Aisha', 'Zahra', 'Maryam'][Math.floor(Math.random() * 5)],
          motherOccupation: ['Housewife', 'Teacher', 'Shopkeeper', 'Nurse'][Math.floor(Math.random() * 4)],
          motherEducation: ['illiterate', 'primary', 'secondary', 'high'][Math.floor(Math.random() * 4)],
          familyIncome: ['very_low', 'low', 'medium', 'high'][Math.floor(Math.random() * 4)],
          familySize: Math.floor(Math.random() * 8) + 3
        },
        contactInfo: {
          phone: `+93-7${Math.floor(Math.random() * 9)}-${Math.floor(Math.random() * 10000000).toString().padStart(7, '0')}`,
          mobile: `+93-7${Math.floor(Math.random() * 9)}-${Math.floor(Math.random() * 10000000).toString().padStart(7, '0')}`,
          province: school.province,
          district: school.district,
          address: `Near ${school.name}, ${school.village}`,
          emergencyContact: {
            name: lastNames[Math.floor(Math.random() * lastNames.length)],
            relation: ['father', 'mother', 'uncle', 'brother'][Math.floor(Math.random() * 4)],
            phone: `+93-7${Math.floor(Math.random() * 9)}-${Math.floor(Math.random() * 10000000).toString().padStart(7, '0')}`
          }
        },
        academicInfo: {
          currentSchool: school._id,
          currentGrade: `grade${Math.floor(Math.random() * 12) + 1}`,
          currentSection: ['A', 'B', 'C'][Math.floor(Math.random() * 3)],
          currentShift: ['morning', 'afternoon'][Math.floor(Math.random() * 2)],
          enrollmentDate: new Date(2023, Math.floor(Math.random() * 8), Math.floor(Math.random() * 28) + 1),
          enrollmentType: ['new', 'transfer', 're_admission'][Math.floor(Math.random() * 3)],
          attendanceRecord: {
            totalDays: 180,
            presentDays: Math.floor(Math.random() * 50) + 130,
            absentDays: Math.floor(Math.random() * 30),
            lateDays: Math.floor(Math.random() * 20)
          },
          academicPerformance: {
            lastYearGPA: Math.floor(Math.random() * 30) + 70,
            lastYearRank: Math.floor(Math.random() * 50) + 1,
            subjects: [
              { name: 'Mathematics', score: Math.floor(Math.random() * 30) + 70, grade: 'A' },
              { name: 'Science', score: Math.floor(Math.random() * 30) + 70, grade: 'B' },
              { name: 'Languages', score: Math.floor(Math.random() * 30) + 70, grade: 'A' }
            ]
          }
        },
        medicalInfo: {
          bloodGroup: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'][Math.floor(Math.random() * 8)],
          hasMedicalConditions: Math.random() > 0.8,
          vaccinations: [
            { vaccine: 'BCG', date: new Date(birthYear + 1, 0, 1), nextDue: new Date(birthYear + 16, 0, 1) },
            { vaccine: 'DTP', date: new Date(birthYear + 2, 0, 1), nextDue: new Date(birthYear + 17, 0, 1) }
          ],
          physicalDisabilities: {
            hasDisability: Math.random() > 0.95,
            type: 'visual',
            severity: 'mild',
            needsSpecialSupport: false
          }
        },
        financialInfo: {
          tuitionFee: {
            amount: school.ownership === 'private' ? Math.floor(Math.random() * 2000) + 1000 : 0,
            paymentMethod: ['cash', 'bank', 'mobile', 'sponsor'][Math.floor(Math.random() * 4)]
          },
          receivesScholarship: Math.random() > 0.8,
          receivesAid: Math.random() > 0.7,
          aidType: ['uniform', 'books', 'transportation', 'food'][Math.floor(Math.random() * 4)]
        },
        status: 'active',
        verificationStatus: 'verified'
      };
      
      students.push(student);
    }
  }
  
  return students;
};

// Sample teachers data
const generateSampleTeachers = async (schools) => {
  const firstNames = ['Ahmad', 'Mohammad', 'Ali', 'Abdul', 'Ghulam', 'Fatima', 'Khadija', 'Aisha', 'Zahra', 'Roya'];
  const lastNames = ['Karimi', 'Mohammadi', 'Ahmadi', 'Rahimi', 'Hussaini', 'Siddiqui', 'Ansari', 'Niazi', 'Yousufzai', 'Ghaznavi'];
  const firstNamesDari = ['احمد', 'محمد', 'علی', 'عبدال', 'غلام', 'فاطمه', 'خدیجه', 'عایشه', 'زهرا', 'رؤیا'];
  const lastNamesDari = ['کریمی', 'محمدی', 'احمدی', 'رحیمی', 'حسینی', 'صدیقی', 'انصاری', 'نیازی', 'یوسف‌زئی', 'غزنوی'];
  
  const teachers = [];
  
  for (const school of schools) {
    const teacherCount = Math.floor(Math.random() * 15) + 10; // 10-25 teachers per school
    
    for (let i = 0; i < teacherCount; i++) {
      const firstNameIndex = Math.floor(Math.random() * firstNames.length);
      const lastNameIndex = Math.floor(Math.random() * lastNames.length);
      const gender = Math.random() > 0.3 ? 'male' : 'female';
      
      const birthYear = 1970 + Math.floor(Math.random() * 30); // Teachers aged 23-53
      const birthDate = new Date(birthYear, Math.floor(Math.random() * 12), Math.floor(Math.random() * 28) + 1);
      
      const hireYear = 2010 + Math.floor(Math.random() * 13); // Hired between 2010-2023
      
      const teacher = {
        personalInfo: {
          firstName: firstNames[firstNameIndex],
          lastName: lastNames[lastNameIndex],
          firstNameDari: firstNamesDari[firstNameIndex],
          lastNameDari: lastNamesDari[lastNameIndex],
          fatherName: lastNames[Math.floor(Math.random() * lastNames.length)],
          gender,
          birthDate,
          birthPlace: school.district,
          nationality: 'Afghan'
        },
        identification: {
          tazkiraNumber: `AF-${school.province.toUpperCase()}-${Math.floor(Math.random() * 1000000)}`,
          hasTeacherLicense: Math.random() > 0.2,
          teacherLicenseNumber: Math.random() > 0.2 ? `TCH-${Math.floor(Math.random() * 100000)}` : '',
          teacherLicenseExpiry: Math.random() > 0.2 ? new Date(2025 + Math.floor(Math.random() * 5), 0, 1) : null
        },
        contactInfo: {
          phone: `+93-7${Math.floor(Math.random() * 9)}-${Math.floor(Math.random() * 10000000).toString().padStart(7, '0')}`,
          mobile: `+93-7${Math.floor(Math.random() * 9)}-${Math.floor(Math.random() * 10000000).toString().padStart(7, '0')}`,
          email: `${firstNames[firstNameIndex].toLowerCase()}.${lastNames[lastNameIndex].toLowerCase()}@${school.schoolCode.toLowerCase()}.edu.af`,
          province: school.province,
          district: school.district,
          address: `Near ${school.name}, ${school.village}`
        },
        educationInfo: {
          highestEducation: ['high_school', 'bachelor', 'master', 'phd'][Math.floor(Math.random() * 4)],
          fieldOfStudy: ['Mathematics', 'Science', 'Languages', 'History', 'Geography', 'Computer Science'][Math.floor(Math.random() * 6)],
          university: ['Kabul University', 'Herat University', 'Balkh University', 'Nangarhar University'][Math.floor(Math.random() * 4)],
          graduationYear: birthYear + 22,
          gpa: Math.random() * 2 + 2, // 2.0-4.0
          hasTeachingCertificate: Math.random() > 0.3,
          teachingCertificateType: Math.random() > 0.3 ? 'Professional' : 'Basic',
          teachingCertificateYear: hireYear
        },
        employmentInfo: {
          currentSchool: school._id,
          employeeId: `EMP-${school.schoolCode}-${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`,
          position: ['teacher', 'principal', 'vice_principal', 'admin_staff'][Math.floor(Math.random() * 4)],
          employmentType: ['permanent', 'contract', 'temporary'][Math.floor(Math.random() * 3)],
          hireDate: new Date(hireYear, Math.floor(Math.random() * 12), Math.floor(Math.random() * 28) + 1),
          contractExpiry: new Date(hireYear + 5, Math.floor(Math.random() * 12), Math.floor(Math.random() * 28) + 1),
          workSchedule: ['full_time', 'part_time'][Math.floor(Math.random() * 2)],
          subjects: [{
            subjectName: ['Mathematics', 'Science', 'Languages', 'History', 'Geography', 'Computer Science'][Math.floor(Math.random() * 6)],
            subjectCode: `SUBJ-${Math.floor(Math.random() * 100)}`,
            gradeLevels: [`grade${Math.floor(Math.random() * 12) + 1}`]
          }],
          classes: [{
            grade: `grade${Math.floor(Math.random() * 12) + 1}`,
            section: ['A', 'B', 'C'][Math.floor(Math.random() * 3)],
            subject: ['Mathematics', 'Science', 'Languages'][Math.floor(Math.random() * 3)],
            shift: ['morning', 'afternoon'][Math.floor(Math.random() * 2)]
          }],
          workload: {
            teachingHours: Math.floor(Math.random() * 20) + 10,
            adminHours: Math.floor(Math.random() * 10),
            totalHours: 0
          }
        },
        financialInfo: {
          salary: {
            base: Math.floor(Math.random() * 10000) + 15000,
            housing: Math.floor(Math.random() * 3000) + 2000,
            transport: Math.floor(Math.random() * 2000) + 1000,
            other: Math.floor(Math.random() * 1000) + 500
          },
          bankAccount: {
            bankName: ['Afghanistan International Bank', 'Kabul Bank', 'Azizi Bank'][Math.floor(Math.random() * 3)],
            accountNumber: `ACC-${Math.floor(Math.random() * 1000000000)}`,
            accountHolder: `${firstNames[firstNameIndex]} ${lastNames[lastNameIndex]}`
          },
          receivesBonus: Math.random() > 0.7,
          bonusCriteria: 'Performance based'
        },
        performanceInfo: {
          evaluations: [{
            date: new Date(2023, Math.floor(Math.random() * 12), Math.floor(Math.random() * 28) + 1),
            evaluator: 'Principal',
            criteria: {
              teaching_quality: Math.random() * 2 + 3,
              classroom_management: Math.random() * 2 + 3,
              student_engagement: Math.random() * 2 + 3,
              professional_development: Math.random() * 2 + 3,
              collaboration: Math.random() * 2 + 3
            },
            overall_score: Math.random() * 2 + 3,
            comments: 'Good performance overall',
            recommendations: 'Continue professional development'
          }],
          achievements: [{
            title: 'Best Teacher Award',
            description: 'Recognized for outstanding teaching',
            date: new Date(2023, 6, 15),
            recognized_by: 'Ministry of Education'
          }],
          professionalDevelopment: {
            trainings: [{
              title: 'Modern Teaching Methods',
              provider: 'Ministry of Education',
              startDate: new Date(2023, 1, 1),
              endDate: new Date(2023, 1, 15),
              certificate: true,
              hours: 40
            }]
          }
        },
        status: 'active',
        verificationStatus: 'verified'
      };
      
      // Calculate total hours
      teacher.employmentInfo.workload.totalHours = 
        teacher.employmentInfo.workload.teachingHours + teacher.employmentInfo.workload.adminHours;
      
      teachers.push(teacher);
    }
  }
  
  return teachers;
};

const createSampleData = async () => {
  try {
    // Connect to database
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/school_db');
    console.log('Connected to database');

    // Clear existing sample data
    await AfghanSchool.deleteMany({});
    await AfghanStudent.deleteMany({});
    await AfghanTeacher.deleteMany({});
    console.log('Cleared existing data');

    // Create schools
    const createdSchools = await AfghanSchool.insertMany(sampleSchools);
    console.log(`Created ${createdSchools.length} schools`);

    // Generate and create students
    const students = await generateSampleStudents(createdSchools);
    const createdStudents = await AfghanStudent.insertMany(students);
    console.log(`Created ${createdStudents.length} students`);

    // Generate and create teachers
    const teachers = await generateSampleTeachers(createdSchools);
    const createdTeachers = await AfghanTeacher.insertMany(teachers);
    console.log(`Created ${createdTeachers.length} teachers`);

    // Update school statistics
    for (let i = 0; i < createdSchools.length; i++) {
      const school = createdSchools[i];
      const schoolStudents = createdStudents.filter(s => 
        s.academicInfo.currentSchool.toString() === school._id.toString()
      );
      const schoolTeachers = createdTeachers.filter(t => 
        t.employmentInfo.currentSchool.toString() === school._id.toString()
      );

      await AfghanSchool.findByIdAndUpdate(school._id, {
        'academicInfo.totalStudents': schoolStudents.length,
        'academicInfo.maleStudents': schoolStudents.filter(s => s.personalInfo.gender === 'male').length,
        'academicInfo.femaleStudents': schoolStudents.filter(s => s.personalInfo.gender === 'female').length,
        'academicInfo.totalTeachers': schoolTeachers.length,
        'academicInfo.maleTeachers': schoolTeachers.filter(t => t.personalInfo.gender === 'male').length,
        'academicInfo.femaleTeachers': schoolTeachers.filter(t => t.personalInfo.gender === 'female').length
      });
    }

    console.log('\n🎉 Sample data created successfully!');
    console.log(`📚 Schools: ${createdSchools.length}`);
    console.log(`👨‍🎓 Students: ${createdStudents.length}`);
    console.log(`👩‍🏫 Teachers: ${createdTeachers.length}`);
    
    console.log('\n📊 Summary:');
    createdSchools.forEach(school => {
      console.log(`🏫 ${school.name} (${school.province}): ${school.academicInfo.totalStudents} students, ${school.academicInfo.totalTeachers} teachers`);
    });

  } catch (error) {
    console.error('Error creating sample data:', error);
  } finally {
    await mongoose.connection.close();
  }
};

createSampleData();
