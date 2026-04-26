const mongoose = require('mongoose');
const AcademicYear = require('./models/AcademicYear');
const SchoolClass = require('./models/SchoolClass');
const Subject = require('./models/Subject');
const User = require('./models/User');
const { resolveBaseRefs } = require('./services/timetableService');
require('dotenv').config();

async function testTimetableSystem() {
  try {
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/school_db');
    
    console.log('🧪 Testing Timetable System...\n');
    
    // Step 1: Get current academic year
    const academicYear = await AcademicYear.findOne({ isActive: true });
    if (!academicYear) {
      throw new Error('No active academic year found');
    }
    console.log(`✅ Using Academic Year: ${academicYear.title} (${academicYear._id})`);
    
    // Step 2: Get a test class
    const testClass = await SchoolClass.findOne({ academicYearId: academicYear._id });
    if (!testClass) {
      throw new Error('No class found for current academic year');
    }
    console.log(`✅ Using Test Class: ${testClass.title} (${testClass._id})`);
    
    // Step 3: Get a test subject
    const testSubject = await Subject.findOne();
    if (!testSubject) {
      throw new Error('No subjects found in database');
    }
    console.log(`✅ Using Test Subject: ${testSubject.title} (${testSubject._id})`);
    
    // Step 4: Get a test teacher
    const testTeacher = await User.findOne({ role: 'instructor' });
    if (!testTeacher) {
      console.log('⚠️  No instructor found, creating test teacher...');
      testTeacher = new User({
        name: 'Test Teacher',
        email: 'teacher@test.com',
        password: 'test123',
        role: 'instructor',
        status: 'active'
      });
      await testTeacher.save();
    }
    console.log(`✅ Using Test Teacher: ${testTeacher.name} (${testTeacher._id})`);
    
    // Step 5: Test timetable context resolution
    console.log('\n🔍 Testing timetable context resolution...');
    
    try {
      const context = await resolveBaseRefs({
        academicYearId: academicYear._id,
        classId: testClass._id,
        subjectId: testSubject._id
      });
      
      console.log('✅ Timetable context resolved successfully:');
      console.log(`   - Academic Year: ${context.academicYear?.title}`);
      console.log(`   - Class: ${context.schoolClass?.title}`);
      console.log(`   - Subject: ${context.subject?.title}`);
      console.log(`   - Teacher Assignment: ${context.teacherAssignment ? 'Found' : 'Not found'}`);
      console.log(`   - Config: ${context.config ? 'Found' : 'Not found'}`);
      
    } catch (error) {
      console.log('❌ Timetable context resolution failed:', error.message);
      
      if (error.message === 'timetable_year_class_mismatch') {
        console.log('\n🔧 This is the exact error we were trying to fix!');
        console.log('Let me check the details...');
        
        const classYear = await SchoolClass.findById(testClass._id).populate('academicYearId');
        console.log(`Class Academic Year: ${classYear.academicYearId?.title} (${classYear.academicYearId?._id})`);
        console.log(`Requested Academic Year: ${academicYear.title} (${academicYear._id})`);
        console.log(`Match: ${String(classYear.academicYearId?._id) === String(academicYear._id)}`);
      }
      return;
    }
    
    // Step 6: Test with mismatched year (should fail gracefully)
    console.log('\n🧪 Testing with mismatched academic year...');
    
    try {
      const wrongYear = await AcademicYear.findOne({ isActive: false });
      if (wrongYear) {
        await resolveBaseRefs({
          academicYearId: wrongYear._id,
          classId: testClass._id,
          subjectId: testSubject._id
        });
        console.log('❌ Expected error but got success');
      } else {
        console.log('⚠️  No inactive academic year found for mismatch test');
      }
    } catch (error) {
      if (error.message === 'timetable_year_class_mismatch') {
        console.log('✅ Correctly caught timetable_year_class_mismatch error');
      } else {
        console.log('❌ Unexpected error:', error.message);
      }
    }
    
    // Step 7: Test without academic year (should resolve from class)
    console.log('\n🧪 Testing without explicit academic year...');
    
    try {
      const context = await resolveBaseRefs({
        classId: testClass._id,
        subjectId: testSubject._id
      });
      
      console.log('✅ Context resolved without explicit academic year');
      console.log(`   - Resolved Academic Year: ${context.academicYear?.title}`);
      
    } catch (error) {
      console.log('❌ Failed to resolve context:', error.message);
    }
    
    console.log('\n🎉 Timetable system test completed!');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    await mongoose.connection.close();
  }
}

testTimetableSystem();
