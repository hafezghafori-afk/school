#!/usr/bin/env node
/**
 * Simple test to validate school data and schema
 */

const mongoose = require('mongoose');
const path = require('path');
const AfghanSchool = require(path.join(__dirname, 'backend/models/AfghanSchool'));

async function testSchoolCreation() {
  try {
    console.log('🔌 Connecting to database...\n');
    
    // Connect to DB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/afghan-schools');
    console.log('✅ Connected to database');

    // Generate test data
    const testData = {
      name: `Test School ${Date.now()}`,
      nameDari: `مکتب تست ${Date.now()}`,
      namePashto: `Test School ${Date.now()}`,
      schoolCode: `TEST-${Date.now()}`,
      province: 'kabul',
      provinceCode: `KAB-${Date.now()}`,
      ministryCode: `MS-KA-${Date.now()}`,
      district: 'District 1',
      schoolType: 'high',
      schoolLevel: 'grade10_12',
      ownership: 'government',
      establishmentDate: new Date('2026-04-12'),
      address: 'District 1',
      principal: {
        name: `مدیر مکتب تست`,
        phone: '',
        email: ''
      },
      academicYear: '2026'
    };

    console.log('\n📋 Creating school with data:', JSON.stringify(testData, null, 2));
    console.log('\n🧪 Testing school creation...\n');

    const school = new AfghanSchool(testData);
    await school.save();

    console.log('✨ SUCCESS! School created');
    console.log('📝 School ID:', school._id);
    console.log('✅ Name:', school.nameDari);

    // Clean up
    await AfghanSchool.deleteOne({ _id: school._id });
    console.log('\n🧹 Test school deleted');

    process.exit(0);
  } catch (error) {
    console.error('\n❌ ERROR:', error.message);
    if (error.errors) {
      console.error('\n📋 Validation errors:');
      Object.entries(error.errors).forEach(([field, err]) => {
        console.error(`  - ${field}:`, err.message);
      });
    }
    process.exit(1);
  }
}

testSchoolCreation();
