require('dotenv').config();
const mongoose = require('mongoose');

const AcademicYear = require('../models/AcademicYear');
const AcademicTerm = require('../models/AcademicTerm');

async function run() {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/school_db');
  try {
    const year = await AcademicYear.findOne({ schoolId: '000000000000000000000001' }).sort({ createdAt: -1 });
    if (!year) {
      throw new Error('academic_year_not_found');
    }

    await AcademicYear.updateMany(
      { schoolId: year.schoolId, _id: { $ne: year._id } },
      { $set: { isActive: false, isCurrent: false, status: 'closed' } }
    );

    year.isActive = true;
    year.isCurrent = true;
    year.status = 'active';
    await year.save();

    const termCount = await AcademicTerm.countDocuments({ academicYearId: year._id });
    if (termCount === 0) {
      await AcademicTerm.insertMany([
        {
          academicYearId: year._id,
          title: 'ترم اول',
          name: 'ترم اول',
          code: 'T1',
          order: 1,
          type: 'term',
          status: 'active',
          isActive: true
        },
        {
          academicYearId: year._id,
          title: 'ترم دوم',
          name: 'ترم دوم',
          code: 'T2',
          order: 2,
          type: 'term',
          status: 'planned',
          isActive: false
        },
        {
          academicYearId: year._id,
          title: 'ترم سوم',
          name: 'ترم سوم',
          code: 'T3',
          order: 3,
          type: 'term',
          status: 'planned',
          isActive: false
        }
      ]);
    }

    const terms = await AcademicTerm.find({ academicYearId: year._id }).sort({ order: 1 }).lean();

    console.log('activeYear=', {
      id: String(year._id),
      title: year.title,
      status: year.status,
      isActive: year.isActive,
      isCurrent: year.isCurrent
    });
    console.log(
      'terms=',
      terms.map((t) => ({
        id: String(t._id),
        title: t.title,
        code: t.code,
        status: t.status,
        isActive: t.isActive,
        order: t.order
      }))
    );
  } finally {
    await mongoose.disconnect();
  }
}

run().catch((error) => {
  console.error(error && error.message ? error.message : error);
  process.exitCode = 1;
});
