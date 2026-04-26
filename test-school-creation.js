#!/usr/bin/env node
/**
 * Test script to create a school with all required fields
 */

const API_BASE = 'http://localhost:3000';
const TOKEN = process.env.TOKEN || '';

async function testCreateSchool() {
  // Generate codes like the frontend does
  const timestamp = Date.now();
  const province = 'kabul';
  const provinceCode = `${province.substring(0, 3).toUpperCase()}-${timestamp}`;
  const ministryCode = `MS-${province.substring(0, 2).toUpperCase()}-${timestamp}`;

  const schoolData = {
    name: `Test School ${Date.now()}`,
    nameDari: `مکتب تست ${Date.now()}`,
    namePashto: `Test School ${Date.now()}`,
    schoolCode: `TEST-${timestamp}`,
    province: 'kabul',
    provinceCode: provinceCode,
    ministryCode: ministryCode,
    district: 'District 1',
    schoolType: 'high',
    schoolLevel: 'grade10_12',
    ownership: 'government',
    establishmentDate: new Date().toISOString().split('T')[0]
  };

  console.log('🧪 Testing school creation with all required fields...\n');
  console.log('📋 School data:', JSON.stringify(schoolData, null, 2));
  console.log('\n📡 Endpoint:', `${API_BASE}/api/afghan-schools`);
  console.log('📡 Method: POST\n');

  try {
    const res = await fetch(`${API_BASE}/api/afghan-schools`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {})
      },
      body: JSON.stringify(schoolData)
    });

    console.log('✅ Response status:', res.status, res.statusText);
    
    const data = await res.json();
    console.log('\n📦 Response:', JSON.stringify(data, null, 2));

    if (data.success) {
      console.log('\n✨ SUCCESS! School created');
      console.log('📝 School ID:', data._id);
      console.log('💾 This ID should be saved to localStorage as "schoolId"');
      process.exit(0);
    } else {
      console.log('\n❌ FAILED:', data.message);
      process.exit(1);
    }
  } catch (error) {
    console.error('\n❌ Connection Error:', error.message);
    console.error('💡 Make sure the backend is running on port 3000');
    process.exit(1);
  }
}

testCreateSchool();
