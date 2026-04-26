const FormData = require('form-data');
const fs = require('fs');
const fetch = require('node-fetch').default;

async function testUpload() {
  try {
    // Create a simple test image
    const testImagePath = 'test-logo.png';
    const testImageData = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
    fs.writeFileSync(testImagePath, testImageData);
    
    // Create form data
    const form = new FormData();
    form.append('logo', fs.createReadStream(testImagePath));
    form.append('title', 'Test Title');
    form.append('subtitle', 'Test Subtitle');
    
    // Send request - Test without auth
    const response = await fetch('http://localhost:5000/api/login-settings', {
      method: 'PUT',
      body: form
    });
    
    const result = await response.json();
    console.log('Upload test result:', result);
    
    // Clean up
    fs.unlinkSync(testImagePath);
  } catch (error) {
    console.error('Upload test failed:', error);
  }
}

testUpload();
