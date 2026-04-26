const express = require('express');
const mongoose = require('mongoose');
const AfghanSchool = require('../models/AfghanSchool');
const AfghanStudent = require('../models/AfghanStudent');
const AfghanTeacher = require('../models/AfghanTeacher');
const { requireFields } = require('../middleware/validate');
const { ok, fail } = require('../utils/response');
const { logActivity } = require('../utils/activity');
const { attachWriteActivityAudit } = require('../utils/routeWriteAudit');

const router = express.Router();
const auditWrite = (payload) => logActivity(payload);
attachWriteActivityAudit(router, { targetType: 'AfghanSchool', actionPrefix: 'afghan_school', audit: auditWrite });

// Helper functions
const getProvinceStats = async (province) => {
  const schools = await AfghanSchool.find({ province, status: 'active' });
  const students = await AfghanStudent.find({ 
    'contactInfo.province': province, 
    status: 'active' 
  });
  const teachers = await AfghanTeacher.find({ 
    'contactInfo.province': province, 
    status: 'active' 
  });

  return {
    totalSchools: schools.length,
    totalStudents: students.length,
    totalTeachers: teachers.length,
    maleStudents: students.filter(s => s.personalInfo.gender === 'male').length,
    femaleStudents: students.filter(s => s.personalInfo.gender === 'female').length,
    maleTeachers: teachers.filter(t => t.personalInfo.gender === 'male').length,
    femaleTeachers: teachers.filter(t => t.personalInfo.gender === 'female').length,
    governmentSchools: schools.filter(s => s.ownership === 'government').length,
    privateSchools: schools.filter(s => s.ownership === 'private').length,
    averageStudentTeacherRatio: teachers.length > 0 ? (students.length / teachers.length).toFixed(2) : 0
  };
};

// GET /api/afghan-schools/dashboard - National dashboard statistics
router.get('/dashboard', async (req, res) => {
  try {
    const provinces = [
      'kabul', 'herat', 'kandahar', 'balkh', 'nangarhar', 'badakhshan',
      'takhar', 'samangan', 'kunduz', 'baghlan', 'farah', 'nimroz',
      'helmand', 'ghor', 'daykundi', 'uruzgan', 'zabul', 'paktika',
      'khost', 'paktia', 'logar', 'parwan', 'kapisa', 'panjshir',
      'badghis', 'faryab', 'jowzjan', 'saripul'
    ];

    const nationalStats = {
      totalSchools: await AfghanSchool.countDocuments({ status: 'active' }),
      totalStudents: await AfghanStudent.countDocuments({ status: 'active' }),
      totalTeachers: await AfghanTeacher.countDocuments({ status: 'active' }),
      provinces: {}
    };

    // Calculate stats for each province
    for (const province of provinces) {
      nationalStats.provinces[province] = await getProvinceStats(province);
    }

    return ok(res, nationalStats, 'National dashboard statistics retrieved successfully');
  } catch (error) {
    console.error('Dashboard Error:', error);
    return fail(res, 'Failed to retrieve dashboard statistics', 500);
  }
});

// GET /api/afghan-schools - Get all schools with filtering
router.get('/', async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      province,
      district,
      schoolType,
      ownership,
      status = 'active',
      search
    } = req.query;

    const query = { status };

    if (province) query.province = province;
    if (district) query.district = district;
    if (schoolType) query.schoolType = schoolType;
    if (ownership) query.ownership = ownership;

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { nameDari: { $regex: search, $options: 'i' } },
        { schoolCode: { $regex: search, $options: 'i' } }
      ];
    }

    const schools = await AfghanSchool.find(query)
      .populate('createdBy', 'name email')
      .populate('lastUpdatedBy', 'name email')
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .sort({ createdAt: -1 });

    const total = await AfghanSchool.countDocuments(query);

    return ok(res, {
      schools,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    }, 'Schools retrieved successfully');
  } catch (error) {
    console.error('Get Schools Error:', error);
    return fail(res, 'Failed to retrieve schools', 500);
  }
});

// GET /api/afghan-schools/:id - Get single school
router.get('/:id', async (req, res) => {
  try {
    const school = await AfghanSchool.findById(req.params.id)
      .populate('createdBy', 'name email')
      .populate('lastUpdatedBy', 'name email');

    if (!school) {
      return fail(res, 'School not found', 404);
    }

    // Get related students and teachers
    const students = await AfghanStudent.find({ 
      'academicInfo.currentSchool': school._id,
      status: 'active'
    }).select('personalInfo.firstName personalInfo.lastName personalInfo.gender academicInfo.currentGrade');

    const teachers = await AfghanTeacher.find({ 
      'employmentInfo.currentSchool': school._id,
      status: 'active'
    }).select('personalInfo.firstName personalInfo.lastName personalInfo.gender employmentInfo.position');

    return ok(res, {
      school,
      students: {
        total: students.length,
        male: students.filter(s => s.personalInfo.gender === 'male').length,
        female: students.filter(s => s.personalInfo.gender === 'female').length,
        byGrade: students.reduce((acc, student) => {
          const grade = student.academicInfo.currentGrade;
          acc[grade] = (acc[grade] || 0) + 1;
          return acc;
        }, {})
      },
      teachers: {
        total: teachers.length,
        male: teachers.filter(t => t.personalInfo.gender === 'male').length,
        female: teachers.filter(t => t.personalInfo.gender === 'female').length,
        byPosition: teachers.reduce((acc, teacher) => {
          const position = teacher.employmentInfo.position;
          acc[position] = (acc[position] || 0) + 1;
          return acc;
        }, {})
      }
    }, 'School retrieved successfully');
  } catch (error) {
    console.error('Get School Error:', error);
    return fail(res, 'Failed to retrieve school', 500);
  }
});

// POST /api/afghan-schools - Create new school
router.post('/', requireFields(['name', 'nameDari', 'schoolCode', 'province', 'district', 'schoolType', 'schoolLevel', 'ownership', 'establishmentDate']), async (req, res) => {
  try {
    const schoolData = {
      ...req.body,
      // Set nested default values for required fields
      contactInfo: {
        phone: req.body.contactInfo?.phone || '',
        email: req.body.contactInfo?.email || '',
        website: req.body.contactInfo?.website || '',
        address: req.body.contactInfo?.address || req.body.district
      },
      principal: {
        name: req.body.principal?.name || `${req.body.nameDari} - مدیر`,
        phone: req.body.principal?.phone || '',
        email: req.body.principal?.email || ''
      },
      academicInfo: {
        totalStudents: req.body.academicInfo?.totalStudents || 0,
        maleStudents: req.body.academicInfo?.maleStudents || 0,
        femaleStudents: req.body.academicInfo?.femaleStudents || 0,
        totalTeachers: req.body.academicInfo?.totalTeachers || 0,
        maleTeachers: req.body.academicInfo?.maleTeachers || 0,
        femaleTeachers: req.body.academicInfo?.femaleTeachers || 0,
        classesCount: req.body.academicInfo?.classesCount || 0,
        shiftType: req.body.academicInfo?.shiftType || 'morning',
        academicYear: req.body.academicInfo?.academicYear || new Date().getFullYear().toString(),
        curriculum: req.body.academicInfo?.curriculum || 'national'
      },
      // createdBy is optional if user is not authenticated (admin creation)
      ...(req.user?.id ? { createdBy: req.user.id } : {})
    };

    // Check if school code already exists
    const existingSchool = await AfghanSchool.findOne({ schoolCode: schoolData.schoolCode });
    if (existingSchool) {
      return fail(res, 'School code already exists', 400);
    }

    const school = new AfghanSchool(schoolData);
    await school.save();

    const schoolPayload = typeof school.toObject === 'function' ? school.toObject() : school;
    return res.status(201).json({
      success: true,
      message: 'School created successfully',
      data: schoolPayload,
      _id: schoolPayload?._id,
      id: schoolPayload?.id || String(schoolPayload?._id || '')
    });
  } catch (error) {
    console.error('Create School Error:', error);
    if (error.code === 11000) {
      return fail(res, 'School code already exists', 400);
    }
    // Log the actual error for debugging
    if (error.message) {
      console.error('Error details:', error.message);
      return fail(res, `Failed to create school: ${error.message}`, 500);
    }
    return fail(res, 'Failed to create school', 500);
  }
});

// PUT /api/afghan-schools/:id - Update school
router.put('/:id', async (req, res) => {
  try {
    const schoolData = {
      ...req.body,
      lastUpdatedBy: req.user?.id || 'system'
    };

    const school = await AfghanSchool.findByIdAndUpdate(
      req.params.id,
      schoolData,
      { new: true, runValidators: true }
    );

    if (!school) {
      return fail(res, 'School not found', 404);
    }

    return ok(res, school, 'School updated successfully');
  } catch (error) {
    console.error('Update School Error:', error);
    if (error.code === 11000) {
      return fail(res, 'School code already exists', 400);
    }
    return fail(res, 'Failed to update school', 500);
  }
});

// DELETE /api/afghan-schools/:id - Delete school
router.delete('/:id', async (req, res) => {
  try {
    const school = await AfghanSchool.findByIdAndDelete(req.params.id);
    if (!school) {
      return fail(res, 'School not found', 404);
    }

    return ok(res, school, 'School deleted successfully');
  } catch (error) {
    console.error('Delete School Error:', error);
    return fail(res, 'Failed to delete school', 500);
  }
});

// GET /api/afghan-schools/provinces - Get all provinces with stats
router.get('/provinces/stats', async (req, res) => {
  try {
    const provinces = [
      'kabul', 'herat', 'kandahar', 'balkh', 'nangarhar', 'badakhshan',
      'takhar', 'samangan', 'kunduz', 'baghlan', 'farah', 'nimroz',
      'helmand', 'ghor', 'daykundi', 'uruzgan', 'zabul', 'paktika',
      'khost', 'paktia', 'logar', 'parwan', 'kapisa', 'panjshir',
      'badghis', 'faryab', 'jowzjan', 'saripul'
    ];

    const provinceStats = {};
    for (const province of provinces) {
      provinceStats[province] = await getProvinceStats(province);
    }

    return ok(res, provinceStats, 'Province statistics retrieved successfully');
  } catch (error) {
    console.error('Province Stats Error:', error);
    return fail(res, 'Failed to retrieve province statistics', 500);
  }
});

// GET /api/afghan-schools/map-data - Get schools data for map visualization
router.get('/map-data', async (req, res) => {
  try {
    const { province, schoolType, ownership } = req.query;
    
    const query = { 
      status: 'active',
      'coordinates.latitude': { $exists: true, $ne: null },
      'coordinates.longitude': { $exists: true, $ne: null }
    };

    if (province) query.province = province;
    if (schoolType) query.schoolType = schoolType;
    if (ownership) query.ownership = ownership;

    const schools = await AfghanSchool.find(query)
      .select('name province district coordinates schoolType ownership academicInfo.totalStudents')
      .lean();

    return ok(res, schools, 'Map data retrieved successfully');
  } catch (error) {
    console.error('Map Data Error:', error);
    return fail(res, 'Failed to retrieve map data', 500);
  }
});

// POST /api/afghan-schools/:id/upload-document - Upload school document
router.post('/:id/upload-document', requireFields(['type', 'title', 'url']), async (req, res) => {
  try {
    const { type, title, url } = req.body;
    
    const school = await AfghanSchool.findById(req.params.id);
    if (!school) {
      return fail(res, 'School not found', 404);
    }

    const newDocument = {
      type,
      title,
      url,
      uploadDate: new Date(),
      uploadedBy: req.user?.id || 'system'
    };

    school.documents.push(newDocument);
    await school.save();

    return ok(res, newDocument, 'Document uploaded successfully', 201);
  } catch (error) {
    console.error('Upload Document Error:', error);
    return fail(res, 'Failed to upload document', 500);
  }
});

// GET /api/afghan-schools/reports/annual - Generate annual report
router.get('/reports/annual', async (req, res) => {
  try {
    const { year = new Date().getFullYear() } = req.query;
    
    const report = {
      year,
      generatedAt: new Date(),
      summary: {
        totalSchools: await AfghanSchool.countDocuments({ status: 'active' }),
        totalStudents: await AfghanStudent.countDocuments({ status: 'active' }),
        totalTeachers: await AfghanTeacher.countDocuments({ status: 'active' }),
        newSchools: await AfghanSchool.countDocuments({ 
          status: 'active',
          createdAt: { 
            $gte: new Date(`${year}-01-01`), 
            $lt: new Date(`${year + 1}-01-01`) 
          }
        })
      },
      provinces: {},
      schoolTypes: {},
      ownershipTypes: {}
    };

    // Province breakdown
    const provinces = [
      'kabul', 'herat', 'kandahar', 'balkh', 'nangarhar', 'badakhshan',
      'takhar', 'samangan', 'kunduz', 'baghlan', 'farah', 'nimroz',
      'helmand', 'ghor', 'daykundi', 'uruzgan', 'zabul', 'paktika',
      'khost', 'paktia', 'logar', 'parwan', 'kapisa', 'panjshir',
      'badghis', 'faryab', 'jowzjan', 'saripul'
    ];

    for (const province of provinces) {
      report.provinces[province] = await getProvinceStats(province);
    }

    // School types breakdown
    const schoolTypes = ['primary', 'secondary', 'high', 'mosque', 'madrasa', 'technical', 'private'];
    for (const type of schoolTypes) {
      report.schoolTypes[type] = await AfghanSchool.countDocuments({ 
        schoolType: type, 
        status: 'active' 
      });
    }

    // Ownership breakdown
    const ownershipTypes = ['government', 'private', 'ngp', 'mosque', 'community'];
    for (const ownership of ownershipTypes) {
      report.ownershipTypes[ownership] = await AfghanSchool.countDocuments({ 
        ownership, 
        status: 'active' 
      });
    }

    return ok(res, report, 'Annual report generated successfully');
  } catch (error) {
    console.error('Annual Report Error:', error);
    return fail(res, 'Failed to generate annual report', 500);
  }
});

module.exports = router;
