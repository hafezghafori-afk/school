#!/usr/bin/env node
/**
 * Test script to create a school via the admin panel endpoint
 */

const API_BASE = 'http://localhost:3000';
const TOKEN = process.env.TOKEN || '';

async function testCreateSchool() {
  const schoolData = {
    name: 'Test High School',
    nameDari: 'مکتب تست',
    schoolCode: `TEST-${Date.now()}`,
    province: 'kabul',
    district: 'District 1',
    schoolType: 'high',
    schoolLevel: 'grade10_12',
    ownership: 'government',
    establishmentDate: '2024-01-01',
    namePashto: 'Test High School'
  };

  console.log('🧪 Testing school creation...\n');
  console.log('📋 School data:', JSON.stringify(schoolData, null, 2));
  console.log('\n📡 Sending request to:', `${API_BASE}/api/afghan-schools`);

  try {
    const res = await fetch(`${API_BASE}/api/afghan-schools`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {})
      },
      body: JSON.stringify(schoolData)
    });

    console.log('\n✅ Response status:', res.status);
    
    const data = await res.json();
    console.log('\n📦 Response body:', JSON.stringify(data, null, 2));

    if (data.success) {
      console.log('\n✨ SUCCESS! School created with ID:', data._id);
      console.log('💾 Save this ID to localStorage as "schoolId"');
    } else {
      console.log('\n❌ FAILED:', data.message);
    }
  } catch (error) {
    console.error('\n❌ Error:', error.message);
  }
}

testCreateSchool();
