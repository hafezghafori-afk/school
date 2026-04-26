const express = require('express');
const mongoose = require('mongoose');
const AfghanTeacher = require('../models/AfghanTeacher');
const AfghanSchool = require('../models/AfghanSchool');
const { requireFields } = require('../middleware/validate');
const { ok, fail } = require('../utils/response');
const { logActivity } = require('../utils/activity');
const { attachWriteActivityAudit } = require('../utils/routeWriteAudit');

const router = express.Router();
const auditWrite = (payload) => logActivity(payload);
attachWriteActivityAudit(router, { targetType: 'AfghanTeacher', actionPrefix: 'afghan_teacher', audit: auditWrite });

// Helper functions
const calculateAge = (birthDate) => {
  const today = new Date();
  const birth = new Date(birthDate);
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age--;
  }
  return age;
};

const calculateYearsOfExperience = (hireDate) => {
  const today = new Date();
  const hire = new Date(hireDate);
  return today.getFullYear() - hire.getFullYear();
};

const getTeacherStats = async (schoolId, position) => {
  const query = { status: 'active' };
  if (schoolId) query['employmentInfo.currentSchool'] = schoolId;
  if (position) query['employmentInfo.position'] = position;

  const teachers = await AfghanTeacher.find(query);
  
  return {
    total: teachers.length,
    male: teachers.filter(t => t.personalInfo.gender === 'male').length,
    female: teachers.filter(t => t.personalInfo.gender === 'female').length,
    averageAge: teachers.length > 0 ? 
      Math.round(teachers.reduce((sum, t) => sum + calculateAge(t.personalInfo.birthDate), 0) / teachers.length) : 0,
    averageExperience: teachers.length > 0 ? 
      Math.round(teachers.reduce((sum, t) => sum + calculateYearsOfExperience(t.employmentInfo.hireDate), 0) / teachers.length) : 0,
    byPosition: teachers.reduce((acc, teacher) => {
      const position = teacher.employmentInfo.position;
      acc[position] = (acc[position] || 0) + 1;
      return acc;
    }, {}),
    byEducation: teachers.reduce((acc, teacher) => {
      const education = teacher.educationInfo.highestEducation;
      acc[education] = (acc[education] || 0) + 1;
      return acc;
    }, {}),
    averageSalary: teachers.length > 0 ? 
      Math.round(teachers.reduce((sum, t) => sum + (t.financialInfo.salary.base + t.financialInfo.salary.housing + t.financialInfo.salary.transport + t.financialInfo.salary.other), 0) / teachers.length) : 0
  };
};

// GET /api/afghan-teachers/dashboard - Teacher dashboard statistics
router.get('/dashboard', async (req, res) => {
  try {
    const { schoolId, position, province } = req.query;
    
    const query = { status: 'active' };
    if (schoolId) query['employmentInfo.currentSchool'] = schoolId;
    if (position) query['employmentInfo.position'] = position;
    if (province) query['contactInfo.province'] = province;

    const teachers = await AfghanTeacher.find(query);
    
    const stats = {
      total: teachers.length,
      male: teachers.filter(t => t.personalInfo.gender === 'male').length,
      female: teachers.filter(t => t.personalInfo.gender === 'female').length,
      averageAge: teachers.length > 0 ? 
        Math.round(teachers.reduce((sum, t) => sum + calculateAge(t.personalInfo.birthDate), 0) / teachers.length) : 0,
      averageExperience: teachers.length > 0 ? 
        Math.round(teachers.reduce((sum, t) => sum + calculateYearsOfExperience(t.employmentInfo.hireDate), 0) / teachers.length) : 0,
      byPosition: teachers.reduce((acc, teacher) => {
        const position = teacher.employmentInfo.position;
        acc[position] = (acc[position] || 0) + 1;
        return acc;
      }, {}),
      byEducation: teachers.reduce((acc, teacher) => {
        const education = teacher.educationInfo.highestEducation;
        acc[education] = (acc[education] || 0) + 1;
        return acc;
      }, {}),
      byProvince: teachers.reduce((acc, teacher) => {
        const province = teacher.contactInfo.province;
        acc[province] = (acc[province] || 0) + 1;
        return acc;
      }, {}),
      averageSalary: teachers.length > 0 ? 
        Math.round(teachers.reduce((sum, t) => sum + (t.financialInfo.salary.base + t.financialInfo.salary.housing + t.financialInfo.salary.transport + t.financialInfo.salary.other), 0) / teachers.length) : 0,
      withLicense: teachers.filter(t => t.identification.hasTeacherLicense).length,
      contractTypes: teachers.reduce((acc, teacher) => {
        const type = teacher.employmentInfo.employmentType;
        acc[type] = (acc[type] || 0) + 1;
        return acc;
      }, {})
    };

    return ok(res, stats, 'Teacher dashboard statistics retrieved successfully');
  } catch (error) {
    console.error('Teacher Dashboard Error:', error);
    return fail(res, 'Failed to retrieve teacher dashboard statistics', 500);
  }
});

// GET /api/afghan-teachers - Get all teachers with filtering
router.get('/', async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      schoolId,
      position,
      gender,
      province,
      district,
      education,
      status = 'active',
      search,
      experienceRange
    } = req.query;

    const query = { status };

    if (schoolId) query['employmentInfo.currentSchool'] = schoolId;
    if (position) query['employmentInfo.position'] = position;
    if (gender) query['personalInfo.gender'] = gender;
    if (province) query['contactInfo.province'] = province;
    if (district) query['contactInfo.district'] = district;
    if (education) query['educationInfo.highestEducation'] = education;

    if (experienceRange) {
      const [minExp, maxExp] = experienceRange.split('-').map(Number);
      const today = new Date();
      const minHireDate = new Date(today.getFullYear() - maxExp, today.getMonth(), today.getDate());
      const maxHireDate = new Date(today.getFullYear() - minExp, today.getMonth(), today.getDate());
      query['employmentInfo.hireDate'] = { $gte: minHireDate, $lte: maxHireDate };
    }

    if (search) {
      query.$or = [
        { 'personalInfo.firstName': { $regex: search, $options: 'i' } },
        { 'personalInfo.lastName': { $regex: search, $options: 'i' } },
        { 'personalInfo.firstNameDari': { $regex: search, $options: 'i' } },
        { 'personalInfo.lastNameDari': { $regex: search, $options: 'i' } },
        { 'identification.tazkiraNumber': { $regex: search, $options: 'i' } },
        { 'employmentInfo.employeeId': { $regex: search, $options: 'i' } }
      ];
    }

    const teachers = await AfghanTeacher.find(query)
      .populate('employmentInfo.currentSchool', 'name province district schoolType')
      .populate('createdBy', 'name email')
      .populate('lastUpdatedBy', 'name email')
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .sort({ createdAt: -1 });

    const total = await AfghanTeacher.countDocuments(query);

    return ok(res, {
      teachers,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    }, 'Teachers retrieved successfully');
  } catch (error) {
    console.error('Get Teachers Error:', error);
    return fail(res, 'Failed to retrieve teachers', 500);
  }
});

// GET /api/afghan-teachers/:id - Get single teacher
router.get('/:id', async (req, res) => {
  try {
    const teacher = await AfghanTeacher.findById(req.params.id)
      .populate('employmentInfo.currentSchool', 'name province district schoolType')
      .populate('createdBy', 'name email')
      .populate('lastUpdatedBy', 'name email');

    if (!teacher) {
      return fail(res, 'Teacher not found', 404);
    }

    return ok(res, teacher, 'Teacher retrieved successfully');
  } catch (error) {
    console.error('Get Teacher Error:', error);
    return fail(res, 'Failed to retrieve teacher', 500);
  }
});

// POST /api/afghan-teachers - Create new teacher
router.post('/', requireFields([
  'personalInfo.firstName', 'personalInfo.lastName', 'personalInfo.firstNameDari', 'personalInfo.lastNameDari',
  'personalInfo.fatherName', 'personalInfo.gender', 'personalInfo.birthDate', 'personalInfo.birthPlace',
  'identification.tazkiraNumber',
  'contactInfo.mobile', 'contactInfo.province', 'contactInfo.district', 'contactInfo.address',
  'educationInfo.highestEducation', 'educationInfo.fieldOfStudy', 'educationInfo.university', 'educationInfo.graduationYear',
  'employmentInfo.currentSchool', 'employmentInfo.employeeId', 'employmentInfo.position', 'employmentInfo.employmentType', 'employmentInfo.hireDate',
  'financialInfo.salary.base'
]), async (req, res) => {
  try {
    const teacherData = {
      ...req.body,
      createdBy: req.user?.id || 'system'
    };

    // Check if tazkira number already exists
    const existingTeacher = await AfghanTeacher.findOne({ 
      'identification.tazkiraNumber': teacherData.identification.tazkiraNumber 
    });
    if (existingTeacher) {
      return fail(res, 'Tazkira number already exists', 400);
    }

    // Check if employee ID already exists
    const existingEmployee = await AfghanTeacher.findOne({ 
      'employmentInfo.employeeId': teacherData.employmentInfo.employeeId 
    });
    if (existingEmployee) {
      return fail(res, 'Employee ID already exists', 400);
    }

    // Validate school exists
    const school = await AfghanSchool.findById(teacherData.employmentInfo.currentSchool);
    if (!school) {
      return fail(res, 'School not found', 400);
    }

    const teacher = new AfghanTeacher(teacherData);
    await teacher.save();

    // Populate school info for response
    await teacher.populate('employmentInfo.currentSchool', 'name province district');

    return ok(res, teacher, 'Teacher created successfully', 201);
  } catch (error) {
    console.error('Create Teacher Error:', error);
    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern)[0];
      if (field.includes('tazkiraNumber')) {
        return fail(res, 'Tazkira number already exists', 400);
      } else if (field.includes('employeeId')) {
        return fail(res, 'Employee ID already exists', 400);
      }
    }
    return fail(res, 'Failed to create teacher', 500);
  }
});

// PUT /api/afghan-teachers/:id - Update teacher
router.put('/:id', async (req, res) => {
  try {
    const teacherData = {
      ...req.body,
      lastUpdatedBy: req.user?.id || 'system'
    };

    // If updating school, validate it exists
    if (teacherData.employmentInfo?.currentSchool) {
      const school = await AfghanSchool.findById(teacherData.employmentInfo.currentSchool);
      if (!school) {
        return fail(res, 'School not found', 400);
      }
    }

    const teacher = await AfghanTeacher.findByIdAndUpdate(
      req.params.id,
      teacherData,
      { new: true, runValidators: true }
    ).populate('employmentInfo.currentSchool', 'name province district');

    if (!teacher) {
      return fail(res, 'Teacher not found', 404);
    }

    return ok(res, teacher, 'Teacher updated successfully');
  } catch (error) {
    console.error('Update Teacher Error:', error);
    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern)[0];
      if (field.includes('tazkiraNumber')) {
        return fail(res, 'Tazkira number already exists', 400);
      } else if (field.includes('employeeId')) {
        return fail(res, 'Employee ID already exists', 400);
      }
    }
    return fail(res, 'Failed to update teacher', 500);
  }
});

// DELETE /api/afghan-teachers/:id - Delete teacher
router.delete('/:id', async (req, res) => {
  try {
    const teacher = await AfghanTeacher.findByIdAndDelete(req.params.id);
    if (!teacher) {
      return fail(res, 'Teacher not found', 404);
    }

    return ok(res, teacher, 'Teacher deleted successfully');
  } catch (error) {
    console.error('Delete Teacher Error:', error);
    return fail(res, 'Failed to delete teacher', 500);
  }
});

// POST /api/afghan-teachers/bulk - Bulk create teachers
router.post('/bulk', requireFields(['teachers']), async (req, res) => {
  try {
    const { teachers } = req.body;
    
    if (!Array.isArray(teachers) || teachers.length === 0) {
      return fail(res, 'Teachers array is required and cannot be empty', 400);
    }

    if (teachers.length > 50) {
      return fail(res, 'Cannot create more than 50 teachers at once', 400);
    }

    const results = {
      successful: [],
      failed: [],
      summary: {
        total: teachers.length,
        successful: 0,
        failed: 0
      }
    };

    for (let i = 0; i < teachers.length; i++) {
      const teacherData = {
        ...teachers[i],
        createdBy: req.user?.id || 'system'
      };

      try {
        // Check if tazkira number already exists
        const existingTeacher = await AfghanTeacher.findOne({ 
          'identification.tazkiraNumber': teacherData.identification.tazkiraNumber 
        });
        if (existingTeacher) {
          results.failed.push({
            index: i,
            tazkiraNumber: teacherData.identification.tazkiraNumber,
            error: 'Tazkira number already exists'
          });
          continue;
        }

        // Check if employee ID already exists
        const existingEmployee = await AfghanTeacher.findOne({ 
          'employmentInfo.employeeId': teacherData.employmentInfo.employeeId 
        });
        if (existingEmployee) {
          results.failed.push({
            index: i,
            employeeId: teacherData.employmentInfo.employeeId,
            error: 'Employee ID already exists'
          });
          continue;
        }

        // Validate school exists
        const school = await AfghanSchool.findById(teacherData.employmentInfo.currentSchool);
        if (!school) {
          results.failed.push({
            index: i,
            tazkiraNumber: teacherData.identification.tazkiraNumber,
            error: 'School not found'
          });
          continue;
        }

        const teacher = new AfghanTeacher(teacherData);
        await teacher.save();
        
        results.successful.push({
          index: i,
          tazkiraNumber: teacherData.identification.tazkiraNumber,
          employeeId: teacherData.employmentInfo.employeeId,
          teacherId: teacher._id
        });
        results.summary.successful++;
      } catch (error) {
        results.failed.push({
          index: i,
          tazkiraNumber: teacherData.identification.tazkiraNumber,
          error: error.message
        });
        results.summary.failed++;
      }
    }

    return ok(res, results, 'Bulk teacher creation completed');
  } catch (error) {
    console.error('Bulk Create Teachers Error:', error);
    return fail(res, 'Failed to create teachers in bulk', 500);
  }
});

// GET /api/afghan-teachers/performance/:schoolId - Get teacher performance statistics
router.get('/performance/:schoolId', async (req, res) => {
  try {
    const { schoolId } = req.params;
    const { position, year = new Date().getFullYear() } = req.query;

    const query = { 
      'employmentInfo.currentSchool': schoolId,
      status: 'active'
    };
    
    if (position) query['employmentInfo.position'] = position;

    const teachers = await AfghanTeacher.find(query);
    
    const performanceStats = {
      totalTeachers: teachers.length,
      averageScore: 0,
      byPosition: {},
      byGender: {
        male: { total: 0, averageScore: 0 },
        female: { total: 0, averageScore: 0 }
      },
      evaluationSummary: {
        evaluated: 0,
        pending: 0,
        excellent: 0,
        good: 0,
        satisfactory: 0,
        needsImprovement: 0
      },
      topPerformers: [],
      needsImprovement: [],
      professionalDevelopment: {
        totalTrainings: 0,
        averageHours: 0,
        byPosition: {}
      }
    };

    let totalScore = 0;
    let evaluatedCount = 0;

    for (const teacher of teachers) {
      const performance = teacher.performanceInfo;
      
      // Latest evaluation
      if (performance.evaluations && performance.evaluations.length > 0) {
        const latestEvaluation = performance.evaluations[performance.evaluations.length - 1];
        const score = latestEvaluation.overall_score || 0;
        
        totalScore += score;
        evaluatedCount++;
        
        // By position
        const position = teacher.employmentInfo.position;
        if (!performanceStats.byPosition[position]) {
          performanceStats.byPosition[position] = { total: 0, averageScore: 0, scores: [] };
        }
        performanceStats.byPosition[position].total++;
        performanceStats.byPosition[position].scores.push(score);

        // By gender
        const gender = teacher.personalInfo.gender;
        performanceStats.byGender[gender].total++;
        performanceStats.byGender[gender].averageScore += score;

        // Evaluation summary
        performanceStats.evaluationSummary.evaluated++;
        if (score >= 4.5) {
          performanceStats.evaluationSummary.excellent++;
        } else if (score >= 3.5) {
          performanceStats.evaluationSummary.good++;
        } else if (score >= 2.5) {
          performanceStats.evaluationSummary.satisfactory++;
        } else {
          performanceStats.evaluationSummary.needsImprovement++;
        }

        // Top performers
        if (score >= 4.5) {
          performanceStats.topPerformers.push({
            teacherId: teacher._id,
            name: `${teacher.personalInfo.firstName} ${teacher.personalInfo.lastName}`,
            score,
            position: teacher.employmentInfo.position
          });
        }

        // Needs improvement
        if (score < 2.5) {
          performanceStats.needsImprovement.push({
            teacherId: teacher._id,
            name: `${teacher.personalInfo.firstName} ${teacher.personalInfo.lastName}`,
            score,
            position: teacher.employmentInfo.position
          });
        }
      } else {
        performanceStats.evaluationSummary.pending++;
      }

      // Professional development
      const pd = teacher.professionalDevelopment;
      if (pd.trainings && pd.trainings.length > 0) {
        performanceStats.professionalDevelopment.totalTrainings += pd.trainings.length;
        const totalHours = pd.trainings.reduce((sum, training) => sum + (training.hours || 0), 0);
        performanceStats.professionalDevelopment.averageHours += totalHours;

        const position = teacher.employmentInfo.position;
        if (!performanceStats.professionalDevelopment.byPosition[position]) {
          performanceStats.professionalDevelopment.byPosition[position] = { trainings: 0, hours: 0 };
        }
        performanceStats.professionalDevelopment.byPosition[position].trainings += pd.trainings.length;
        performanceStats.professionalDevelopment.byPosition[position].hours += totalHours;
      }
    }

    // Calculate averages
    performanceStats.averageScore = evaluatedCount > 0 ? 
      (totalScore / evaluatedCount).toFixed(2) : 0;

    // Position averages
    for (const position in performanceStats.byPosition) {
      const positionData = performanceStats.byPosition[position];
      positionData.averageScore = positionData.scores.length > 0 ? 
        (positionData.scores.reduce((sum, score) => sum + score, 0) / positionData.scores.length).toFixed(2) : 0;
      delete positionData.scores;
    }

    // Gender averages
    performanceStats.byGender.male.averageScore = performanceStats.byGender.male.total > 0 ? 
      (performanceStats.byGender.male.averageScore / performanceStats.byGender.male.total).toFixed(2) : 0;
    performanceStats.byGender.female.averageScore = performanceStats.byGender.female.total > 0 ? 
      (performanceStats.byGender.female.averageScore / performanceStats.byGender.female.total).toFixed(2) : 0;

    // Professional development averages
    const totalTeachers = teachers.length;
    performanceStats.professionalDevelopment.averageHours = totalTeachers > 0 ? 
      Math.round(performanceStats.professionalDevelopment.averageHours / totalTeachers) : 0;

    // Sort top performers and needs improvement
    performanceStats.topPerformers.sort((a, b) => b.score - a.score);
    performanceStats.needsImprovement.sort((a, b) => a.score - b.score);

    return ok(res, performanceStats, 'Teacher performance statistics retrieved successfully');
  } catch (error) {
    console.error('Teacher Performance Error:', error);
    return fail(res, 'Failed to retrieve teacher performance statistics', 500);
  }
});

// POST /api/afghan-teachers/:id/evaluation - Add teacher evaluation
router.post('/:id/evaluation', requireFields(['date', 'evaluator', 'criteria']), async (req, res) => {
  try {
    const { date, evaluator, criteria, comments, recommendations } = req.body;
    
    const teacher = await AfghanTeacher.findById(req.params.id);
    if (!teacher) {
      return fail(res, 'Teacher not found', 404);
    }

    // Calculate overall score
    const scores = Object.values(criteria);
    const overall_score = scores.reduce((sum, score) => sum + score, 0) / scores.length;

    const newEvaluation = {
      date: new Date(date),
      evaluator,
      criteria,
      overall_score,
      comments: comments || '',
      recommendations: recommendations || ''
    };

    teacher.performanceInfo.evaluations.push(newEvaluation);
    teacher.performanceInfo.lastEvaluationDate = new Date(date);
    teacher.lastUpdatedBy = req.user?.id || 'system';
    
    await teacher.save();

    return ok(res, newEvaluation, 'Teacher evaluation added successfully', 201);
  } catch (error) {
    console.error('Add Evaluation Error:', error);
    return fail(res, 'Failed to add teacher evaluation', 500);
  }
});

// POST /api/afghan-teachers/:id/training - Add professional development training
router.post('/:id/training', requireFields(['title', 'provider', 'startDate', 'endDate']), async (req, res) => {
  try {
    const { title, provider, startDate, endDate, certificate, hours } = req.body;
    
    const teacher = await AfghanTeacher.findById(req.params.id);
    if (!teacher) {
      return fail(res, 'Teacher not found', 404);
    }

    const newTraining = {
      title,
      provider,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      certificate: certificate || false,
      hours: hours || 0
    };

    teacher.professionalDevelopment.trainings.push(newTraining);
    teacher.lastUpdatedBy = req.user?.id || 'system';
    
    await teacher.save();

    return ok(res, newTraining, 'Training added successfully', 201);
  } catch (error) {
    console.error('Add Training Error:', error);
    return fail(res, 'Failed to add training', 500);
  }
});

// GET /api/afghan-teachers/workload/:schoolId - Get teacher workload statistics
router.get('/workload/:schoolId', async (req, res) => {
  try {
    const { schoolId } = req.params;
    const { position } = req.query;

    const query = { 
      'employmentInfo.currentSchool': schoolId,
      status: 'active'
    };
    
    if (position) query['employmentInfo.position'] = position;

    const teachers = await AfghanTeacher.find(query);
    
    const workloadStats = {
      totalTeachers: teachers.length,
      totalTeachingHours: 0,
      totalAdminHours: 0,
      totalHours: 0,
      averageHours: 0,
      byPosition: {},
      overloadedTeachers: [], // Teachers with > 40 hours/week
      underutilizedTeachers: [], // Teachers with < 20 hours/week
      subjectDistribution: {},
      classDistribution: {}
    };

    for (const teacher of teachers) {
      const workload = teacher.employmentInfo.workload;
      
      workloadStats.totalTeachingHours += workload.teachingHours;
      workloadStats.totalAdminHours += workload.adminHours;
      workloadStats.totalHours += workload.totalHours;

      // By position
      const position = teacher.employmentInfo.position;
      if (!workloadStats.byPosition[position]) {
        workloadStats.byPosition[position] = { 
          count: 0, 
          averageHours: 0, 
          totalHours: 0 
        };
      }
      workloadStats.byPosition[position].count++;
      workloadStats.byPosition[position].totalHours += workload.totalHours;

      // Subject distribution
      for (const subject of teacher.employmentInfo.subjects) {
        if (!workloadStats.subjectDistribution[subject.subjectName]) {
          workloadStats.subjectDistribution[subject.subjectName] = 0;
        }
        workloadStats.subjectDistribution[subject.subjectName]++;
      }

      // Class distribution
      for (const classInfo of teacher.employmentInfo.classes) {
        const classKey = `${classInfo.grade}-${classInfo.section}`;
        if (!workloadStats.classDistribution[classKey]) {
          workloadStats.classDistribution[classKey] = 0;
        }
        workloadStats.classDistribution[classKey]++;
      }

      // Overloaded teachers (>40 hours/week)
      if (workload.totalHours > 40) {
        workloadStats.overloadedTeachers.push({
          teacherId: teacher._id,
          name: `${teacher.personalInfo.firstName} ${teacher.personalInfo.lastName}`,
          totalHours: workload.totalHours,
          position: teacher.employmentInfo.position
        });
      }

      // Underutilized teachers (<20 hours/week)
      if (workload.totalHours < 20 && workload.totalHours > 0) {
        workloadStats.underutilizedTeachers.push({
          teacherId: teacher._id,
          name: `${teacher.personalInfo.firstName} ${teacher.personalInfo.lastName}`,
          totalHours: workload.totalHours,
          position: teacher.employmentInfo.position
        });
      }
    }

    // Calculate averages
    workloadStats.averageHours = teachers.length > 0 ? 
      Math.round(workloadStats.totalHours / teachers.length) : 0;

    // Position averages
    for (const position in workloadStats.byPosition) {
      const positionData = workloadStats.byPosition[position];
      positionData.averageHours = positionData.count > 0 ? 
        Math.round(positionData.totalHours / positionData.count) : 0;
      delete positionData.totalHours;
    }

    // Sort overloaded and underutilized teachers
    workloadStats.overloadedTeachers.sort((a, b) => b.totalHours - a.totalHours);
    workloadStats.underutilizedTeachers.sort((a, b) => a.totalHours - b.totalHours);

    return ok(res, workloadStats, 'Teacher workload statistics retrieved successfully');
  } catch (error) {
    console.error('Workload Stats Error:', error);
    return fail(res, 'Failed to retrieve teacher workload statistics', 500);
  }
});

module.exports = router;
