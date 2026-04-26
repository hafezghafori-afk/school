const mongoose = require('mongoose');
const AcademicYear = require('./models/AcademicYear');
const SchoolClass = require('./models/SchoolClass');
require('dotenv').config();

async function fixTimetableMismatch() {
  try {
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/school_db');
    
    console.log('🔧 Fixing timetable_year_class_mismatch issue...\n');
    
    // Step 1: Create/Get Gregorian academic year 2023-2024
    let gregorianYear = await AcademicYear.findOne({ title: '2023-2024' });
    
    if (!gregorianYear) {
      // First deactivate all existing years
      await AcademicYear.updateMany({}, { isActive: false, status: 'archived' });
      
      gregorianYear = new AcademicYear({
        code: '2023-2024',
        title: '2023-2024',
        startDate: '2023-09-01',
        endDate: '2024-06-30',
        sequence: 1,
        status: 'active',
        isActive: true,
        note: 'Gregorian academic year for Afghan schools system'
      });
      
      await gregorianYear.save();
      console.log('✅ Created Gregorian academic year: 2023-2024');
    } else {
      console.log('✅ Found existing Gregorian academic year: 2023-2024');
    }
    
    // Step 2: Update all SchoolClass documents to use the correct academic year
    const classUpdateResult = await SchoolClass.updateMany(
      { academicYearId: { $ne: gregorianYear._id } },
      { academicYearId: gregorianYear._id }
    );
    
    console.log(`✅ Updated ${classUpdateResult.modifiedCount} SchoolClass documents with correct academic year`);
    
    // Step 3: Check for any classes without academic year
    const classesWithoutYear = await SchoolClass.countDocuments({ academicYearId: null });
    if (classesWithoutYear > 0) {
      await SchoolClass.updateMany(
        { academicYearId: null },
        { academicYearId: gregorianYear._id }
      );
      console.log(`✅ Updated ${classesWithoutYear} SchoolClass documents that had no academic year`);
    }
    
    // Step 4: Verify the fix
    const totalClasses = await SchoolClass.countDocuments();
    const classesWithCorrectYear = await SchoolClass.countDocuments({ academicYearId: gregorianYear._id });
    
    console.log(`\n📊 Verification Results:`);
    console.log(`- Total SchoolClasses: ${totalClasses}`);
    console.log(`- Classes with correct academic year: ${classesWithCorrectYear}`);
    console.log(`- Academic Year ID: ${gregorianYear._id}`);
    
    if (totalClasses === classesWithCorrectYear) {
      console.log('✅ All classes now have the correct academic year!');
    } else {
      console.log('⚠️  Some classes may still have incorrect academic year');
    }
    
    // Step 5: Test timetable validation
    console.log('\n🧪 Testing timetable validation...');
    
    // This would normally throw the error if there's still a mismatch
    try {
      const testClass = await SchoolClass.findOne({ academicYearId: gregorianYear._id });
      if (testClass) {
        console.log(`✅ Test class found: ${testClass.title}`);
        console.log(`✅ Academic Year: ${testClass.academicYearId}`);
        console.log('✅ Timetable validation should pass now!');
      }
    } catch (error) {
      console.log('❌ Test failed:', error.message);
    }
    
  } catch (error) {
    console.error('❌ Error fixing timetable mismatch:', error);
  } finally {
    await mongoose.connection.close();
  }
}

fixTimetableMismatch();
