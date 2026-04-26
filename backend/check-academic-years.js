const mongoose = require('mongoose');
const AcademicYear = require('./models/AcademicYear');
require('dotenv').config();

async function checkAcademicYears() {
  try {
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/school_db');
    
    const years = await AcademicYear.find({}).sort({ sequence: 1 });
    console.log('📚 Academic Years in database:');
    years.forEach(year => {
      console.log(`- ${year.title} (${year.code}) - Status: ${year.status}, Active: ${year.isActive}`);
    });
    
    // Get the active year
    const activeYear = await AcademicYear.findOne({ isActive: true });
    if (activeYear) {
      console.log(`\n✅ Current Active Year: ${activeYear.title} (${activeYear._id})`);
    } else {
      console.log('\n❌ No active academic year found');
    }
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await mongoose.connection.close();
  }
}

checkAcademicYears();
